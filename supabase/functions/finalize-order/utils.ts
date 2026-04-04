// =============================================================================
// supabase/functions/finalize-order/utils.ts
// =============================================================================

import type { JsonRecord } from './types.ts';
import { MAX_AWARD_AMOUNT_CENTS, MAX_ORDER_TOTAL_CENTS } from './config.ts';

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeRequestId(req: Request, maxLen: number): string {
  const headerId = (req.headers.get('x-request-id') ?? '').trim();
  if (headerId) return headerId.slice(0, maxLen);
  return crypto.randomUUID();
}

export function prefix(value: string | null | undefined, length = 8): string | null {
  if (!value) return null;
  return value.slice(0, length);
}

export function asErrorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function clampAmountCents(value: unknown): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(MAX_AWARD_AMOUNT_CENTS, Math.max(0, Math.trunc(parsed)));
}

export function clampOrderTotalCents(value: unknown): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(MAX_ORDER_TOTAL_CENTS, Math.max(0, Math.trunc(parsed)));
}

export function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  meta: Record<string, unknown>,
): void {
  console.log(JSON.stringify({ level, event, service: 'finalize-order', ts: nowIso(), ...meta }));
}

export function readString(rec: JsonRecord, key: string): string | null {
  const value = rec[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readNumber(rec: JsonRecord, key: string): number | null {
  const value = rec[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readJson(rec: JsonRecord, key: string): unknown {
  return rec[key] ?? null;
}

export function normalizeCurrency(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized || 'usd';
}