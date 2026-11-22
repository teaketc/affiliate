/** Parsing helpers shared by adapters. Inputs are untrusted provider JSON. */

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  // Lazada returns literal "null" strings (see /marketing/getlink sample response)
  if (s === '' || s.toLowerCase() === 'null') return null;
  return s;
}

export function num(v: unknown): number | null {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s.replace(/,/g, '').replace(/%$/, ''));
  return Number.isFinite(n) ? n : null;
}

export function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

/** Format a number as fixed decimal string; clamps to [min,max] when given. */
export function fixed(n: number, digits: number, min?: number, max?: number): string {
  let v = n;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v.toFixed(digits);
}

/** "24.1%" | "0.241" | 0.241 -> 0.241. Values > 1 are treated as percentages. */
export function rate(v: unknown): number | null {
  const s = str(v);
  if (s === null) return null;
  const isPercent = s.endsWith('%');
  const n = num(s);
  if (n === null) return null;
  return isPercent || n > 1 ? n / 100 : n;
}

/** Parse "YYYY-MM-DD HH:mm:ss" in a fixed UTC offset like "+07:00". */
export function localDate(v: unknown, offset: string): Date | null {
  const s = str(v);
  if (s === null) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}${offset}`);
  // 1970 dates are placeholders in Lazada samples
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000 ? null : d;
}

export function unixSeconds(v: unknown): Date | null {
  const n = int(v);
  return n === null || n <= 0 ? null : new Date(n * 1000);
}
