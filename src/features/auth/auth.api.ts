// src/features/auth/auth.api.ts
// ============================================================================
// AUTH API — Canonical Merged (2026)
// ============================================================================
// Single source of truth for the entire auth layer.
// Merges:
//   • src/modules/auth/api/auth.api.ts        — core auth functions
//   • src/lib/supabase/auth.api.ts             — legacy lib surface
//   • src/modules/auth/api/session.api.ts      — session snapshot utilities
//
// Consumers update their imports to:
//   import { ... } from '@/features/auth/auth.api';
//
// ✅ DEFAULT_PASSWORD_RESET_REDIRECT_PATH = '/update-password'
// ✅ Full legacy surface preserved (signIn, signUp, getSession, getUser, authAPI)
// ✅ Session snapshot API inlined — session.api.ts is no longer needed
// ✅ Google OAuth, OTP, onAuthStateChange all included
// ============================================================================

import type {
  AuthChangeEvent,
  Session,
  Subscription,
  User,
} from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/supabaseClient';

// ─── Low-level helpers (private) ─────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;
type VerifyOtpKind = 'email' | 'recovery';

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isControlChar(cp: number): boolean {
  return cp <= 31 || cp === 127;
}

function stripControlChars(value: string): string {
  let out = '';
  for (const ch of value) out += isControlChar(ch.charCodeAt(0)) ? ' ' : ch;
  return out;
}

function containsControlChars(value: string): boolean {
  for (const ch of value) if (isControlChar(ch.charCodeAt(0))) return true;
  return false;
}

function collapseWhitespace(value: string): string {
  return value.trim().split(/\s+/u).join(' ');
}

function sanitizePlainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const n = collapseWhitespace(stripControlChars(value));
  if (n.length === 0) return null;
  return n.length <= maxLength ? n : n.slice(0, maxLength).trim();
}

function sanitizeEmail(value: unknown): string {
  const n = sanitizePlainText(value, 320)?.toLowerCase() ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(n)) {
    throw new AuthApiError({
      code: AUTH_API_ERROR_CODES.INVALID_EMAIL,
      message: 'Please enter a valid email address.',
      status: 400,
    });
  }
  return n;
}

function sanitizePassword(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AuthApiError({ code: AUTH_API_ERROR_CODES.INVALID_PASSWORD, message: 'Password is required.', status: 400 });
  }
  const t = value.trim();
  if (t.length < 8) {
    throw new AuthApiError({ code: AUTH_API_ERROR_CODES.INVALID_PASSWORD, message: 'Password must be at least 8 characters.', status: 400 });
  }
  if (t.length > 128) {
    throw new AuthApiError({ code: AUTH_API_ERROR_CODES.INVALID_PASSWORD, message: 'Password must be 128 characters or less.', status: 400 });
  }
  return value;
}

function sanitizeOtpToken(value: unknown): string {
  const n = sanitizePlainText(value, 128) ?? '';
  if (n.length === 0) {
    throw new AuthApiError({ code: AUTH_API_ERROR_CODES.INVALID_OTP_TOKEN, message: 'Verification token is required.', status: 400 });
  }
  return n;
}

function sanitizeVerifyOtpType(value: unknown): VerifyOtpKind {
  if (value === 'email' || value === 'recovery') return value;
  throw new AuthApiError({ code: AUTH_API_ERROR_CODES.UNKNOWN, message: 'Verification type must be email or recovery.', status: 400 });
}

