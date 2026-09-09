import { useEffect, useState } from 'react'
import { useUiStore } from '../store/ui'

/** Names of the CSS custom properties defined in styles/tokens.css. */
export const TOKEN_NAMES = [
  'bg', 'surface', 'surface-2', 'surface-3', 'border',
  'ink', 'ink-2', 'muted',
  'accent', 'accent-ink', 'accent-soft',
  'grid', 'axis',
  'series-1', 'series-2', 'series-3', 'series-4', 'series-5', 'series-6', 'series-7', 'series-8',
  'seq-100', 'seq-150', 'seq-200', 'seq-250', 'seq-300', 'seq-350', 'seq-400',
  'seq-450', 'seq-500', 'seq-550', 'seq-600', 'seq-650', 'seq-700',
  'good', 'warning', 'serious', 'critical',
] as const

export type TokenName = (typeof TOKEN_NAMES)[number]
export type ThemeTokens = Record<TokenName, string>

/** Static light-theme values; used as SSR/test fallback and as the source of truth for docs. */
export const LIGHT_TOKENS: ThemeTokens = {
  bg: '#f7f7f5', surface: '#ffffff', 'surface-2': '#f2f2ef', 'surface-3': '#e9e9e5',
  border: 'rgba(24,24,20,0.10)', ink: '#17181a', 'ink-2': '#52575d', muted: '#82888f',
  accent: '#c8811a', 'accent-ink': '#1a1207', 'accent-soft': 'rgba(200,129,26,0.12)',
  grid: '#ececea', axis: '#d3d3cf',
  'series-1': '#2f63d1', 'series-2': '#c9811f', 'series-3': '#1f9484', 'series-4': '#7a5ad4',
  'series-5': '#cf4f78', 'series-6': '#3d8f2c', 'series-7': '#3c8fc4', 'series-8': '#c94444',
  'seq-100': '#dbe6fa', 'seq-150': '#c8d9f7', 'seq-200': '#b3cbf3', 'seq-250': '#9dbcee',
  'seq-300': '#86ace8', 'seq-350': '#6f9be2', 'seq-400': '#5889da', 'seq-450': '#4376d3',
  'seq-500': '#2f63d1', 'seq-550': '#2856b8', 'seq-600': '#234a9f', 'seq-650': '#1d3e86', 'seq-700': '#17326e',
  good: '#2e8b57', warning: '#d19a1e', serious: '#d97a45', critical: '#cf4a3f',
}

export const DARK_TOKENS: ThemeTokens = {
  ...LIGHT_TOKENS,
  bg: '#0f1113', surface: '#16191c', 'surface-2': '#1d2125', 'surface-3': '#262b30',
  border: 'rgba(255,255,255,0.08)', ink: '#ecedee', 'ink-2': '#b3b8bf', muted: '#7c838b',
  accent: '#e2a03a', 'accent-soft': 'rgba(226,160,58,0.14)',
  grid: '#23272b', axis: '#33383e',
  'series-1': '#5687e6', 'series-2': '#c4841f', 'series-3': '#2f9d8d', 'series-4': '#8f7ce4',
  'series-5': '#d86a8e', 'series-6': '#5ca343', 'series-7': '#3f93c4', 'series-8': '#d65c5c',
  'seq-100': '#1c2a45', 'seq-150': '#1f3155', 'seq-200': '#223965', 'seq-250': '#264276',
  'seq-300': '#2a4b87', 'seq-350': '#2f5599', 'seq-400': '#3560ab', 'seq-450': '#3d6cc0',
  'seq-500': '#4a7bd2', 'seq-550': '#5687e6', 'seq-600': '#6d98ea', 'seq-650': '#86aaee', 'seq-700': '#a2bdf2',
  good: '#4fb078', warning: '#e0b04a', serious: '#e08d5e', critical: '#e06a60',
}

/** Read the live computed value of every token from <html>. Falls back to static values when unavailable. */
export function readThemeTokens(): ThemeTokens {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return LIGHT_TOKENS
  const style = getComputedStyle(document.documentElement)
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (document.documentElement.getAttribute('data-theme') !== 'light'
      && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const fallback = isDark ? DARK_TOKENS : LIGHT_TOKENS
  const out = { ...fallback }
  for (const name of TOKEN_NAMES) {
    const v = style.getPropertyValue(`--${name}`).trim()
    if (v) out[name] = v
  }
  return out
}

/**
 * Returns the resolved token values, re-read whenever the theme preference
 * or the OS color scheme changes. Recharts gradients/tooltips need real colors.
 */
export function useThemeTokens(): ThemeTokens {
  const theme = useUiStore((s) => s.theme)
  const [tokens, setTokens] = useState<ThemeTokens>(() => readThemeTokens())

  useEffect(() => {
    // Read after the DOM attribute update has been painted.
    const id = requestAnimationFrame(() => setTokens(readThemeTokens()))
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onChange = () => setTokens(readThemeTokens())
    mq?.addEventListener?.('change', onChange)
    return () => {
      cancelAnimationFrame(id)
      mq?.removeEventListener?.('change', onChange)
    }
  }, [theme])

  return tokens
}

/** Fixed categorical order for chart series (never cycled). */
export function seriesColor(index: number): string {
  const n = Math.min(Math.max(index, 0), 7) + 1
  return `var(--series-${n})`
}
