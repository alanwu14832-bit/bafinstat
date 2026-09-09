import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, UploadCloud } from 'lucide-react'
import * as XLSX from 'xlsx'
import { PageHeader } from '../components/layout/PageHeader'
import { Card, SectionHeading } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Checkbox, Field, Input } from '../components/ui/Input'
import { cx } from '../lib/format'
import { datasetToWorkbook, legacyToDataset, parseWorkbook, type ImportReport } from '../data/xlsx'
import { useFilterOptions } from '../hooks/useStats'
import type { Dataset } from '../data/types'
import { useDataStore } from '../store/data'
import { CloudPanel } from '../components/ui/CloudPanel'

const STEPS = [
  { title: '下載總表', desc: '總表內含「單場-摘要 / 單場-打擊 / 單場-投球」模板，照原本習慣逐球紀錄。' },
  { title: '貼回紀錄表', desc: '比賽後把單場工作表的列貼到「打席紀錄」「投球紀錄」「守備紀錄」（貼上值）。' },
  { title: '上傳', desc: '把整個總表拖進來；也可以只上傳一份單場模板檔，或以前的舊格式單場紀錄表。' },
  { title: '完成', desc: '所有頁面即時更新。本地模式資料只存在你的瀏覽器；雲端模式則全隊共用、即時同步。' },
]
const TEMPLATE_URL = (import.meta.env.VITE_TEMPLATE_URL as string | undefined) ?? `${import.meta.env.BASE_URL}BAFIN_棒球數據總表.xlsx`
const MODE_LABEL = { master: '總表', single: '單場模板', legacy: '舊格式單場紀錄表' } as const

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="min-w-0"><div className="text-xs text-muted">{label}</div><div className="text-[20px] font-semibold tracking-[-0.01em] text-ink leading-6 mt-0.5 tnum">{value}</div></div>
}

