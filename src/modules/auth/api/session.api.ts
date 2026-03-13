import type {
  AuthChangeEvent,
  Session,
  Subscription,
} from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/supabaseClient';

import {
  AUTH_API_ERROR_CODES,
  AuthApiError,
  type AuthSessionSummary,
  type AuthUserProfile,
  isAuthenticatedSession,
  toAuthSessionSummary,
} from './auth.api';

export type SessionStateStatus = 'authenticated' | 'anonymous';

export interface SessionStateSnapshot {
  status: SessionStateStatus;
  session: AuthSessionSummary | null;
  user: AuthUserProfile | null;
  checkedAt: string;
  expiresSoon: boolean;
}

export type SessionChangeListener = (
  snapshot: SessionStateSnapshot,
  event: AuthChangeEvent,
) => void;

const DEFAULT_EXPIRING_SOON_WINDOW_SECONDS = 5 * 60;

function createSnapshot(session: Session | null): SessionStateSnapshot {
  const normalized = toAuthSessionSummary(session);
  const expiresAtUnix = normalized?.expiresAtUnix ?? null;
  const nowUnix = Math.floor(Date.now() / 1000);

  return {
    status: normalized ? 'authenticated' : 'anonymous',
    session: normalized,
    user: normalized?.user ?? null,
    checkedAt: new Date().toISOString(),
    expiresSoon:
      typeof expiresAtUnix === 'number'
        ? expiresAtUnix - nowUnix <= DEFAULT_EXPIRING_SOON_WINDOW_SECONDS
        : false,
  };
}

function toSessionApiError(
  error: unknown,
  fallbackMessage: string,
  status = 500,
): AuthApiError {
  if (error instanceof AuthApiError) {
    return error;
  }

  if (error instanceof Error) {
    return new AuthApiError({
      code: AUTH_API_ERROR_CODES.UNKNOWN,
      message: error.message || fallbackMessage,
      status,
      details: undefined,
    });
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const message =
      typeof record.message === 'string' && record.message.trim().length > 0
        ? record.message.trim()
        : fallbackMessage;

    const errorStatus =
      typeof record.status === 'number' && Number.isFinite(record.status) ? record.status : status;

    return new AuthApiError({
      code: AUTH_API_ERROR_CODES.UNKNOWN,
      message,
      status: errorStatus,
      details: error,
    });
  }

  return new AuthApiError({
    code: AUTH_API_ERROR_CODES.UNKNOWN,
    message: fallbackMessage,
    status,
    details: error,
  });
}

export function isAuthenticatedSnapshot(
  snapshot: SessionStateSnapshot,
): snapshot is SessionStateSnapshot & { status: 'authenticated'; session: AuthSessionSummary; user: AuthUserProfile } {
  return snapshot.status === 'authenticated' && isAuthenticatedSession(snapshot.session);
}

export async function getSessionStateSnapshot(): Promise<SessionStateSnapshot> {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw toSessionApiError(error, 'Unable to load the current session.');
  }

  return createSnapshot(data.session);
}

export async function getRequiredSession(): Promise<AuthSessionSummary> {
  const snapshot = await getSessionStateSnapshot();

  if (!snapshot.session) {
    throw new AuthApiError({
      code: AUTH_API_ERROR_CODES.UNAUTHORIZED,
      message: 'You must be signed in to continue.',
      status: 401,
    });
  }

  return snapshot.session;
}

export async function getRequiredUser(): Promise<AuthUserProfile> {
  const session = await getRequiredSession();
  return session.user;
}

export async function refreshSessionState(): Promise<SessionStateSnapshot> {
  const { data, error } = await supabase.auth.refreshSession();

  if (error) {
    throw toSessionApiError(error, 'Unable to refresh the session.');
  }

  return createSnapshot(data.session ?? null);
}

export async function hasActiveSession(): Promise<boolean> {
  const snapshot = await getSessionStateSnapshot();
  return snapshot.status === 'authenticated';
}

export function subscribeToSessionChanges(listener: SessionChangeListener): () => void {
  const result = supabase.auth.onAuthStateChange((event, session) => {
    listener(createSnapshot(session), event);
  });

  const subscription: Subscription = result.data.subscription;

  return () => {
    subscription.unsubscribe();
  };
}