function getStringFromRecord(record: UnknownRecord, key: string): string | null {
  const v = record[key];
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function readRole(user: User): string | null {
  const app  = user.app_metadata  as unknown;
  const meta = user.user_metadata as unknown;
  if (isRecord(app))  { const r = getStringFromRecord(app,  'role'); if (r) return r; }
  if (isRecord(meta)) { const r = getStringFromRecord(meta, 'role'); if (r) return r; }
  return null;
}

function readDisplayName(user: User): string | null {
  const meta = user.user_metadata as unknown;
  if (!isRecord(meta)) return null;
  return (
    getStringFromRecord(meta, 'full_name')    ??
    getStringFromRecord(meta, 'name')         ??
    getStringFromRecord(meta, 'display_name') ??
    getStringFromRecord(meta, 'username')
  );
}

function readProvider(user: User): string | null {
  const app = user.app_metadata as unknown;
  if (!isRecord(app)) return null;
  return getStringFromRecord(app, 'provider');
}

function toIsoDateTime(unix: number | null | undefined): string | null {
  if (typeof unix !== 'number' || !Number.isFinite(unix) || unix <= 0) return null;
  return new Date(unix * 1000).toISOString();
}

function inferAuthErrorCode(message: string, status: number): AuthApiErrorCode {
  const m = message.toLowerCase();
  if (status === 401 || m.includes('invalid login credentials'))                           return AUTH_API_ERROR_CODES.UNAUTHORIZED;
  if (status === 409 || m.includes('already registered') || m.includes('already exists')) return AUTH_API_ERROR_CODES.CONFLICT;
  if (status === 429 || m.includes('rate limit') || m.includes('too many requests'))       return AUTH_API_ERROR_CODES.RATE_LIMITED;
  if (m.includes('email not confirmed') || m.includes('email not verified') || m.includes('confirm your email')) {
    return AUTH_API_ERROR_CODES.EMAIL_NOT_CONFIRMED;
  }
  return AUTH_API_ERROR_CODES.PROVIDER_ERROR;
}

function toAuthApiError(error: unknown, fallbackMessage = 'Authentication request failed.', fallbackStatus = 500): AuthApiError {
  if (error instanceof AuthApiError) return error;
  if (error instanceof Error) {
    return new AuthApiError({ code: inferAuthErrorCode(error.message, fallbackStatus), message: error.message || fallbackMessage, status: fallbackStatus, details: undefined });
  }
  if (isRecord(error)) {
    const message = typeof error.message === 'string' && error.message.trim().length > 0 ? error.message.trim() : fallbackMessage;
    const status  = typeof error.status  === 'number' && Number.isFinite(error.status)   ? error.status          : fallbackStatus;
    return new AuthApiError({ code: inferAuthErrorCode(message, status), message, status, details: error });
  }
  return new AuthApiError({ code: AUTH_API_ERROR_CODES.UNKNOWN, message: fallbackMessage, status: fallbackStatus, details: error });
}

function createSignUpMetadata(input: SignUpWithPasswordInput): Record<string, string> {
  const m: Record<string, string> = {};
  const fullName = sanitizePlainText(input.fullName, 120);
  if (fullName !== null) m.full_name = fullName;
  const phone = sanitizePlainText(input.phone, 40);
  if (phone !== null) m.phone = phone;
  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    const k = sanitizePlainText(key, 64);
    const v = sanitizePlainText(value, 200);
    if (k !== null && v !== null) m[k] = v;
  }
  return m;
}

function toApiResponse<T>(data: T): ApiResponse<T> { return { data, error: null }; }
function toErrorResponse<T>(error: unknown, msg: string): ApiResponse<T> { return { data: null, error: toAuthApiError(error, msg) }; }

// ─── Error codes (exported) ───────────────────────────────────────────────────

export const AUTH_API_ERROR_CODES = {
  INVALID_EMAIL:       'AUTH_INVALID_EMAIL',
  INVALID_PASSWORD:    'AUTH_INVALID_PASSWORD',
  INVALID_REDIRECT:    'AUTH_INVALID_REDIRECT',
  INVALID_OTP_TOKEN:   'AUTH_INVALID_OTP_TOKEN',
  UNAUTHORIZED:        'AUTH_UNAUTHORIZED',
  EMAIL_NOT_CONFIRMED: 'AUTH_EMAIL_NOT_CONFIRMED',
  RATE_LIMITED:        'AUTH_RATE_LIMITED',
  CONFLICT:            'AUTH_CONFLICT',
  PROVIDER_ERROR:      'AUTH_PROVIDER_ERROR',
  SESSION_NOT_FOUND:   'AUTH_SESSION_NOT_FOUND',
  UNKNOWN:             'AUTH_UNKNOWN',
} as const;

