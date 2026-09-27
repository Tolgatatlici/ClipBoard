import {
  createPairingKeys,
  derivePairing,
  openRoomSecret,
  pairServerMessageSchema,
  sealRoomSecret,
  WS_CLOSE_PAIRING_BUSY,
  WS_CLOSE_PAIRING_NOT_FOUND,
  type PairClientMessage,
  type PairingKeys,
  type PairingSecret,
  type PairServerMessage,
} from '@clipboard/shared';
import { api } from './api';

const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

function pairSocketUrl(code: string): string {
  const path = `/ws/pair/${code}`;
  if (API_BASE) return API_BASE.replace(/^http/, 'ws') + path;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

export type PairingFailure = 'not-found' | 'busy' | 'cancelled' | 'peer-left' | 'error';

export type HostState =
  | { step: 'waiting' }
  | { step: 'verify'; sas: string }
  | { step: 'sent' }
  | { step: 'failed'; reason: PairingFailure };

export type GuestState =
  | { step: 'connecting' }
  | { step: 'verify'; sas: string }
  | { step: 'done'; roomSecret: string }
  | { step: 'failed'; reason: PairingFailure };

/** Eşleştirme kanalına bağlanır; mesajları doğrular, kapanış kodunu hataya çevirir. */
function openChannel(
  code: string,
  onMessage: (message: PairServerMessage) => void,
  onFail: (reason: PairingFailure) => void,
) {
  const socket = new WebSocket(pairSocketUrl(code));
  let finished = false;
  socket.onmessage = (event) => {
    try {
      const parsed = pairServerMessageSchema.safeParse(JSON.parse(String(event.data)));
      if (parsed.success) onMessage(parsed.data);
    } catch {
      // Geçersiz mesajlar yok sayılır.
    }
  };
  socket.onclose = (event) => {
    if (finished) return;
    onFail(
      event.code === WS_CLOSE_PAIRING_NOT_FOUND
        ? 'not-found'
        : event.code === WS_CLOSE_PAIRING_BUSY
          ? 'busy'
          : 'error',
    );
  };
  return {
    send: (message: PairClientMessage) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    close: () => {
      finished = true;
      socket.close(1000);
    },
  };
}

type Role = 'host' | 'guest';

interface Handlers {
  onVerify(sas: string): void;
  onWaiting?(): void;
  onSecret?(message: Extract<PairServerMessage, { type: 'secret' }>, derived: PairingSecret): void;
  onFail(reason: PairingFailure): void;
}

/**
 * İki tarafın ortak akışı. Mesajlar sırayla işlenir; karşı tarafın açık anahtarı kendi
 * anahtarlarımızdan önce gelirse, anahtarlar hazır olunca kullanılmak üzere bekletilir.
 */
function runPairing(code: string, role: Role, handlers: Handlers) {
  let keys: PairingKeys | null = null;
  let peerKey: string | null = null;
  let derived: PairingSecret | null = null;
  let queue = Promise.resolve();
  let stopped = false;

  const deriveIfReady = async () => {
    if (!keys || !peerKey || derived) return;
    derived = await derivePairing({
      own: keys,
      peerPublicKey: peerKey,
      code,
      hostPublicKey: role === 'host' ? keys.publicKey : peerKey,
      guestPublicKey: role === 'host' ? peerKey : keys.publicKey,
    });
    handlers.onVerify(derived.sas);
  };

  const handle = async (message: PairServerMessage) => {
    if (stopped) return;
    switch (message.type) {
      case 'ready':
        // Ev sahibi bağlı değilse misafir ilk bağlanan olur: eşleştirme geçersizdir.
        if (message.role !== role) handlers.onFail(role === 'host' ? 'busy' : 'not-found');
        else handlers.onWaiting?.();
        break;
      case 'paired':
        keys = await createPairingKeys();
        channel.send({ type: 'hello', publicKey: keys.publicKey });
        await deriveIfReady();
        break;
      case 'hello':
        peerKey = message.publicKey;
        await deriveIfReady();
        break;
      case 'secret':
        if (derived) handlers.onSecret?.(message, derived);
        break;
      case 'cancel':
        handlers.onFail('cancelled');
        break;
      case 'peer-left':
        if (role === 'guest') {
          handlers.onFail('peer-left');
        } else {
          // Doğrulama sırasında ayrılan cihazın yerine başka bir cihaz gelebilir.
          keys = peerKey = derived = null;
          handlers.onWaiting?.();
        }
        break;
    }
  };

  const channel = openChannel(
    code,
    (message) => {
      queue = queue.then(() => handle(message)).catch(() => handlers.onFail('error'));
    },
    (reason) => handlers.onFail(reason),
  );
  return {
    channel,
    derived: () => derived,
    /** Eşleştirme tamamlandı: kanaldan gelecek diğer mesajlar (ör. ayrılma) yok sayılır. */
    stop: () => {
      stopped = true;
    },
  };
}

export interface HostPairing {
  code: string;
  expiresAt: number;
  confirm(): Promise<void>;
  cancel(): void;
}

/**
 * Odadaki cihaz: eşleştirme kodu alır, yeni cihazla anahtar değişimi yapar ve kullanıcı
 * doğrulama numarasını onaylayınca oda sırrını şifreli olarak gönderir.
 */
export async function startHostPairing(
  roomSecret: string,
  onState: (state: HostState) => void,
): Promise<HostPairing> {
  const { code, expiresAt } = await api.createPairing();
  const { channel, derived, stop } = runPairing(code, 'host', {
    onWaiting: () => onState({ step: 'waiting' }),
    onVerify: (sas) => onState({ step: 'verify', sas }),
    onFail: (reason) => {
      channel.close();
      onState({ step: 'failed', reason });
    },
  });
  onState({ step: 'waiting' });

  return {
    code,
    expiresAt,
    async confirm() {
      const current = derived();
      if (!current) return;
      channel.send({ type: 'secret', secret: await sealRoomSecret(current.key, roomSecret, code) });
      stop();
      onState({ step: 'sent' });
      // Mesajın iletilmesi için kısa bir süre tanı.
      setTimeout(() => channel.close(), 500);
    },
    cancel() {
      channel.send({ type: 'cancel' });
      channel.close();
    },
  };
}

/** Yeni cihaz: kodla kanala katılır, doğrulama numarasını gösterir ve oda sırrını alır. */
export function startGuestPairing(code: string, onState: (state: GuestState) => void) {
  const fail = (reason: PairingFailure) => {
    channel.close();
    onState({ step: 'failed', reason });
  };
  const { channel } = runPairing(code, 'guest', {
    onVerify: (sas) => onState({ step: 'verify', sas }),
    onSecret: (message, derived) => {
      openRoomSecret(derived.key, message.secret, code)
        .then((roomSecret) => {
          channel.close();
          onState({ step: 'done', roomSecret });
        })
        .catch(() => fail('error'));
    },
    onFail: fail,
  });
  onState({ step: 'connecting' });

  return {
    cancel() {
      channel.send({ type: 'cancel' });
      channel.close();
    },
  };
}
