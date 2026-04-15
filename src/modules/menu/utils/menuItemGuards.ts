// =============================================================================
// PATH: src/modules/menu/utils/menuItemGuards.ts
// =============================================================================
// Primitive type guards and safe coercions used across the MenuItemModal
// feature. No React or Supabase imports — pure functions only.
// =============================================================================

import type { MenuItemPublic } from '@/domain/menu/menu.types';

export type UnknownRecord = Record<string, unknown>;

export function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

export function safeStr(v: unknown, fallback = '', max = 500): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim();``
  if (!s) return fallback;
  return s.length > max ? s.slice(0, max) : s;
}

export function safeBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function safeCents(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return clampInt(Math.round(n), 0, 50_000_000);
}

export function errMsg(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return 'aborted';
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : 'Request failed';
}

export function fmtUsdFromCents(cents: number): string {
  const c = safeCents(cents, 0);
  return (c / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Tight runtime guard for MenuItemPublic-ish objects. */
export function isMenuItemPublic(v: unknown): v is MenuItemPublic {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === 'string' && v.id.length > 0 && typeof v.name === 'string' && v.name.length > 0
  );
}