export type AuthApiErrorCode =
  | (typeof AUTH_API_ERROR_CODES)[keyof typeof AUTH_API_ERROR_CODES]
  | (string & {});

// ─── AuthApiError class ───────────────────────────────────────────────────────

export interface AuthApiErrorShape {
  code:     AuthApiErrorCode;
  message:  string;
  status:   number;
  details?: unknown;
}

export class AuthApiError extends Error implements AuthApiErrorShape {
  public readonly code:     AuthApiErrorCode;
  public readonly status:   number;
  public readonly details?: unknown;

  public constructor(input: AuthApiErrorShape) {
    super(input.message);
    this.name    = 'AuthApiError';
    this.code    = input.code;
    this.status  = input.status;
    this.details = input.details;
  }
}

// ─── Core types ───────────────────────────────────────────────────────────────

export interface AuthUserProfile {
  id:               string;
  email:            string | null;
  phone:            string | null;
  displayName:      string | null;
  role:             string | null;
  provider:         string | null;
  emailConfirmedAt: string | null;
  lastSignInAt:     string | null;
  createdAt:        string | null;
  isAnonymous:      boolean;
}

export interface AuthSessionSummary {
  user:             AuthUserProfile;
  expiresAt:        string | null;
  expiresAtUnix:    number | null;
  expiresInSeconds: number | null;
  tokenType:        string | null;
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface SignInWithPasswordInput    { email: string; password: string; }
export interface SignUpWithPasswordInput    { email: string; password: string; fullName?: string; phone?: string; redirectPath?: string; metadata?: Record<string, string>; }
export interface RequestPasswordResetInput { email: string; redirectPath?: string; }
export interface UpdatePasswordInput       { password: string; }
export interface ChangeEmailInput          { email: string; redirectPath?: string; }
export interface SignInWithGoogleInput     { redirectPath?: string; }
export interface VerifyOtpInput            { email: string; token: string; type: VerifyOtpKind; }

// ─── Legacy types ─────────────────────────────────────────────────────────────

export type AuthStateChangeCallback = (event: AuthChangeEvent, session: AuthSessionSummary | null) => void;

export interface ApiResponse<T> { data: T | null; error: AuthApiError | null; }

export interface LegacyAuthSuccessPayload { user: User; session: Session | null; }

// ─── Session snapshot types (was session.api.ts) ──────────────────────────────

export type SessionStateStatus = 'authenticated' | 'anonymous';

export interface SessionStateSnapshot {
  status:      SessionStateStatus;
  session:     AuthSessionSummary | null;
  user:        AuthUserProfile | null;
  checkedAt:   string;
  expiresSoon: boolean;
}

export type SessionChangeListener = (snapshot: SessionStateSnapshot, event: AuthChangeEvent) => void;

// ─── Redirect constants ───────────────────────────────────────────────────────

export const DEFAULT_AUTH_REDIRECT_PATH           = '/account';
// ✅ Fixed: was '/' in legacy files
export const DEFAULT_PASSWORD_RESET_REDIRECT_PATH = '/update-password';

// ─── Public mappers ───────────────────────────────────────────────────────────

export function toAuthUserProfile(user: User): AuthUserProfile {
  const provider = readProvider(user);
  return {
    id:               user.id,
    email:            user.email            ?? null,
    phone:            user.phone            ?? null,
    displayName:      readDisplayName(user),
    role:             readRole(user),
    provider,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    lastSignInAt:     user.last_sign_in_at    ?? null,
    createdAt:        user.created_at         ?? null,
    isAnonymous:      provider === 'anonymous',
  };
}

export function toAuthSessionSummary(session: Session | null): AuthSessionSummary | null {
  if (!session?.user) return null;
  return {
    user:             toAuthUserProfile(session.user),
    expiresAt:        toIsoDateTime(session.expires_at ?? null),
    expiresAtUnix:    typeof session.expires_at  === 'number' && Number.isFinite(session.expires_at)  ? session.expires_at  : null,
    expiresInSeconds: typeof session.expires_in  === 'number' && Number.isFinite(session.expires_in)  ? session.expires_in  : null,
    tokenType:        session.token_type ?? null,
  };
}

export function isAuthenticatedSession(session: AuthSessionSummary | null): session is AuthSessionSummary {
  return session !== null && session.user.id.length > 0;
}

export function normalizeInternalRedirectPath(input: string | null | undefined, fallback: string = DEFAULT_AUTH_REDIRECT_PATH): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (raw.length === 0)                                        return fallback;
  if (!raw.startsWith('/'))                                    return fallback;
  if (/^(https?:)?\/\//iu.test(raw) || raw.startsWith('//')) return fallback;
  if (containsControlChars(raw))                              return fallback;
  return raw;
}

export function buildAuthRedirectUrl(path: string | null | undefined, fallback: string = DEFAULT_AUTH_REDIRECT_PATH): string {
  const p = normalizeInternalRedirectPath(path, fallback);
  if (typeof window === 'undefined') return p;
  return new URL(p, window.location.origin).toString();
}

// ─── Session snapshot API (was session.api.ts) ────────────────────────────────

const EXPIRING_SOON_SECONDS = 5 * 60;

function buildSessionSnapshot(session: Session | null): SessionStateSnapshot {
  const normalized    = toAuthSessionSummary(session);
  const expiresAtUnix = normalized?.expiresAtUnix ?? null;
  const nowUnix       = Math.floor(Date.now() / 1000);
  return {
    status:      normalized ? 'authenticated' : 'anonymous',
    session:     normalized,
    user:        normalized?.user ?? null,
    checkedAt:   new Date().toISOString(),
    expiresSoon: typeof expiresAtUnix === 'number'
      ? expiresAtUnix - nowUnix <= EXPIRING_SOON_SECONDS
      : false,
  };
}

export function isAuthenticatedSnapshot(
  snapshot: SessionStateSnapshot,
): snapshot is SessionStateSnapshot & { status: 'authenticated'; session: AuthSessionSummary; user: AuthUserProfile } {
  return snapshot.status === 'authenticated' && isAuthenticatedSession(snapshot.session);
}

export async function getSessionStateSnapshot(): Promise<SessionStateSnapshot> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw toAuthApiError(error, 'Unable to load the current session.');
  return buildSessionSnapshot(data.session);
}

