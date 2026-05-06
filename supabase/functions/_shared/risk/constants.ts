// =============================================================================
// supabase/functions/_shared/risk/constants.ts
// Pre-checkout risk engine — all tunable scoring constants.
//
// THIS IS THE ONLY FILE THAT SHOULD BE EDITED WHEN TUNING THE RISK MODEL.
// Do not inline any of these values at call sites.
//
// ─── Scoring model summary ────────────────────────────────────────────────────
//
//   Signal                          Pts   Condition
//   ─────────────────────────────────────────────────────────────────────────
//   Guest checkout                   20   isGuest === true
//   High-value guest order           40   isGuest + totalCents >= $100 (replaces LARGE_ORDER)
//   Large order ($75–$99.99)         15   totalCents >= $75 (non-high-value)
//   Medium order ($40–$74.99)         8   totalCents >= $40 (non-large)
//   IP velocity                      20   ipAttempts > 2 in 15 min, same IP
//   Device fingerprint velocity      20   deviceAttempts > 2 in 15 min, same device
//   Guest email velocity             15   emailAttempts > 1 in 15 min, same email
//   New auth account                 12   !isGuest, 0 paid orders, < 7 days old
//   ─────────────────────────────────────────────────────────────────────────
//
//   Order-value signals are mutually exclusive — highest tier wins.
//
//   HIGH_VALUE_GUEST arithmetic:
//     GUEST(20) + HIGH_VALUE_GUEST(40) = 60 = CHALLENGE_FLOOR
//     Any first-attempt guest order >= $100 is guaranteed a challenge.
//
//   Trusted user bypass (score → 0, action → allow):
//     !isGuest && paidOrderCount >= TRUST.MIN_PAID_ORDERS && accountAgeDays >= TRUST.MIN_ACCOUNT_AGE_DAYS
//
//   Action thresholds:
//     score < 60           → allow
//     60 <= score < 75     → challenge (OTP required before session creation)
//     score >= 75          → block (hard reject)
// =============================================================================

// ─── Signal weights ───────────────────────────────────────────────────────────

export const WEIGHTS = {
  // Identity
  GUEST:            20,

  // Order-value (mutually exclusive tiers — highest applies)
  // HIGH_VALUE_GUEST + GUEST = 60 = CHALLENGE_FLOOR: guarantees OTP for $100+ guests.
  HIGH_VALUE_GUEST: 40,
  LARGE_ORDER:      15,
  MEDIUM_ORDER:      8,

  // Velocity (DB-authoritative — never from client input)
  IP_VELOCITY:     20,
  DEVICE_VELOCITY: 20,
  EMAIL_VELOCITY:  15,

  // Account age
  NEW_ACCOUNT:     12,
} as const;

// ─── Velocity limits ──────────────────────────────────────────────────────────
//
// Signals fire when attempt count EXCEEDS the limit within a 15-minute window.

export const VELOCITY = {
  IP_LIMIT:     2,  // > 2 from same IP triggers IP_VELOCITY
  DEVICE_LIMIT: 2,  // > 2 from same device fingerprint triggers DEVICE_VELOCITY
  EMAIL_LIMIT:  1,  // > 1 from same guest email triggers EMAIL_VELOCITY (lower bar)
} as const;

// ─── Order value thresholds ───────────────────────────────────────────────────

export const ORDER = {
  HIGH_VALUE_CENTS: 100_00,  // $100.00 — high-value guest escalation floor
  LARGE_CENTS:       75_00,  // $75.00  — large order signal floor
  MEDIUM_CENTS:      40_00,  // $40.00  — medium order signal floor
} as const;

// ─── Trust bypass criteria ────────────────────────────────────────────────────
//
// Both conditions must be true. Guests are permanently ineligible (isGuest).

export const TRUST = {
  MIN_PAID_ORDERS:      3,
  MIN_ACCOUNT_AGE_DAYS: 7,
} as const;

// ─── Action and tier thresholds ───────────────────────────────────────────────
//
// CHALLENGE_FLOOR and BLOCK_FLOOR drive both action resolution and tier labelling.
// MEDIUM_FLOOR drives tier labelling only — no action change.
// All three are centralised here to prevent drift between the two concerns.

export const RISK_THRESHOLDS = {
  CHALLENGE_FLOOR: 60,
  BLOCK_FLOOR:     75,
  MEDIUM_FLOOR:    30,
} as const;