import { Link, Outlet } from 'react-router';
import { useInstallPrompt } from '../lib/use-install-prompt';

export function Layout() {
  const install = useInstallPrompt();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-6 w-6 text-indigo-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="8" y="2" width="8" height="4" rx="1" />
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            </svg>
            ClipBoard
          </Link>
          {install ? (
            <button type="button" className="btn-secondary py-1.5" onClick={() => void install()}>
              Uygulamayı yükle
            </button>
          ) : (
            <span className="muted hidden sm:inline">Cihazlar arası şifreli pano</span>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="muted mx-auto flex max-w-3xl flex-col items-center gap-2 px-4 py-6 text-center text-xs">
        <p>
          İçerik tarayıcınızda şifrelenir; sunucu okuyamaz. Süresi dolan içerik otomatik silinir.
        </p>
        <nav aria-label="Alt bilgi" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link to="/nasil-calisir" className="hover:underline">
            Nasıl çalışır
          </Link>
          <Link to="/gizlilik" className="hover:underline">
            Gizlilik
          </Link>
          <Link to="/kullanim-kosullari" className="hover:underline">
            Kullanım koşulları
          </Link>
          <Link to="/bildir" className="hover:underline">
            Kötüye kullanım bildir
          </Link>
        </nav>
      </footer>
    </div>
  );
}
