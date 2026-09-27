import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  deriveRoom,
  formatRoomCode,
  generateRoomCode,
  parseRoomCode,
  type EncryptedRoomItem,
  type RoomContent,
  type RoomSecrets,
  type ServerMessage,
  type TextFormat,
} from '@clipboard/shared';
import { CodeBlock, PlainText } from '../components/CodeBlock';
import { CopyButton } from '../components/CopyButton';
import { ErrorAlert } from '../components/ErrorAlert';
import { FileView } from '../components/FileView';
import { QrCode } from '../components/QrCode';
import { RoomConnection, roomSocketUrl, type ConnectionStatus } from '../lib/room-connection';
import {
  decryptItem,
  downloadRoomFile,
  fileItem,
  mergeEntries,
  textItem,
  type RoomEntry,
} from '../lib/rooms';

/** Karşı taraf yazıyor bildiriminin ne kadar süre gösterileceği. */
const TYPING_VISIBLE_MS = 3000;
/** "Yazıyor" bildiriminin en sık gönderilme aralığı. */
const TYPING_THROTTLE_MS = 2000;

export function RoomPage() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const raw = decodeURIComponent(hash.replace(/^#/, ''));
  const code = parseRoomCode(raw);

  // Kodsuz açılırsa yeni bir oda oluştur.
  useEffect(() => {
    if (!raw) navigate(`/r#${formatRoomCode(generateRoomCode())}`, { replace: true });
  }, [raw, navigate]);

  if (!raw) return null;
  if (!code) {
    return (
      <section className="card flex flex-col items-start gap-4">
        <h1 className="text-xl font-semibold">Geçersiz oda kodu</h1>
        <p className="muted">Oda kodu 10 karakterden oluşur, örneğin ABCDE-FGHJK.</p>
        <Link to="/r" className="btn-primary">
          Yeni oda oluştur
        </Link>
      </section>
    );
  }
  return <Room key={code} code={code} />;
}

function Room({ code }: { code: string }) {
  const [room, setRoom] = useState<RoomSecrets | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [roomFull, setRoomFull] = useState(false);
  const [peers, setPeers] = useState(0);
  const [entries, setEntries] = useState<RoomEntry[]>([]);
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const connection = useRef<RoomConnection | null>(null);

  useEffect(() => () => clearTimeout(typingTimer.current), []);

  useEffect(() => {
    let cancelled = false;
    void deriveRoom(code).then((derived) => !cancelled && setRoom(derived));
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!room) return;
    const handle = async (message: ServerMessage) => {
      switch (message.type) {
        case 'welcome': {
          setPeers(message.peers);
          const decrypted = await Promise.all(message.history.map((i) => decryptItem(room, i)));
          // Yeniden bağlanınca geçmiş sunucudakiyle değiştirilir.
          setEntries(mergeEntries([], decrypted));
          break;
        }
        case 'item': {
          const entry = await decryptItem(room, message.item);
          setEntries((current) => mergeEntries(current, [entry]));
          clearTimeout(typingTimer.current);
          setTyping(false);
          break;
        }
        case 'presence':
          setPeers(message.peers);
          break;
        case 'typing':
          setTyping(true);
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setTyping(false), TYPING_VISIBLE_MS);
          break;
        case 'cleared':
          setEntries([]);
          break;
        case 'error':
          if (message.code === 'room_full') setRoomFull(true);
          break;
      }
    };
    const conn = new RoomConnection(roomSocketUrl(room.roomId), {
      onMessage: (message) => void handle(message),
      onStatus: setStatus,
    });
    connection.current = conn;
    return () => {
      conn.close();
      connection.current = null;
    };
  }, [room]);

  const link = `${window.location.origin}/r#${formatRoomCode(code)}`;

  if (roomFull) {
    return (
      <section className="card flex flex-col items-start gap-4">
        <h1 className="text-xl font-semibold">Oda dolu</h1>
        <p className="muted">Bu odaya bağlı cihaz sayısı sınıra ulaştı.</p>
        <Link to="/r" className="btn-primary">
          Yeni oda oluştur
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <RoomHeader code={code} link={link} status={status} peers={peers} ready={room !== null} />
      <Composer
        disabled={!room}
        onSend={async (build) => {
          if (!room || !connection.current) return;
          connection.current.send({ type: 'item', item: await build(room) });
        }}
        onTyping={() => connection.current?.send({ type: 'typing' })}
      />
      <Feed
        entries={entries}
        typing={typing}
        onClear={() => connection.current?.send({ type: 'clear' })}
      />
    </div>
  );
}

