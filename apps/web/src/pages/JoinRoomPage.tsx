import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatPairingCode, normalizePairingCode } from '@clipboard/shared';
import { useT } from '../i18n/use-i18n';
import { startGuestPairing, type GuestState } from '../lib/pairing';
import { useSession } from '../lib/use-session';
import { useTitle } from '../lib/use-title';

/** Yeni cihaz: eşleştirme koduyla odaya katılır. */
export function JoinRoomPage() {
  useTitle('titles.room');
  const { code: raw = '' } = useParams();
  const code = normalizePairingCode(raw);
  if (!code) return <JoinFailed />;
  return <Join key={code} code={code} />;
}

function Join({ code }: { code: string }) {
  const t = useT();
  const navigate = useNavigate();
  const [state, setState] = useState<GuestState>({ step: 'connecting' });

  useSession(code, () => startGuestPairing(code, setState));

  useEffect(() => {
    if (state.step === 'done') navigate(`/r#${state.roomSecret}`, { replace: true });
  }, [state, navigate]);

  if (state.step === 'failed') return <JoinFailed reason={state.reason} />;

  return (
    <section className="card flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold">{t('pairing.guestTitle')}</h1>
      <p className="muted">
        {t('codeInput.pairingLabel')}: <span className="font-mono">{formatPairingCode(code)}</span>
      </p>
      {state.step === 'verify' ? (
        <>
          <p>{t('pairing.verifyGuest')}</p>
          <output data-testid="pairing-sas" className="font-mono text-3xl font-semibold">
            {state.sas}
          </output>
          <p className="muted text-sm">{t('pairing.mismatchNote')}</p>
        </>
      ) : (
        <p className="muted" aria-live="polite">
          {t('pairing.connecting')}
        </p>
      )}
    </section>
  );
}

function JoinFailed({ reason }: { reason?: string }) {
  const t = useT();
  return (
    <section className="card flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold">{t('pairing.guestTitle')}</h1>
      <p role="alert" className="text-red-700 dark:text-red-300">
        {reason === 'cancelled'
          ? t('pairing.cancelled')
          : reason === 'peer-left' || reason === 'error'
            ? t('pairing.failed')
            : t('pairing.notFound')}
      </p>
      <Link to="/" className="btn-secondary">
        {t('common.home')}
      </Link>
    </section>
  );
}
