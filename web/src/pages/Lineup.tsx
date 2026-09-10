import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Reorder, useDragControls } from 'framer-motion'
import { ArrowDown, ArrowUp, Copy, Eraser, GripVertical, PenLine, Wand2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { CloudPanel } from '../components/ui/CloudPanel'
import { PlayerSelect, rosterNames } from '../components/ui/PlayerSelect'
import { PlateBadge } from '../components/ui/Scoreboard'
import { useDataStore } from '../store/data'
import { FIELD_POSITIONS } from '../data/types'
import { POSITION_LABEL } from '../lib/fmt'
import { cx } from '../lib/format'
import { autoOrder, emptyLineup, lineupIssues, lineupText, positionOf, readLineup, writeLineup, type FieldPos, type Lineup } from '../record/lineup'

/** Where each position's dropdown sits on the field (percent of the diagram box). */
const SPOTS: Record<FieldPos, { x: number; y: number }> = {
  LF: { x: 17, y: 22 }, CF: { x: 50, y: 11 }, RF: { x: 83, y: 22 },
  '3B': { x: 21, y: 55 }, SS: { x: 36, y: 40 }, '2B': { x: 64, y: 40 }, '1B': { x: 79, y: 55 },
  P: { x: 50, y: 64 }, C: { x: 50, y: 88 },
}

function FieldDiagram({ lineup, names, onPick }: { lineup: Lineup; names: string[]; onPick: (pos: FieldPos, name: string) => void }) {
  const taken = useMemo(() => new Set([...Object.values(lineup.field), lineup.dh].filter(Boolean) as string[]), [lineup])
  return (
    <div className="relative w-full max-w-[640px] mx-auto aspect-[200/175]">
      <svg viewBox="0 0 200 175" className="absolute inset-0 w-full h-full" aria-hidden>
        <path d="M100 165 L8 73 A130 130 0 0 1 192 73 Z" fill="var(--surface-2)" stroke="var(--axis)" strokeWidth="1" />
        <path d="M100 165 L56 121 L100 77 L144 121 Z" fill="var(--surface-3)" stroke="var(--axis)" strokeWidth="1" />
        <path d="M100 165 L8 73 M100 165 L192 73" stroke="var(--axis)" strokeWidth="1" />
        <circle cx="100" cy="121" r="6" fill="var(--surface-2)" stroke="var(--axis)" strokeWidth="1" />
        {[[56, 121], [100, 77], [144, 121]].map(([x, y]) => <rect key={`${x}${y}`} x={x - 3} y={y - 3} width={6} height={6} transform={`rotate(45 ${x} ${y})`} fill="var(--surface)" stroke="var(--axis)" strokeWidth="0.8" />)}
        <rect x={97} y={162} width={6} height={6} transform="rotate(45 100 165)" fill="var(--surface)" stroke="var(--axis)" strokeWidth="0.8" />
      </svg>
      {FIELD_POSITIONS.map((p) => (
        <div key={p} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1" style={{ left: `${SPOTS[p].x}%`, top: `${SPOTS[p].y}%` }}>
          <span className={cx('text-[11px] font-semibold leading-none px-1.5 py-0.5 rounded-[4px]', lineup.field[p] ? 'bg-ink text-bg' : 'bg-surface text-ink-2 border border-border')}>{p}<span className="font-normal opacity-80 ml-1 hidden sm:inline">{POSITION_LABEL[p]}</span></span>
          <PlayerSelect size="sm" aria-label={`${p} ${POSITION_LABEL[p]}`} value={lineup.field[p] ?? ''} onChange={(n) => onPick(p, n)} names={names} taken={taken} placeholder="—" className={cx('w-[84px] sm:w-[120px] md:w-[136px] shadow-[var(--shadow-card)]', lineup.field[p] && 'border-ink/40')} />
        </div>
      ))}
    </div>
  )
}

interface OrderItem { key: number; name: string }

/** One batting slot: drag by the grip (so the dropdown stays tappable), or use the arrows. */
function OrderRow({ item, index, last, pos, names, taken, onPick, onMove }: { item: OrderItem; index: number; last: boolean; pos: string; names: string[]; taken: Set<string>; onPick: (name: string) => void; onMove: (d: number) => void }) {
  const controls = useDragControls()
  return (
    <Reorder.Item value={item} dragListener={false} dragControls={controls} as="li"
      className="relative flex items-center gap-2 px-2 sm:px-3 py-2 bg-surface border-b border-border last:border-b-0"
      whileDrag={{ scale: 1.015, boxShadow: 'var(--shadow-hover)', zIndex: 5, backgroundColor: 'var(--surface)' }}>
      <button type="button" aria-label="拖曳調整棒次" title="拖曳調整棒次" onPointerDown={(e) => { e.preventDefault(); controls.start(e) }}
        className="size-8 shrink-0 inline-flex items-center justify-center rounded-[6px] text-muted hover:text-ink hover:bg-surface-2 cursor-grab active:cursor-grabbing touch-none select-none">
        <GripVertical className="size-4" />
      </button>
      <PlateBadge size={28} active={!!item.name}>{index + 1}</PlateBadge>
      <PlayerSelect size="sm" aria-label={`第 ${index + 1} 棒`} value={item.name} onChange={onPick} names={names} taken={taken} placeholder="—" className="flex-1 min-w-0" />
      <span className={cx('w-[42px] text-center text-[12px] font-medium tnum', pos ? 'text-ink' : 'text-critical')}>{item.name ? pos || '無守位' : ''}</span>
      <div className="hidden sm:flex shrink-0">
        <button type="button" aria-label="上移" onClick={() => onMove(-1)} disabled={index === 0} className="size-7 inline-flex items-center justify-center rounded text-muted hover:text-ink hover:bg-surface-2 cursor-pointer disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
        <button type="button" aria-label="下移" onClick={() => onMove(1)} disabled={last} className="size-7 inline-flex items-center justify-center rounded text-muted hover:text-ink hover:bg-surface-2 cursor-pointer disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
      </div>
    </Reorder.Item>
  )
}

export function LineupPage() {
  const navigate = useNavigate()
  const cloud = useDataStore((s) => s.cloud)
  const base = useDataStore((s) => s.base)
  const names = useMemo(() => rosterNames(base.roster), [base.roster])
  const [lineup, setLineup] = useState<Lineup>(() => readLineup() ?? emptyLineup())
  // stable keys per batting slot so drag reordering animates the right rows (blank slots have no name to key on)
  const [keys, setKeys] = useState<number[]>(() => Array.from({ length: 9 }, (_, i) => i))
  const [msg, setMsg] = useState<string | null>(null)
  const canEdit = !cloud.configured || (!!cloud.user && cloud.isEditor)
  // every change stays on this device, so the lineup survives a refresh and is waiting on the 紀錄比賽 page
  useEffect(() => { if (lineup.updatedAt) writeLineup(lineup) }, [lineup])
  const update = (fn: (l: Lineup) => Lineup) => setLineup((l) => ({ ...fn(l), updatedAt: new Date().toISOString() }))
  const pick = (pos: FieldPos, name: string) => update((l) => {
    const field = { ...l.field }
    // a player can only stand in one spot: moving them clears the old one
    for (const p of FIELD_POSITIONS) if (name && field[p] === name) delete field[p]
    if (name) field[pos] = name; else delete field[pos]
    const dh = name && l.dh === name ? '' : l.dh
    return { ...l, field, dh }
  })
  const setDh = (name: string) => update((l) => {
    const field = { ...l.field }
    for (const p of FIELD_POSITIONS) if (name && field[p] === name) delete field[p]
    return { ...l, field, dh: name }
  })
  const setOrder = (i: number, name: string) => update((l) => ({ ...l, order: l.order.map((n, k) => (k === i ? name : n === name && name ? '' : n)) }))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= lineup.order.length) return
    setKeys((k) => { const n = k.slice(); [n[i], n[j]] = [n[j], n[i]]; return n })
    update((l) => { const order = l.order.slice(); [order[i], order[j]] = [order[j], order[i]]; return { ...l, order } })
  }
  const items: OrderItem[] = useMemo(() => keys.map((key, i) => ({ key, name: lineup.order[i] ?? '' })), [keys, lineup.order])
  const reorder = (next: OrderItem[]) => { setKeys(next.map((x) => x.key)); update((l) => ({ ...l, order: next.map((x) => x.name) })) }
  const issues = useMemo(() => lineupIssues(lineup, base.roster), [lineup, base.roster])
  const inOrder = useMemo(() => new Set(lineup.order.filter(Boolean)), [lineup.order])
  const copy = async () => {
    try { await navigator.clipboard.writeText(lineupText(lineup)); setMsg('已複製陣容文字，可以貼到群組') } catch { setMsg('這個瀏覽器不允許複製，請手動選取') }
  }
  const toRecord = () => { writeLineup({ ...lineup, updatedAt: new Date().toISOString() }); navigate('/record') }

  if (!canEdit) {
    return (
      <>
        <PageHeader title="先發陣容" description="紀錄員登入後，在球場圖上排守位與打序，再一鍵帶到紀錄比賽。" />
        <div className="max-w-md"><CloudPanel /></div>
      </>
    )
  }
  return (
    <>
      <PageHeader title="先發陣容" description="在球場圖上選每個守位的球員，再排打序；陣容會存在這台裝置，開始紀錄比賽時自動帶入。"
        actions={<div className="flex items-center gap-2"><Button variant="ghost" size="sm" icon={<Copy />} onClick={() => void copy()}>複製文字</Button><Button variant="primary" size="sm" icon={<PenLine />} onClick={toRecord}>帶到紀錄比賽</Button></div>} />
      {msg && <div role="status" className="rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-ink">{msg}</div>}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5 items-start">
        <Card className="xl:col-span-7" title="守備陣容" subtitle="點每個守位的下拉選單選人；同一人只會站一個位置" bodyClassName="p-3 sm:p-5">
          <FieldDiagram lineup={lineup} names={names} onPick={pick} />
          <div className="mt-4 pt-4 border-t border-border flex items-center gap-3 flex-wrap">
            <span className="text-[12px] font-medium text-ink-2">指定打擊 DH</span>
            <PlayerSelect size="sm" aria-label="DH 指定打擊" value={lineup.dh} onChange={setDh} names={names} placeholder="不用 DH" className="w-[160px]" />
            <span className="text-[12px] text-muted">有 DH 時投手不排進打序</span>
            <Button variant="ghost" size="sm" icon={<Eraser />} className="ml-auto" onClick={() => { if (window.confirm('清空整個陣容？')) update(() => emptyLineup()) }}>全部清空</Button>
          </div>
        </Card>
        <Card className="xl:col-span-5" title="打序" subtitle="按住左邊的把手拖曳就能換棒次；先排好守位再按「依守位填入」" flush
          action={<div className="flex items-center gap-1.5"><Button variant="ghost" size="sm" icon={<Wand2 />} onClick={() => update(autoOrder)}>依守位填入</Button><Button variant="ghost" size="sm" onClick={() => update((l) => ({ ...l, order: l.order.map(() => '') }))}>清空打序</Button></div>}>
          <Reorder.Group as="ol" axis="y" values={items} onReorder={reorder} className="flex flex-col">
            {items.map((item, i) => (
              <OrderRow key={item.key} item={item} index={i} last={i === items.length - 1} pos={positionOf(lineup, item.name)} names={names} taken={inOrder}
                onPick={(v) => setOrder(i, v)} onMove={(d) => move(i, d)} />
            ))}
          </Reorder.Group>
          <div className="px-4 py-3 border-t border-border flex flex-col gap-2">
            {issues.length ? issues.map((t) => <div key={t} className="text-[12px] text-warning flex items-start gap-1.5"><span className="mt-[5px] size-1.5 rounded-full bg-warning shrink-0" />{t}</div>) : <Badge variant="good">陣容完整</Badge>}
            <div className="text-[12px] text-muted">{lineup.updatedAt ? `已存在這台裝置・${new Date(lineup.updatedAt).toLocaleString('zh-TW')}` : '還沒開始排'}</div>
          </div>
        </Card>
      </div>
    </>
  )
}
