import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { isShortCodeId, isValidClipId, type ClipMetaResponse } from '@clipboard/shared';
import { CodeInput } from '../components/CodeInput';
import { CopyButton } from '../components/CopyButton';
import { Countdown } from '../components/Countdown';
import { ErrorAlert } from '../components/ErrorAlert';
import { api, ApiError } from '../lib/api';
import { openTextClip, parseFragment, type ClipSecret, type OpenedClip } from '../lib/clips';
import { getDeleteToken, removeDeleteToken } from '../lib/delete-tokens';

type State =
  | { step: 'loading' }
  | { step: 'need-code'; error?: unknown }
  | { step: 'missing-key' }
  | { step: 'confirm'; meta: ClipMetaResponse; secret: ClipSecret }
  | { step: 'opening' }
  | { step: 'ready'; clip: OpenedClip }
  | { step: 'deleted' }
  | { step: 'error'; error: unknown };

const NOT_FOUND = new ApiError(404, { error: 'not_found' });

/** Hatalı koddan sonra yeni kod girilebilecek durumlar. */
function isRetryableCodeError(error: unknown): boolean {
  return error instanceof ApiError && error.body.error === 'invalid_token';
}

export function ClipPage() {
  // URL (kimlik veya `#` kısmı) değişince sayfa sıfırdan kurulur ve yükleniyor durumuna döner.
  const { pathname, hash } = useLocation();
  return <ClipLoader key={pathname + hash} />;
}

function ClipLoader() {
  const { id = '' } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ step: 'loading' });
  // StrictMode efektleri iki kez çalıştırır; aynı isteğin tekrarı yanlış kod denemesi
  // sayılmasın ve tek okumalık içerik ikinci istekte kaybolmasın diye sonucu paylaşıyoruz.
  const pending = useRef<{ key: string; promise: Promise<State> } | null>(null);

  const reveal = useCallback(
    async (secret: ClipSecret): Promise<State> => {
      try {
        return { step: 'ready', clip: await openTextClip(id, secret) };
      } catch (error) {
        if (secret.kind === 'code' && isRetryableCodeError(error)) {
          return { step: 'need-code', error };
        }
        return { step: 'error', error };
      }
    },
    [id],
  );

  useEffect(() => {
    let cancelled = false;
    const key = `${id}${hash}`;
    if (pending.current?.key !== key) {
      pending.current = {
        key,
        promise: (async (): Promise<State> => {
          if (!isValidClipId(id)) return { step: 'error', error: NOT_FOUND };
          const secret = parseFragment(hash);
          if (!secret) return isShortCodeId(id) ? { step: 'need-code' } : { step: 'missing-key' };
          let meta: ClipMetaResponse;
          try {
            meta = await api.getClipMeta(id);
          } catch (error) {
            return { step: 'error', error };
          }
          if (meta.burnAfterRead) return { step: 'confirm', meta, secret };
          return reveal(secret);
        })(),
      };
    }
    void pending.current.promise.then((next) => !cancelled && setState(next));
    return () => {
      cancelled = true;
    };
  }, [id, hash, reveal]);

  async function handleConfirm(secret: ClipSecret) {
    setState({ step: 'opening' });
    setState(await reveal(secret));
  }

  function submitCode({ id: codeId, secret }: { id: string; secret: string }) {
    // Aynı kod yeniden girildiyse URL değişmez; isteği doğrudan tekrarla.
    if (codeId === id && hash === `#s=${secret}`) {
      void handleConfirm({ kind: 'code', value: secret });
    } else {
      navigate(`/c/${codeId}#s=${secret}`);
    }
  }

  async function handleDelete(token: string) {
    try {
      await api.deleteClip(id, token);
      removeDeleteToken(id);
      setState({ step: 'deleted' });
    } catch (error) {
      setState({ step: 'error', error });
    }
  }

  switch (state.step) {
    case 'loading':
    case 'opening':
      return (
        <section className="card" aria-busy="true">
          <p className="muted">{state.step === 'loading' ? 'Yükleniyor…' : 'Şifre çözülüyor…'}</p>
        </section>
      );

    case 'need-code':
      return (
        <section className="card flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">Kodu girin</h1>
            <p className="muted">Bu içeriği açmak için paylaşım kodunun tamamı gerekiyor.</p>
          </div>
          {state.error !== undefined && <ErrorAlert error={state.error} />}
          <CodeInput onSubmit={submitCode} />
        </section>
      );

    case 'missing-key':
      return (
        <section className="card flex flex-col items-start gap-4">
          <h1 className="text-xl font-semibold">Link eksik</h1>
          <p className="muted">
            Bu linkte içeriği çözmek için gereken anahtar yok. Linki eksiksiz kopyaladığınızdan emin
            olun.
          </p>
          <Link to="/" className="btn-secondary">
            Ana sayfa
          </Link>
        </section>
      );

    case 'confirm':
      return (
        <section className="card flex flex-col items-start gap-4">
          <h1 className="text-xl font-semibold">Tek okumalık içerik</h1>
          <p className="muted">
            Bu içerik görüntülendiği anda sunucudan silinecek ve bir daha açılamayacak.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleConfirm(state.secret)}
          >
            İçeriği göster
          </button>
        </section>
      );

    case 'ready':
      return (
        <ClipView clip={state.clip} deleteToken={getDeleteToken(id)} onDelete={handleDelete} />
      );

    case 'deleted':
      return (
        <section className="card flex flex-col items-start gap-4">
          <h1 className="text-xl font-semibold">İçerik silindi</h1>
          <Link to="/" className="btn-primary">
            Yeni paylaşım
          </Link>
        </section>
      );

    case 'error':
      return (
        <section className="card flex flex-col items-start gap-4">
          <h1 className="text-xl font-semibold">İçerik açılamadı</h1>
          <ErrorAlert error={state.error} />
          <Link to="/" className="btn-secondary">
            Ana sayfa
          </Link>
        </section>
      );
  }
}

interface ClipViewProps {
  clip: OpenedClip;
  deleteToken: string | null;
  onDelete(token: string): Promise<void>;
}

function ClipView({ clip, deleteToken, onDelete }: ClipViewProps) {
  const [deleting, setDeleting] = useState(false);

  function download() {
    const url = URL.createObjectURL(new Blob([clip.text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'clipboard.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Paylaşılan içerik</h1>
        <p className="muted">
          {clip.burnAfterRead ? (
            'Sunucudan silindi; bu sayfayı kapatınca tekrar açılamaz.'
          ) : (
            <>
              <Countdown expiresAt={clip.expiresAt} /> sonra silinecek
            </>
          )}
        </p>
      </div>
      <pre
        data-testid="clip-content"
        className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm break-words whitespace-pre-wrap dark:border-slate-800 dark:bg-slate-950"
      >
        {clip.text}
      </pre>
      <div className="flex flex-wrap gap-2">
        <CopyButton text={clip.text} className="btn-primary" />
        <button type="button" className="btn-secondary" onClick={download}>
          İndir (.txt)
        </button>
        {deleteToken && !clip.burnAfterRead && (
          <button
            type="button"
            className="btn-danger"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              await onDelete(deleteToken);
            }}
          >
            {deleting ? 'Siliniyor…' : 'Şimdi sil'}
          </button>
        )}
      </div>
    </section>
  );
}