function RoomHeader(props: {
  code: string;
  link: string;
  status: ConnectionStatus;
  peers: number;
  ready: boolean;
}) {
  const { code, link, status, peers, ready } = props;
  const [showQr, setShowQr] = useState(false);
  const formatted = formatRoomCode(code);
  const statusText = !ready
    ? 'Anahtar hazırlanıyor…'
    : status === 'open'
      ? `Bağlı · ${peers} cihaz`
      : status === 'reconnecting'
        ? 'Yeniden bağlanıyor…'
        : status === 'closed'
          ? 'Bağlantı kapandı'
          : 'Bağlanıyor…';
  const dotClass =
    status === 'open' && ready
      ? 'bg-emerald-500'
      : status === 'closed'
        ? 'bg-red-500'
        : 'bg-amber-400';

  return (
    <section className="card flex flex-col gap-4" aria-labelledby="room-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="room-title" className="text-xl font-semibold">
            Canlı oda
          </h1>
          <p className="muted">
            Bu kodu diğer cihazda girin; gönderilen her şey anında görünür. Oda 24 saat hareketsiz
            kalınca silinir.
          </p>
        </div>
        <span className="flex items-center gap-2 text-sm" data-testid="room-status">
          <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} aria-hidden="true" />
          {statusText}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <output
          data-testid="room-code"
          className="rounded-lg bg-slate-100 px-4 py-2 font-mono text-2xl font-semibold tracking-[0.2em] dark:bg-slate-800"
        >
          {formatted}
        </output>
        <CopyButton text={formatted} label="Kodu kopyala" />
        <CopyButton text={link} label="Linki kopyala" />
        <button type="button" className="btn-secondary" onClick={() => setShowQr(!showQr)}>
          {showQr ? 'QR gizle' : 'QR göster'}
        </button>
        <Link to="/" className="btn-secondary">
          Odadan çık
        </Link>
      </div>
      {showQr && (
        <div className="flex flex-col items-start gap-1">
          <QrCode value={link} />
          <span className="muted text-xs">Telefonla okutun</span>
        </div>
      )}
    </section>
  );
}

/** Oda anahtarıyla şifreli öğeyi hazırlayan adım. */
type BuildItem = (room: RoomSecrets) => Promise<EncryptedRoomItem>;

