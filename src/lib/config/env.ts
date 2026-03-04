// src/lib/config/env.ts
export type AppMode = 'development' | 'production' | 'test'

type EnvKey = keyof ImportMetaEnv

function readEnv(key: EnvKey): unknown {
  return (import.meta.env as unknown as Record<string, unknown>)[key as string]
}

function mustGetString(key: EnvKey): string {
  const v = readEnv(key)
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`Missing required environment variable: ${String(key)}`)
  }
  return v
}

function getOptionalString(key: EnvKey): string | undefined {
  const v = readEnv(key)
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

function mode(): AppMode {
  const m = import.meta.env.MODE; // ok
  return m === 'production' || m === 'test' ? m : 'development';
}

const stripePublicKey = getOptionalString('VITE_STRIPE_PUBLIC_KEY')

export const env = {
  supabase: {
    url: mustGetString('VITE_SUPABASE_URL'),
    anonKey: mustGetString('VITE_SUPABASE_ANON_KEY'),
  },
  stripe: {
    // ✅ Don’t crash app: allow site to load even if Stripe isn't configured
    enabled: Boolean(stripePublicKey),
    publicKey: stripePublicKey ?? '',
  },
  api: {
    baseUrl: getOptionalString('VITE_API_BASE_URL') ?? '',
  },
  app: {
    mode: mode(),
    isDev: import.meta.env.DEV,
    isProd: import.meta.env.PROD,
  },
} as const