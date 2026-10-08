import type { RecordState } from './model'

// v1 on purpose: fields added later (starters, bench, reentry, subs) are optional and every reader defaults them,
// so a game in progress when the app updates can still be resumed
export const DRAFT_KEY = 'bafin.record.draft.v1'
export const readDraft = (): RecordState | null => { try { const v = localStorage.getItem(DRAFT_KEY); return v ? (JSON.parse(v) as RecordState) : null } catch { return null } }
/** false when the browser refused to keep it (storage full or blocked): the page then says the progress is not on this device */
export const writeDraft = (s: RecordState | null): boolean => { try { if (s) localStorage.setItem(DRAFT_KEY, JSON.stringify(s)); else localStorage.removeItem(DRAFT_KEY); return true } catch { return false } }
