/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;

  // New preferred browser-safe key
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;

  // Legacy fallback during migration
  readonly VITE_SUPABASE_ANON_KEY?: string;

  readonly VITE_STRIPE_PUBLIC_KEY: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}