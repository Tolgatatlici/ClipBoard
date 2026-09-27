import { randomBytes, randomInt } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { Redis } from 'ioredis';
import type { WebSocket } from 'ws';
import {
  pairClientMessageSchema,
  PAIRING_TTL_SECONDS,
  WS_CLOSE_PAIRING_BUSY,
  WS_CLOSE_PAIRING_NOT_FOUND,
  type PairServerMessage,
} from '@clipboard/shared';

const codeKey = (code: string) => `pair:${code}`;
const countKey = (code: string) => `pair:${code}:n`;
const channel = (code: string) => `pair:${code}:events`;

/** Bir eşleştirme mesajı için en fazla boyut; açık anahtar ve şifreli sır sığar. */
const MAX_MESSAGE_BYTES = 4096;
const MAX_MESSAGES = 20;

// Katılımcı sayısını atomik artırır; üçüncü bağlantıyı reddeder.
const JOIN_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
local n = redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], ARGV[1])
if n > 2 then
  redis.call('DECR', KEYS[2])
  return -1
end
return n
`;

interface Peer {
  id: string;
  code: string;
  socket: WebSocket;
  messages: number;
}

type RelayEvent = { from?: string; message: PairServerMessage };

/**
 * Eşleştirme kanalları: iki cihaz arasında mesajları olduğu gibi aktarır. Açık anahtarlar
 * ve şifreli oda sırrı dışında bir şey taşınmaz; sunucu sırrı çözemez.
 */
export class PairingHub {
  private readonly local = new Map<string, Set<Peer>>();
  private readonly join: (codeKey: string, countKey: string, ttl: number) => Promise<number>;

  constructor(
    private readonly redis: Redis,
    private readonly subscriber: Redis,
    private readonly log: FastifyBaseLogger,
  ) {
    redis.defineCommand('pairJoin', { numberOfKeys: 2, lua: JOIN_SCRIPT });
    this.join = (redis as unknown as { pairJoin: PairingHub['join'] }).pairJoin.bind(redis);
    subscriber.on('message', (name: string, raw: string) => {
      if (!name.startsWith('pair:') || !name.endsWith(':events')) return;
      this.deliver(name.slice('pair:'.length, -':events'.length), JSON.parse(raw) as RelayEvent);
    });
  }

  /** Tek kullanımlık, 5 dakika geçerli 6 haneli bir kod ayırır. */
  async create(): Promise<{ code: string; expiresAt: number }> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const created = await this.redis.set(codeKey(code), '1', 'EX', PAIRING_TTL_SECONDS, 'NX');
      if (created) return { code, expiresAt: Date.now() + PAIRING_TTL_SECONDS * 1000 };
    }
    throw new Error('No free pairing code');
  }

  async connect(code: string, socket: WebSocket): Promise<void> {
    const n = await this.join(codeKey(code), countKey(code), PAIRING_TTL_SECONDS);
    if (n <= 0) {
      socket.close(n === 0 ? WS_CLOSE_PAIRING_NOT_FOUND : WS_CLOSE_PAIRING_BUSY);
      return;
    }

    const peer: Peer = { id: randomBytes(8).toString('base64url'), code, socket, messages: 0 };
    let local = this.local.get(code);
    if (!local) {
      local = new Set();
      this.local.set(code, local);
      await this.subscriber.subscribe(channel(code));
    }
    local.add(peer);

    socket.on('message', (data: Buffer) => {
      this.handle(peer, data).catch((err: unknown) => this.log.warn({ err }, 'pairing message'));
    });
    socket.on('close', () => {
      this.leave(peer).catch((err: unknown) => this.log.warn({ err }, 'pairing leave'));
    });

    this.send(socket, { type: 'ready', role: n === 1 ? 'host' : 'guest' });
    if (n === 2) await this.publish(code, { message: { type: 'paired' } });
  }

  private async handle(peer: Peer, data: Buffer) {
    if (++peer.messages > MAX_MESSAGES || data.length > MAX_MESSAGE_BYTES) {
      peer.socket.close(1008, 'limit');
      return;
    }
    let parsed;
    try {
      parsed = pairClientMessageSchema.safeParse(JSON.parse(data.toString('utf8')));
    } catch {
      parsed = null;
    }
    if (!parsed?.success) {
      peer.socket.close(1008, 'invalid_message');
      return;
    }
    await this.publish(peer.code, { from: peer.id, message: parsed.data });
    // Oda sırrı iletildiyse kod tekrar kullanılamaz.
    if (parsed.data.type === 'secret') await this.redis.del(codeKey(peer.code));
  }

  private async leave(peer: Peer) {
    const local = this.local.get(peer.code);
    if (!local?.delete(peer)) return;
    if (local.size === 0) {
      this.local.delete(peer.code);
      await this.subscriber.unsubscribe(channel(peer.code)).catch(() => undefined);
    }
    await this.redis.decr(countKey(peer.code)).catch(() => undefined);
    await this.publish(peer.code, { from: peer.id, message: { type: 'peer-left' } }).catch(
      () => undefined,
    );
  }

  private publish(code: string, event: RelayEvent) {
    return this.redis.publish(channel(code), JSON.stringify(event));
  }

  private deliver(code: string, { from, message }: RelayEvent) {
    for (const peer of this.local.get(code) ?? []) {
      if (peer.id !== from) this.send(peer.socket, message);
    }
  }

  private send(socket: WebSocket, message: PairServerMessage) {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }

  async close() {
    for (const peers of this.local.values()) for (const peer of peers) peer.socket.close(1001);
    this.local.clear();
    await this.subscriber.quit().catch(() => undefined);
  }
}
