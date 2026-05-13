/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;

  // Browser-safe publishable key — required
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;

  readonly VITE_STRIPE_PUBLIC_KEY: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  // path: src/vite-env.d.ts
}