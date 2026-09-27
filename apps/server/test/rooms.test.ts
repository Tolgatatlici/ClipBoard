import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { serverMessageSchema, type ServerMessage } from '@clipboard/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { TEST_REDIS_URL, useTestApp } from './helpers.js';
import { closeAll, openSocket, type TestSocket } from './ws-client.js';

const ctx = useTestApp(
  {},
  { rooms: { messageLimit: { count: 5, windowMs: 60_000 }, maxPeers: 3 } },
);

let baseUrl: string;

const ROOM = 'A'.repeat(22);
const OTHER_ROOM = 'B'.repeat(22);
const clients: WebSocket[] = [];

afterEach(() => closeAll(clients));

type TestClient = TestSocket<ServerMessage> & {
  /** Belirtilen sayıda cihaz bildiren çevrimiçi mesajını bekler. */
  peers(count: number): Promise<void>;
};

async function listenUrl(app: FastifyInstance) {
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  return address.replace('http', 'ws');
}

function connect(url: string, roomId = ROOM): TestClient {
  const client = openSocket<ServerMessage>(
    `${url}/ws/rooms/${roomId}`,
    serverMessageSchema,
    clients,
  );
  return Object.assign(client, {
    async peers(count: number) {
      for (;;) {
        const message = await client.next('presence');
        if (message.type === 'presence' && message.peers === count) return;
      }
    },
  });
}

const item = (n: number) => ({ type: 'item', item: { ct: `ciphertext${n}`, iv: 'I'.repeat(16) } });

describe('rooms', () => {
  beforeAll(async () => {
    baseUrl = await listenUrl(ctx.app);
  });

  it('welcomes a peer with an empty history', async () => {
    const a = connect(baseUrl);
    expect(await a.next('welcome')).toEqual({ type: 'welcome', peers: 1, history: [] });
  });

  it('broadcasts items to every peer and keeps them in the history', async () => {
    const a = connect(baseUrl);
    await a.next('welcome');
    const b = connect(baseUrl);
    await b.next('welcome');
    await a.peers(2);

    a.send(item(1));
    const received = [await a.next('item'), await b.next('item')];
    for (const message of received) {
      expect(message).toMatchObject({ type: 'item', item: { ct: 'ciphertext1' } });
    }

    const c = connect(baseUrl);
    const welcome = await c.next('welcome');
    expect(welcome).toMatchObject({ peers: 3, history: [{ ct: 'ciphertext1' }] });
  });

  it('does not mix rooms', async () => {
    const a = connect(baseUrl);
    await a.next('welcome');
    const other = connect(baseUrl, OTHER_ROOM);
    await other.next('welcome');
    a.send(item(1));
    await a.next('item');
    await expect(other.next('item')).rejects.toThrow(/Timed out/);
  });

  it('forwards typing notifications to others only', async () => {
    const a = connect(baseUrl);
    await a.next('welcome');
    const b = connect(baseUrl);
    await b.next('welcome');
    a.send({ type: 'typing' });
    expect(await b.next('typing')).toEqual({ type: 'typing' });
    await expect(a.next('typing')).rejects.toThrow(/Timed out/);
  });

  it('relays signals to other devices without storing them', async () => {
    const a = connect(baseUrl);
    await a.next('welcome');
    const b = connect(baseUrl);
    await b.next('welcome');
    const signal = { ct: 'encryptedsignal', iv: 'I'.repeat(16) };
    a.send({ type: 'signal', signal });
    expect(await b.next('signal')).toEqual({ type: 'signal', signal });
    await expect(a.next('signal')).rejects.toThrow(/Timed out/);
    const c = connect(baseUrl);
    expect(await c.next('welcome')).toMatchObject({ history: [] });
  });

  it('clears the room', async () => {
    const a = connect(baseUrl);
    await a.next('welcome');
    a.send(item(1));
    await a.next('item');
    a.send({ type: 'clear' });
    expect(await a.next('cleared')).toEqual({ type: 'cleared' });
    const b = connect(baseUrl);
    expect(await b.next('welcome')).toMatchObject({ history: [] });
  });

  it('updates presence when a peer leaves', async () => {
    const a = connect(baseUrl);
    await a.next('welcome');
    const b = connect(baseUrl);
    await b.next('welcome');
    await a.peers(2);
    b.socket.close();
    await a.peers(1);
  });

  it('rejects invalid messages', async () => {
    const a = connect(baseUrl);
    await a.next('welcome');
    a.socket.send('not json');
    expect(await a.next('error')).toEqual({ type: 'error', code: 'invalid_message' });
    a.send({ type: 'item', item: { ct: 'x', iv: 'short' } });
    expect(await a.next('error')).toEqual({ type: 'error', code: 'invalid_message' });
  });

  it('rate limits messages per connection', async () => {
    const a = connect(baseUrl);
    await a.next('welcome');
    for (let i = 0; i < 6; i++) a.send({ type: 'typing' });
    expect(await a.next('error')).toEqual({ type: 'error', code: 'rate_limited' });
  });

  it('keeps only the latest items', async () => {
    await ctx.redis.del(`room:${ROOM}:items`);
    for (let i = 0; i < 55; i++) {
      await ctx.redis.rpush(
        `room:${ROOM}:items`,
        JSON.stringify({ id: `${i}`, ts: i, ct: 'c', iv: 'I'.repeat(16) }),
      );
    }
    const a = connect(baseUrl);
    await a.next('welcome');
    a.send(item(1));
    await a.next('item');
    const b = connect(baseUrl);
    const welcome = await b.next('welcome');
    expect(welcome.type === 'welcome' && welcome.history).toHaveLength(50);
  });

  it('closes connections to a full room', async () => {
    for (let i = 0; i < 3; i++) await connect(baseUrl).next('welcome');
    const extra = connect(baseUrl);
    expect(await extra.next('error')).toEqual({ type: 'error', code: 'room_full' });
    expect(await extra.closed).toBe(4001);
  });

  it('closes connections with an invalid room id', async () => {
    const bad = connect(baseUrl, 'not-a-room');
    expect(await bad.closed).toBe(1008);
  });
});

describe('rooms across server instances', () => {
  const redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
  let second: FastifyInstance;
  let secondUrl: string;

  beforeAll(async () => {
    second = await buildApp(loadConfig({ NODE_ENV: 'test' }), { redis });
    secondUrl = await listenUrl(second);
  });

  afterAll(async () => {
    await second.close();
    await redis.quit();
  });

  it('delivers items published on another instance', async () => {
    const a = connect(baseUrl);
    await a.next('welcome');
    const b = connect(secondUrl);
    await b.next('welcome');
    await a.peers(2);

    a.send(item(7));
    expect(await b.next('item')).toMatchObject({ item: { ct: 'ciphertext7' } });
  });
});
