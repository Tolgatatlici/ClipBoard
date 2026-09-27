import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import {
  isShortCodeId,
  isValidClipId,
  PasswordRequiredError,
  WrongPasswordError,
  type ClipMetaResponse,
} from '@clipboard/shared';
import { CodeBlock, PlainText } from '../components/CodeBlock';
import { CodeInput } from '../components/CodeInput';
import { CopyButton } from '../components/CopyButton';
import { ExpiresIn } from '../components/Countdown';
import { ErrorAlert } from '../components/ErrorAlert';
import { FileView } from '../components/FileView';
import { PasswordPrompt } from '../components/PasswordPrompt';
import { api, ApiError } from '../lib/api';
import {
  decryptClip,
  downloadFile,
  fetchClip,
  parseFragment,
  type ClipSecret,
  type FetchedClip,
  type OpenedClip,
} from '../lib/clips';
import { getDeleteToken, removeDeleteToken } from '../lib/delete-tokens';
import { saveBytes } from '../lib/download';
import { useT } from '../i18n/use-i18n';
import { useTitle } from '../lib/use-title';

type State =
  | { step: 'loading' }
  | { step: 'need-code'; error?: unknown }
  | { step: 'missing-key' }
  | { step: 'confirm'; meta: ClipMetaResponse; secret: ClipSecret }
  | {
      step: 'need-password';
      secret: ClipSecret;
      burnAfterRead: boolean;
      /** İlk denemede alınan şifreli içerik; tek okumalık içerik ikinci kez alınamaz. */
      fetched?: FetchedClip;
      error?: unknown;
    }
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
  useTitle('titles.clip');
  // URL (kimlik veya `#` kısmı) değişince sayfa sıfırdan kurulur ve yükleniyor durumuna döner.
  const { pathname, hash } = useLocation();
  return <ClipLoader key={pathname + hash} />;
}

function ClipLoader() {
  const t = useT();
  const { id = '' } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ step: 'loading' });
  // StrictMode efektleri iki kez çalıştırır; aynı isteğin tekrarı yanlış kod denemesi
  // sayılmasın ve tek okumalık içerik ikinci istekte kaybolmasın diye sonucu paylaşıyoruz.
  const pending = useRef<{ key: string; promise: Promise<State> } | null>(null);

  const reveal = useCallback(
    async (secret: ClipSecret, password?: string, cached?: FetchedClip): Promise<State> => {
      let fetched = cached;
      try {
        fetched ??= await fetchClip(id, secret);
        return { step: 'ready', clip: await decryptClip(fetched, password) };
      } catch (error) {
        if (
          fetched &&
          (error instanceof WrongPasswordError || error instanceof PasswordRequiredError)
        ) {
          return {
            step: 'need-password',
            secret,
            fetched,
            burnAfterRead: fetched.payload.burnAfterRead,
            error: error instanceof WrongPasswordError ? error : undefined,
          };
        }
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
          if (meta.hasPassword) {
            return { step: 'need-password', secret, burnAfterRead: meta.burnAfterRead };
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

  async function handleConfirm(secret: ClipSecret, password?: string, cached?: FetchedClip) {
    setState({ step: 'opening' });
    setState(await reveal(secret, password, cached));
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
          <p className="muted">
            {state.step === 'loading' ? t('clip.loading') : t('clip.decrypting')}
          </p>
        </section>
      );

    case 'need-code':
      return (
        <section className="card flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">{t('clip.needCodeTitle')}</h1>
            <p className="muted">{t('clip.needCodeBody')}</p>
          </div>
          {state.error !== undefined && <ErrorAlert error={state.error} />}
          <CodeInput onSubmit={submitCode} />
        </section>
      );

    case 'need-password':
      return (
        <section className="card flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">{t('clip.passwordTitle')}</h1>
            <p className="muted">
              {t('clip.passwordBody')}
              {state.burnAfterRead && ` ${t('clip.burnPasswordWarning')}`}
            </p>
          </div>
          {state.error !== undefined && <ErrorAlert error={state.error} />}
          <PasswordPrompt
            onSubmit={(password) => void handleConfirm(state.secret, password, state.fetched)}
          />
        </section>
      );

    case 'missing-key':
      return (
        <section className="card flex flex-col items-start gap-4">
          <h1 className="text-xl font-semibold">{t('clip.missingKeyTitle')}</h1>
          <p className="muted">{t('clip.missingKeyBody')}</p>
          <Link to="/" className="btn-secondary">
            {t('common.home')}
          </Link>
        </section>
      );

    case 'confirm':
      return (
        <section className="card flex flex-col items-start gap-4">
          <h1 className="text-xl font-semibold">{t('clip.confirmTitle')}</h1>
          <p className="muted">{t('clip.confirmBody')}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleConfirm(state.secret)}
          >
            {t('clip.show')}
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
          <h1 className="text-xl font-semibold">{t('clip.deletedTitle')}</h1>
          <Link to="/" className="btn-primary">
            {t('common.newShare')}
          </Link>
        </section>
      );

    case 'error':
      return (
        <section className="card flex flex-col items-start gap-4">
          <h1 className="text-xl font-semibold">{t('clip.errorTitle')}</h1>
          <ErrorAlert error={state.error} />
          <Link to="/" className="btn-secondary">
            {t('common.home')}
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
  const t = useT();
  const [deleting, setDeleting] = useState(false);
  const { content, file } = clip;
  const loadFile = useCallback(() => downloadFile(file!), [file]);

  return (
    <section className="card flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">
          {content.kind === 'file' ? t('clip.fileTitle') : t('clip.textTitle')}
        </h1>
        <p className="muted">
          {clip.burnAfterRead ? (
            content.kind === 'file' ? (
              t('clip.burnedFile')
            ) : (
              t('clip.burnedText')
            )
          ) : (
            <ExpiresIn expiresAt={clip.expiresAt} />
          )}
        </p>
      </div>

      {content.kind === 'file' ? (
        file && (
          <FileView name={content.name} mime={content.mime} size={content.size} load={loadFile} />
        )
      ) : content.format === 'code' ? (
        <CodeBlock text={content.text} />
      ) : (
        <PlainText text={content.text} />
      )}

      <div className="flex flex-wrap gap-2">
        {content.kind === 'text' && (
          <>
            <CopyButton text={content.text} className="btn-primary" />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => saveBytes(content.text, 'clipboard.txt', 'text/plain;charset=utf-8')}
            >
              {t('clip.downloadTxt')}
            </button>
          </>
        )}
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
            {deleting ? t('common.deleting') : t('common.deleteNow')}
          </button>
        )}
      </div>
    </section>
  );
}
