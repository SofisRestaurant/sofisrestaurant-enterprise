import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/supabaseClient';

type UnknownRecord = Record<string, unknown>;

export const AUTH_API_ERROR_CODES = {
  INVALID_EMAIL: 'AUTH_INVALID_EMAIL',
  INVALID_PASSWORD: 'AUTH_INVALID_PASSWORD',
  INVALID_REDIRECT: 'AUTH_INVALID_REDIRECT',
  UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  EMAIL_NOT_CONFIRMED: 'AUTH_EMAIL_NOT_CONFIRMED',
  RATE_LIMITED: 'AUTH_RATE_LIMITED',
  CONFLICT: 'AUTH_CONFLICT',
  PROVIDER_ERROR: 'AUTH_PROVIDER_ERROR',
  SESSION_NOT_FOUND: 'AUTH_SESSION_NOT_FOUND',
  UNKNOWN: 'AUTH_UNKNOWN',
} as const;

export type AuthApiErrorCode =
  | (typeof AUTH_API_ERROR_CODES)[keyof typeof AUTH_API_ERROR_CODES]
  | (string & {});

export interface AuthApiErrorShape {
  code: AuthApiErrorCode;
  message: string;
  status: number;
  details?: unknown;
}

export class AuthApiError extends Error implements AuthApiErrorShape {
  public readonly code: AuthApiErrorCode;
  public readonly status: number;
  public readonly details?: unknown;

  public constructor(input: AuthApiErrorShape) {
    super(input.message);
    this.name = 'AuthApiError';
    this.code = input.code;
    this.status = input.status;
    this.details = input.details;
  }
}

export interface AuthUserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  role: string | null;
  provider: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string | null;
  isAnonymous: boolean;
}

export interface AuthSessionSummary {
  user: AuthUserProfile;
  expiresAt: string | null;
  expiresAtUnix: number | null;
  expiresInSeconds: number | null;
  tokenType: string | null;
}

export interface SignInWithPasswordInput {
  email: string;
  password: string;
}

export interface SignUpWithPasswordInput {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  redirectPath?: string;
  metadata?: Record<string, string>;
}

export interface RequestPasswordResetInput {
  email: string;
  redirectPath?: string;
}

export interface UpdatePasswordInput {
  password: string;
}

export interface ChangeEmailInput {
  email: string;
  redirectPath?: string;
}

export const DEFAULT_AUTH_REDIRECT_PATH = '/account';
export const DEFAULT_PASSWORD_RESET_REDIRECT_PATH = '/';

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isControlCharacter(codePoint: number): boolean {
  return codePoint <= 31 || codePoint === 127;
}

function stripControlCharacters(value: string): string {
  let result = '';

  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    result += isControlCharacter(codePoint) ? ' ' : character;
  }

  return result;
}

function containsControlCharacters(value: string): boolean {
  for (const character of value) {
    if (isControlCharacter(character.charCodeAt(0))) {
      return true;
    }
  }

  return false;
}

function collapseWhitespace(value: string): string {
  return value.trim().split(/\s+/u).join(' ');
}

function sanitizePlainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = collapseWhitespace(stripControlCharacters(value));

  if (normalized.length === 0) {
    return null;
  }

  return normalized.length <= maxLength
    ? normalized
    : normalized.slice(0, maxLength).trim();
}

function sanitizeEmail(value: unknown): string {
  const normalized = sanitizePlainText(value, 320)?.toLowerCase() ?? '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    throw new AuthApiError({
      code: AUTH_API_ERROR_CODES.INVALID_EMAIL,
      message: 'Please enter a valid email address.',
      status: 400,
    });
  }

  return normalized;
}

function sanitizePassword(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AuthApiError({
      code: AUTH_API_ERROR_CODES.INVALID_PASSWORD,
      message: 'Password is required.',
      status: 400,
    });
  }

  const trimmed = value.trim();

  if (trimmed.length < 8) {
    throw new AuthApiError({
      code: AUTH_API_ERROR_CODES.INVALID_PASSWORD,
      message: 'Password must be at least 8 characters.',
      status: 400,
    });
  }

  if (trimmed.length > 128) {
    throw new AuthApiError({
      code: AUTH_API_ERROR_CODES.INVALID_PASSWORD,
      message: 'Password must be 128 characters or less.',
      status: 400,
    });
  }

  return value;
}

