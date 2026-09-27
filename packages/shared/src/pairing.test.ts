import { describe, expect, it } from 'vitest';
import { DecryptionError } from './crypto.js';
import {
  createPairingKeys,
  derivePairing,
  formatPairingCode,
  normalizePairingCode,
  openRoomSecret,
  pairClientMessageSchema,
  sealRoomSecret,
  type PairingKeys,
} from './pairing.js';
import { generateRoomSecret } from './room.js';

async function pair(host: PairingKeys, guest: PairingKeys, code = '123456') {
  const common = { code, hostPublicKey: host.publicKey, guestPublicKey: guest.publicKey };
  return {
    host: await derivePairing({ ...common, own: host, peerPublicKey: guest.publicKey }),
    guest: await derivePairing({ ...common, own: guest, peerPublicKey: host.publicKey }),
  };
}

describe('pairing codes', () => {
  it('normalizes and formats', () => {
    expect(normalizePairingCode(' 123 456 ')).toBe('123456');
    expect(normalizePairingCode('12345')).toBeNull();
    expect(formatPairingCode('123456')).toBe('123 456');
  });
});

describe('ECDH pairing', () => {
  it('derives the same key and verification number on both devices', async () => {
    const host = await createPairingKeys();
    const guest = await createPairingKeys();
    expect(
      pairClientMessageSchema.safeParse({ type: 'hello', publicKey: host.publicKey }).success,
    ).toBe(true);

    const { host: h, guest: g } = await pair(host, guest);
    expect(h.key).toEqual(g.key);
    expect(h.sas).toBe(g.sas);
    expect(h.sas).toMatch(/^\d{3} \d{3}$/);

    const secret = generateRoomSecret();
    const sealed = await sealRoomSecret(h.key, secret, '123456');
    expect(sealed.ct).not.toContain(secret);
    expect(await openRoomSecret(g.key, sealed, '123456')).toBe(secret);
  });

  it('reveals a man in the middle through different verification numbers', async () => {
    const host = await createPairingKeys();
    const guest = await createPairingKeys();
    // Sunucu her iki tarafa da kendi açık anahtarını verir.
    const mitmForHost = await createPairingKeys();
    const mitmForGuest = await createPairingKeys();

    const hostView = await derivePairing({
      own: host,
      peerPublicKey: mitmForHost.publicKey,
      code: '123456',
      hostPublicKey: host.publicKey,
      guestPublicKey: mitmForHost.publicKey,
    });
    const guestView = await derivePairing({
      own: guest,
      peerPublicKey: mitmForGuest.publicKey,
      code: '123456',
      hostPublicKey: mitmForGuest.publicKey,
      guestPublicKey: guest.publicKey,
    });
    expect(hostView.sas).not.toBe(guestView.sas);
    expect(hostView.key).not.toEqual(guestView.key);
  });

  it('binds the result to the pairing code', async () => {
    const host = await createPairingKeys();
    const guest = await createPairingKeys();
    const a = await pair(host, guest, '111111');
    const b = await pair(host, guest, '222222');
    expect(a.host.sas).not.toBe(b.host.sas);
    const sealed = await sealRoomSecret(a.host.key, generateRoomSecret(), '111111');
    await expect(openRoomSecret(a.guest.key, sealed, '222222')).rejects.toThrow(DecryptionError);
  });

  it('rejects malformed public keys', async () => {
    const host = await createPairingKeys();
    await expect(
      derivePairing({
        own: host,
        peerPublicKey: 'not-a-key',
        code: '123456',
        hostPublicKey: host.publicKey,
        guestPublicKey: 'not-a-key',
      }),
    ).rejects.toThrow();
  });
});
