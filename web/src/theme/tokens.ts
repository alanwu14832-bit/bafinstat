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
  bg: '#f6f7f4', surface: '#ffffff', 'surface-2': '#eef1ec', 'surface-3': '#e4e8e2',
  border: 'rgba(11,20,16,0.10)', ink: '#101512', 'ink-2': '#4b554f', muted: '#7d8781',
  accent: '#d98d1c', 'accent-ink': '#1a1207', 'accent-soft': 'rgba(217,141,28,0.12)',
  grid: '#e1e0d9', axis: '#c3c2b7',
  'series-1': '#2a78d6', 'series-2': '#eb6834', 'series-3': '#1baf7a', 'series-4': '#eda100',
  'series-5': '#e87ba4', 'series-6': '#008300', 'series-7': '#4a3aa7', 'series-8': '#e34948',
  'seq-100': '#cde2fb', 'seq-150': '#b7d3f6', 'seq-200': '#9ec5f4', 'seq-250': '#86b6ef',
  'seq-300': '#6da7ec', 'seq-350': '#5598e7', 'seq-400': '#3987e5', 'seq-450': '#2a78d6',
  'seq-500': '#256abf', 'seq-550': '#1c5cab', 'seq-600': '#184f95', 'seq-650': '#104281', 'seq-700': '#0d366b',
  good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b',
}

export const DARK_TOKENS: ThemeTokens = {
  ...LIGHT_TOKENS,
  bg: '#0e1311', surface: '#151c19', 'surface-2': '#1c2521', 'surface-3': '#243029',
  border: 'rgba(255,255,255,0.09)', ink: '#f2f4f0', 'ink-2': '#b8c2bb',
  accent: '#f0a72e', 'accent-soft': 'rgba(240,167,46,0.14)',
  grid: '#2c2c2a', axis: '#383835',
  'series-1': '#3987e5', 'series-2': '#d95926', 'series-3': '#199e70', 'series-4': '#c98500',
  'series-5': '#d55181', 'series-6': '#008300', 'series-7': '#9085e9', 'series-8': '#e66767',
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
