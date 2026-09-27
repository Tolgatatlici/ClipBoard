import { useState, type FormEvent } from 'react';
import { REPORT_REASONS, type ReportReason } from '@clipboard/shared';
import { ErrorAlert } from '../components/ErrorAlert';
import { api } from '../lib/api';
import { useTitle } from '../lib/use-title';

const REASON_LABELS: Record<ReportReason, string> = {
  illegal: 'Yasa dışı içerik',
  malware: 'Zararlı yazılım',
  phishing: 'Kimlik avı / dolandırıcılık',
  copyright: 'Telif hakkı ihlali',
  other: 'Diğer',
};

export function ReportPage() {
  useTitle('Kötüye kullanım bildir');
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
        <h1 className="text-xl font-semibold">Bildiriminiz alındı</h1>
        <p className="muted">Teşekkürler. Bildirimi en kısa sürede inceleyeceğiz.</p>
      </section>
    );
  }

  return (
    <form className="card flex flex-col gap-4" onSubmit={handleSubmit}>
      <div>
        <h1 className="text-xl font-semibold">Kötüye kullanım bildir</h1>
        <p className="muted">
          İçerik şifreli olduğu için onu ancak siz linki paylaşırsanız inceleyebiliriz. Linkin
          tamamını (# işaretinden sonrası dahil) yapıştırırsanız içeriği görebilir ve gerekirse
          silebiliriz.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="report-target" className="label">
          Link ya da kod
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
          Neden
        </label>
        <select
          id="report-reason"
          className="input"
          value={reason}
          onChange={(event) => setReason(event.target.value as ReportReason)}
        >
          {REPORT_REASONS.map((value) => (
            <option key={value} value={value}>
              {REASON_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="report-details" className="label">
          Açıklama (isteğe bağlı)
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
          E-posta (isteğe bağlı, size dönüş yapabilmemiz için)
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
          {sending ? 'Gönderiliyor…' : 'Bildir'}
        </button>
      </div>
    </form>
  );
}
