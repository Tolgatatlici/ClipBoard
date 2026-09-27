import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type WebSocket from 'ws';
import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import {
  createPairingKeys,
  createPairingResponseSchema,
  derivePairing,
  generateRoomSecret,
  openRoomSecret,
  pairServerMessageSchema,
  sealRoomSecret,
  WS_CLOSE_PAIRING_BUSY,
  WS_CLOSE_PAIRING_NOT_FOUND,
  type PairServerMessage,
} from '@clipboard/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { TEST_REDIS_URL, useTestApp } from './helpers.js';
import { closeAll, openSocket } from './ws-client.js';

const ctx = useTestApp();
const sockets: WebSocket[] = [];
let baseUrl: string;

beforeAll(async () => {
  baseUrl = (await ctx.app.listen({ port: 0, host: '127.0.0.1' })).replace('http', 'ws');
});
afterEach(() => closeAll(sockets));

async function createCode(app: FastifyInstance = ctx.app) {
  const res = await app.inject({ method: 'POST', url: '/api/pairings' });
  expect(res.statusCode).toBe(201);
  return createPairingResponseSchema.parse(res.json()).code;
}

const join = (code: string, url = baseUrl) =>
  openSocket<PairServerMessage>(`${url}/ws/pair/${code}`, pairServerMessageSchema, sockets);

describe('POST /api/pairings', () => {
  it('returns a 6 digit code valid for 5 minutes', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/pairings' });
    const body = createPairingResponseSchema.parse(res.json());
    expect(body.code).toMatch(/^\d{6}$/);
    expect(await ctx.redis.ttl(`pair:${body.code}`)).toBeGreaterThan(290);
  });
});

describe('pairing channel', () => {
  it('assigns roles and announces when both sides are present', async () => {
    const code = await createCode();
    const host = join(code);
    expect(await host.next('ready')).toEqual({ type: 'ready', role: 'host' });
    const guest = join(code);
    expect(await guest.next('ready')).toEqual({ type: 'ready', role: 'guest' });
    expect(await host.next('paired')).toEqual({ type: 'paired' });
    expect(await guest.next('paired')).toEqual({ type: 'paired' });
  });

  it('transfers a room secret end to end without the server learning it', async () => {
    const code = await createCode();
    const host = join(code);
    await host.next('ready');
    const guest = join(code);
    await guest.next('ready');
    await host.next('paired');

    const hostKeys = await createPairingKeys();
    const guestKeys = await createPairingKeys();
    host.send({ type: 'hello', publicKey: hostKeys.publicKey });
    guest.send({ type: 'hello', publicKey: guestKeys.publicKey });
    const toGuest = await guest.next('hello');
    const toHost = await host.next('hello');
    // Kendi mesajı kendisine geri gelmez.
    expect(toHost).toEqual({ type: 'hello', publicKey: guestKeys.publicKey });
    expect(toGuest).toEqual({ type: 'hello', publicKey: hostKeys.publicKey });

    const common = { code, hostPublicKey: hostKeys.publicKey, guestPublicKey: guestKeys.publicKey };
    const hostSide = await derivePairing({
      ...common,
      own: hostKeys,
      peerPublicKey: guestKeys.publicKey,
    });
    const guestSide = await derivePairing({
      ...common,
      own: guestKeys,
      peerPublicKey: hostKeys.publicKey,
    });
    expect(hostSide.sas).toBe(guestSide.sas);

    const roomSecret = generateRoomSecret();
    host.send({ type: 'secret', secret: await sealRoomSecret(hostSide.key, roomSecret, code) });
    const received = await guest.next('secret');
    expect(
      received.type === 'secret' && (await openRoomSecret(guestSide.key, received.secret, code)),
    ).toBe(roomSecret);

    // Sır iletildikten sonra kod bir daha kullanılamaz.
    await expect.poll(() => ctx.redis.exists(`pair:${code}`)).toBe(0);
    expect(await join(code).closed).toBe(WS_CLOSE_PAIRING_NOT_FOUND);
  });

  it('refuses a third device', async () => {
    const code = await createCode();
    await join(code).next('ready');
    await join(code).next('ready');
    expect(await join(code).closed).toBe(WS_CLOSE_PAIRING_BUSY);
  });

  it('tells the other side when a device leaves', async () => {
    const code = await createCode();
    const host = join(code);
    await host.next('ready');
    const guest = join(code);
    await guest.next('ready');
    guest.socket.close();
    expect(await host.next('peer-left')).toEqual({ type: 'peer-left' });
    // Ayrılan cihazın yeri boşalır; başka bir cihaz bağlanabilir.
    expect(await join(code).next('ready')).toEqual({ type: 'ready', role: 'guest' });
  });

  it('rejects unknown and malformed codes and invalid messages', async () => {
    expect(await join('000000').closed).toBe(WS_CLOSE_PAIRING_NOT_FOUND);
    expect(await join('abc').closed).toBe(1008);
    const code = await createCode();
    const host = join(code);
    await host.next('ready');
    host.send({ type: 'hello', publicKey: 'short' });
    expect(await host.closed).toBe(1008);
  });
});

describe('pairing across server instances', () => {
  const redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
  let second: FastifyInstance;
  let secondUrl: string;

  beforeAll(async () => {
    second = await buildApp(loadConfig({ NODE_ENV: 'test' }), { redis });
    secondUrl = (await second.listen({ port: 0, host: '127.0.0.1' })).replace('http', 'ws');
  });
  afterAll(async () => {
    await second.close();
    await redis.quit();
  });

  it('relays between devices connected to different instances', async () => {
    const code = await createCode();
    const host = join(code);
    await host.next('ready');
    const guest = join(code, secondUrl);
    expect(await guest.next('ready')).toEqual({ type: 'ready', role: 'guest' });
    await host.next('paired');
    const keys = await createPairingKeys();
    guest.send({ type: 'hello', publicKey: keys.publicKey });
    expect(await host.next('hello')).toEqual({ type: 'hello', publicKey: keys.publicKey });
  });
});
