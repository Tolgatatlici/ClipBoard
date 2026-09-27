import {
  serverMessageSchema,
  WS_CLOSE_ROOM_FULL,
  type ClientMessage,
  type ServerMessage,
} from '@clipboard/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface RoomConnectionHandlers {
  onMessage(message: ServerMessage): void;
  onStatus(status: ConnectionStatus): void;
}

const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

export function roomSocketUrl(roomId: string): string {
  const path = `/ws/rooms/${roomId}`;
  if (API_BASE) return API_BASE.replace(/^http/, 'ws') + path;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

const MAX_BACKOFF_MS = 15_000;

/**
 * Odaya WebSocket bağlantısı. Kopunca artan bekleme süreleriyle (üstel geri çekilme)
 * yeniden bağlanır; bağlı değilken gönderilen öğeler sıraya alınıp bağlanınca iletilir.
 */
export class RoomConnection {
  private socket: WebSocket | null = null;
  private attempts = 0;
  private queue: string[] = [];
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly url: string,
    private readonly handlers: RoomConnectionHandlers,
  ) {
    window.addEventListener('online', this.reconnectNow);
    this.connect();
  }

  private connect() {
    this.handlers.onStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.handlers.onStatus('open');
      for (const payload of this.queue.splice(0)) socket.send(payload);
    };
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let parsed;
      try {
        parsed = serverMessageSchema.safeParse(JSON.parse(event.data));
      } catch {
        return;
      }
      if (parsed.success) this.handlers.onMessage(parsed.data);
    };
    socket.onclose = (event) => {
      if (this.socket === socket) this.socket = null;
      if (this.stopped) return;
      // Oda dolu ya da geçersizse yeniden denemenin anlamı yok.
      if (event.code === WS_CLOSE_ROOM_FULL || event.code === 1008) {
        this.stop();
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempts);
    const delay = base / 2 + Math.random() * (base / 2);
    this.attempts++;
    this.handlers.onStatus('reconnecting');
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private reconnectNow = () => {
    if (this.stopped || this.socket) return;
    clearTimeout(this.retryTimer);
    this.connect();
  };

  send(message: ClientMessage) {
    const payload = JSON.stringify(message);
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    } else if (message.type !== 'typing') {
      this.queue.push(payload);
    }
  }

  private stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    window.removeEventListener('online', this.reconnectNow);
    this.handlers.onStatus('closed');
  }

  close() {
    if (this.stopped) return;
    this.stop();
    this.socket?.close(1000);
    this.socket = null;
  }
}
