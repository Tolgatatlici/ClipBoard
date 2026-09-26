export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
}

/** Kalan süreyi okunabilir biçimde yazar: "4 dk 12 sn", "23 sa 5 dk", "6 gün 3 sa". */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'süresi doldu';
  const totalSeconds = Math.ceil(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return hours > 0 ? `${days} gün ${hours} sa` : `${days} gün`;
  if (hours > 0) return minutes > 0 ? `${hours} sa ${minutes} dk` : `${hours} sa`;
  if (minutes > 0) return seconds > 0 ? `${minutes} dk ${seconds} sn` : `${minutes} dk`;
  return `${seconds} sn`;
}

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}
