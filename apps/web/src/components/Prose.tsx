import type { ReactNode } from 'react';

/** Uzun metin sayfaları için tipografi. */
export function Prose({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="card flex flex-col gap-4 leading-relaxed [&_a]:text-indigo-600 [&_a]:underline dark:[&_a]:text-indigo-400 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-slate-700 dark:[&_p]:text-slate-300 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </article>
  );
}
