import { create } from 'zustand'

export type ThemeMode = 'system' | 'light' | 'dark'
export type FontMode = 'serif' | 'sans'

const THEME_KEY = 'bafin.theme'
const SIDEBAR_KEY = 'bafin.sidebar'
const FONT_KEY = 'bafin.font'

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

let themeTimer: number | undefined
export function applyTheme(mode: ThemeMode, animate = false) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-transition')
    window.clearTimeout(themeTimer)
    themeTimer = window.setTimeout(() => root.classList.remove('theme-transition'), 320)
  }
  if (mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
}

export function applyFont(mode: FontMode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (mode === 'serif') root.removeAttribute('data-font')
  else root.setAttribute('data-font', mode)
}

interface UiState {
  sidebarCollapsed: boolean
  mobileNavOpen: boolean
  theme: ThemeMode
  /** serif (宋體, default) or sans (黑體) */
  font: FontMode
  setFont: (mode: FontMode) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  setMobileNavOpen: (open: boolean) => void
  setTheme: (mode: ThemeMode) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarCollapsed: readStorage(SIDEBAR_KEY) === 'collapsed',
  mobileNavOpen: false,
  theme: initialTheme(),
  font: readStorage(FONT_KEY) === 'sans' ? 'sans' : 'serif',
  setFont: (mode) => {
    writeStorage(FONT_KEY, mode === 'serif' ? null : mode)
    applyFont(mode)
    set({ font: mode })
  },
  setSidebarCollapsed: (collapsed) => {
    writeStorage(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded')
    set({ sidebarCollapsed: collapsed })
  },
  toggleSidebar: () => get().setSidebarCollapsed(!get().sidebarCollapsed),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  setTheme: (mode) => {
    writeStorage(THEME_KEY, mode === 'system' ? null : mode)
    applyTheme(mode, true)
    set({ theme: mode })
  },
}))

// Sync the DOM attribute with the persisted preference on load.
applyTheme(useUiStore.getState().theme)
applyFont(useUiStore.getState().font)