export async function getRequiredSession(): Promise<AuthSessionSummary> {
  const snapshot = await getSessionStateSnapshot();
  if (!snapshot.session) {
    throw new AuthApiError({ code: AUTH_API_ERROR_CODES.UNAUTHORIZED, message: 'You must be signed in to continue.', status: 401 });
  }
  return snapshot.session;
}

export async function getRequiredUser(): Promise<AuthUserProfile> {
  return (await getRequiredSession()).user;
}

export async function refreshSessionState(): Promise<SessionStateSnapshot> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw toAuthApiError(error, 'Unable to refresh the session.');
  return buildSessionSnapshot(data.session ?? null);
}

export async function hasActiveSession(): Promise<boolean> {
  return (await getSessionStateSnapshot()).status === 'authenticated';
}

export function subscribeToSessionChanges(listener: SessionChangeListener): () => void {
  const result = supabase.auth.onAuthStateChange((event, session) => {
    listener(buildSessionSnapshot(session), event);
  });
  const subscription: Subscription = result.data.subscription;
  return () => { subscription.unsubscribe(); };
}

// ─── Core auth functions ──────────────────────────────────────────────────────

export async function getCurrentAuthSession(): Promise<AuthSessionSummary | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw toAuthApiError(error, 'Unable to read the current session.');
  return toAuthSessionSummary(data.session);
}

