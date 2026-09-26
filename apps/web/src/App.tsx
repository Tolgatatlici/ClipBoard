import { LIMITS } from '@clipboard/shared';

export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-4">
      <h1 className="text-3xl font-bold tracking-tight">ClipBoard</h1>
      <p className="text-slate-600">
        Cihazlarınız arasında metin ve dosyaları uçtan uca şifreli olarak anında paylaşın.
      </p>
      <p className="text-sm text-slate-500">
        Yakında: en fazla {LIMITS.maxTextBytes / 1024} KB metin paylaşımı.
      </p>
    </main>
  );
}
