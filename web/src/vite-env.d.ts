/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TEMPLATE_URL?: string
  readonly VITE_ROUTER?: 'hash' | 'browser'
}
