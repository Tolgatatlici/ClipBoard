import { useRef, useState } from 'react';
import { useT } from '../i18n/use-i18n';
import { saveBytes } from '../lib/download';
import { formatBytes } from '../lib/format';
import {
  FileTooLargeForP2PError,
  type IncomingTransfer,
  type OutgoingTransfer,
  type P2PManager,
  type P2PSnapshot,
} from '../lib/p2p/manager';

function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <progress className="h-2 w-full accent-indigo-600" value={value} max={max} aria-label={label} />
  );
}

/** Odada doğrudan (P2P) dosya aktarımı: duyurma, kabul etme ve ilerleme. */
export function DirectTransfer({
  manager,
  snapshot,
}: {
  manager: P2PManager | null;
  snapshot: P2PSnapshot;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function announce(file: File) {
    setError(null);
    try {
      manager?.announce(file);
    } catch (err) {
      setError(err instanceof FileTooLargeForP2PError ? t('p2p.tooLarge') : String(err));
    }
  }

  return (
    <section className="card flex flex-col gap-3" aria-labelledby="p2p-title">
      <div>
        <h2 id="p2p-title" className="font-semibold">
          {t('p2p.title')}
        </h2>
        <p className="muted">{t('p2p.intro')}</p>
      </div>
      <div>
        <button
          type="button"
          className="btn-secondary"
          disabled={!manager}
          onClick={() => input.current?.click()}
        >
          {t('p2p.choose')}
        </button>
        <input
          ref={input}
          type="file"
          className="sr-only"
          aria-label={t('p2p.chooseFile')}
          data-testid="p2p-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) announce(file);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      {snapshot.outgoing.map((transfer) => (
        <Outgoing key={transfer.transferId} transfer={transfer} manager={manager} />
      ))}
      {snapshot.incoming.map((transfer) => (
        <Incoming key={transfer.transferId} transfer={transfer} manager={manager} />
      ))}
    </section>
  );
}

function Outgoing({
  transfer,
  manager,
}: {
  transfer: OutgoingTransfer;
  manager: P2PManager | null;
}) {
  const t = useT();
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
      data-testid="p2p-outgoing"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium">
          {transfer.name} · {formatBytes(transfer.size)}
        </span>
        <button
          type="button"
          className="btn-secondary py-1"
          onClick={() => manager?.cancel(transfer.transferId)}
        >
          {t('p2p.cancel')}
        </button>
      </div>
      {transfer.receivers.length === 0 && <p className="muted text-sm">{t('p2p.waiting')}</p>}
      {transfer.receivers.map((receiver) => (
        <div key={receiver.clientId} className="flex flex-col gap-1 text-sm">
          <span>
            {t('p2p.device', { id: receiver.clientId.slice(0, 4).toUpperCase() })}:{' '}
            <span data-testid="p2p-receiver-status">{t(`p2p.status.${receiver.status}`)}</span>
          </span>
          {receiver.status === 'sending' && (
            <Progress value={receiver.sent} max={transfer.size} label={transfer.name} />
          )}
        </div>
      ))}
    </div>
  );
}

function Incoming({
  transfer,
  manager,
}: {
  transfer: IncomingTransfer;
  manager: P2PManager | null;
}) {
  const t = useT();
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30"
      data-testid="p2p-incoming"
    >
      <p className="muted text-xs">{t('p2p.incoming')}</p>
      <span className="truncate font-medium">
        {transfer.name} · {formatBytes(transfer.size)}
      </span>
      <span className="text-sm" data-testid="p2p-incoming-status">
        {t(`p2p.status.${transfer.status}`)}
      </span>
      {transfer.status === 'receiving' && (
        <Progress value={transfer.received} max={transfer.size} label={transfer.name} />
      )}
      <div className="flex flex-wrap gap-2">
        {transfer.status === 'offered' && (
          <>
            <button
              type="button"
              className="btn-primary"
              onClick={() => manager?.accept(transfer.transferId)}
            >
              {t('p2p.accept')}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => manager?.decline(transfer.transferId)}
            >
              {t('p2p.decline')}
            </button>
          </>
        )}
        {transfer.status === 'done' && transfer.file && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => saveBytes(transfer.file!, transfer.name, transfer.mime || undefined)}
          >
            {t('p2p.save')}
          </button>
        )}
        {['done', 'failed', 'cancelled'].includes(transfer.status) && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => manager?.dismiss(transfer.transferId)}
          >
            {t('p2p.dismiss')}
          </button>
        )}
      </div>
    </div>
  );
}