export function ImportPage() {
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState<{ dataset: Dataset; report: ImportReport; file: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [legacyId, setLegacyId] = useState('')
  const [legacyTournament, setLegacyTournament] = useState('')
  const [legacyDate, setLegacyDate] = useState('')
  const opts = useFilterOptions()
  const inputRef = useRef<HTMLInputElement>(null)
  const { base, source, importedAt, replaceDataset, appendDataset, resetToSeed, params, setParams, demo, setDemo, cloud } = useDataStore()
  const canWriteCloud = cloud.configured && !!cloud.user
  const cloudReadOnly = cloud.configured && !cloud.user

  const handleFile = async (file: File) => {
    setError(null); setDone(null); setPending(null)
    try {
      const buf = await file.arrayBuffer()
      const parsed = parseWorkbook(buf, file.name)
      setPending({ ...parsed, file: file.name })
      if (parsed.report.legacy) { setLegacyId(parsed.report.legacy.game_id); setLegacyDate(parsed.report.legacy.date); setLegacyTournament(opts.tournaments[0] ?? '友誼賽') }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f) }
  const onPick = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = '' }
  const confirm = async (mode: 'replace' | 'append') => {
    if (!pending) return
    setError(null)
    try {
      const ds = pending.report.legacy ? legacyToDataset(pending.report.legacy, { id: legacyId, tournament: legacyTournament, date: legacyDate }) : pending.dataset
      const r = mode === 'replace' ? await replaceDataset(ds) : await appendDataset(ds)
      const where = cloud.configured && cloud.user ? '已寫入雲端' : mode === 'replace' ? '已取代本地資料' : '已合併到本地資料'
      const skipped = r?.skipped ? `（略過 ${r.skipped} 場已存在的比賽）` : ''
      setDone(`${where}：${r ? r.games : pending.report.games} 場比賽${skipped}、${pending.report.batting} 個打席、${pending.report.pitching} 個投球打席。`)
      setPending(null)
      if (demo) setDemo(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const exportCurrent = () => XLSX.writeFile(datasetToWorkbook(base), `BAFIN_資料備份_${new Date().toISOString().slice(0, 10)}.xlsx`)
  const sourceLabel = source === 'cloud' ? `雲端資料庫${importedAt ? `・同步於 ${new Date(importedAt).toLocaleString('zh-TW')}` : ''}` : source === 'seed' ? '內建範例（由原紀錄表轉入）' : `匯入於 ${importedAt ? new Date(importedAt).toLocaleString('zh-TW') : ''}`

  return (
    <>
      <PageHeader title="資料匯入" description="上傳 Excel 檔以更新所有統計。解析在瀏覽器內完成，只讀取輸入欄位，所有數據由網站重新計算。"
        actions={<Button icon={<FileSpreadsheet />} href={TEMPLATE_URL} download>下載總表範本</Button>} />
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 md:gap-5 items-start">
        <Card className="xl:col-span-3" title="上傳檔案" subtitle="總表、單場模板，或以前的單場紀錄表（舊格式）都可以；不同格式會算出一樣的數據">
          <div role="button" tabIndex={0} aria-label="拖曳檔案到此處或點選上傳" onClick={() => inputRef.current?.click()} onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }} onDragEnter={(e) => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
            className={cx('flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed px-6 py-10 text-center cursor-pointer transition-colors motion-reduce:transition-none',
              dragging ? 'border-ink bg-surface-2' : 'border-border-strong hover:bg-surface-2/60')}>
            <UploadCloud className="size-6 text-muted mb-1" strokeWidth={1.6} />
            <div className="text-sm font-medium text-ink">拖曳檔案到這裡，或點選選擇</div>
            <div className="text-xs text-muted">.xlsx・會辨識「打席紀錄／投球紀錄」、「單場-打擊／單場-投球」，或舊格式的「當日比賽統計」</div>
            <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={onPick} />
          </div>
          {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--critical)_35%,transparent)] bg-[color-mix(in_srgb,var(--critical)_8%,transparent)] px-3 py-2.5 text-[13px] text-ink"><AlertTriangle className="size-4 shrink-0 mt-0.5 text-critical" /><span>{error}</span></div>}
          {done && <div role="status" className="mt-4 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--good)_35%,transparent)] bg-[color-mix(in_srgb,var(--good)_8%,transparent)] px-3 py-2.5 text-[13px] text-ink"><CheckCircle2 className="size-4 shrink-0 mt-0.5 text-good" /><span>{done}</span></div>}
          {pending && (
            <div className="mt-4 rounded-[var(--radius-sm)] border border-border divide-y divide-[var(--border)]">
              <div className="px-4 py-3 flex items-center gap-2 flex-wrap"><Badge variant="accent">{MODE_LABEL[pending.report.mode]}</Badge><span className="text-[13px] font-medium text-ink truncate">{pending.file}</span></div>
              {pending.report.legacy && (
                <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="日期"><Input type="date" value={legacyDate} onChange={(e) => { const d = e.target.value; setLegacyDate(d); if (d && (!legacyId.trim() || /^G\d{8}-\d{2}$/.test(legacyId))) setLegacyId(`G${d.replace(/-/g, '')}-01`) }} className={cx('tnum', !legacyDate && 'border-warning')} /></Field>
                  <Field label="比賽ID"><Input value={legacyId} onChange={(e) => setLegacyId(e.target.value)} className="tnum" /></Field>
                  <Field label="杯賽"><Input list="tournaments" value={legacyTournament} onChange={(e) => setLegacyTournament(e.target.value)} /><datalist id="tournaments">{opts.tournaments.map((t) => <option key={t} value={t} />)}</datalist></Field>
                  <div className="sm:col-span-3 text-xs text-ink-2">{pending.report.legacy.home_away === '主' ? '主場' : '客場'} vs {pending.report.legacy.opponent}・{pending.report.legacy.innings_played} 局</div>
                </div>
              )}
              <dl className="px-4 py-4 grid grid-cols-3 sm:grid-cols-5 gap-3">
                {[['比賽', pending.report.games], ['打席', pending.report.batting], ['投球打席', pending.report.pitching], ['守備列', pending.report.fielding], ['球員', pending.report.roster]].map(([k, v]) => <Metric key={String(k)} label={String(k)} value={v} />)}
              </dl>
              {pending.report.warnings.length > 0 && (
                <ul className="px-4 py-3 text-xs text-ink-2 flex flex-col gap-1.5 max-h-48 overflow-y-auto">{pending.report.warnings.map((w) => <li key={w} className="flex gap-1.5"><AlertTriangle className="size-3.5 text-warning shrink-0 mt-0.5" />{w}</li>)}</ul>
              )}
              {cloudReadOnly && <div className="px-4 py-3 text-xs text-ink-2">雲端模式：請先在右側登入，才能把資料寫入全隊共用的資料庫。</div>}
              <div className="px-4 py-3 flex gap-2 flex-wrap">
                {pending.report.mode === 'master' && <Button variant="primary" disabled={cloudReadOnly || cloud.pushing} onClick={() => void confirm('replace')}>{canWriteCloud ? '以此檔取代雲端全部資料' : '以此檔取代全部資料'}</Button>}
                <Button variant={pending.report.mode === 'master' ? 'outline' : 'primary'} disabled={cloudReadOnly || cloud.pushing || (!!pending.report.legacy && (!legacyId.trim() || !legacyDate))} onClick={() => void confirm('append')}>{cloud.pushing ? '寫入中…' : pending.report.legacy ? '加入這場比賽' : '合併（略過重複的比賽ID）'}</Button>
                <Button variant="ghost" onClick={() => setPending(null)}>取消</Button>
              </div>
            </div>
          )}
        </Card>
        <div className="xl:col-span-2 flex flex-col gap-4 md:gap-5">
          <CloudPanel />
          <Card title="目前資料" subtitle={sourceLabel}>
            <dl className="grid grid-cols-3 gap-3">
              {[['比賽', base.games.length], ['打席', base.batting.length], ['球員', base.roster.length]].map(([k, v]) => <Metric key={String(k)} label={String(k)} value={v} />)}
            </dl>
            <div className="flex gap-2 flex-wrap mt-4">
              <Button size="sm" icon={<Download />} onClick={exportCurrent}>匯出備份 (.xlsx)</Button>
              {source === 'imported' && <Button size="sm" variant="ghost" icon={<RefreshCw />} onClick={() => { if (window.confirm('確定清除匯入的資料，回到內建範例？')) resetToSeed() }}>回到內建資料</Button>}
            </div>
            <Checkbox className="mt-4" checked={demo} onChange={setDemo} label="混入示範比賽（僅供瀏覽功能）" />
          </Card>
          <Card title="計算參數" subtitle="與總表『設定』工作表相同">
            <div className="grid grid-cols-2 gap-3">
              <Field label="每場局數（ERA 換算）"><Input type="number" min={1} max={9} value={params.inningsPerGame} onChange={(e) => setParams({ inningsPerGame: Number(e.target.value) || 7 })} className="tnum" /></Field>
              <Field label="FIP 常數"><Input type="number" step={0.001} value={params.fipConstant} onChange={(e) => setParams({ fipConstant: Number(e.target.value) || 3.135 })} className="tnum" /></Field>
            </div>
            <p className="text-xs text-muted mt-3 leading-relaxed">wOBA 權重採 FanGraphs 2025 線性權重（wBB {params.wBB}、w1B {params.w1B}、wHR {params.wHR}）。</p>
          </Card>
        </div>
      </div>
      <section className="flex flex-col gap-4">
        <SectionHeading title="流程" description="從比賽當天到全隊看到數據，四個步驟" />
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {STEPS.map((st, i) => (
            <li key={st.title} className="flex gap-3">
              <span className="size-6 rounded-[6px] bg-surface-2 text-ink text-[12px] font-semibold grid place-items-center shrink-0 tnum">{i + 1}</span>
              <div className="min-w-0"><div className="text-[13px] font-medium text-ink leading-6">{st.title}</div><p className="text-xs text-ink-2 mt-0.5 leading-relaxed">{st.desc}</p></div>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}
