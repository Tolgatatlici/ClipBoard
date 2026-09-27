import { useEffect, useState } from 'react';
import type { Highlighted } from '../lib/highlight';

const PRE_CLASS =
  'max-h-[60vh] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm dark:border-slate-800 dark:bg-slate-950';

export function PlainText({ text }: { text: string }) {
  return (
    <pre data-testid="clip-content" className={`${PRE_CLASS} break-words whitespace-pre-wrap`}>
      {text}
    </pre>
  );
}

/** Söz dizimi vurgulamalı kod; vurgulayıcı yüklenene kadar düz metin gösterir. */
export function CodeBlock({ text }: { text: string }) {
  const [result, setResult] = useState<{ text: string; highlighted: Highlighted } | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('../lib/highlight')
      .then(({ highlight }) => !cancelled && setResult({ text, highlighted: highlight(text) }))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [text]);

  const highlighted = result?.text === text ? result.highlighted : null;
  return (
    <div className="relative">
      {highlighted?.language && (
        <span className="muted absolute top-2 right-3 text-xs" data-testid="code-language">
          {highlighted.language}
        </span>
      )}
      <pre data-testid="clip-content" className={`${PRE_CLASS} hljs whitespace-pre`}>
        <code>{highlighted?.nodes ?? text}</code>
      </pre>
    </div>
  );
}
