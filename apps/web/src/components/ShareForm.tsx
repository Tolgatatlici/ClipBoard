import { useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import {
  DEFAULT_TTL,
  LIMITS,
  MAX_SHORT_CODE_TTL,
  TTL_OPTIONS,
  type TextFormat,
  type TtlOption,
} from '@clipboard/shared';
import { createClip, type CreatedClip } from '../lib/clips';
import { formatBytes, utf8Length } from '../lib/format';
import { ErrorAlert } from './ErrorAlert';
import { FileIcon } from './FileView';

const TTL_LABELS: Record<TtlOption, string> = {
  '5m': '5 dakika',
  '1h': '1 saat',
  '1d': '1 gün',
  '7d': '7 gün',
};

const ttlAllowedWithCode = (ttl: TtlOption) => TTL_OPTIONS[ttl] <= TTL_OPTIONS[MAX_SHORT_CODE_TTL];

const segmentClass =
  'cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm transition has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-600 has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-indigo-500 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 dark:border-slate-700';

export function ShareForm({ onCreated }: { onCreated(clip: CreatedClip): void }) {
  const [text, setText] = useState('');
  const [format, setFormat] = useState<TextFormat>('plain');
  const [file, setFile] = useState<File | null>(null);
  const [ttl, setTtl] = useState<TtlOption>(DEFAULT_TTL);
  const [burnAfterRead, setBurnAfterRead] = useState(false);
  const [wantCode, setWantCode] = useState(true);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Parola, kısa kodla atlanabileceği için kısa kodu kapatır.
  const withCode = wantCode && !usePassword;
  const size = file ? file.size : utf8Length(text);
  const limit = file ? LIMITS.maxFileBytes : LIMITS.maxTextBytes;
  const tooLarge = size > limit;
  const hasContent = file !== null || text.trim().length > 0;
  const canSave = hasContent && !tooLarge && !saving && (!usePassword || password.length > 0);

  function handleWantCodeChange(checked: boolean) {
    setWantCode(checked);
    if (checked && !usePassword && !ttlAllowedWithCode(ttl)) setTtl(MAX_SHORT_CODE_TTL);
  }

  function handlePasswordToggle(checked: boolean) {
    setUsePassword(checked);
    if (!checked && wantCode && !ttlAllowedWithCode(ttl)) setTtl(MAX_SHORT_CODE_TTL);
  }

  function attach(next: File | null) {
    setFile(next);
    setError(null);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setProgress(file ? 0 : null);
    try {
      const created = await createClip(
        file ? { kind: 'file', file } : { kind: 'text', text, format },
        {
          ttl,
          burnAfterRead,
          withCode,
          password: usePassword ? password : undefined,
          onProgress: setProgress,
        },
      );
      setText('');
      setFile(null);
      setPassword('');
      onCreated(created);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    }
  }

  // Panodan görsel yapıştırıldığında (ekran görüntüsü vb.) dosya olarak ekle.
  function handlePaste(event: ClipboardEvent) {
    const pasted = Array.from(event.clipboardData.files)[0];
    if (pasted) {
      event.preventDefault();
      attach(pasted);
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) attach(dropped);
  }

  return (
    <form
      className={`card relative flex flex-col gap-4 ${dragging ? 'ring-2 ring-indigo-500' : ''}`}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
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
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {file ? (
            <h2 className="text-lg font-semibold">Paylaşılacak dosya</h2>
          ) : (
            <label htmlFor="clip-text" className="text-lg font-semibold">
              Paylaşmak istediğiniz metni yapıştırın
            </label>
          )}
          {!file && (
            <div className="flex gap-1" role="radiogroup" aria-label="Biçim">
              {(['plain', 'code'] as const).map((option) => (
                <label key={option} className={segmentClass}>
                  <input
                    type="radio"
                    name="format"
                    className="sr-only"
                    checked={format === option}
                    onChange={() => setFormat(option)}
                  />
                  {option === 'plain' ? 'Metin' : 'Kod'}
                </label>
              ))}
            </div>
          )}
        </div>

        {file ? (
          <div className="flex items-center gap-3 rounded-lg border border-slate-300 p-4 dark:border-slate-700">
            <FileIcon />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" data-testid="attached-file">
                {file.name || 'Yapıştırılan görsel'}
              </p>
              <p className={tooLarge ? 'text-xs font-medium text-red-600' : 'muted text-xs'}>
                {formatBytes(file.size)} / en fazla {formatBytes(LIMITS.maxFileBytes)}
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => attach(null)}
              disabled={saving}
            >
              Kaldır
            </button>
          </div>
        ) : (
          <textarea
            id="clip-text"
            className="input min-h-56 resize-y font-mono"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Metin, link, kod parçası… ya da bir dosyayı buraya sürükleyin"
            spellCheck={false}
            autoFocus
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-3">
            <button
              type="button"
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              onClick={() => fileInput.current?.click()}
            >
              {file ? 'Başka dosya seç' : 'Dosya ekle'}
            </button>
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              aria-label="Dosya seç"
              data-testid="file-input"
              onChange={(event) => {
                attach(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />
            {!file && <span className="muted hidden sm:inline">Ctrl/⌘ + Enter ile kaydedin</span>}
          </span>
          {!file && (
            <span className={tooLarge ? 'font-medium text-red-600' : 'muted'}>
              {formatBytes(size)} / {formatBytes(LIMITS.maxTextBytes)}
            </span>
          )}
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-2">Silinme süresi</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TTL_OPTIONS) as TtlOption[]).map((option) => (
            <label key={option} className={segmentClass}>
              <input
                type="radio"
                name="ttl"
                value={option}
                checked={ttl === option}
                disabled={withCode && !ttlAllowedWithCode(option)}
                onChange={() => setTtl(option)}
                className="sr-only"
              />
              {TTL_LABELS[option]}
            </label>
          ))}
        </div>
        {withCode && (
          <p className="muted text-xs">
            Kısa kodlu paylaşımlar en fazla {TTL_LABELS[MAX_SHORT_CODE_TTL]} saklanır.
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
        <label className="flex items-center gap-2 text-sm has-[:disabled]:opacity-50">
          <input
            type="checkbox"
            checked={withCode}
            disabled={usePassword}
            onChange={(event) => handleWantCodeChange(event.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          Kısa kod oluştur
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={burnAfterRead}
            onChange={(event) => setBurnAfterRead(event.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          İlk açılışta sil
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={usePassword}
            onChange={(event) => handlePasswordToggle(event.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          Parola ile koru
        </label>
      </div>

      {usePassword && (
        <div className="flex flex-col gap-1">
          <label htmlFor="clip-password" className="label">
            Parola
          </label>
          <input
            id="clip-password"
            type="password"
            className="input sm:max-w-xs"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
          <p className="muted text-xs">
            Açmak için hem link hem parola gerekir. Parolayı linkten ayrı bir yoldan iletin; kısa
            kod bu seçenekle kullanılamaz.
          </p>
        </div>
      )}

      {error !== null && <ErrorAlert error={error} />}

      <div className="flex items-center gap-4">
        <button type="submit" className="btn-primary px-6 py-2.5" disabled={!canSave}>
          {saving ? (progress !== null ? 'Yükleniyor…' : 'Şifreleniyor…') : 'Şifrele ve paylaş'}
        </button>
        {progress !== null && (
          <progress
            className="h-2 flex-1 accent-indigo-600"
            value={progress}
            max={1}
            aria-label="Yükleme ilerlemesi"
          />
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-indigo-50/90 text-lg font-medium text-indigo-700 dark:bg-indigo-950/90 dark:text-indigo-300">
          Dosyayı bırakın
        </div>
      )}
    </form>
  );
}
