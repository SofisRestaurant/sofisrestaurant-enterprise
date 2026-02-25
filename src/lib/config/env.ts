// Environment configuration with validation
export const env = {
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL || '',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  },
  stripe: {
    publicKey: import.meta.env.VITE_STRIPE_PUBLIC_KEY || '',
  },
  api: {
    baseUrl: import.meta.env.VITE_API_BASE_URL || '',
  },
  app: {
    env: import.meta.env.MODE as 'development' | 'production' | 'test',
    isDev: import.meta.env.DEV,
    isProd: import.meta.env.PROD,
  },
} as const;

// Validate required environment variables
export function validateEnv() {
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_STRIPE_PUBLIC_KEY',
  ];

  const missing = required.filter(
    (key) => !import.meta.env[key]
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}