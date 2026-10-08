/** Local mode keeps the data only in this browser: when the browser refuses to store it, saving fails loudly. */
import { describe, expect, it, vi } from 'vitest'
import { STORAGE_FULL, useDataStore } from '../store/data'
import { writeDraft } from '../record/draft'
import { EMPTY_DATASET } from '../data/types'

describe('browser storage full', () => {
  it('an import that did not stick is an error and the page keeps the old data', async () => {
    const before = useDataStore.getState().base
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
    const ds = { ...EMPTY_DATASET, games: [{ id: 'G1', date: '2026-10-01', tournament: '聯賽', opponent: '政大', homeAway: '主' as const }] }
    await expect(useDataStore.getState().replaceDataset(ds)).rejects.toThrow(STORAGE_FULL)
    expect(useDataStore.getState().base).toBe(before)
    expect(writeDraft(null)).toBe(true)          // removing still works
    expect(writeDraft({} as never)).toBe(false)  // the recording page is told
    spy.mockRestore()
  })
})
