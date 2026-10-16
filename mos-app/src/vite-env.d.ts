/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SAMPLE_ONE_CLICK_LOGIN?: string
  readonly VITE_SAMPLE_LOGIN_PASSWORD?: string
  readonly VITE_LOCAL_VIEW_AS_PASSWORD?: string
  readonly VITE_RELEASE_PROFILE?: 'full' | 'cafe'
  /** Local-launch opt-in for preview screens (lib/ship-gate.ts); only honoured on the dev server. */
  readonly VITE_FUTURE_PREVIEW?: string
  /** Side-server port for the preview opt-in (gate runs); defaults to 4400. */
  readonly VITE_FUTURE_PREVIEW_PORT?: string
  readonly VITE_RELEASE_SHA: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
