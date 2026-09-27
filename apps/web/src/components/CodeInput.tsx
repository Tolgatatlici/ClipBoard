import { useId, useState, type FormEvent } from 'react';
import {
  formatPairingCode,
  normalizePairingCode,
  PAIRING_CODE_LENGTH,
  parseCode,
  type ParsedCode,
} from '@clipboard/shared';
import { useT } from '../i18n/use-i18n';
import { formatCodeInput } from '../lib/code-input';

interface FieldProps<T> {
  label: string;
  placeholder: string;
  maxLength: number;
  inputMode: 'text' | 'numeric';
  /** Yazarken girdiyi biçimlendirir. */
  format(value: string): string;
  parse(value: string): T | null;
  onSubmit(value: T): void;
  submitLabel: string;
  busy: boolean;
}

function CodeField<T>(props: FieldProps<T>) {
  const { label, placeholder, maxLength, inputMode, format, parse, onSubmit, submitLabel, busy } =
    props;
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
          onChange={(event) => setValue(format(event.target.value))}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={maxLength}
          inputMode={inputMode}
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
      maxLength={9}
      inputMode="text"
      format={(value) => formatCodeInput(value)}
      parse={parseCode}
      onSubmit={onSubmit}
      submitLabel={submitLabel ?? t('common.open')}
      busy={busy}
    />
  );
}

/** Odaya katılmak için 6 haneli eşleştirme kodu girişi. */
export function PairingCodeInput({ onSubmit, submitLabel, busy = false }: Props<string>) {
  const t = useT();
  return (
    <CodeField
      label={t('codeInput.pairingLabel')}
      placeholder="123 456"
      maxLength={PAIRING_CODE_LENGTH + 1}
      inputMode="numeric"
      format={(value) => {
        const digits = value.replace(/\D/g, '').slice(0, PAIRING_CODE_LENGTH);
        return digits.length > 3 ? formatPairingCode(digits) : digits;
      }}
      parse={normalizePairingCode}
      onSubmit={onSubmit}
      submitLabel={submitLabel ?? t('codeInput.join')}
      busy={busy}
    />
  );
}
