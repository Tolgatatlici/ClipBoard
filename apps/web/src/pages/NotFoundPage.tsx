import { Link } from 'react-router';
import { useT } from '../i18n/use-i18n';
import { useTitle } from '../lib/use-title';

export function NotFoundPage() {
  useTitle('titles.notFound');
  const t = useT();
  return (
    <section className="card flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold">{t('notFound.title')}</h1>
      <Link to="/" className="btn-primary">
        {t('notFound.back')}
      </Link>
    </section>
  );
}
