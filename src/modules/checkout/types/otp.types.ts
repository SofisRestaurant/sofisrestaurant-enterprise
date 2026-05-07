// src/modules/checkout/types/otp.types.ts
// =============================================================================
// Types for the pre-checkout OTP challenge flow.
//
// CHANGE IN THIS VERSION:
//
//   [FIX] IssueChallengeTokenResponse success variant removes `valid: true`.
//
//         The backend (challenge-actions.ts) never includes `valid` in its
//         success response — it returns { ok: true, challenge_token: string }.
//         Declaring `valid: true` in the TypeScript type created a false
//         expectation that callers could check `data.valid` to confirm success,
//         and it conflicted with the `valid: false` failure variant causing
//         TypeScript to require `valid` be present in the success branch even
//         though the wire payload never includes it.
//
//         Fix: remove `valid: true` from the success variant. Callers
//         discriminate on `data.ok` only, which is both correct and sufficient.
//
// All other types are unchanged.
//
// These types are shared between:
//   • CheckoutChallengeModal.tsx  (UI component)
//   • challengeClient.ts         (API transport)
//   • useCheckoutRouter.ts       (hook orchestration)
// =============================================================================

// ─── Challenge payload ────────────────────────────────────────────────────────
//
// Returned in the error body when create-checkout responds with
// code: 'otp_required'. The frontend uses `nonce` to link the OTP
// verification to this specific checkout attempt.

export interface OtpChallengePayload {
  nonce:     string;
  expiresAt: string;
}

// ─── Challenge request ────────────────────────────────────────────────────────
//
// Sent to verify-phone with action: 'issue_challenge_token' after the user
// completes OTP entry.

export interface IssueChallengeTokenRequest {
  action:       'issue_challenge_token';
  phone:        string;     // user-entered phone, sent raw — backend normalises
  code:         string;     // OTP digits, digits only
  nonce:        string;     // from OtpChallengePayload.nonce
  identity_key: string;     // SHA-256 hex of userId (auth) or email (guest)
}

// ─── Challenge response ───────────────────────────────────────────────────────
//
// Discriminate on `ok`. The `valid: false` variant is a first-class error
// specifically for wrong OTP codes — the modal shows "Incorrect code" rather
// than a generic error message. All other failures use the third variant.

export type IssueChallengeTokenResponse =
  | { ok: true;  challenge_token: string }        // OTP correct, token issued
  | { ok: false; valid: false; error: string }    // OTP code incorrect
  | { ok: false; error: string };                 // service/validation error

// ─── OTP send / check (existing types, mirrored here for modal use) ───────────

export interface SendOtpRequest {
  action: 'send';
  phone:  string;
}

export interface SendOtpResponse {
  ok:               boolean;
  normalizedPhone?: string;
  error?:           string;
}

export interface CheckOtpRequest {
  action:    'check';
  phone:     string;
  code:      string;
  order_id?: string | null;
}

export interface CheckOtpResponse {
  ok:     boolean;
  valid?: boolean;
  error?: string;
}

// ─── Challenge modal state ────────────────────────────────────────────────────

export type ChallengeStep = 'phone' | 'otp' | 'done';

export interface ChallengeModalState {
  step:           ChallengeStep;
  canonicalPhone: string;       // E.164 from backend after send
  otpInput:       string;
  phoneInput:     string;
  loading:        boolean;
  error:          string | null;
  challengeToken: string | null;
}