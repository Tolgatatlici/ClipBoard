import { ackMessage, CHUNK_SIZE, FileReceiver, isAck, sendFile } from './transfer';
import { FakeChannel } from './fake-rtc';

/** crypto.getRandomValues tek seferde en fazla 64 KB üretir. */
function randomData(length: number) {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i += 65536) crypto.getRandomValues(data.subarray(i, i + 65536));
  return data;
}

function pair() {
  const a = new FakeChannel();
  const b = new FakeChannel();
  a.peer = b;
  b.peer = a;
  a.open();
  b.open();
  return [a, b] as const;
}

describe('file transfer protocol', () => {
  it('sends a file in chunks and reassembles it', async () => {
    const data = randomData(CHUNK_SIZE * 3 + 123);
    const [sender, receiverChannel] = pair();
    const progress: number[] = [];
    const receiver = new FileReceiver(data.length, 'application/octet-stream', (n) =>
      progress.push(n),
    );
    const result = new Promise<Blob>((resolve, reject) => {
      receiverChannel.onmessage = ({ data: chunk }) => {
        try {
          const blob = receiver.handle(chunk as string | ArrayBuffer);
          if (blob) resolve(blob);
        } catch (err) {
          reject(err);
        }
      };
    });
    await sendFile(sender as never, new Blob([data]));
    const blob = await result;
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(data);
    expect(progress.at(-1)).toBe(data.length);
    expect(progress).toHaveLength(4);
  });

  it('waits for the buffer to drain before sending more', async () => {
    const [sender] = pair();
    sender.bufferedAmount = 10 * 1024 * 1024;
    let done = false;
    const sending = sendFile(sender as never, new Blob([new Uint8Array(10)])).then(() => {
      done = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(done).toBe(false);
    sender.bufferedAmount = 0;
    sender.onbufferedamountlow?.();
    await sending;
    expect(done).toBe(true);
  });

  it('rejects truncated or oversized streams', () => {
    const short = new FileReceiver(10, '');
    short.handle(JSON.stringify({ type: 'start', size: 10 }));
    short.handle(new ArrayBuffer(5));
    expect(() => short.handle(JSON.stringify({ type: 'end' }))).toThrow('Incomplete');

    const long = new FileReceiver(4, '');
    long.handle(JSON.stringify({ type: 'start', size: 4 }));
    expect(() => long.handle(new ArrayBuffer(5))).toThrow('Too much');

    expect(() =>
      new FileReceiver(4, '').handle(JSON.stringify({ type: 'start', size: 9 })),
    ).toThrow();
    expect(() => new FileReceiver(4, '').handle(new ArrayBuffer(1))).toThrow('before start');
  });

  it('recognizes acknowledgements', () => {
    expect(isAck(ackMessage())).toBe(true);
    expect(isAck('{"type":"end"}')).toBe(false);
    expect(isAck(new ArrayBuffer(1))).toBe(false);
  });
});
