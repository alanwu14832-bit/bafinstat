import { useSearchParams } from 'react-router-dom'

/**
 * Reads ?view=&sort=&dir= so a link such as /batting?view=advanced&sort=rispAvg opens that tab already sorted
 * by that column (the overview tiles link here). Unknown views fall back; the caller checks the sort key.
 */
export function useLinkedSort<V extends string>(views: readonly V[], fallback: V) {
  const [params] = useSearchParams()
  const q = params.get('view') as V | null
  const initialView = q && views.includes(q) ? q : fallback
  const sortKey = params.get('sort')
  const dir: 'asc' | 'desc' = params.get('dir') === 'asc' ? 'asc' : 'desc'
  return { initialView, sortKey, dir }
}
