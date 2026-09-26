import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  DEFAULT_TTL,
  LIMITS,
  MAX_SHORT_CODE_TTL,
  TTL_OPTIONS,
  type TtlOption,
} from '@clipboard/shared';
import { CodeInput } from '../components/CodeInput';
import { ErrorAlert } from '../components/ErrorAlert';
import { ShareResult } from '../components/ShareResult';
import { createTextClip, type CreatedClip } from '../lib/clips';
import { formatBytes, utf8Length } from '../lib/format';

const TTL_LABELS: Record<TtlOption, string> = {
  '5m': '5 dakika',
  '1h': '1 saat',
  '1d': '1 gün',
  '7d': '7 gün',
};

const ttlAllowedWithCode = (ttl: TtlOption) => TTL_OPTIONS[ttl] <= TTL_OPTIONS[MAX_SHORT_CODE_TTL];

export function HomePage() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [ttl, setTtl] = useState<TtlOption>(DEFAULT_TTL);
  const [burnAfterRead, setBurnAfterRead] = useState(false);
  const [withCode, setWithCode] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<CreatedClip | null>(null);

  const size = utf8Length(text);
  const tooLarge = size > LIMITS.maxTextBytes;
  const canSave = text.trim().length > 0 && !tooLarge && !saving;

  function handleWithCodeChange(checked: boolean) {
    setWithCode(checked);
    if (checked && !ttlAllowedWithCode(ttl)) setTtl(MAX_SHORT_CODE_TTL);
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      setCreated(await createTextClip(text, { ttl, burnAfterRead, withCode }));
      setText('');
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void save();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {created ? (
        <ShareResult clip={created} onDone={() => setCreated(null)} />
      ) : (
        <form className="card flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <label htmlFor="clip-text" className="text-lg font-semibold">
              Paylaşmak istediğiniz metni yapıştırın
            </label>
            <textarea
              id="clip-text"
              className="input min-h-56 resize-y font-mono"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Metin, link, kod parçası…"
              spellCheck={false}
              autoFocus
            />
            <div className="flex justify-between text-xs">
              <span className="muted">Ctrl/⌘ + Enter ile kaydedin</span>
              <span className={tooLarge ? 'font-medium text-red-600' : 'muted'}>
                {formatBytes(size)} / {formatBytes(LIMITS.maxTextBytes)}
              </span>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="label mb-2">Silinme süresi</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TTL_OPTIONS) as TtlOption[]).map((option) => {
                const disabled = withCode && !ttlAllowedWithCode(option);
                return (
                  <label
                    key={option}
                    className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-600 has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-indigo-500 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40 border-slate-300 dark:border-slate-700"
                  >
                    <input
                      type="radio"
                      name="ttl"
                      value={option}
                      checked={ttl === option}
                      disabled={disabled}
                      onChange={() => setTtl(option)}
                      className="sr-only"
                    />
                    {TTL_LABELS[option]}
                  </label>
                );
              })}
            </div>
            {withCode && (
              <p className="muted text-xs">
                Kısa kodlu paylaşımlar en fazla {TTL_LABELS[MAX_SHORT_CODE_TTL]} saklanır.
              </p>
            )}
          </fieldset>

          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={withCode}
                onChange={(event) => handleWithCodeChange(event.target.checked)}
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
          </div>

          {error !== null && <ErrorAlert error={error} />}

          <div>
            <button type="submit" className="btn-primary px-6 py-2.5" disabled={!canSave}>
              {saving ? 'Şifreleniyor…' : 'Şifrele ve paylaş'}
            </button>
          </div>
        </form>
      )}

      <section className="card flex flex-col gap-3" aria-labelledby="receive-title">
        <div>
          <h2 id="receive-title" className="text-lg font-semibold">
            Başka bir cihazdan mı paylaşıldı?
          </h2>
          <p className="muted">Kodu girin, içerik bu cihazda çözülsün.</p>
        </div>
        <CodeInput onSubmit={({ id, secret }) => navigate(`/c/${id}#s=${secret}`)} />
      </section>
    </div>
  );
}
