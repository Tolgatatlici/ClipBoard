import { useEffect, useState } from 'react';
import { useT } from '../i18n/use-i18n';
import { copyText } from '../lib/clipboard';

interface Props {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label, className = 'btn-secondary' }: Props) {
  const t = useT();
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
        {state === 'copied'
          ? t('common.copied')
          : state === 'failed'
            ? t('common.copyFailed')
            : (label ?? t('common.copy'))}
      </span>
    </button>
  );
}
