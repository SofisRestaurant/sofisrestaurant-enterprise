// src/compliance/gdp/userConsent.ts

export interface ConsentPreferences {
  necessary: boolean; // Always true, can't be disabled
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
}

export const defaultConsent: ConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  personalization: false,
};

// ── Type guard ────────────────────────────────────────────────────────────────
//
// JSON.parse returns `any`. Accessing properties on `any` directly triggers
// no-unsafe-member-access and no-unsafe-assignment on every field read.
//
// The type guard narrows the value to a known shape before any property access,
// which satisfies the linter and makes the downstream destructuring fully typed.
// `unknown` is the correct annotation for unvalidated external data.
function isConsentShape(value: unknown): value is Record<keyof ConsentPreferences, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'necessary' in value &&
    'analytics' in value &&
    'marketing' in value &&
    'personalization' in value
  );
}

export function saveConsent(preferences: ConsentPreferences): void {
  localStorage.setItem(
    'user_consent',
    JSON.stringify({
      ...preferences,
      timestamp: new Date().toISOString(),
    }),
  );
}

export function getConsent(): ConsentPreferences | null {
  const stored = localStorage.getItem('user_consent');
  if (!stored) return null;

  try {
    // Cast to `unknown` first — the correct type for unvalidated parsed JSON.
    // This makes every subsequent access go through the type guard rather than
    // flowing as `any`, eliminating all no-unsafe-* violations.
    const parsed: unknown = JSON.parse(stored);

    if (!isConsentShape(parsed)) return null;

    return {
      necessary:     parsed.necessary     === true,
      analytics:     parsed.analytics     === true,
      marketing:     parsed.marketing     === true,
      personalization: parsed.personalization === true,
    };
  } catch {
    return null;
  }
}

export function hasConsent(): boolean {
  return getConsent() !== null;
}