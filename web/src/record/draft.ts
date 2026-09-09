import type { RecordState } from './model'

export const DRAFT_KEY = 'bafin.record.draft.v1'
export const readDraft = (): RecordState | null => { try { const v = localStorage.getItem(DRAFT_KEY); return v ? (JSON.parse(v) as RecordState) : null } catch { return null } }
export const writeDraft = (s: RecordState | null) => { try { if (s) localStorage.setItem(DRAFT_KEY, JSON.stringify(s)); else localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ } }
