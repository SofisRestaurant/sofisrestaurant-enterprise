// src/modules/checkout/types/otp.types.ts
// =============================================================================
// Types for the pre-checkout OTP challenge flow.
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

export type IssueChallengeTokenResponse =
  | { ok: true;  valid: true;  challenge_token: string }
  | { ok: false; valid: false; error: string }           // incorrect OTP code
  | { ok: false;               error: string };          // other error

// ─── OTP send / check (existing types, mirrored here for modal use) ───────────

export interface SendOtpRequest {
  action: 'send';
  phone:  string;
}

export interface SendOtpResponse {
  ok:              boolean;
  normalizedPhone?: string;
  error?:          string;
}

export interface CheckOtpRequest {
  action:   'check';
  phone:    string;
  code:     string;
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
  canonicalPhone: string;      // E.164 from backend after send
  otpInput:       string;
  phoneInput:     string;
  loading:        boolean;
  error:          string | null;
  challengeToken: string | null;
}