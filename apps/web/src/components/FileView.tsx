import { useCallback, useEffect, useState } from 'react';
import type { Bytes } from '@clipboard/shared';
import { useT } from '../i18n/use-i18n';
import { saveBytes } from '../lib/download';
import { formatBytes } from '../lib/format';
import { ErrorAlert } from './ErrorAlert';

/** Önizlemesi otomatik gösterilen en büyük görsel. */
const AUTO_PREVIEW_BYTES = 10 * 1024 * 1024;

interface Props {
  name: string;
  mime: string;
  size: number;
  /** Şifreli dosyayı indirip çözer. */
  load(): Promise<Bytes>;
}

export function FileView({ name, mime, size, load }: Props) {
  const t = useT();
  const isImage = mime.startsWith('image/');
  const [loaded, setLoaded] = useState<{ bytes: Bytes; previewUrl: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const accept = useCallback(
    (bytes: Bytes) => {
      const previewUrl = isImage ? URL.createObjectURL(new Blob([bytes], { type: mime })) : null;
      setLoaded({ bytes, previewUrl });
    },
    [isImage, mime],
  );

  // Önizleme adresi değişince ya da bileşen kaldırılınca eskisini serbest bırak.
  const previewUrl = loaded?.previewUrl ?? null;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function fetchData(): Promise<Bytes | null> {
    if (loaded) return loaded.bytes;
    setBusy(true);
    setError(null);
    try {
      const bytes = await load();
      accept(bytes);
      return bytes;
    } catch (err) {
      setError(err);
      return null;
    } finally {
      setBusy(false);
    }
  }

  // Küçük görselleri açılır açılmaz indirip önizle.
  useEffect(() => {
    if (!isImage || size > AUTO_PREVIEW_BYTES) return;
    let cancelled = false;
    load()
      .then((bytes) => !cancelled && accept(bytes))
      .catch((err: unknown) => !cancelled && setError(err));
    return () => {
      cancelled = true;
    };
  }, [isImage, size, load, accept]);

  async function download() {
    const bytes = await fetchData();
    if (bytes) saveBytes(bytes, name, mime || undefined);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <FileIcon />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium" data-testid="file-name">
            {name}
          </p>
          <p className="muted text-xs">
            {formatBytes(size)}
            {mime && ` · ${mime}`}
          </p>
        </div>
        <button type="button" className="btn-primary shrink-0" onClick={download} disabled={busy}>
          {busy ? t('common.downloading') : t('common.download')}
        </button>
      </div>
      {previewUrl && (
        <img
          src={previewUrl}
          alt={name}
          data-testid="file-preview"
          className="max-h-[60vh] w-auto self-start rounded-lg border border-slate-200 dark:border-slate-800"
        />
      )}
      {error !== null && <ErrorAlert error={error} />}
    </div>
  );
}

export function FileIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-8 w-8 shrink-0 text-indigo-600"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}
