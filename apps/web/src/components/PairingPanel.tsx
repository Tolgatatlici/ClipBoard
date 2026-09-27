import { useState } from 'react';
import { formatPairingCode } from '@clipboard/shared';
import { useT } from '../i18n/use-i18n';
import { startHostPairing, type HostPairing, type HostState } from '../lib/pairing';
import { useSession } from '../lib/use-session';
import { Countdown } from './Countdown';
import { ErrorAlert } from './ErrorAlert';

/**
 * Odaya kodla yeni cihaz ekler: 6 haneli kodu gösterir, doğrulama numarasını iki
 * ekranda karşılaştırmayı ister ve onaylanınca oda sırrını şifreli gönderir.
 */
export function PairingPanel({ roomSecret, onClose }: { roomSecret: string; onClose(): void }) {
  const t = useT();
  const [attempt, setAttempt] = useState(0);
  const [pairing, setPairing] = useState<HostPairing | null>(null);
  const [state, setState] = useState<HostState>({ step: 'waiting' });
  const [error, setError] = useState<unknown>(null);

  // Her deneme (attempt) yeni bir kod alır; StrictMode'da kod iki kez alınmaz.
  useSession(attempt, () => {
    let cancelled = false;
    let started: HostPairing | null = null;
    startHostPairing(roomSecret, (next) => !cancelled && setState(next))
      .then((pairing) => {
        started = pairing;
        if (cancelled) pairing.cancel();
        else setPairing(pairing);
      })
      .catch((err: unknown) => !cancelled && setError(err));
    return {
      cancel() {
        cancelled = true;
        started?.cancel();
      },
    };
  });

  function restart() {
    setPairing(null);
    setError(null);
    setState({ step: 'waiting' });
    setAttempt((n) => n + 1);
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700"
      data-testid="pairing-panel"
    >
      <h2 className="font-semibold">{t('pairing.hostTitle')}</h2>
      {error !== null ? (
        <ErrorAlert error={error} />
      ) : !pairing ? (
        <p className="muted">{t('clip.loading')}</p>
      ) : state.step === 'waiting' ? (
        <>
          <p className="muted">{t('pairing.hostIntro')}</p>
          <output
            data-testid="pairing-code"
            className="self-start rounded-lg bg-slate-100 px-4 py-2 font-mono text-3xl font-semibold tracking-[0.2em] dark:bg-slate-800"
          >
            {formatPairingCode(pairing.code)}
          </output>
          <p className="muted text-sm" aria-live="polite">
            {t('pairing.waiting')} · <Countdown expiresAt={pairing.expiresAt} />
          </p>
        </>
      ) : state.step === 'verify' ? (
        <>
          <p>{t('pairing.verifyHost')}</p>
          <output data-testid="pairing-sas" className="self-start font-mono text-3xl font-semibold">
            {state.sas}
          </output>
          <p className="muted text-sm">{t('pairing.mismatchNote')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => void pairing.confirm()}>
              {t('pairing.confirm')}
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => {
                pairing.cancel();
                restart();
              }}
            >
              {t('pairing.reject')}
            </button>
          </div>
        </>
      ) : state.step === 'sent' ? (
        <p role="status">{t('pairing.sent')}</p>
      ) : (
        <p role="alert" className="text-red-700 dark:text-red-300">
          {state.reason === 'cancelled' ? t('pairing.cancelled') : t('pairing.failed')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {(state.step === 'sent' || state.step === 'failed' || error !== null) && (
          <button type="button" className="btn-secondary" onClick={restart}>
            {t('pairing.again')}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>
          {t('pairing.close')}
        </button>
      </div>
    </div>
  );
}
