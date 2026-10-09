/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SAMPLE_ONE_CLICK_LOGIN?: string
  readonly VITE_SAMPLE_LOGIN_PASSWORD?: string
  readonly VITE_LOCAL_VIEW_AS_PASSWORD?: string
  readonly VITE_RELEASE_PROFILE?: 'full' | 'cafe'
  readonly VITE_RELEASE_SHA: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
