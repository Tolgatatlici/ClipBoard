import { useId, useState, type FormEvent } from 'react';
import { parseCode, type ParsedCode } from '@clipboard/shared';
import { formatCodeInput } from '../lib/code-input';

interface Props {
  onSubmit(code: ParsedCode): void;
  submitLabel?: string;
  busy?: boolean;
}

export function CodeInput({ onSubmit, submitLabel = 'Aç', busy = false }: Props) {
  const inputId = useId();
  const [value, setValue] = useState('');
  const parsed = parseCode(value);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (parsed) onSubmit(parsed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="label">
        Paylaşım kodu
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          className="input font-mono text-lg tracking-[0.2em] uppercase"
          placeholder="ABCD-EFGH"
          value={value}
          onChange={(event) => setValue(formatCodeInput(event.target.value))}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          inputMode="text"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={!parsed || busy}>
          {busy ? 'Açılıyor…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
