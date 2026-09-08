import { create } from 'zustand'

export type ThemeMode = 'system' | 'light' | 'dark'

const THEME_KEY = 'bafin.theme'
const SIDEBAR_KEY = 'bafin.sidebar'

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage unavailable (private mode, SSR) */
  }
}

function initialTheme(): ThemeMode {
  const v = readStorage(THEME_KEY)
  return v === 'light' || v === 'dark' ? v : 'system'
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
}

interface UiState {
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  theme: ThemeMode
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  setMobileNavOpen: (open: boolean) => void
  setTheme: (mode: ThemeMode) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarCollapsed: readStorage(SIDEBAR_KEY) === 'collapsed',
  mobileNavOpen: false,
  theme: initialTheme(),
  setSidebarCollapsed: (collapsed) => {
    writeStorage(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded')
    set({ sidebarCollapsed: collapsed })
  },
  toggleSidebar: () => get().setSidebarCollapsed(!get().sidebarCollapsed),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  setTheme: (mode) => {
    writeStorage(THEME_KEY, mode === 'system' ? null : mode)
    applyTheme(mode)
    set({ theme: mode })
  },
}))

// Sync the DOM attribute with the persisted preference on load.
applyTheme(useUiStore.getState().theme)
