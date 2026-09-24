import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

/**
 * Reads ?view=&sort=&dir= so a link such as /batting?view=advanced&sort=rispAvg opens that tab already sorted
 * by that column (stat tiles link here). The tab lives in the URL, so a tile on the same page can switch it
 * too. A #hash scrolls that section into view. Unknown views fall back; the caller checks the sort key.
 */
export function useLinkedSort<V extends string>(views: readonly V[], fallback: V) {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const q = params.get('view') as V | null
  const view = q && views.includes(q) ? q : fallback
  const sortKey = params.get('sort')
  const dir: 'asc' | 'desc' = params.get('dir') === 'asc' ? 'asc' : 'desc'

  // Picking a tab drops the linked sort: that tab opens on its own default column.
  const setView = (v: V) => setParams((p) => {
    const next = new URLSearchParams(p)
    next.delete('sort'); next.delete('dir')
    if (v === fallback) next.delete('view'); else next.set('view', v)
    return next
  }, { replace: true })

  useEffect(() => {
    if (!location.hash) return
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)))
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() => el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }))
  }, [location.key, location.hash])

  // Every click on a tile is a new navigation, so the table re-sorts even when the URL is unchanged.
  const tableKey = `${view}-${sortKey ? `${sortKey}-${dir}-${location.key}` : ''}`
  return { view, setView, sortKey, dir, tableKey }
}
