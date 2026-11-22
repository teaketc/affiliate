/** Formatting helpers shared by API responses and the dashboard. Pure functions only. */

/** "0.2500" -> "25%" ; tolerant of null */
export function formatRate(rate: string | null | undefined, digits = 1): string {
  if (rate === null || rate === undefined || rate === '') return '—';
  const n = Number(rate) * 100;
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(digits).replace(/\.0+$/, '')}%`;
}

export function formatMoney(amount: string | null | undefined, currency = 'THB', locale = 'th-TH'): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}

/** Percent (0..100) from query params to fraction (0..1) used in the DB. */
export function percentToRate(percent: number): number {
  return Math.round((percent / 100) * 10_000) / 10_000;
}

export function totalPages(total: number, limit: number): number {
  return limit <= 0 ? 0 : Math.ceil(total / limit);
}
