import { useEffect, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useDataStore, effectiveDataset } from '../../store/data'
import { filterGames } from '../../data/filters'
import { DEFAULT_FILTERS, type Filters } from '../../data/types'
import { POSITION_LABEL } from '../../lib/fmt'

/** Filters in the address (?cup=新生盃&opp=經濟…), so a copied link opens the same data. Short keys, never the page's own. */
const URL_KEYS: Record<keyof Filters, string> = { tournament: 'cup', from: 'from', to: 'to', position: 'pos', opponent: 'opp', homeAway: 'ha', result: 'res' }

/** location.state flag set by useNavigateWithFilters: this address's filters are to be applied (the rest reset). */
const APPLY_FILTERS = 'applyFilters'
const filtersFromParams = (params: URLSearchParams): Partial<Filters> => {
  const patch: Partial<Filters> = {}
  for (const [k, q] of Object.entries(URL_KEYS) as Array<[keyof Filters, string]>) { const v = params.get(q); if (v) (patch as Record<string, string>)[k] = v }
  return patch
}
/** `params` with the filter keys set to `filters` (default values left out). */
const withFilters = (params: URLSearchParams, filters: Filters): URLSearchParams => {
  const next = new URLSearchParams(params)
  for (const [k, q] of Object.entries(URL_KEYS) as Array<[keyof Filters, string]>) {
    if (filters[k] && filters[k] !== DEFAULT_FILTERS[k]) next.set(q, filters[k]); else next.delete(q)
  }
  return next
}

/** Keeps the global filters and the address in step: a link's filters are applied once on arrival, after that every
 *  filter change (and every navigation) writes them back into the address. A navigation from
 *  useNavigateWithFilters applies its address's filters instead. */
export function useFilterUrlSync() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const { pathname } = location
  const filters = useDataStore((s) => s.filters)
  const setFilters = useDataStore((s) => s.setFilters)
  const arrived = useRef(false)
  const appliedKey = useRef<string | null>(null)
  // after applying an address's filters, don't write the old ones back before the store has caught up
  const waiting = useRef(false)
  useEffect(() => {
    if (arrived.current) return
    arrived.current = true
    const patch = filtersFromParams(params)
    if (Object.keys(patch).length) setFilters(patch)
  }, [params, setFilters])
  useEffect(() => {
    const apply = (location.state as Record<string, unknown> | null)?.[APPLY_FILTERS] === true
    if (!apply || appliedKey.current === location.key) return
    appliedKey.current = location.key
    arrived.current = true
    waiting.current = true
    setFilters({ ...DEFAULT_FILTERS, ...filtersFromParams(params) })
  }, [location.key, location.state, params, setFilters])
  useEffect(() => {
    if (!arrived.current) return
    const next = withFilters(params, filters)
    if (waiting.current) { if (next.toString() === params.toString()) waiting.current = false; return }
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [filters, params, setParams, pathname])
}

/**
 * Go to `pathname` (or stay, with null) with these filters in one step. Calling setFilters and then navigate() races
 * with useFilterUrlSync, which writes the new filters into the OLD address and so cancels the navigation; this puts the
 * filters into the new address and lets the sync apply them there. `keep` = other query parameters (tab, player…).
 */
export function useNavigateWithFilters() {
  const navigate = useNavigate()
  const { pathname: here } = useLocation()
  return (pathname: string | null, filters: Partial<Filters>, { keep, replace = false }: { keep?: URLSearchParams | Record<string, string>; replace?: boolean } = {}) => {
    const q = withFilters(new URLSearchParams(keep), { ...DEFAULT_FILTERS, ...filters }).toString()
    navigate({ pathname: pathname ?? here, search: q ? `?${q}` : '' }, { replace, state: { [APPLY_FILTERS]: true } })
  }
}

const RESULT: Record<string, string> = { W: '勝', L: '敗', T: '和' }

/** One line saying what the numbers cover, for exports and share images: the filters, the games, the last date. */
export function scopeText(filters: Filters, games: Array<{ date: string }>): string {
  const parts = [
    filters.tournament !== 'all' && filters.tournament,
    (filters.from || filters.to) && `${filters.from || '開始'} – ${filters.to || '至今'}`,
    filters.opponent !== 'all' && `對手 ${filters.opponent}`,
    filters.homeAway !== 'all' && (filters.homeAway === '主' ? '主場' : '客場'),
    filters.result !== 'all' && `${RESULT[filters.result]}場`,
    filters.position !== 'all' && `守位 ${filters.position}`,
  ].filter(Boolean)
  const last = games.reduce((m, g) => (g.date > m ? g.date : m), '')
  return `${parts.length ? `篩選：${parts.join('・')}` : '全部比賽'}・${games.length} 場${last ? `・資料截至 ${last}` : ''}`
}
const md = (iso: string) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '')

/**
 * Under the page title: what the numbers on this page cover (how many games, up to which date) and every active
 * filter as a chip with its own ✕, so the scope is visible without opening the filter panel.
 */
export function FilterChips() {
  const filters = useDataStore((s) => s.filters)
  const setFilters = useDataStore((s) => s.setFilters)
  const resetFilters = useDataStore((s) => s.resetFilters)
  const base = useDataStore((s) => s.base)
  const demo = useDataStore((s) => s.demo)
  const games = useMemo(() => filterGames(effectiveDataset(base, demo), filters).games, [base, demo, filters])
  const chips: Array<{ key: string; label: string; clear: Partial<Filters> }> = []
  if (filters.tournament !== 'all') chips.push({ key: 't', label: filters.tournament, clear: { tournament: 'all' } })
  if (filters.from || filters.to) chips.push({ key: 'd', label: `${filters.from ? md(filters.from) : '開始'} – ${filters.to ? md(filters.to) : '至今'}`, clear: { from: '', to: '' } })
  if (filters.opponent !== 'all') chips.push({ key: 'o', label: `對手：${filters.opponent}`, clear: { opponent: 'all' } })
  if (filters.homeAway !== 'all') chips.push({ key: 'h', label: filters.homeAway === '主' ? '主場' : '客場', clear: { homeAway: 'all' } })
  if (filters.result !== 'all') chips.push({ key: 'r', label: `${RESULT[filters.result]}場`, clear: { result: 'all' } })
  if (filters.position !== 'all') chips.push({ key: 'p', label: `守位：${filters.position} ${POSITION_LABEL[filters.position] ?? ''}`.trim(), clear: { position: 'all' } })
  const last = games.reduce((m, g) => (g.date > m ? g.date : m), '')
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-[12px] -mt-2 mb-1" aria-label="資料範圍">
      <span className="text-muted mr-1">{chips.length ? '篩選：' : '全部比賽・'}{games.length} 場{last ? `・資料截至 ${md(last)}` : ''}</span>
      {chips.map((c) => (
        <button key={c.key} type="button" onClick={() => setFilters(c.clear)} aria-label={`移除篩選 ${c.label}`}
          className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full bg-accent-soft text-ink font-medium cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]">
          {c.label}<X aria-hidden className="size-3.5 text-muted" />
        </button>
      ))}
      {chips.length > 1 && <button type="button" onClick={resetFilters} className="h-7 px-2 text-muted underline underline-offset-2 cursor-pointer hover:text-ink">清除全部</button>}
    </div>
  )
}
