export type AppMode = 'development' | 'production' | 'test'

type EnvKey = keyof ImportMetaEnv

function readEnv(key: EnvKey): unknown {
  // typed-eslint sometimes treats indexed access as unsafe.
  // Narrow from unknown -> string explicitly.
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
  const m = import.meta.env.MODE
  return m === 'production' || m === 'test' ? m : 'development'
}

export const env = {
  supabase: {
    url: mustGetString('VITE_SUPABASE_URL'),
    anonKey: mustGetString('VITE_SUPABASE_ANON_KEY'),
  },
  stripe: {
    publicKey: mustGetString('VITE_STRIPE_PUBLIC_KEY'),
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