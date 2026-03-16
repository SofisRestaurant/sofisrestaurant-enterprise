/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KLAVIYO_PUBLIC_KEY: string
  readonly VITE_KLAVIYO_LIST_ID: string
  readonly VITE_APP_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}