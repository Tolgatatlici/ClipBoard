import { useEffect, useState } from 'react';
import { copyText } from '../lib/clipboard';

interface Props {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = 'Kopyala', className = 'btn-secondary' }: Props) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <button
      type="button"
      className={className}
      onClick={async () => setState((await copyText(text)) ? 'copied' : 'failed')}
    >
      <span aria-live="polite">
        {state === 'copied' ? 'Kopyalandı ✓' : state === 'failed' ? 'Kopyalanamadı' : label}
      </span>
    </button>
  );
}
