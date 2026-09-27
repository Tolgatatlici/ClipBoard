import { Link } from 'react-router';
import { useTitle } from '../lib/use-title';

export function NotFoundPage() {
  useTitle('Sayfa bulunamadı');
  return (
    <section className="card flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold">Sayfa bulunamadı</h1>
      <Link to="/" className="btn-primary">
        Ana sayfaya dön
      </Link>
    </section>
  );
}
