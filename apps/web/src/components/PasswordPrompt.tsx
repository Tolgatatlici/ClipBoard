import { useId, useState, type FormEvent } from 'react';
import { useT } from '../i18n/use-i18n';

interface Props {
  onSubmit(password: string): void;
  busy?: boolean;
}

export function PasswordPrompt({ onSubmit, busy = false }: Props) {
  const t = useT();
  const inputId = useId();
  const [password, setPassword] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (password) onSubmit(password);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="label">
        {t('common.password')}
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="password"
          className="input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="off"
          autoFocus
        />
        <button type="submit" className="btn-primary shrink-0" disabled={!password || busy}>
          {busy ? t('clip.decrypting') : t('common.open')}
        </button>
      </div>
    </form>
  );
}
