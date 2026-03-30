import { ALLOWED_ORIGINS } from './constants.ts';

const ALLOWED_HEADERS = [
  'authorization',
  'x-client-info',
  'apikey',
  'content-type',
  'x-application-name',
] as const;

export function corsHeadersFor(origin: string | null): HeadersInit | null {
  // Also allow Vercel preview deployments (secure — project-scoped anchored regex)
  const isVercelPreview = /^https:\/\/sofisrestaurant-enterprise(-[a-z0-9]+-leonel-mezas-projects)?\.vercel\.app$/.test(origin ?? '');
  if (origin === null || (!ALLOWED_ORIGINS.has(origin) && !isVercelPreview)) {
    return null;
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS.join(', '),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}