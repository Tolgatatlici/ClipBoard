import { describe, expect, it } from 'vitest';
import { DecryptionError } from './crypto.js';
import {
  generateRoomSecret,
  isRoomSecret,
  openRoomItem,
  roomFromSecret,
  roomIdSchema,
  sealRoomItem,
  type RoomContent,
} from './room.js';

describe('room secrets', () => {
  it('are random 256-bit values', () => {
    const a = generateRoomSecret();
    expect(isRoomSecret(a)).toBe(true);
    expect(a).toHaveLength(43);
    expect(generateRoomSecret()).not.toBe(a);
    expect(isRoomSecret('ABCDE-FGHJK')).toBe(false);
  });

  it('derive a stable room id and key', async () => {
    const secret = generateRoomSecret();
    const a = await roomFromSecret(secret);
    const b = await roomFromSecret(secret);
    const c = await roomFromSecret(generateRoomSecret());
    expect(a.roomId).toBe(b.roomId);
    expect(a.key).toEqual(b.key);
    expect(c.roomId).not.toBe(a.roomId);
    expect(roomIdSchema.safeParse(a.roomId).success).toBe(true);
    // Oda kimliği sırrın bir parçası değildir.
    expect(secret).not.toContain(a.roomId);
  });
});

describe('room items', () => {
  it.each<RoomContent>([
    { kind: 'text', format: 'plain', text: 'merhaba\nodaya 👋' },
    {
      kind: 'file',
      fileId: 'F'.repeat(22),
      key: 'K'.repeat(43),
      name: 'foto.jpg',
      mime: 'image/jpeg',
      size: 42,
    },
  ])('round-trips %o', async (content) => {
    const room = await roomFromSecret(generateRoomSecret());
    const sealed = await sealRoomItem(room, content);
    expect(sealed.ct).not.toContain('merhaba');
    expect(await openRoomItem(room, sealed)).toEqual(content);
  });

  it('cannot be read with another room key', async () => {
    const room = await roomFromSecret(generateRoomSecret());
    const other = await roomFromSecret(generateRoomSecret());
    const sealed = await sealRoomItem(room, { kind: 'text', format: 'plain', text: 'x' });
    await expect(openRoomItem(other, sealed)).rejects.toThrow(DecryptionError);
  });
});
