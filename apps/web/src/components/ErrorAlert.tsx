import { useT } from '../i18n/use-i18n';
import { describeError } from '../lib/errors';

export function ErrorAlert({ error }: { error: unknown }) {
  const t = useT();
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    >
      {describeError(error, t)}
    </div>
  );
}