export async function getCurrentAuthUser(): Promise<AuthUserProfile | null> {
  return (await getCurrentAuthSession())?.user ?? null;
}

export async function signInWithPassword(input: SignInWithPasswordInput): Promise<AuthSessionSummary> {
  const email    = sanitizeEmail(input.email);
  const password = sanitizePassword(input.password);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw toAuthApiError(error, 'Unable to sign in.');
  const session = toAuthSessionSummary(data.session);
  if (session === null) throw new AuthApiError({ code: AUTH_API_ERROR_CODES.SESSION_NOT_FOUND, message: 'Sign-in succeeded but no session was returned.', status: 500 });
  return session;
}

export async function signUpWithPassword(input: SignUpWithPasswordInput): Promise<AuthSessionSummary | null> {
  const email           = sanitizeEmail(input.email);
  const password        = sanitizePassword(input.password);
  const emailRedirectTo = buildAuthRedirectUrl(input.redirectPath, DEFAULT_AUTH_REDIRECT_PATH);
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo, data: createSignUpMetadata(input) } });
  if (error) throw toAuthApiError(error, 'Unable to create your account.');
  return toAuthSessionSummary(data.session);
}

export async function signInWithGoogle(input: SignInWithGoogleInput = {}): Promise<void> {
  const redirectTo = buildAuthRedirectUrl(input.redirectPath, DEFAULT_AUTH_REDIRECT_PATH);
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw toAuthApiError(error, 'Unable to continue with Google.');
}

export async function requestPasswordReset(input: RequestPasswordResetInput): Promise<void> {
  const email      = sanitizeEmail(input.email);
  const redirectTo = buildAuthRedirectUrl(input.redirectPath, DEFAULT_PASSWORD_RESET_REDIRECT_PATH);
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw toAuthApiError(error, 'Unable to send the password reset email.');
}

export async function updatePassword(input: UpdatePasswordInput): Promise<AuthUserProfile> {
  const password = sanitizePassword(input.password);
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw toAuthApiError(error, 'Unable to update your password.');
  if (!data.user) throw new AuthApiError({ code: AUTH_API_ERROR_CODES.UNKNOWN, message: 'Password updated but no user was returned.', status: 500 });
  return toAuthUserProfile(data.user);
}

export async function changeEmail(input: ChangeEmailInput): Promise<AuthUserProfile> {
  const email           = sanitizeEmail(input.email);
  const emailRedirectTo = buildAuthRedirectUrl(input.redirectPath, DEFAULT_AUTH_REDIRECT_PATH);
  const { data, error } = await supabase.auth.updateUser({ email }, { emailRedirectTo });
  if (error) throw toAuthApiError(error, 'Unable to update your email.');
  if (!data.user) throw new AuthApiError({ code: AUTH_API_ERROR_CODES.UNKNOWN, message: 'Email updated but no user was returned.', status: 500 });
  return toAuthUserProfile(data.user);
}

export async function resendVerificationEmail(email: string, redirectPath?: string): Promise<void> {
  const safeEmail       = sanitizeEmail(email);
  const emailRedirectTo = buildAuthRedirectUrl(redirectPath, DEFAULT_AUTH_REDIRECT_PATH);
  const { error } = await supabase.auth.resend({ type: 'signup', email: safeEmail, options: { emailRedirectTo } });
  if (error) throw toAuthApiError(error, 'Unable to resend the verification email.');
}

