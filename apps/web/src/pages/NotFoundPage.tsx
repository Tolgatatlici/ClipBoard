import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="card flex flex-col items-start gap-4">
      <h1 className="text-xl font-semibold">Sayfa bulunamadı</h1>
      <Link to="/" className="btn-primary">
        Ana sayfaya dön
      </Link>
    </section>
  );
}
