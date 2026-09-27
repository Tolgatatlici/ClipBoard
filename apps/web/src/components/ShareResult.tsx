import { useState } from 'react';
import type { CreatedClip } from '../lib/clips';
import { api } from '../lib/api';
import { removeDeleteToken } from '../lib/delete-tokens';
import { CopyButton } from './CopyButton';
import { Countdown } from './Countdown';
import { ErrorAlert } from './ErrorAlert';
import { QrCode } from './QrCode';

interface Props {
  clip: CreatedClip;
  onDone(): void;
}

export function ShareResult({ clip, onDone }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteClip(clip.id, clip.deleteToken);
      removeDeleteToken(clip.id);
      setDeleted(true);
    } catch (err) {
      setError(err);
    } finally {
      setDeleting(false);
    }
  }

  if (deleted) {
    return (
      <section className="card flex flex-col items-start gap-4">
        <h2 className="text-lg font-semibold">İçerik silindi</h2>
        <p className="muted">Bu içerik artık hiçbir cihazdan açılamaz.</p>
        <button type="button" className="btn-primary" onClick={onDone}>
          Yeni paylaşım
        </button>
      </section>
    );
  }

  return (
    <section className="card flex flex-col gap-6" aria-labelledby="share-title">
      <div>
        <h2 id="share-title" className="text-lg font-semibold">
          Hazır! Diğer cihazda açın
        </h2>
        <p className="muted mt-1">
          <Countdown expiresAt={clip.expiresAt} /> sonra silinecek
          {clip.burnAfterRead && ' · ilk açılışta silinir'}
          {clip.hasPassword && ' · parola korumalı'}
        </p>
      </div>

      {clip.code && (
        <div className="flex flex-col gap-2">
          <span className="label">Kod</span>
          <div className="flex flex-wrap items-center gap-3">
            <output
              data-testid="share-code"
              className="rounded-lg bg-slate-100 px-4 py-2 font-mono text-3xl font-semibold tracking-[0.2em] dark:bg-slate-800"
            >
              {clip.code}
            </output>
            <CopyButton text={clip.code} label="Kodu kopyala" />
          </div>
          <p className="muted">Diğer cihazda bu siteyi açıp kodu girin.</p>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label className="label" htmlFor="share-link">
            Link
          </label>
          <div className="flex gap-2">
            <input
              id="share-link"
              data-testid="share-link"
              className="input min-w-0 font-mono text-xs"
              value={clip.link}
              readOnly
              onFocus={(event) => event.target.select()}
            />
            <CopyButton text={clip.link} label="Linki kopyala" className="btn-secondary shrink-0" />
          </div>
          <p className="muted">
            Linkteki anahtar sunucuya gönderilmez.
            {clip.code &&
              ' Kod kısa olduğu için hassas veriler için link veya QR kodu tercih edin.'}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1">
          <QrCode value={clip.link} />
          <span className="muted text-xs">Telefonla okutun</span>
        </div>
      </div>

      {error !== null && <ErrorAlert error={error} />}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={onDone}>
          Yeni paylaşım
        </button>
        <button type="button" className="btn-danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'Siliniyor…' : 'Şimdi sil'}
        </button>
      </div>
    </section>
  );
}