export async function verifyOtp(input: VerifyOtpInput): Promise<AuthSessionSummary | null> {
  const email  = sanitizeEmail(input.email);
  const token  = sanitizeOtpToken(input.token);
  const type   = sanitizeVerifyOtpType(input.type);
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type });
  if (error) throw toAuthApiError(error, 'Unable to verify the code.');
  return toAuthSessionSummary(data.session);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw toAuthApiError(error, 'Unable to sign out.');
}

export function onAuthStateChange(callback: AuthStateChangeCallback): () => void {
  const result = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, toAuthSessionSummary(session));
  });
  return () => { result.data.subscription.unsubscribe(); };
}

// ─── Legacy wrappers (preserved for older call sites) ────────────────────────

export async function signIn(input: SignInWithPasswordInput): Promise<ApiResponse<LegacyAuthSuccessPayload>> {
  try {
    const email    = sanitizeEmail(input.email);
    const password = sanitizePassword(input.password);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return toErrorResponse<LegacyAuthSuccessPayload>(error, 'Unable to sign in.');
    if (!data.user) return toErrorResponse<LegacyAuthSuccessPayload>(new AuthApiError({ code: AUTH_API_ERROR_CODES.SESSION_NOT_FOUND, message: 'Sign-in succeeded but no user was returned.', status: 500 }), 'Unable to sign in.');
    return toApiResponse<LegacyAuthSuccessPayload>({ user: data.user, session: data.session });
  } catch (error: unknown) {
    return toErrorResponse<LegacyAuthSuccessPayload>(error, 'Unable to sign in.');
  }
}

export async function signUp(input: SignUpWithPasswordInput): Promise<ApiResponse<LegacyAuthSuccessPayload>> {
  try {
    const email           = sanitizeEmail(input.email);
    const password        = sanitizePassword(input.password);
    const emailRedirectTo = buildAuthRedirectUrl(input.redirectPath, DEFAULT_AUTH_REDIRECT_PATH);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo, data: createSignUpMetadata(input) } });
    if (error) return toErrorResponse<LegacyAuthSuccessPayload>(error, 'Unable to create your account.');
    if (!data.user) return toErrorResponse<LegacyAuthSuccessPayload>(new AuthApiError({ code: AUTH_API_ERROR_CODES.UNKNOWN, message: 'Signup completed but no user was returned.', status: 500 }), 'Unable to create your account.');
    return toApiResponse<LegacyAuthSuccessPayload>({ user: data.user, session: data.session });
  } catch (error: unknown) {
    return toErrorResponse<LegacyAuthSuccessPayload>(error, 'Unable to create your account.');
  }
}

export async function getSession(): Promise<ApiResponse<Session>> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return toErrorResponse<Session>(error, 'Unable to read the current session.');
    if (!data.session) return { data: null, error: null };
    return toApiResponse<Session>(data.session);
  } catch (error: unknown) {
    return toErrorResponse<Session>(error, 'Unable to read the current session.');
  }
}

export async function getUser(): Promise<ApiResponse<User>> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return toErrorResponse<User>(error, 'Unable to read the current user.');
    if (!data.user) return { data: null, error: null };
    return toApiResponse<User>(data.user);
  } catch (error: unknown) {
    return toErrorResponse<User>(error, 'Unable to read the current user.');
  }
}

// ─── Canonical export object ──────────────────────────────────────────────────

export const authAPI = {
  // Core auth
  getCurrentAuthSession,
  getCurrentAuthUser,
  signInWithPassword,
  signUpWithPassword,
  signInWithGoogle,
  requestPasswordReset,
  updatePassword,
  changeEmail,
  resendVerificationEmail,
  verifyOtp,
  signOut,
  onAuthStateChange,
  // Session snapshots
  getSessionStateSnapshot,
  getRequiredSession,
  getRequiredUser,
  refreshSessionState,
  hasActiveSession,
  subscribeToSessionChanges,
  // Legacy surface
  signIn,
  signUp,
  getSession,
  getUser,
} as const;