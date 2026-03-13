// src/lib/number.ts
export function toFiniteNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function safeDiv(numerator: unknown, denominator: unknown, fallback = 0): number {
  const a = toFiniteNumber(numerator, NaN);
  const b = toFiniteNumber(denominator, NaN);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return fallback;
  const out = a / b;
  return Number.isFinite(out) ? out : fallback;
}
