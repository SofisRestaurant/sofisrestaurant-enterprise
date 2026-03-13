export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function safeStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function safeNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function safePosInt(value: unknown): number | null {
  const n = safeNum(value);
  return n !== null ? Math.max(0, Math.trunc(n)) : null;
}

export function safeDate(value: unknown): Date | null {
  const s = safeStr(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function safeMeta(meta: unknown): Record<string, unknown> {
  return isRecord(meta) ? meta : {};
}

export function metaNum(meta: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const n = safeNum(meta[key]);
    if (n !== null) return n;
  }
  return null;
}

export function metaPosInt(meta: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const n = safePosInt(meta[key]);
    if (n !== null) return n;
  }
  return null;
}

export function metaDate(meta: Record<string, unknown>, ...keys: string[]): Date | null {
  for (const key of keys) {
    const d = safeDate(meta[key]);
    if (d !== null) return d;
  }
  return null;
}