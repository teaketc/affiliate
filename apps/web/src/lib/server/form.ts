import type { Static, TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import '@affiliate/shared';

/**
 * Validate FormData with the SAME TypeBox schema the API uses (packages/shared).
 * Empty strings are treated as "not provided"; numbers/booleans are converted.
 */
export function parseForm<S extends TSchema>(
  schema: S,
  form: FormData,
  opts: { arrays?: string[]; json?: string[] } = {}
): { ok: true; data: Static<S> } | { ok: false; errors: Record<string, string> } {
  const raw: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    if (opts.arrays?.includes(key)) {
      const vals = form
        .getAll(key)
        .map((v) => String(v).trim())
        .flatMap((v) => v.split(','))
        .map((v) => v.trim())
        .filter(Boolean);
      if (vals.length) raw[key] = vals;
      continue;
    }
    const v = String(form.get(key) ?? '').trim();
    if (v === '') continue;
    if (opts.json?.includes(key)) {
      try {
        raw[key] = JSON.parse(v) as unknown;
      } catch {
        return { ok: false, errors: { [key]: 'Invalid JSON' } };
      }
      continue;
    }
    raw[key] = v;
  }
  const converted = Value.Convert(schema, raw);
  if (Value.Check(schema, converted)) return { ok: true, data: converted };
  const errors: Record<string, string> = {};
  for (const e of Value.Errors(schema, converted)) {
    const k = e.path.replace(/^\//, '').split('/')[0] || '_';
    errors[k] ??= e.message;
  }
  return { ok: false, errors };
}

/** datetime-local input -> ISO string (assumes browser-local time is Asia/Bangkok). */
export function localToIso(v: FormDataEntryValue | null): string | undefined {
  const s = String(v ?? '').trim();
  if (!s) return undefined;
  const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}:00+07:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
