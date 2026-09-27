import { Link, Outlet } from 'react-router';
import { LANGS } from '../i18n/core';
import { useI18n } from '../i18n/use-i18n';
import { useInstallPrompt } from '../lib/use-install-prompt';

export function Layout() {
  const { t, lang, setLang } = useI18n();
  const install = useInstallPrompt();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
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
          <div className="flex items-center gap-3">
            {install ? (
              <button type="button" className="btn-secondary py-1.5" onClick={() => void install()}>
                {t('layout.install')}
              </button>
            ) : (
              <span className="muted hidden sm:inline">{t('layout.tagline')}</span>
            )}
            <div role="group" aria-label={t('layout.language')} className="flex text-xs">
              {LANGS.map((option) => (
                <button
                  key={option}
                  type="button"
                  lang={option}
                  aria-pressed={lang === option}
                  onClick={() => setLang(option)}
                  className="rounded-md px-2 py-1 font-medium text-slate-600 uppercase hover:bg-slate-100 aria-pressed:bg-indigo-600 aria-pressed:text-white dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="muted mx-auto flex max-w-3xl flex-col items-center gap-2 px-4 py-6 text-center text-xs">
        <p>{t('layout.footerNote')}</p>
        <nav
          aria-label={t('layout.footerNav')}
          className="flex flex-wrap justify-center gap-x-4 gap-y-1"
        >
          <Link to="/nasil-calisir" className="hover:underline">
            {t('layout.howItWorks')}
          </Link>
          <Link to="/gizlilik" className="hover:underline">
            {t('layout.privacy')}
          </Link>
          <Link to="/kullanim-kosullari" className="hover:underline">
            {t('layout.terms')}
          </Link>
          <Link to="/bildir" className="hover:underline">
            {t('layout.report')}
          </Link>
        </nav>
      </footer>
    </div>
  );
}
