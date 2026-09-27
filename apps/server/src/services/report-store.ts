import type { Redis } from 'ioredis';
import { isValidClipId, parseCode, type ReportReason } from '@clipboard/shared';

const REPORTS_KEY = 'reports';
const MAX_REPORTS = 1000;
/** Bildirimler en son bildirimden 30 gün sonra silinir. */
const REPORT_RETENTION_SECONDS = 30 * 24 * 60 * 60;

export interface Report {
  ts: number;
  /** Linkten ya da koddan çıkarılan clip kimliği (bulunabildiyse). */
  clipId: string | null;
  target: string;
  reason: ReportReason;
  details: string;
  contact: string;
}

/** Bildirilen link ya da koddan clip kimliğini çıkarır. */
export function extractClipId(target: string): string | null {
  const fromLink = /\/c\/([0-9A-Za-z]+)/.exec(target)?.[1];
  if (fromLink && isValidClipId(fromLink)) return fromLink;
  return parseCode(target)?.id ?? null;
}

export class ReportStore {
  constructor(private readonly redis: Redis) {}

  async add(report: Omit<Report, 'ts' | 'clipId'>): Promise<void> {
    const entry: Report = { ts: Date.now(), clipId: extractClipId(report.target), ...report };
    await this.redis
      .multi()
      .lpush(REPORTS_KEY, JSON.stringify(entry))
      .ltrim(REPORTS_KEY, 0, MAX_REPORTS - 1)
      .expire(REPORTS_KEY, REPORT_RETENTION_SECONDS)
      .exec();
  }

  async list(limit = 50): Promise<Report[]> {
    const raw = await this.redis.lrange(REPORTS_KEY, 0, limit - 1);
    return raw.map((entry) => JSON.parse(entry) as Report);
  }
}
