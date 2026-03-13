import type { ErrorResponseBody, MarkOutForDeliveryPayload, RequestPayload, Role } from './types.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isErrorResponseBody(value: unknown): value is ErrorResponseBody {
  return (
    isRecord(value) &&
    value.ok === false &&
    typeof value.code === 'string' &&
    typeof value.message === 'string'
  );
}

export function isMarkOutForDeliveryPayload(value: RequestPayload): value is MarkOutForDeliveryPayload {
  return 'action' in value && value.action === 'mark_out_for_delivery';
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
  );
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeRole(value: string | null): Role | null {
  if (value === 'admin' || value === 'staff' || value === 'customer') {
    return value;
  }
  return null;
}

export function shortId(value: string): string {
  return value.slice(0, 8);
}