function getStringFromRecord(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readRole(user: User): string | null {
  const appMetadata: unknown = user.app_metadata;
  const userMetadata: unknown = user.user_metadata;

  if (isRecord(appMetadata)) {
    const role = getStringFromRecord(appMetadata, 'role');
    if (role !== null) {
      return role;
    }
  }

  if (isRecord(userMetadata)) {
    const role = getStringFromRecord(userMetadata, 'role');
    if (role !== null) {
      return role;
    }
  }

  return null;
}

function readDisplayName(user: User): string | null {
  const userMetadata: unknown = user.user_metadata;

  if (!isRecord(userMetadata)) {
    return null;
  }

  return (
    getStringFromRecord(userMetadata, 'full_name') ??
    getStringFromRecord(userMetadata, 'name') ??
    getStringFromRecord(userMetadata, 'display_name') ??
    getStringFromRecord(userMetadata, 'username')
  );
}

function readProvider(user: User): string | null {
  const appMetadata: unknown = user.app_metadata;

  if (!isRecord(appMetadata)) {
    return null;
  }

  return getStringFromRecord(appMetadata, 'provider');
}

function toIsoDateTime(unixSeconds: number | null | undefined): string | null {
  if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return null;
  }

  return new Date(unixSeconds * 1000).toISOString();
}

export function toAuthUserProfile(user: User): AuthUserProfile {
  const provider = readProvider(user);

  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    displayName: readDisplayName(user),
    role: readRole(user),
    provider,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    createdAt: user.created_at ?? null,
    isAnonymous: provider === 'anonymous',
  };
}

export function toAuthSessionSummary(session: Session | null): AuthSessionSummary | null {
  if (!session?.user) {
    return null;
  }

  return {
    user: toAuthUserProfile(session.user),
    expiresAt: toIsoDateTime(session.expires_at ?? null),
    expiresAtUnix:
      typeof session.expires_at === 'number' && Number.isFinite(session.expires_at)
        ? session.expires_at
        : null,
    expiresInSeconds:
      typeof session.expires_in === 'number' && Number.isFinite(session.expires_in)
        ? session.expires_in
        : null,
    tokenType: session.token_type ?? null,
  };
}

export function isAuthenticatedSession(
  session: AuthSessionSummary | null,
): session is AuthSessionSummary {
  return session !== null && session.user.id.length > 0;
}

export function normalizeInternalRedirectPath(
  input: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT_PATH,
): string {
  const raw = typeof input === 'string' ? input.trim() : '';

  if (raw.length === 0) {
    return fallback;
  }

  if (!raw.startsWith('/')) {
    return fallback;
  }

  if (/^(https?:)?\/\//iu.test(raw) || raw.startsWith('//')) {
    return fallback;
  }

  if (containsControlCharacters(raw)) {
    return fallback;
  }

  return raw;
}

export function buildAuthRedirectUrl(
  path: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT_PATH,
): string {
  const normalizedPath = normalizeInternalRedirectPath(path, fallback);

  if (typeof window === 'undefined') {
    return normalizedPath;
  }

  return new URL(normalizedPath, window.location.origin).toString();
}

function inferAuthErrorCode(message: string, status: number): AuthApiErrorCode {
  const normalized = message.toLowerCase();

  if (status === 401 || normalized.includes('invalid login credentials')) {
    return AUTH_API_ERROR_CODES.UNAUTHORIZED;
  }

  if (
    status === 409 ||
    normalized.includes('already registered') ||
    normalized.includes('already exists')
  ) {
    return AUTH_API_ERROR_CODES.CONFLICT;
  }

  if (
    status === 429 ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return AUTH_API_ERROR_CODES.RATE_LIMITED;
  }

  if (
    normalized.includes('email not confirmed') ||
    normalized.includes('email not verified') ||
    normalized.includes('confirm your email')
  ) {
    return AUTH_API_ERROR_CODES.EMAIL_NOT_CONFIRMED;
  }

  return AUTH_API_ERROR_CODES.PROVIDER_ERROR;
}

function toAuthApiError(
  error: unknown,
  fallbackMessage = 'Authentication request failed.',
  fallbackStatus = 500,
): AuthApiError {
  if (error instanceof AuthApiError) {
    return error;
  }

  if (error instanceof Error) {
    return new AuthApiError({
      code: inferAuthErrorCode(error.message, fallbackStatus),
      message: error.message || fallbackMessage,
      status: fallbackStatus,
      details: undefined,
    });
  }

  if (isRecord(error)) {
    const message =
      typeof error.message === 'string' && error.message.trim().length > 0
        ? error.message.trim()
        : fallbackMessage;

    const status =
      typeof error.status === 'number' && Number.isFinite(error.status)
        ? error.status
        : fallbackStatus;

    return new AuthApiError({
      code: inferAuthErrorCode(message, status),
      message,
      status,
      details: error,
    });
  }

  return new AuthApiError({
    code: AUTH_API_ERROR_CODES.UNKNOWN,
    message: fallbackMessage,
    status: fallbackStatus,
    details: error,
  });
}

