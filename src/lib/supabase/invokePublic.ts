// =============================================================================
// Public edge invoke — no Supabase auth client on the critical path
// =============================================================================
// Use for anonymous endpoints (e.g. get-featured-menu) so the home route does
// not import @supabase/supabase-js auth/storage/postgrest via invoke.ts.
// =============================================================================

import { env } from '@/lib/config/env';

export async function invokePublicEdge<TResponse = unknown>(
  functionName: string,
  body: unknown = {},
  init?: { signal?: AbortSignal },
): Promise<TResponse> {
  const baseUrl = env.supabase.url;
  const publishableKey = env.supabase.publishableKey;

  if (!baseUrl || !publishableKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/functions/v1/${functionName}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      apikey: publishableKey,
      'x-application-name': 'sofis-restaurant-v2',
    },
    body: JSON.stringify(body ?? {}),
    signal: init?.signal,
  });

  const text = await response.text().catch(() => '');

  let payload: unknown = null;
  if (text.length > 0) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof (payload as { message: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : 'Request failed';

    throw new Error(message);
  }

  return payload as TResponse;
}
