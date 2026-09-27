import { useT } from '../i18n/use-i18n';
import { formatRemaining } from '../lib/format';
import { useNow } from '../lib/use-now';

export function Countdown({ expiresAt }: { expiresAt: number }) {
  const t = useT();
  const now = useNow();
  return (
    <time dateTime={new Date(expiresAt).toISOString()} title={new Date(expiresAt).toLocaleString()}>
      {formatRemaining(expiresAt - now, t)}
    </time>
  );
}

/** "{time} sonra silinecek" / "Deleted in {time}": kelime sırası dile göre değişir. */
export function ExpiresIn({ expiresAt }: { expiresAt: number }) {
  const t = useT();
  const [before, after = ''] = t('common.expiresIn').split('{time}');
  return (
    <>
      {before}
      <Countdown expiresAt={expiresAt} />
      {after}
    </>
  );
}