function createSignUpMetadata(input: SignUpWithPasswordInput): Record<string, string> {
  const metadata: Record<string, string> = {};

  const fullName = sanitizePlainText(input.fullName, 120);
  if (fullName !== null) {
    metadata.full_name = fullName;
  }

  const phone = sanitizePlainText(input.phone, 40);
  if (phone !== null) {
    metadata.phone = phone;
  }

  const userMetadata = input.metadata ?? {};
  for (const [key, value] of Object.entries(userMetadata)) {
    const safeKey = sanitizePlainText(key, 64);
    const safeValue = sanitizePlainText(value, 200);

    if (safeKey !== null && safeValue !== null) {
      metadata[safeKey] = safeValue;
    }
  }

  return metadata;
}

export async function getCurrentAuthSession(): Promise<AuthSessionSummary | null> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw toAuthApiError(error, 'Unable to read the current session.');
  }

  return toAuthSessionSummary(data.session);
}

export async function getCurrentAuthUser(): Promise<AuthUserProfile | null> {
  const session = await getCurrentAuthSession();
  return session?.user ?? null;
}

export async function signInWithPassword(
  input: SignInWithPasswordInput,
): Promise<AuthSessionSummary> {
  const email = sanitizeEmail(input.email);
  const password = sanitizePassword(input.password);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw toAuthApiError(error, 'Unable to sign in.');
  }

  const session = toAuthSessionSummary(data.session);
  if (session === null) {
    throw new AuthApiError({
      code: AUTH_API_ERROR_CODES.SESSION_NOT_FOUND,
      message: 'Sign-in succeeded but no session was returned.',
      status: 500,
    });
  }

  return session;
}

export async function signUpWithPassword(
  input: SignUpWithPasswordInput,
): Promise<AuthSessionSummary | null> {
  const email = sanitizeEmail(input.email);
  const password = sanitizePassword(input.password);
  const emailRedirectTo = buildAuthRedirectUrl(input.redirectPath, DEFAULT_AUTH_REDIRECT_PATH);

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: createSignUpMetadata(input),
    },
  });

  if (error) {
    throw toAuthApiError(error, 'Unable to create your account.');
  }

  return toAuthSessionSummary(data.session);
}

export async function requestPasswordReset(
  input: RequestPasswordResetInput,
): Promise<void> {
  const email = sanitizeEmail(input.email);
  const redirectTo = buildAuthRedirectUrl(
    input.redirectPath,
    DEFAULT_PASSWORD_RESET_REDIRECT_PATH,
  );

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    throw toAuthApiError(error, 'Unable to send the password reset email.');
  }
}

export async function updatePassword(input: UpdatePasswordInput): Promise<AuthUserProfile> {
  const password = sanitizePassword(input.password);

  const { data, error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    throw toAuthApiError(error, 'Unable to update your password.');
  }

  if (!data.user) {
    throw new AuthApiError({
      code: AUTH_API_ERROR_CODES.UNKNOWN,
      message: 'Password updated but no user was returned.',
      status: 500,
    });
  }

  return toAuthUserProfile(data.user);
}

export async function changeEmail(input: ChangeEmailInput): Promise<AuthUserProfile> {
  const email = sanitizeEmail(input.email);
  const emailRedirectTo = buildAuthRedirectUrl(input.redirectPath, DEFAULT_AUTH_REDIRECT_PATH);

  const { data, error } = await supabase.auth.updateUser(
    { email },
    {
      emailRedirectTo,
    },
  );

  if (error) {
    throw toAuthApiError(error, 'Unable to update your email.');
  }

  if (!data.user) {
    throw new AuthApiError({
      code: AUTH_API_ERROR_CODES.UNKNOWN,
      message: 'Email updated but no user was returned.',
      status: 500,
    });
  }

  return toAuthUserProfile(data.user);
}

export async function resendVerificationEmail(
  email: string,
  redirectPath?: string,
): Promise<void> {
  const safeEmail = sanitizeEmail(email);
  const emailRedirectTo = buildAuthRedirectUrl(redirectPath, DEFAULT_AUTH_REDIRECT_PATH);

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: safeEmail,
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    throw toAuthApiError(error, 'Unable to resend the verification email.');
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut({
    scope: 'local',
  });

  if (error) {
    throw toAuthApiError(error, 'Unable to sign out.');
  }
}