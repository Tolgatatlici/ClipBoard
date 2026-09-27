/**
 * Testler için bellek içi RTCPeerConnection: aynı "ağdaki" iki bağlantı, teklif ve
 * yanıt eşleşince veri kanallarını birbirine bağlar.
 */
type Listener = (event: Event) => void;

export class FakeChannel {
  binaryType = 'arraybuffer';
  readyState = 'connecting';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onbufferedamountlow: (() => void) | null = null;
  peer: FakeChannel | null = null;
  sent = 0;

  send(data: string | ArrayBuffer) {
    if (this.readyState !== 'open') throw new Error('Channel not open');
    this.sent += typeof data === 'string' ? data.length : data.byteLength;
    const copy = typeof data === 'string' ? data : data.slice(0);
    queueMicrotask(() => this.peer?.onmessage?.({ data: copy }));
  }

  open() {
    this.readyState = 'open';
    this.onopen?.();
  }
}

export class FakeNetwork {
  private readonly pending = new Map<string, FakePeer>();
  private counter = 0;
  /** true ise bağlantılar kurulamaz (NAT arkası cihazlar). */
  blocked = false;

  nextSdp(kind: string) {
    return `${kind}-${++this.counter}`;
  }
  register(sdp: string, peer: FakePeer) {
    this.pending.set(sdp, peer);
  }
  find(sdp: string) {
    return this.pending.get(sdp);
  }
}

export class FakePeer {
  iceGatheringState = 'complete';
  connectionState = 'new';
  localDescription: { type: string; sdp: string } | null = null;
  ondatachannel: ((event: { channel: FakeChannel }) => void) | null = null;
  private channel: FakeChannel | null = null;
  private remote: FakePeer | null = null;
  private listeners = new Map<string, Listener[]>();
  closed = false;

  constructor(private readonly network: FakeNetwork) {}

  addEventListener(type: string, fn: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener() {}
  private dispatch(type: string) {
    for (const fn of this.listeners.get(type) ?? []) fn(new Event(type));
  }

  createDataChannel() {
    this.channel = new FakeChannel();
    return this.channel;
  }
  async createOffer() {
    return { type: 'offer', sdp: this.network.nextSdp('offer') };
  }
  async createAnswer() {
    return { type: 'answer', sdp: this.network.nextSdp('answer') };
  }
  async setLocalDescription(description: { type: string; sdp: string }) {
    this.localDescription = description;
    this.network.register(description.sdp, this);
  }
  async setRemoteDescription(description: { type: string; sdp: string }) {
    this.remote = this.network.find(description.sdp) ?? null;
    if (description.type === 'answer' && this.remote) this.connect(this.remote);
  }

  /** Teklif veren taraf yanıtı alınca iki kanalı birbirine bağlar. */
  private connect(answerer: FakePeer) {
    if (this.network.blocked) {
      this.connectionState = 'failed';
      this.dispatch('connectionstatechange');
      return;
    }
    const local = this.channel!;
    const remote = new FakeChannel();
    local.peer = remote;
    remote.peer = local;
    for (const peer of [this, answerer]) {
      peer.connectionState = 'connected';
      peer.dispatch('connectionstatechange');
    }
    answerer.ondatachannel?.({ channel: remote });
    remote.open();
    local.open();
  }

  close() {
    this.closed = true;
    if (this.channel) this.channel.readyState = 'closed';
  }
}