function Composer(props: {
  disabled: boolean;
  onSend(build: BuildItem): Promise<void>;
  onTyping(): void;
}) {
  const { disabled, onSend, onTyping } = props;
  const [text, setText] = useState('');
  const [format, setFormat] = useState<TextFormat>('plain');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [dragging, setDragging] = useState(false);
  const lastTyping = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  async function run(build: BuildItem, withProgress: boolean) {
    setBusy(true);
    setError(null);
    setProgress(withProgress ? 0 : null);
    try {
      await onSend(build);
      return true;
    } catch (err) {
      setError(err);
      return false;
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function sendText() {
    if (!text.trim() || busy || disabled) return;
    if (await run((room) => textItem(room, text, format), false)) setText('');
  }

  function sendFile(file: File) {
    if (busy || disabled) return;
    void run((room) => fileItem(room, file, setProgress), true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void sendText();
    }
  }

  function handleChange(value: string) {
    setText(value);
    const now = Date.now();
    if (value && now - lastTyping.current > TYPING_THROTTLE_MS) {
      lastTyping.current = now;
      onTyping();
    }
  }

  function handlePaste(event: ClipboardEvent) {
    const pasted = event.clipboardData.files[0];
    if (pasted) {
      event.preventDefault();
      sendFile(pasted);
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) sendFile(dropped);
  }

  return (
    <form
      className={`card relative flex flex-col gap-3 ${dragging ? 'ring-2 ring-indigo-500' : ''}`}
      onSubmit={(event) => {
        event.preventDefault();
        void sendText();
      }}
      onPaste={handlePaste}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="room-text" className="font-semibold">
          Odaya gönder
        </label>
        <div className="flex gap-1" role="radiogroup" aria-label="Biçim">
          {(['plain', 'code'] as const).map((option) => (
            <label
              key={option}
              className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1 text-sm has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-600 has-[:checked]:text-white dark:border-slate-700"
            >
              <input
                type="radio"
                name="room-format"
                className="sr-only"
                checked={format === option}
                onChange={() => setFormat(option)}
              />
              {option === 'plain' ? 'Metin' : 'Kod'}
            </label>
          ))}
        </div>
      </div>
      <textarea
        id="room-text"
        className="input min-h-28 resize-y font-mono"
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Metin yapıştırın, görsel yapıştırın ya da dosya sürükleyin…"
        spellCheck={false}
      />
      {error !== null && <ErrorAlert error={error} />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={disabled || busy || !text.trim()}>
          {busy && progress === null ? 'Gönderiliyor…' : 'Gönder'}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={disabled || busy}
          onClick={() => fileInput.current?.click()}
        >
          Dosya gönder
        </button>
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          aria-label="Odaya dosya seç"
          data-testid="room-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) sendFile(file);
          }}
        />
        {progress !== null && (
          <progress
            className="h-2 flex-1 accent-indigo-600"
            value={progress}
            max={1}
            aria-label="Yükleme ilerlemesi"
          />
        )}
        <span className="muted hidden text-xs sm:inline">Ctrl/⌘ + Enter ile gönderin</span>
      </div>
      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-indigo-50/90 text-lg font-medium text-indigo-700 dark:bg-indigo-950/90 dark:text-indigo-300">
          Dosyayı bırakın
        </div>
      )}
    </form>
  );
}

function Feed(props: { entries: RoomEntry[]; typing: boolean; onClear(): void }) {
  const { entries, typing, onClear } = props;
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="feed-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="feed-title" className="font-semibold">
          Paylaşılanlar
        </h2>
        {entries.length > 0 &&
          (confirming ? (
            <span className="flex gap-2">
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  onClear();
                  setConfirming(false);
                }}
              >
                Evet, temizle
              </button>
              <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
                Vazgeç
              </button>
            </span>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}>
              Odayı temizle
            </button>
          ))}
      </div>
      {typing && (
        <p className="muted text-sm" aria-live="polite" data-testid="typing-indicator">
          Diğer cihaz yazıyor…
        </p>
      )}
      {entries.length === 0 ? (
        <p className="muted rounded-2xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">
          Henüz bir şey paylaşılmadı.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="card flex flex-col gap-3" data-testid="room-item">
              <time className="muted text-xs" dateTime={new Date(entry.ts).toISOString()}>
                {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </time>
              <EntryContent content={entry.content} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EntryContent({ content }: { content: RoomContent | null }) {
  if (!content) return <p className="muted text-sm">Bu öğe çözülemedi.</p>;
  if (content.kind === 'file') return <RoomFile content={content} />;
  return (
    <>
      {content.format === 'code' ? (
        <CodeBlock text={content.text} />
      ) : (
        <PlainText text={content.text} />
      )}
      <div>
        <CopyButton text={content.text} />
      </div>
    </>
  );
}

function RoomFile({ content }: { content: Extract<RoomContent, { kind: 'file' }> }) {
  const load = useCallback(() => downloadRoomFile(content), [content]);
  return <FileView name={content.name} mime={content.mime} size={content.size} load={load} />;
}
