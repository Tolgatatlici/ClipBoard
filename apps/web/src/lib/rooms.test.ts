import { generateRoomSecret, LIMITS, roomFromSecret } from '@clipboard/shared';
import { decryptItem, mergeEntries, RoomTextTooLargeError, textItem } from './rooms';

const entry = (id: string, ts: number) => ({ id, ts, content: null });

describe('mergeEntries', () => {
  it('sorts newest first and de-duplicates by id', () => {
    const merged = mergeEntries([entry('a', 1), entry('b', 3)], [entry('c', 2), entry('a', 1)]);
    expect(merged.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps at most the room history limit', () => {
    const many = Array.from({ length: LIMITS.maxRoomHistory + 5 }, (_, i) => entry(`${i}`, i));
    expect(mergeEntries([], many)).toHaveLength(LIMITS.maxRoomHistory);
  });
});

describe('room items', () => {
  it('encrypts text and marks undecryptable items', async () => {
    const room = await roomFromSecret(generateRoomSecret());
    const other = await roomFromSecret(generateRoomSecret());
    const sealed = await textItem(room, 'selam', 'plain');
    const item = { ...sealed, id: '1', ts: 1 };
    expect((await decryptItem(room, item)).content).toEqual({
      kind: 'text',
      format: 'plain',
      text: 'selam',
    });
    expect((await decryptItem(other, item)).content).toBeNull();
  });

  it('rejects texts over the room limit', async () => {
    const room = await roomFromSecret(generateRoomSecret());
    expect(() => textItem(room, 'x'.repeat(LIMITS.maxRoomTextBytes + 1), 'plain')).toThrow(
      RoomTextTooLargeError,
    );
  });
});
