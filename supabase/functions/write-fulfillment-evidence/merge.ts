export function mergeString(
  incoming: string | null | undefined,
  existing: string | null | undefined,
): string | null {
  return incoming ?? existing ?? null;
}

export function mergeBoolean(
  incoming: boolean | undefined,
  existing: boolean | undefined,
  fallback: boolean,
): boolean {
  if (incoming !== undefined) return incoming;
  if (existing !== undefined) return existing;
  return fallback;
}

export function mergeNumber(
  incoming: number | null | undefined,
  existing: string | number | null | undefined,
): number | null {
  if (incoming !== null && incoming !== undefined) return incoming;

  if (typeof existing === 'number' && Number.isFinite(existing)) return existing;

  if (typeof existing === 'string' && existing.trim().length > 0) {
    const parsed = Number(existing);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}