/**
 * RTCDataChannel üzerinden dosya aktarımı: önce boyut bildirilir, dosya 64 KB'lık
 * parçalar halinde gönderilir, sonunda alıcı onay verir. Tampon dolunca gönderim
 * bekler (backpressure); büyük dosyalar belleği şişirmez.
 */
export const CHUNK_SIZE = 64 * 1024;
const HIGH_WATER_MARK = 4 * 1024 * 1024;

export interface ChannelLike {
  send(data: string | ArrayBuffer): void;
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  onbufferedamountlow: ((this: never, ev: Event) => unknown) | null;
  readonly readyState: string;
}

type Control = { type: 'start'; size: number } | { type: 'end' } | { type: 'ack' };

function waitForDrain(channel: ChannelLike): Promise<void> {
  return new Promise((resolve) => {
    channel.bufferedAmountLowThreshold = HIGH_WATER_MARK / 2;
    channel.onbufferedamountlow = () => {
      channel.onbufferedamountlow = null;
      resolve();
    };
  });
}

export class TransferCancelledError extends Error {}

export async function sendFile(
  channel: ChannelLike,
  file: Blob,
  onProgress?: (sent: number) => void,
): Promise<void> {
  channel.send(JSON.stringify({ type: 'start', size: file.size } satisfies Control));
  let offset = 0;
  while (offset < file.size) {
    if (channel.readyState !== 'open') throw new TransferCancelledError();
    if (channel.bufferedAmount > HIGH_WATER_MARK) await waitForDrain(channel);
    const chunk = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
    channel.send(chunk);
    offset += chunk.byteLength;
    onProgress?.(offset);
  }
  channel.send(JSON.stringify({ type: 'end' } satisfies Control));
}

export function ackMessage(): string {
  return JSON.stringify({ type: 'ack' } satisfies Control);
}

export function isAck(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  try {
    return (JSON.parse(data) as Control).type === 'ack';
  } catch {
    return false;
  }
}

/** Gelen parçaları toplar; dosya tamamlanınca (ve boyut doğruysa) Blob döner. */
export class FileReceiver {
  private readonly parts: ArrayBuffer[] = [];
  private received = 0;
  private started = false;

  constructor(
    private readonly expectedSize: number,
    private readonly type: string,
    private readonly onProgress?: (received: number) => void,
  ) {}

  /** Tamamlandıysa dosyayı döner; hatalı akışta hata fırlatır. */
  handle(data: string | ArrayBuffer): Blob | null {
    if (typeof data === 'string') {
      const control = JSON.parse(data) as Control;
      if (control.type === 'start') {
        if (control.size !== this.expectedSize) throw new Error('Unexpected file size');
        this.started = true;
        return null;
      }
      if (control.type === 'end') {
        if (!this.started || this.received !== this.expectedSize) {
          throw new Error('Incomplete transfer');
        }
        return new Blob(this.parts, { type: this.type });
      }
      return null;
    }
    if (!this.started) throw new Error('Data before start');
    this.received += data.byteLength;
    if (this.received > this.expectedSize) throw new Error('Too much data');
    this.parts.push(data);
    this.onProgress?.(this.received);
    return null;
  }
}
