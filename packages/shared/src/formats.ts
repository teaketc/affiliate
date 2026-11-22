import { FormatRegistry } from '@sinclair/typebox';

/**
 * TypeBox's `Value.Check` rejects any string with an unregistered `format`. Elysia registers its own
 * formats for request validation, but the dashboard and backend code that call `Value.Check`
 * directly need them too. Registration is idempotent.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i;

function isUri(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol.length > 1;
  } catch {
    return false;
  }
}

const formats: Record<string, (v: string) => boolean> = {
  uuid: (v) => UUID.test(v),
  email: (v) => EMAIL.test(v),
  uri: isUri,
  'date-time': (v) => DATE_TIME.test(v) && !Number.isNaN(Date.parse(v))
};

export function registerFormats(): void {
  for (const [name, fn] of Object.entries(formats)) {
    if (!FormatRegistry.Has(name)) FormatRegistry.Set(name, fn);
  }
}

registerFormats();
