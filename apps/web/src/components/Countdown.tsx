import { formatRemaining } from '../lib/format';
import { useNow } from '../lib/use-now';

export function Countdown({ expiresAt }: { expiresAt: number }) {
  const now = useNow();
  return (
    <time dateTime={new Date(expiresAt).toISOString()} title={new Date(expiresAt).toLocaleString()}>
      {formatRemaining(expiresAt - now)}
    </time>
  );
}
