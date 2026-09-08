/// <reference types="vite/client" />

declare const __BUILD_SHA__: string

interface ImportMetaEnv {
  readonly VITE_KV_BASE_URL: string
  readonly VITE_KV_PROJECT: string
  readonly VITE_KV_API_KEY: string
  readonly VITE_OSM_OAUTH_CLIENT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
