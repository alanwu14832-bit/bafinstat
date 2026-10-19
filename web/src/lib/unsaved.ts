/**
 * 修改資料 with changes not saved yet: whatever closes the game (✕, the sheet's scrim / Escape / pull-down, 回比賽列表)
 * asks first. The editor registers how many changes it holds; the changes also stay on this device
 * (components/ui/editDraft.ts), so leaving never loses them for good.
 */
let count: (() => number) | null = null

export function setUnsaved(fn: (() => number) | null) { count = fn }
export const unsavedCount = () => count?.() ?? 0

/** true when nothing is unsaved, or the recorder chose to leave anyway */
export function confirmLeave(): boolean {
  const n = unsavedCount()
  if (!n) return true
  return window.confirm(`有 ${n} 處修改還沒儲存，要離開嗎？\n修改中的內容會先留在這台裝置，下次按「修改資料」可以接著改。`)
}
