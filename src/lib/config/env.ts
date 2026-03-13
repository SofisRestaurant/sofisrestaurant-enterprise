// src/lib/config/env.ts
export type AppMode = 'development' | 'production' | 'test';

type EnvKey = keyof ImportMetaEnv;
type EnvRecord = Record<string, unknown>;

const DEFAULT_APP_NAME = 'sofis-restaurant-v2';

function readEnv(key: EnvKey): unknown {
  const source = import.meta.env as unknown as EnvRecord;
  return source[String(key)];
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function mustGetString(key: EnvKey): string {
  const value = asTrimmedString(readEnv(key));

  if (value === null) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }

  return value;
}

function getOptionalString(key: EnvKey): string | undefined {
  return asTrimmedString(readEnv(key)) ?? undefined;
}

function mode(): AppMode {
  const currentMode = import.meta.env.MODE;
  return currentMode === 'production' || currentMode === 'test'
    ? currentMode
    : 'development';
}

const supabaseUrl = mustGetString('VITE_SUPABASE_URL');
const supabaseAnonKey = mustGetString('VITE_SUPABASE_ANON_KEY');
const stripePublicKey = getOptionalString('VITE_STRIPE_PUBLIC_KEY');
const apiBaseUrl = getOptionalString('VITE_API_BASE_URL') ?? '';
const appName = getOptionalString('VITE_APP_NAME') ?? DEFAULT_APP_NAME;

export const env = {
  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
  },
  stripe: {
    enabled: Boolean(stripePublicKey),
    publicKey: stripePublicKey ?? '',
  },
  api: {
    baseUrl: apiBaseUrl,
  },
  app: {
    name: appName,
    mode: mode(),
    isDev: import.meta.env.DEV,
    isProd: import.meta.env.PROD,
  },
} as const;

if (import.meta.env.DEV && typeof window !== 'undefined') {
  console.info('[env] loaded', {
    supabaseUrl: env.supabase.url,
    hasAnonKey: env.supabase.anonKey.length > 0,
    stripeEnabled: env.stripe.enabled,
    stripeKeyPrefix: env.stripe.publicKey ? env.stripe.publicKey.slice(0, 8) : null,
    apiBaseUrl: env.api.baseUrl,
    appName: env.app.name,
    mode: env.app.mode,
  });
}