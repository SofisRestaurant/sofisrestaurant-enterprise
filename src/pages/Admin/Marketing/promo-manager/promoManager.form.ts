import type { PromoCreatePayload } from '@/features/admin/api/adminGateway.types';

export type PromoFormType = PromoCreatePayload['type'];

export type PromoCreateFormState = {
  code: string;
  type: PromoFormType;
  value: string;
  active: boolean;
  startsAt: string;
  endsAt: string;
  expiresAt: string;
  minOrderCents: string;
  maxUses: string;
  perUserLimit: string;
  channel: string;
};

/** Edit form mirrors create but always has an id for the target promo. */
export type PromoEditFormState = PromoCreateFormState;

export const PROMO_TYPE_OPTIONS: ReadonlyArray<{
  value: PromoFormType;
  label: string;
  hint: string;
}> = [
  { value: 'percent', label: 'Percent', hint: 'Example: 10 = 10% off' },
  { value: 'fixed', label: 'Fixed', hint: 'Example: 500 = $5.00 off' },
  { value: 'amount', label: 'Amount', hint: 'Alternative fixed amount style' },
  { value: 'bogo', label: 'BOGO', hint: 'Buy one, get one style promo' },
  { value: 'free_item', label: 'Free Item', hint: 'Free item style promo' },
] as const;

export const INITIAL_PROMO_FORM: PromoCreateFormState = {
  code: '',
  type: 'percent',
  value: '',
  active: true,
  startsAt: '',
  endsAt: '',
  expiresAt: '',
  minOrderCents: '0',
  maxUses: '',
  perUserLimit: '0',
  channel: 'all',
};

// ---------------------------------------------------------------------------
// Input normalisation helpers
// ---------------------------------------------------------------------------

export function normalizePromoCodeInput(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 50);
}

export function parseOptionalNonNegativeInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.trunc(parsed);
}

export function parseRequiredNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function toIsoStringOrNull(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validatePromoForm(form: PromoCreateFormState): string | null {
  const code = normalizePromoCodeInput(form.code);
  if (!code) {
    return 'Promo code is required.';
  }

  const numericValue = parseRequiredNumber(form.value);
  if (numericValue === null) {
    return 'Promo value is required.';
  }

  if (form.type === 'percent' && (numericValue <= 0 || numericValue > 100)) {
    return 'Percent promos must be between 1 and 100.';
  }

  if (form.type !== 'percent' && numericValue < 0) {
    return 'Promo value must be 0 or greater.';
  }

  const startsAtIso = toIsoStringOrNull(form.startsAt);
  const endsAtIso = toIsoStringOrNull(form.endsAt);
  const expiresAtIso = toIsoStringOrNull(form.expiresAt);

  if (form.startsAt.trim() && startsAtIso === null) {
    return 'Start date is invalid.';
  }

  if (form.endsAt.trim() && endsAtIso === null) {
    return 'End date is invalid.';
  }

  if (form.expiresAt.trim() && expiresAtIso === null) {
    return 'Expires date is invalid.';
  }

  const startsMs = startsAtIso ? new Date(startsAtIso).getTime() : null;
  const endsMs = endsAtIso ? new Date(endsAtIso).getTime() : null;
  const expiresMs = expiresAtIso ? new Date(expiresAtIso).getTime() : null;

  if (startsMs !== null && endsMs !== null && startsMs > endsMs) {
    return 'Start date must be before end date.';
  }

  if (startsMs !== null && expiresMs !== null && startsMs > expiresMs) {
    return 'Start date must be before expiration date.';
  }

  if (form.minOrderCents.trim() && parseOptionalNonNegativeInt(form.minOrderCents) === null) {
    return 'Minimum order must be a non-negative whole number of cents.';
  }

  if (form.maxUses.trim() && parseOptionalNonNegativeInt(form.maxUses) === null) {
    return 'Max uses must be a non-negative whole number.';
  }

  if (form.perUserLimit.trim() && parseOptionalNonNegativeInt(form.perUserLimit) === null) {
    return 'Per-user limit must be a non-negative whole number.';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Payload builder
// ---------------------------------------------------------------------------

export function buildCreatePromoPayload(form: PromoCreateFormState): PromoCreatePayload {
  return {
    code: normalizePromoCodeInput(form.code),
    type: form.type,
    value: parseRequiredNumber(form.value) ?? 0,
    active: form.active,
    starts_at: toIsoStringOrNull(form.startsAt),
    ends_at: toIsoStringOrNull(form.endsAt),
    expires_at: toIsoStringOrNull(form.expiresAt),
    min_order_cents: parseOptionalNonNegativeInt(form.minOrderCents) ?? 0,
    max_uses: parseOptionalNonNegativeInt(form.maxUses),
    per_user_limit: parseOptionalNonNegativeInt(form.perUserLimit) ?? 0,
    channel: form.channel.trim() ? form.channel.trim() : null,
  };
}