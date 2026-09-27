import { useState, type FormEvent } from 'react';
import { REPORT_REASONS, type ReportReason } from '@clipboard/shared';
import { useT } from '../i18n/use-i18n';
import { ErrorAlert } from '../components/ErrorAlert';
import { api } from '../lib/api';
import { useTitle } from '../lib/use-title';

export function ReportPage() {
  useTitle('titles.report');
  const t = useT();
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState<ReportReason>('illegal');
  const [details, setDetails] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      await api.createReport({ target, reason, details, contact });
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <section className="card flex flex-col gap-2" role="status">
        <h1 className="text-xl font-semibold">{t('report.sentTitle')}</h1>
        <p className="muted">{t('report.sentBody')}</p>
      </section>
    );
  }

  return (
    <form className="card flex flex-col gap-4" onSubmit={handleSubmit}>
      <div>
        <h1 className="text-xl font-semibold">{t('report.title')}</h1>
        <p className="muted">{t('report.intro')}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="report-target" className="label">
          {t('report.target')}
        </label>
        <input
          id="report-target"
          className="input"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          required
          minLength={4}
          maxLength={500}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="report-reason" className="label">
          {t('report.reason')}
        </label>
        <select
          id="report-reason"
          className="input"
          value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
        >
          {REPORT_REASONS.map((value) => (
            <option key={value} value={value}>
              {t(`report.reasons.${value}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="report-details" className="label">
          {t('report.details')}
        </label>
        <textarea
          id="report-details"
          className="input min-h-24"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={2000}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="report-contact" className="label">
          {t('report.contact')}
        </label>
        <input
          id="report-contact"
          type="email"
          className="input"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          maxLength={200}
        />
      </div>
      {error !== null && <ErrorAlert error={error} />}
      <div>
        <button
          type="submit"
          className="btn-primary"
          disabled={sending || target.trim().length < 4}
        >
          {sending ? t('report.sending') : t('report.submit')}
        </button>
      </div>
    </form>
  );
}
