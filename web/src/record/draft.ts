import type { RecordState } from './model'

// v1 on purpose: fields added later (starters, bench, reentry, subs) are optional and every reader defaults them,
// so a game in progress when the app updates can still be resumed
export const DRAFT_KEY = 'bafin.record.draft.v1'
export const readDraft = (): RecordState | null => { try { const v = localStorage.getItem(DRAFT_KEY); return v ? (JSON.parse(v) as RecordState) : null } catch { return null } }
export const writeDraft = (s: RecordState | null) => { try { if (s) localStorage.setItem(DRAFT_KEY, JSON.stringify(s)); else localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ } }
