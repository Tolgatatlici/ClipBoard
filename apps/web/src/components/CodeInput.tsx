import { useId, useState, type FormEvent } from 'react';
import {
  CODE_ID_LENGTH,
  CODE_LENGTH,
  parseCode,
  parseRoomCode,
  ROOM_CODE_LENGTH,
  type ParsedCode,
} from '@clipboard/shared';
import { useT } from '../i18n/use-i18n';
import { formatCodeInput } from '../lib/code-input';

interface FieldProps<T> {
  label: string;
  placeholder: string;
  length: number;
  split: number;
  parse(value: string): T | null;
  onSubmit(value: T): void;
  submitLabel: string;
  busy: boolean;
}

function CodeField<T>(props: FieldProps<T>) {
  const { label, placeholder, length, split, parse, onSubmit, submitLabel, busy } = props;
  const t = useT();
  const inputId = useId();
  const [value, setValue] = useState('');
  const parsed = parse(value);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (parsed) onSubmit(parsed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="label">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          className="input font-mono text-lg tracking-[0.2em] uppercase"
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(formatCodeInput(event.target.value, length, split))}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={length + 1}
          inputMode="text"
        />
        <button type="submit" className="btn-primary shrink-0" disabled={!parsed || busy}>
          {busy ? t('common.opening') : submitLabel}
        </button>
      </div>
    </form>
  );
}

interface Props<T> {
  onSubmit(value: T): void;
  submitLabel?: string;
  busy?: boolean;
}

export function CodeInput({ onSubmit, submitLabel, busy = false }: Props<ParsedCode>) {
  const t = useT();
  return (
    <CodeField
      label={t('codeInput.clipLabel')}
      placeholder="ABCD-EFGH"
      length={CODE_LENGTH}
      split={CODE_ID_LENGTH}
      parse={parseCode}
      onSubmit={onSubmit}
      submitLabel={submitLabel ?? t('common.open')}
      busy={busy}
    />
  );
}

/** Oda kodu girişi; normalize edilmiş 10 karakterlik kodu döner. */
export function RoomCodeInput({ onSubmit, submitLabel, busy = false }: Props<string>) {
  const t = useT();
  return (
    <CodeField
      label={t('codeInput.roomLabel')}
      placeholder="ABCDE-FGHJK"
      length={ROOM_CODE_LENGTH}
      split={5}
      parse={parseRoomCode}
      onSubmit={onSubmit}
      submitLabel={submitLabel ?? t('codeInput.join')}
      busy={busy}
    />
  );
}
