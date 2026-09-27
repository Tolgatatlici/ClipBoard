import { randomBytes } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { WebSocket } from 'ws';
import type { Metrics } from '../metrics.js';
import {
  clientMessageSchema,
  LIMITS,
  ROOM_TTL_SECONDS,
  WS_CLOSE_ROOM_FULL,
  type RoomErrorCode,
  type RoomItem,
  type ServerMessage,
} from '@clipboard/shared';

const itemsKey = (roomId: string) => `room:${roomId}:items`;
const peersKey = (roomId: string) => `room:${roomId}:peers`;
const channel = (roomId: string) => `room:${roomId}:events`;
const CHANNEL_PREFIX = 'room:';
const CHANNEL_SUFFIX = ':events';

/** Pub/Sub ile dağıtılan olay: sunucu mesajı + (yazıyor olayları için) gönderen. */
type RoomEvent = ServerMessage & { from?: string };

interface Peer {
  id: string;
  roomId: string;
  socket: WebSocket;
  alive: boolean;
  /** Basit jeton kovası: son pencerede gönderilen mesaj sayısı. */
  window: { start: number; count: number };
}

export interface RoomHubOptions {
  heartbeatMs?: number;
  /** Bu kadar süre heartbeat'i yenilenmeyen cihaz çevrimdışı sayılır. */
  presenceTimeoutMs?: number;
  messageLimit?: { count: number; windowMs: number };
  maxPeers?: number;
  metrics?: Metrics;
}

/**
 * Oda bağlantılarını yönetir. Her sunucu örneği kendi soketlerini tutar; olaylar
 * Redis Pub/Sub ile tüm örneklere dağıtılır, geçmiş ve çevrimiçi listesi Redis'tedir.
 */
export class RoomHub {
  private readonly rooms = new Map<string, Set<Peer>>();
  private readonly heartbeat: NodeJS.Timeout;
  private readonly presenceTimeoutMs: number;
  private readonly messageLimit: { count: number; windowMs: number };
  private readonly maxPeers: number;
  private readonly metrics?: Metrics;
  private closing = false;

  constructor(
    private readonly redis: Redis,
    private readonly subscriber: Redis,
    private readonly log: FastifyBaseLogger,
    options: RoomHubOptions = {},
  ) {
    const heartbeatMs = options.heartbeatMs ?? 30_000;
    this.presenceTimeoutMs = options.presenceTimeoutMs ?? heartbeatMs * 3;
    this.messageLimit = options.messageLimit ?? { count: 20, windowMs: 10_000 };
    this.maxPeers = options.maxPeers ?? LIMITS.maxRoomPeers;
    this.metrics = options.metrics;

    subscriber.on('message', (name: string, raw: string) => {
      if (!name.startsWith(CHANNEL_PREFIX) || !name.endsWith(CHANNEL_SUFFIX)) return;
      const roomId = name.slice(CHANNEL_PREFIX.length, -CHANNEL_SUFFIX.length);
      this.deliver(roomId, JSON.parse(raw) as RoomEvent);
    });

    this.heartbeat = setInterval(() => {
      this.beat().catch((err: unknown) => this.log.warn({ err }, 'room heartbeat failed'));
    }, heartbeatMs);
    this.heartbeat.unref();
  }

  async join(roomId: string, socket: WebSocket): Promise<void> {
    const peer: Peer = {
      id: randomBytes(8).toString('base64url'),
      roomId,
      socket,
      alive: true,
      window: { start: Date.now(), count: 0 },
    };

    // Mesajlar, katılım tamamlanana kadar sıraya alınır.
    const pending: Buffer[] = [];
    let ready = false;
    socket.on('message', (data: Buffer) => {
      if (!ready) return void pending.push(data);
      this.handleMessage(peer, data).catch((err: unknown) =>
        this.log.error({ err }, 'room message failed'),
      );
    });
    socket.on('pong', () => {
      peer.alive = true;
    });
    socket.on('close', () => {
      this.leave(peer).catch((err: unknown) => this.log.warn({ err }, 'room leave failed'));
    });
    socket.on('error', (err) => this.log.debug({ err }, 'room socket error'));

    if ((await this.countPeers(roomId)) >= this.maxPeers) {
      this.send(socket, { type: 'error', code: 'room_full' });
      socket.close(WS_CLOSE_ROOM_FULL, 'room_full');
      return;
    }

    let local = this.rooms.get(roomId);
    if (!local) {
      local = new Set();
      this.rooms.set(roomId, local);
      await this.subscriber.subscribe(channel(roomId));
    }
    local.add(peer);
    this.metrics?.roomConnections.inc();

    await this.redis
      .multi()
      .zadd(peersKey(roomId), Date.now(), peer.id)
      .expire(peersKey(roomId), ROOM_TTL_SECONDS)
      .expire(itemsKey(roomId), ROOM_TTL_SECONDS)
      .exec();

    const [history, peers] = await Promise.all([this.history(roomId), this.countPeers(roomId)]);
    this.send(socket, { type: 'welcome', peers, history });
    await this.publish(roomId, { type: 'presence', peers });

    ready = true;
    for (const data of pending) await this.handleMessage(peer, data);
  }

