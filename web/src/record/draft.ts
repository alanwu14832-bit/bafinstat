import type { RecordState } from './model'

// v1 on purpose: fields added later (starters, bench, reentry, subs) are optional and every reader defaults them,
// so a game in progress when the app updates can still be resumed
export const DRAFT_KEY = 'bafin.record.draft.v1'
/** 練習紀錄's own progress, apart from the real one (the 即時比分 page only reads DRAFT_KEY, so it never shows a practice) */
export const PRACTICE_KEY = 'bafin.record.practice.v1'
export const readDraft = (key: string = DRAFT_KEY): RecordState | null => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as RecordState) : null } catch { return null } }
/** false when the browser refused to keep it (storage full or blocked): the page then says the progress is not on this device */
export const writeDraft = (s: RecordState | null, key: string = DRAFT_KEY): boolean => { try { if (s) localStorage.setItem(key, JSON.stringify(s)); else localStorage.removeItem(key); return true } catch { return false } }
