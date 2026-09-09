import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, Plus, Trash2 } from 'lucide-react'
import { mergeRoster, parseRosterWorkbook, type RosterImportResult, type RosterMerge } from '../../data/rosterImport'
import { Button } from './Button'
import { inputCls } from './Input'
import { cx } from '../../lib/format'
import { playersWithRecords, type RosterChange } from '../../data/roster'
import { ROSTER_POSITIONS, type Dataset, type Player } from '../../data/types'
import { POSITION_LABEL } from '../../lib/fmt'

interface Row { original: string; player: Player; removed: boolean }
const STATUSES = ['現役', '離隊', '畢業', '休賽']
const HANDS = [{ v: '', l: '—' }, { v: 'R', l: '右' }, { v: 'L', l: '左' }, { v: 'S', l: '左右' }]
const cell = cx(inputCls('sm'), 'h-8 px-2 text-[13px] w-full')
const sel = cx(cell, 'appearance-none cursor-pointer')

/** Inline roster table: add, edit, rename, mark status, remove (only players without records). */
export function RosterEditor({ base, busy, onSave, onCancel }: { base: Dataset; busy?: boolean; onSave: (c: RosterChange) => Promise<void>; onCancel: () => void }) {
  const withRecords = useMemo(() => playersWithRecords(base), [base])
  const [rows, setRows] = useState<Row[]>(() => base.roster.map((p) => ({ original: p.name, player: { ...p }, removed: false })))
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ file: string; parsed: RosterImportResult; merge: RosterMerge } | null>(null)
  const [touched, setTouched] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const onFile = async (f: File) => {
    setError(null)
    try {
      const parsed = parseRosterWorkbook(await f.arrayBuffer())
      const current = rows.filter((r) => !r.removed).map((r) => r.player)
      setPreview({ file: f.name, parsed, merge: mergeRoster(current, parsed.players) })
    } catch (e) { setError(`讀取失敗：${e instanceof Error ? e.message : String(e)}`) }
  }
  const applyPreview = () => {
    if (!preview) return
    const merged = new Map(preview.merge.players.map((p) => [p.name, p]))
    const changed = new Set([...preview.merge.added, ...preview.merge.updated.map((u) => u.name)])
    setRows((rs) => {
      const next = rs.map((r) => (!r.removed && merged.has(r.player.name) ? { ...r, player: merged.get(r.player.name)! } : r))
      for (const n of preview.merge.added) if (!next.some((r) => r.player.name === n)) next.push({ original: '', player: merged.get(n)!, removed: false })
      return next
    })
    setTouched(changed); setPreview(null)
  }
  const set = (i: number, patch: Partial<Player>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, player: { ...r.player, ...patch } } : r)))
  const save = async () => {
    setError(null)
    const change: RosterChange = {
      players: rows.filter((r) => !r.removed).map((r) => ({ original: r.original, player: { ...r.player, name: r.player.name.trim(), number: r.player.number?.trim() || undefined, primaryPos: r.player.primaryPos || undefined, secondaryPos: r.player.secondaryPos || undefined, bats: r.player.bats || undefined, throws: r.player.throws || undefined, status: r.player.status || '現役', note: r.player.note?.trim() || undefined } })),
      removed: rows.filter((r) => r.removed && r.original).map((r) => r.original),
    }
    try { await onSave(change) } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = '' }} />
        <Button size="sm" icon={<FileSpreadsheet />} onClick={() => fileRef.current?.click()}>匯入 Excel</Button>
        <span className="text-[12px] text-muted">任何有「姓名」欄的工作表都可以；背號、守位、慣用手、狀態會自動對應。同名球員以檔案為準，檔案空白的欄位保留舊值。</span>
      </div>
      {preview && (
        <div className="rounded-[var(--radius-sm)] border border-border bg-surface-2/50 p-3 md:p-4 flex flex-col gap-2 text-[13px]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="font-medium text-ink">{preview.file}<span className="text-muted font-normal ml-2">工作表「{preview.parsed.sheet}」・讀到 {preview.parsed.players.length} 人</span></div>
            <div className="text-[12px] text-muted">欄位對應：{Object.entries(preview.parsed.mapping).map(([k, v]) => `${k}←${v}`).join('・')}</div>
          </div>
          <div className="flex gap-4 flex-wrap tnum"><span>新增 <b className="text-ink">{preview.merge.added.length}</b></span><span>更新 <b className="text-ink">{preview.merge.updated.length}</b></span><span>沒有變動 <b className="text-ink">{preview.merge.unchanged}</b></span></div>
          {preview.merge.added.length > 0 && <div className="text-ink-2"><span className="text-muted">新增：</span>{preview.merge.added.join('、')}</div>}
          {preview.merge.updated.length > 0 && <ul className="text-ink-2 flex flex-col gap-0.5">{preview.merge.updated.map((u) => <li key={u.name}><span className="font-medium text-ink">{u.name}</span>：{u.changes.join('；')}</li>)}</ul>}
          {preview.parsed.warnings.map((w) => <div key={w} className="flex items-start gap-1.5 text-[12px] text-ink-2"><AlertTriangle className="size-3.5 text-warning shrink-0 mt-0.5" />{w}</div>)}
          <div className="flex gap-2 justify-end pt-1"><Button size="sm" variant="ghost" onClick={() => setPreview(null)}>取消</Button><Button size="sm" variant="primary" onClick={applyPreview} disabled={!preview.merge.added.length && !preview.merge.updated.length}>套用到名單</Button></div>
        </div>
      )}
      <div className="overflow-x-auto scroll-x border border-border rounded-[var(--radius-sm)]">
        <table className="min-w-full border-collapse text-[13px]">
          <thead className="bg-surface-2/60"><tr className="text-[11px] text-muted">{['背號', '姓名', '主守位', '副守位', '打', '投', '狀態', '備註', ''].map((h) => <th key={h} className="px-2 h-8 text-left font-medium whitespace-nowrap first:pl-3">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={cx('border-t border-border', r.removed && 'opacity-40', touched.has(r.player.name) && 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]')}>
                <td className="pl-3 pr-1 py-1 w-[64px]"><input value={r.player.number ?? ''} onChange={(e) => set(i, { number: e.target.value })} className={cx(cell, 'tnum')} disabled={r.removed} /></td>
                <td className="px-1 py-1 min-w-[120px]"><input value={r.player.name} onChange={(e) => set(i, { name: e.target.value })} className={cx(cell, r.original && r.original !== r.player.name.trim() && 'border-warning')} disabled={r.removed} title={r.original && r.original !== r.player.name ? `儲存後所有「${r.original}」的紀錄會改為「${r.player.name}」` : undefined} /></td>
                <td className="px-1 py-1 w-[108px]"><select value={r.player.primaryPos ?? ''} onChange={(e) => set(i, { primaryPos: e.target.value })} className={sel} disabled={r.removed}><option value="">—</option>{ROSTER_POSITIONS.map((p) => <option key={p} value={p}>{p} {POSITION_LABEL[p]}</option>)}</select></td>
                <td className="px-1 py-1 w-[108px]"><select value={r.player.secondaryPos ?? ''} onChange={(e) => set(i, { secondaryPos: e.target.value })} className={sel} disabled={r.removed}><option value="">—</option>{ROSTER_POSITIONS.map((p) => <option key={p} value={p}>{p} {POSITION_LABEL[p]}</option>)}</select></td>
                <td className="px-1 py-1 w-[72px]"><select value={r.player.bats ?? ''} onChange={(e) => set(i, { bats: (e.target.value || undefined) as Player['bats'] })} className={sel} disabled={r.removed}>{HANDS.map((h) => <option key={h.v} value={h.v}>{h.l}</option>)}</select></td>
                <td className="px-1 py-1 w-[72px]"><select value={r.player.throws ?? ''} onChange={(e) => set(i, { throws: (e.target.value || undefined) as Player['throws'] })} className={sel} disabled={r.removed}>{HANDS.map((h) => <option key={h.v} value={h.v}>{h.l}</option>)}</select></td>
                <td className="px-1 py-1 w-[88px]"><select value={r.player.status ?? '現役'} onChange={(e) => set(i, { status: e.target.value })} className={sel} disabled={r.removed}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
                <td className="px-1 py-1 min-w-[140px]"><input value={r.player.note ?? ''} onChange={(e) => set(i, { note: e.target.value })} className={cell} disabled={r.removed} /></td>
                <td className="px-2 py-1 w-[40px]">
                  {r.original && withRecords.has(r.original) ? (
                    <span className="inline-flex size-7 items-center justify-center text-muted" title="已有比賽紀錄，不能刪除；要離隊請改狀態"><Trash2 className="size-3.5 opacity-30" /></span>
                  ) : (
                    <button type="button" onClick={() => setRows((rs) => (r.original ? rs.map((x, k) => (k === i ? { ...x, removed: !x.removed } : x)) : rs.filter((_, k) => k !== i)))} title={r.removed ? '取消刪除' : '刪除'} className="size-7 inline-flex items-center justify-center rounded text-muted hover:text-critical hover:bg-surface-2 cursor-pointer"><Trash2 className="size-3.5" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-2 py-2 border-t border-border"><Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setRows((rs) => [...rs, { original: '', player: { name: '', status: '現役' }, removed: false }])}>新增球員</Button></div>
      </div>
      <p className="text-[12px] text-muted">改姓名會連同所有比賽紀錄一起改；已有紀錄的球員不能刪除，請把狀態改成「離隊」或「畢業」，名單會把他們排到後面。{touched.size > 0 && ' 淡色列是剛從 Excel 套用的變動，確認後按「儲存名單」。'}</p>
      {error && <div role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--critical)_35%,transparent)] bg-[color-mix(in_srgb,var(--critical)_8%,transparent)] px-3 py-2.5 text-[13px] text-ink"><AlertTriangle className="size-4 shrink-0 mt-0.5 text-critical" />{error}</div>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onCancel} disabled={busy}>取消</Button><Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? '儲存中…' : '儲存名單'}</Button></div>
    </div>
  )
}
