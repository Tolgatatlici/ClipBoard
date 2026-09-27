import { WS_CLOSE_ROOM_FULL } from '@clipboard/shared';
import { RoomConnection, type ConnectionStatus } from './room-connection';

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  const statuses: ConnectionStatus[] = [];
  const messages: unknown[] = [];
  const conn = new RoomConnection('ws://test/ws/rooms/x', {
    onStatus: (status) => statuses.push(status),
    onMessage: (message) => messages.push(message),
  });
  return { conn, statuses, messages, socket: () => FakeSocket.instances.at(-1)! };
}

describe('RoomConnection', () => {
  it('queues items until the socket opens but drops typing notifications', () => {
    const { conn, socket } = setup();
    conn.send({ type: 'item', item: { ct: 'c', iv: 'I'.repeat(16) } });
    conn.send({ type: 'typing' });
    socket().open();
    expect(socket().sent).toHaveLength(1);
    expect(JSON.parse(socket().sent[0]!).type).toBe('item');
  });

  it('parses valid server messages and ignores invalid ones', () => {
    const { messages, socket } = setup();
    socket().open();
    socket().onmessage?.({ data: '{"type":"presence","peers":2}' });
    socket().onmessage?.({ data: '{"type":"nope"}' });
    socket().onmessage?.({ data: 'not json' });
    expect(messages).toEqual([{ type: 'presence', peers: 2 }]);
  });

  it('reconnects with backoff after the connection drops', () => {
    const { statuses, socket } = setup();
    socket().open();
    socket().drop();
    expect(statuses.at(-1)).toBe('reconnecting');
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(600);
    expect(FakeSocket.instances).toHaveLength(2);
    socket().open();
    expect(statuses.at(-1)).toBe('open');
  });

  it('stops retrying when the room is full', () => {
    const { statuses, socket } = setup();
    socket().drop(WS_CLOSE_ROOM_FULL);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(statuses.at(-1)).toBe('closed');
  });

  it('does not reconnect after close()', () => {
    const { conn, socket } = setup();
    socket().open();
    conn.close();
    socket().drop(1000);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
