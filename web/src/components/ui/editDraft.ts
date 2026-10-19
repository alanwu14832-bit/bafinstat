/**
 * 修改資料 kept on this device until it is saved: closing the editor, a reload or a dead battery mid-edit does not lose
 * the changes; the next 修改資料 of that game offers 接著改／丟掉. And how many changes the editor holds, for the leave
 * guard (lib/unsaved.ts) and the bar under the editor.
 */
const PREFIX = 'bafin.gameEdit.v1.'

export interface DraftMeta {
  savedAt: string
  /** the game as the edit started from (a hash): different now = it was changed elsewhere since */
  base: string
  changes: number
}

export function readEditDraft<T>(gameId: string): (T & DraftMeta) | null {
  try { const v = localStorage.getItem(PREFIX + gameId); return v ? (JSON.parse(v) as T & DraftMeta) : null } catch { return null }
}
export function writeEditDraft<T>(gameId: string, draft: (T & DraftMeta) | null): void {
  try { if (draft) localStorage.setItem(PREFIX + gameId, JSON.stringify(draft)); else localStorage.removeItem(PREFIX + gameId) } catch { /* full or blocked: the guard still asks */ }
}

/** a short hash of a JSON value (FNV-1a) */
export function hashOf(v: unknown): string {
  const s = JSON.stringify(v) ?? ''
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36)
}

/** one game's editable parts, each as JSON text (rows one by one) */
export interface EditSnap { game: string; roster: string; fielding: string; batting: string[]; pitching: string[] }

/** rows changed, added or deleted (an edited row counts once), moved rows once per list */
function rowChanges(now: string[], was: string[]): number {
  const left = new Map<string, number>()
  for (const s of was) left.set(s, (left.get(s) ?? 0) + 1)
  let added = 0
  for (const s of now) { const k = left.get(s) ?? 0; if (k) left.set(s, k - 1); else added++ }
  const removed = was.length - (now.length - added)
  const n = Math.max(added, removed)
  return n || (now.some((s, i) => s !== was[i]) ? 1 : 0)
}

/** how many changes: each plate appearance changed, added or deleted, plus one each for the game info, the 登錄名單 and the 守備 table */
export function changeCount(was: EditSnap, now: EditSnap): number {
  return rowChanges(now.batting, was.batting) + rowChanges(now.pitching, was.pitching)
    + (now.game !== was.game ? 1 : 0) + (now.roster !== was.roster ? 1 : 0) + (now.fielding !== was.fielding ? 1 : 0)
}