  private async leave(peer: Peer) {
    const local = this.rooms.get(peer.roomId);
    if (!local?.delete(peer)) return;
    this.metrics?.roomConnections.dec();
    if (this.closing) return;
    if (local.size === 0) {
      this.rooms.delete(peer.roomId);
      await this.subscriber.unsubscribe(channel(peer.roomId));
    }
    await this.redis.zrem(peersKey(peer.roomId), peer.id);
    await this.publish(peer.roomId, {
      type: 'presence',
      peers: await this.countPeers(peer.roomId),
    });
  }

  private async handleMessage(peer: Peer, data: Buffer) {
    if (!this.allow(peer)) {
      this.send(peer.socket, { type: 'error', code: 'rate_limited' });
      return;
    }
    let parsed;
    try {
      parsed = clientMessageSchema.safeParse(JSON.parse(data.toString('utf8')));
    } catch {
      parsed = null;
    }
    if (!parsed?.success) {
      this.sendError(peer, 'invalid_message');
      return;
    }

    const message = parsed.data;
    const { roomId } = peer;
    this.metrics?.roomMessages.inc({ type: message.type });
    switch (message.type) {
      case 'item': {
        const item: RoomItem = {
          id: randomBytes(8).toString('base64url'),
          ts: Date.now(),
          ...message.item,
        };
        await this.redis
          .multi()
          .rpush(itemsKey(roomId), JSON.stringify(item))
          .ltrim(itemsKey(roomId), -LIMITS.maxRoomHistory, -1)
          .expire(itemsKey(roomId), ROOM_TTL_SECONDS)
          .expire(peersKey(roomId), ROOM_TTL_SECONDS)
          .exec();
        await this.publish(roomId, { type: 'item', item });
        break;
      }
      case 'typing':
        await this.publish(roomId, { type: 'typing', from: peer.id });
        break;
      case 'clear':
        await this.redis.del(itemsKey(roomId));
        await this.publish(roomId, { type: 'cleared' });
        break;
    }
  }

  private allow(peer: Peer): boolean {
    const now = Date.now();
    if (now - peer.window.start > this.messageLimit.windowMs) {
      peer.window = { start: now, count: 0 };
    }
    peer.window.count++;
    return peer.window.count <= this.messageLimit.count;
  }

  private sendError(peer: Peer, code: RoomErrorCode) {
    this.send(peer.socket, { type: 'error', code });
  }

  private send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }

  private async publish(roomId: string, event: RoomEvent) {
    await this.redis.publish(channel(roomId), JSON.stringify(event));
  }

  /** Pub/Sub'dan gelen olayı bu örnekteki soketlere iletir. */
  private deliver(roomId: string, event: RoomEvent) {
    const local = this.rooms.get(roomId);
    if (!local) return;
    const { from, ...message } = event;
    const payload = JSON.stringify(message);
    for (const peer of local) {
      // "Yazıyor" bildirimi gönderenin kendisine gitmez.
      if (from && peer.id === from) continue;
      if (peer.socket.readyState === peer.socket.OPEN) peer.socket.send(payload);
    }
  }

  private async history(roomId: string): Promise<RoomItem[]> {
    const raw = await this.redis.lrange(itemsKey(roomId), 0, -1);
    return raw.map((entry) => JSON.parse(entry) as RoomItem);
  }

  /** Heartbeat'i yakın zamanda yenilenmiş cihaz sayısı (tüm sunucu örnekleri). */
  private async countPeers(roomId: string): Promise<number> {
    const key = peersKey(roomId);
    await this.redis.zremrangebyscore(key, '-inf', Date.now() - this.presenceTimeoutMs);
    return this.redis.zcard(key);
  }

  /** Yanıt vermeyen soketleri kapatır, diğerlerinin çevrimiçi kaydını yeniler. */
  private async beat() {
    const now = Date.now();
    for (const local of this.rooms.values()) {
      for (const peer of local) {
        if (!peer.alive) {
          peer.socket.terminate();
          continue;
        }
        peer.alive = false;
        peer.socket.ping();
        await this.redis.zadd(peersKey(peer.roomId), now, peer.id).catch(() => undefined);
      }
    }
  }

  async close() {
    this.closing = true;
    clearInterval(this.heartbeat);
    for (const local of this.rooms.values()) {
      for (const peer of local) peer.socket.close(1001, 'server_shutdown');
    }
    this.rooms.clear();
    await this.subscriber.quit().catch(() => undefined);
  }
}
