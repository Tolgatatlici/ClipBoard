import { signalSchema, type Signal } from './signals';
import { createAnswer, createOffer } from './peer';
import { ackMessage, FileReceiver, isAck, sendFile } from './transfer';

/** Doğrudan aktarımda izin verilen en büyük dosya. */
export const MAX_P2P_BYTES = 2 * 1024 * 1024 * 1024;
/** Bağlantı bu sürede kurulamazsa aktarım başarısız sayılır. */
const CONNECT_TIMEOUT_MS = 20_000;

export type ReceiverStatus = 'connecting' | 'sending' | 'done' | 'failed' | 'declined';
export type IncomingStatus =
  'offered' | 'connecting' | 'receiving' | 'done' | 'failed' | 'declined' | 'cancelled';

export interface OutgoingTransfer {
  transferId: string;
  name: string;
  size: number;
  receivers: { clientId: string; status: ReceiverStatus; sent: number }[];
}

export interface IncomingTransfer {
  transferId: string;
  from: string;
  name: string;
  size: number;
  mime: string;
  status: IncomingStatus;
  received: number;
  file: Blob | null;
}

export interface P2PSnapshot {
  outgoing: OutgoingTransfer[];
  incoming: IncomingTransfer[];
}

export class FileTooLargeForP2PError extends Error {}

interface Options {
  clientId: string;
  sendSignal(signal: Signal): void;
  iceServers(): Promise<RTCIceServer[]>;
  onChange(snapshot: P2PSnapshot): void;
  createPeer?(config: RTCConfiguration): RTCPeerConnection;
}

interface OutgoingState {
  file: File;
  info: OutgoingTransfer;
  peers: Map<string, RTCPeerConnection>;
}

interface IncomingState {
  info: IncomingTransfer;
  peer: RTCPeerConnection | null;
}

export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Bir odadaki doğrudan (P2P) dosya aktarımlarını yönetir.
 *
 * Gönderen dosyayı duyurur → alıcı kabul eder → gönderen o alıcı için bir
 * RTCPeerConnection açıp teklif gönderir → alıcı yanıtlar → veri kanalı açılınca dosya
 * parça parça gider, alıcı onaylar. Sinyaller şifreli oda kanalından geçer; dosya
 * sunucudan geçmez.
 */
export class P2PManager {
  private readonly outgoing = new Map<string, OutgoingState>();
  private readonly incoming = new Map<string, IncomingState>();
  private closed = false;

  constructor(private readonly options: Options) {}

  private createPeer(config: RTCConfiguration) {
    return this.options.createPeer?.(config) ?? new RTCPeerConnection(config);
  }

  private emit() {
    if (this.closed) return;
    this.options.onChange({
      outgoing: [...this.outgoing.values()].map((o) => ({
        ...o.info,
        receivers: o.info.receivers.map((r) => ({ ...r })),
      })),
      incoming: [...this.incoming.values()].map((i) => ({ ...i.info })),
    });
  }

  private signal(signal: Signal) {
    this.options.sendSignal(signal);
  }

  /** Dosyayı odadaki diğer cihazlara duyurur. */
  announce(file: File): string {
    if (file.size === 0 || file.size > MAX_P2P_BYTES) throw new FileTooLargeForP2PError();
    const transferId = randomId();
    this.outgoing.set(transferId, {
      file,
      peers: new Map(),
      info: { transferId, name: file.name || 'dosya', size: file.size, receivers: [] },
    });
    this.sendAnnouncement(transferId);
    this.emit();
    return transferId;
  }

  private sendAnnouncement(transferId: string) {
    const state = this.outgoing.get(transferId);
    if (!state) return;
    this.signal({
      kind: 'announce',
      transferId,
      from: this.options.clientId,
      name: state.info.name,
      size: state.info.size,
      mime: state.file.type,
    });
  }

  /** Odaya yeni bir cihaz katıldığında süren duyuruları tekrarlar. */
  reannounce() {
    for (const transferId of this.outgoing.keys()) this.sendAnnouncement(transferId);
  }

  /** Gönderimi durdurur ve alıcılara bildirir. */
  cancel(transferId: string) {
    const state = this.outgoing.get(transferId);
    if (!state) return;
    for (const pc of state.peers.values()) pc.close();
    this.outgoing.delete(transferId);
    this.signal({ kind: 'cancel', transferId, from: this.options.clientId });
    this.emit();
  }

  accept(transferId: string) {
    const state = this.incoming.get(transferId);
    if (!state || state.info.status !== 'offered') return;
    state.info.status = 'connecting';
    this.signal({ kind: 'accept', transferId, from: this.options.clientId, to: state.info.from });
    this.emit();
  }

  decline(transferId: string) {
    const state = this.incoming.get(transferId);
    if (!state) return;
    this.signal({ kind: 'decline', transferId, from: this.options.clientId, to: state.info.from });
    this.incoming.delete(transferId);
    this.emit();
  }

  /** Tamamlanan ya da başarısız bir alımı listeden kaldırır. */
  dismiss(transferId: string) {
    this.incoming.get(transferId)?.peer?.close();
    this.incoming.delete(transferId);
    this.emit();
  }

