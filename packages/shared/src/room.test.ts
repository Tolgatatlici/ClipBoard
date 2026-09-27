import { describe, expect, it } from 'vitest';
import { DecryptionError } from './crypto.js';
import {
  deriveRoom,
  formatRoomCode,
  generateRoomCode,
  openRoomItem,
  parseRoomCode,
  roomIdSchema,
  sealRoomItem,
  type RoomContent,
} from './room.js';

describe('room codes', () => {
  it('generates, formats and parses codes', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(10);
    expect(parseRoomCode(formatRoomCode(code).toLowerCase())).toBe(code);
    expect(parseRoomCode('ABCD-EFGH')).toBeNull();
    expect(parseRoomCode('ABCDE-FGHJU')).toBeNull();
  });
});

describe('deriveRoom', () => {
  it('is deterministic per code and yields a valid room id', async () => {
    const a = await deriveRoom('ABCDEFGHJK');
    const b = await deriveRoom('ABCDEFGHJK');
    const c = await deriveRoom('ABCDEFGHJM');
    expect(a.roomId).toBe(b.roomId);
    expect(a.key).toEqual(b.key);
    expect(c.roomId).not.toBe(a.roomId);
    expect(roomIdSchema.safeParse(a.roomId).success).toBe(true);
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
    const room = await deriveRoom('ABCDEFGHJK');
    const sealed = await sealRoomItem(room, content);
    expect(sealed.ct).not.toContain('merhaba');
    expect(await openRoomItem(room, sealed)).toEqual(content);
  });

  it('cannot be read with another room key', async () => {
    const room = await deriveRoom('ABCDEFGHJK');
    const other = await deriveRoom('ABCDEFGHJM');
    const sealed = await sealRoomItem(room, { kind: 'text', format: 'plain', text: 'x' });
    await expect(openRoomItem(other, sealed)).rejects.toThrow(DecryptionError);
  });
});
