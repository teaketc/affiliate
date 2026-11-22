export { formatMoney, formatRate } from '@affiliate/shared';

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(iso));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('th-TH').format(n);
}

/** Build a URL keeping current search params, overriding the given keys. */
export function withParams(url: URL, patch: Record<string, string | number | null | undefined>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') u.searchParams.delete(k);
    else u.searchParams.set(k, String(v));
  }
  return `${u.pathname}${u.search}`;
}