  handleSignal(raw: unknown) {
    const parsed = signalSchema.safeParse(raw);
    if (!parsed.success || this.closed) return;
    const signal = parsed.data;
    if ('to' in signal && signal.to !== this.options.clientId) return;
    if (signal.from === this.options.clientId) return;
    void this.dispatch(signal).catch(() => this.fail(signal.transferId, signal.from));
  }

  private async dispatch(signal: Signal) {
    switch (signal.kind) {
      case 'announce':
        if (!this.incoming.has(signal.transferId)) {
          this.incoming.set(signal.transferId, {
            peer: null,
            info: {
              transferId: signal.transferId,
              from: signal.from,
              name: signal.name,
              size: signal.size,
              mime: signal.mime,
              status: 'offered',
              received: 0,
              file: null,
            },
          });
          this.emit();
        }
        break;
      case 'accept':
        await this.startSending(signal.transferId, signal.from);
        break;
      case 'decline':
        this.setReceiver(signal.transferId, signal.from, { status: 'declined' });
        break;
      case 'offer':
        await this.startReceiving(signal.transferId, signal.sdp);
        break;
      case 'answer': {
        const pc = this.outgoing.get(signal.transferId)?.peers.get(signal.from);
        await pc?.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
        break;
      }
      case 'cancel': {
        const state = this.incoming.get(signal.transferId);
        if (state && state.info.status !== 'done') {
          state.peer?.close();
          state.info.status = 'cancelled';
          this.emit();
        }
        break;
      }
    }
  }

  private setReceiver(
    transferId: string,
    clientId: string,
    update: Partial<OutgoingTransfer['receivers'][number]>,
  ) {
    const state = this.outgoing.get(transferId);
    if (!state) return;
    let receiver = state.info.receivers.find((r) => r.clientId === clientId);
    if (!receiver) {
      receiver = { clientId, status: 'connecting', sent: 0 };
      state.info.receivers.push(receiver);
    }
    Object.assign(receiver, update);
    this.emit();
  }

  private fail(transferId: string, clientId: string) {
    const incoming = this.incoming.get(transferId);
    if (incoming && incoming.info.status !== 'done') {
      incoming.peer?.close();
      incoming.info.status = 'failed';
      this.emit();
    }
    const outgoing = this.outgoing.get(transferId);
    const receiver = outgoing?.info.receivers.find((r) => r.clientId === clientId);
    if (outgoing && receiver && receiver.status !== 'done') {
      outgoing.peers.get(clientId)?.close();
      this.setReceiver(transferId, clientId, { status: 'failed' });
    }
  }

  private watchConnection(pc: RTCPeerConnection, transferId: string, clientId: string) {
    const timer = setTimeout(() => {
      if (pc.connectionState !== 'connected') this.fail(transferId, clientId);
    }, CONNECT_TIMEOUT_MS);
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'connected') clearTimeout(timer);
      if (pc.connectionState === 'failed') {
        clearTimeout(timer);
        this.fail(transferId, clientId);
      }
    });
  }

  private async startSending(transferId: string, clientId: string) {
    const state = this.outgoing.get(transferId);
    if (!state || state.peers.has(clientId)) return;
    this.setReceiver(transferId, clientId, { status: 'connecting', sent: 0 });

    const pc = this.createPeer({ iceServers: await this.options.iceServers() });
    state.peers.set(clientId, pc);
    this.watchConnection(pc, transferId, clientId);

    const channel = pc.createDataChannel('file', { ordered: true });
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      this.setReceiver(transferId, clientId, { status: 'sending' });
      sendFile(channel, state.file, (sent) =>
        this.setReceiver(transferId, clientId, { sent }),
      ).catch(() => this.fail(transferId, clientId));
    };
    channel.onmessage = (event) => {
      if (isAck(event.data)) {
        this.setReceiver(transferId, clientId, { status: 'done', sent: state.file.size });
        setTimeout(() => pc.close(), 1000);
      }
    };

    const sdp = await createOffer(pc);
    this.signal({ kind: 'offer', transferId, from: this.options.clientId, to: clientId, sdp });
  }

  private async startReceiving(transferId: string, offer: string) {
    const state = this.incoming.get(transferId);
    if (!state || state.info.status !== 'connecting' || state.peer) return;
    const pc = this.createPeer({ iceServers: await this.options.iceServers() });
    state.peer = pc;
    this.watchConnection(pc, transferId, state.info.from);

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      channel.binaryType = 'arraybuffer';
      const receiver = new FileReceiver(state.info.size, state.info.mime, (received) => {
        state.info.received = received;
        if (state.info.status === 'connecting') state.info.status = 'receiving';
        this.emit();
      });
      channel.onmessage = (message) => {
        try {
          const file = receiver.handle(message.data as string | ArrayBuffer);
          if (file) {
            state.info.file = file;
            state.info.status = 'done';
            channel.send(ackMessage());
            this.emit();
          }
        } catch {
          this.fail(transferId, state.info.from);
        }
      };
    };

    const sdp = await createAnswer(pc, offer);
    this.signal({
      kind: 'answer',
      transferId,
      from: this.options.clientId,
      to: state.info.from,
      sdp,
    });
  }

  close() {
    for (const transferId of [...this.outgoing.keys()]) this.cancel(transferId);
    for (const state of this.incoming.values()) state.peer?.close();
    this.incoming.clear();
    this.closed = true;
  }
}
