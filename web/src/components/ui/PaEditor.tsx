/**
 * Post-game editing that looks like 紀錄比賽: every plate appearance is a row; tapping one opens it with the same
 * pitch pad, result chips and batted-ball picker used while recording. Changes stay in the editor until 儲存修改.
 */
import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, List, Plus, Trash2 } from 'lucide-react'
import { Button } from './Button'
import { Input } from './Input'
import { Select } from './Select'
import { PlayerSelect } from './PlayerSelect'
import { PitchChips } from './PlayByPlay'
import { cx } from '../../lib/format'
import { POSITIONS, type BattingPA, type PitchingPA } from '../../data/types'
import { count } from '../../record/model'
import { BattedBallPicker, chipBtn, NO_BATTED_BALL, PitchPad, ResultChips } from '../../record/widgets'
import { toggleBase, withResult, withRun } from '../../record/paEdit'

export type PaSide = 'bat' | 'pit'
type AnyPA = BattingPA | PitchingPA
const isBat = (side: PaSide, _pa: AnyPA): _pa is BattingPA => side === 'bat'

const CODE_LABEL: Record<string, string> = { I: '1 出局', II: '2 出局', III: '3 出局', L: '殘壘', R: '得分', ER: '自責分' }
const whoOf = (side: PaSide, p: AnyPA) => {
  if (isBat(side, p)) return `${p.order ? `第 ${p.order} 棒 ` : ''}${p.batter || '（未填打者）'}`
  const q = p as PitchingPA
  return `對方 ${q.oppBatter || (q.oppOrder ? `第 ${q.oppOrder} 棒` : '打者')}`
}
const extrasOf = (side: PaSide, p: AnyPA) => (isBat(side, p)
  ? [p.runner && `代跑 ${p.runner}`, p.sb && `盜壘 ${p.sb}`, p.cs && `盜壘失敗 ${p.cs}`, p.advOnError && `失誤進壘 ${p.advOnError}`, p.outOnBase && `壘死 ${p.outOnBase}`, p.rbi && `打點 ${p.rbi}`]
  : [(p as PitchingPA).sba && `被盜 ${(p as PitchingPA).sba}`, p.cs && `阻殺 ${p.cs}`, (p as PitchingPA).wp && `暴投 ${(p as PitchingPA).wp}`, (p as PitchingPA).pb && `捕逸 ${(p as PitchingPA).pb}`, (p as PitchingPA).pk && `牽制出局 ${(p as PitchingPA).pk}`]
).filter(Boolean).join('・')

/* ------------------------------------------------------------------ list */
export function PaList({ side, rows, flags, onOpen, onInsert }: { side: PaSide; rows: AnyPA[]; flags: Map<number, string[]>; onOpen: (i: number) => void; onInsert: (at: number) => void }) {
  let last = -1
  return (
    <div className="border border-border rounded-[var(--radius-sm)] overflow-hidden">
      {rows.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-muted">沒有打席</div>}
      <ul>
        {rows.map((p, i) => {
          const header = p.inning !== last
          last = p.inning
          const extra = extrasOf(side, p)
          const pitcher = !isBat(side, p) ? (p as PitchingPA).pitcher : ''
          return (
            <Fragment key={i}>
              {header && <li className="px-3 py-1.5 bg-surface-2/60 text-[11px] font-medium text-muted border-t border-border first:border-t-0 tnum">第 {p.inning || '?'} 局・{side === 'bat' ? '我隊進攻' : '對方進攻'}</li>}
              <li className="border-t border-border first:border-t-0">
                <button type="button" onClick={() => onOpen(i)} className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-surface-2/60 cursor-pointer" aria-label={`修改第 ${i + 1} 個打席：${whoOf(side, p)} ${p.result || '沒有結果'}`}>
                  <span className="w-6 shrink-0 text-[11px] text-muted tnum text-right">{i + 1}</span>
                  <span className="min-w-0 flex-1 flex flex-col gap-1">
                    <span className="flex items-center gap-2 flex-wrap text-[13px]">
                      <span className="font-medium text-ink">{whoOf(side, p)}</span>
                      {isBat(side, p) && p.pos && <span className="text-[11px] text-muted">{p.pos}</span>}
                      {pitcher && <span className="text-[11px] text-muted">投手 {pitcher}</span>}
                      <span className={cx('font-semibold', p.result ? 'text-ink' : 'text-critical')}>{p.result || '沒有結果'}</span>
                      {p.code && <span className="text-[11px] px-1.5 h-5 inline-flex items-center rounded-[4px] bg-surface-2 text-ink-2">{CODE_LABEL[p.code] ?? p.code}</span>}
                      {flags.has(i) && <span title={flags.get(i)!.join('\n')} className="inline-flex items-center gap-1 text-[11px] text-warning"><AlertTriangle className="size-3.5" />{flags.get(i)!.length}</span>}
                    </span>
                    <span className="flex items-center gap-2 flex-wrap text-[11px] text-muted">
                      {(p.outsBefore !== undefined || p.basesBefore) && <span className="tnum">{[p.outsBefore !== undefined && `${p.outsBefore} 出局`, p.basesBefore && `壘上 ${p.basesBefore}`].filter(Boolean).join('・')}</span>}
                      <PitchChips pitches={p.pitches} />
                      {extra && <span>{extra}</span>}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted shrink-0" />
                </button>
              </li>
            </Fragment>
          )
        })}
      </ul>
      <div className="px-2 py-2 border-t border-border">
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onInsert(rows.length)}>在最後新增一個打席</Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ one plate appearance */
function Stepper({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="inline-flex items-center gap-1.5 text-[13px]">
      <span className="text-ink-2 min-w-[3.5rem]">{label}</span>
      <button type="button" aria-label={`${label}減一`} onClick={() => onChange(Math.max(0, value - 1))} className="size-9 pointer-fine:size-8 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer">−</button>
      <span className="tnum font-semibold w-5 text-center" aria-label={`${label} ${value}`}>{value}</span>
      <button type="button" aria-label={`${label}加一`} onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)} className="size-9 pointer-fine:size-8 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer">＋</button>
    </div>
  )
}
/** Scroll the nearest scrolling ancestor so `el` sits just below that container's sticky header (the sheet title). */
function scrollBelowHeader(el: HTMLElement) {
  let box = el.parentElement
  while (box && !(box.scrollHeight > box.clientHeight && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  const target = box ?? document.scrollingElement
  if (!target) return
  const header = box ? [...box.children].find((c) => getComputedStyle(c).position === 'sticky') : null
  const top = header ? header.getBoundingClientRect().bottom : box ? box.getBoundingClientRect().top : 0
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  target.scrollBy?.({ top: el.getBoundingClientRect().top - top - 12, behavior: reduce ? 'auto' : 'smooth' })
}
const Section = ({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) => (
  <section className="flex flex-col gap-2">
    <div className="flex items-center gap-2 min-h-7"><span className="text-[12px] font-medium text-ink-2">{title}</span>{aside}</div>
    {children}
  </section>
)

export interface PaPanelProps {
  side: PaSide
  pa: AnyPA
  index: number
  total: number
  issues: string[]
  names: string[]
  pitcherNames: string[]
  onChange: (pa: AnyPA) => void
  onNav: (index: number) => void
  onClose: () => void
  onDelete: () => void
  onInsert: (at: number) => void
  onMove: (d: -1 | 1) => void
}

export function PaPanel({ side, pa, index, total, issues, names, pitcherNames, onChange, onNav, onClose, onDelete, onInsert, onMove }: PaPanelProps) {
  const set = (patch: Partial<AnyPA>) => onChange({ ...pa, ...patch } as AnyPA)
  const c = count(pa.pitches)
  const bases = new Set((pa.basesBefore ?? '').split(''))
  const codes = side === 'bat' ? ['I', 'II', 'III', 'L', 'R'] : ['I', 'II', 'III', 'L', 'R', 'ER']
  const bat = isBat(side, pa) ? pa : null
  const pit = !bat ? (pa as PitchingPA) : null
  // opening a plate appearance (or moving to the next) brings it into view
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) scrollBelowHeader(ref.current) }, [index])
  return (
    <div ref={ref} className="flex flex-col gap-4 rounded-[var(--radius-sm)] border border-ink/20 bg-surface-2/40 p-3 md:p-4">
      {/* where am I */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="ghost" icon={<List />} onClick={onClose}>回到清單</Button>
        <div className="flex-1 min-w-0 text-center text-[13px] text-ink tnum whitespace-nowrap" aria-label={`第 ${index + 1} / ${total} 個打席`}><span className="hidden sm:inline">第 </span>{index + 1} / {total}<span className="hidden sm:inline"> 個打席</span></div>
        <Button size="sm" variant="outline" icon={<ChevronLeft />} onClick={() => onNav(index - 1)} disabled={index === 0}>上一個</Button>
        <Button size="sm" variant="outline" onClick={() => onNav(index + 1)} disabled={index >= total - 1}>下一個<ChevronRight className="size-4" /></Button>
      </div>

      {/* situation */}
      <Section title="局面">
        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
          <Stepper label="局" value={pa.inning} onChange={(v) => set({ inning: Math.max(1, v) })} />
          <div className="inline-flex items-center gap-1.5 text-[13px]">
            <span className="text-ink-2">出局(前)</span>
            {[0, 1, 2].map((o) => <button key={o} type="button" aria-pressed={pa.outsBefore === o} onClick={() => set({ outsBefore: o })} className={cx(chipBtn(pa.outsBefore === o), 'w-10 px-0 tnum')}>{o}</button>)}
          </div>
          <div className="inline-flex items-center gap-1.5 text-[13px]">
            <span className="text-ink-2">壘上(前)</span>
            {([1, 2, 3] as const).map((b) => <button key={b} type="button" aria-pressed={bases.has(String(b))} onClick={() => set({ basesBefore: toggleBase(pa.basesBefore, b) })} className={cx(chipBtn(bases.has(String(b))), 'w-11 px-0')}>{b}B</button>)}
            <span className="text-[12px] text-muted tnum ml-1">{pa.basesBefore || '—'}</span>
          </div>
        </div>
      </Section>

      {/* who */}
      {bat ? (
        <Section title="打者">
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">棒次<Select value={bat.order ? String(bat.order) : ''} onChange={(e) => set({ order: e.target.value ? Number(e.target.value) : undefined })} options={[{ value: '', label: '—' }, ...Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: `第 ${i + 1} 棒` }))]} className="w-[104px]" /></label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-2 flex-1 min-w-[160px]">打者<PlayerSelect aria-label="打者" value={bat.batter} onChange={(v) => set({ batter: v })} names={bat.batter && !names.includes(bat.batter) ? [bat.batter, ...names] : names} className="w-full" /></label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">守位<Select value={bat.pos ?? ''} onChange={(e) => set({ pos: e.target.value || undefined })} options={[{ value: '', label: '—' }, ...POSITIONS.map((p) => ({ value: p, label: p }))]} className="w-[88px]" /></label>
          </div>
        </Section>
      ) : pit && (
        <Section title="投手與對方打者">
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col gap-1 text-[12px] text-ink-2 flex-1 min-w-[160px]">我隊投手<PlayerSelect aria-label="投手" value={pit.pitcher} onChange={(v) => set({ pitcher: v })} names={pit.pitcher && !pitcherNames.includes(pit.pitcher) ? [pit.pitcher, ...pitcherNames] : pitcherNames} className="w-full" /></label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">對方棒次<Select value={pit.oppOrder ? String(pit.oppOrder) : ''} onChange={(e) => set({ oppOrder: e.target.value ? Number(e.target.value) : undefined })} options={[{ value: '', label: '—' }, ...Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: `第 ${i + 1} 棒` }))]} className="w-[104px]" /></label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-2 w-[140px]">對方打者<Input value={pit.oppBatter ?? ''} onChange={(e) => set({ oppBatter: e.target.value || undefined })} placeholder="可不填" /></label>
          </div>
        </Section>
      )}

      {/* pitches */}
      <Section title="逐球" aside={<span className="text-[12px] text-muted tnum">{c.balls} 壞 {c.strikes} 好・點一顆球可刪除</span>}>
        <div className="flex items-center gap-2 min-h-8 flex-wrap">
          <PitchChips pitches={pa.pitches} onRemove={(i) => set({ pitches: pa.pitches.filter((_, k) => k !== i) })} />
          {pa.pitches.length > 0 && <button type="button" onClick={() => set({ pitches: [] })} className="ml-auto h-9 pointer-fine:h-7 text-[12px] text-ink-2 hover:text-ink cursor-pointer underline underline-offset-2">全部清除</button>}
        </div>
        <PitchPad onPitch={(code) => set({ pitches: [...pa.pitches, code] })} />
      </Section>

      {/* result */}
      <Section title="結果">
        <ResultChips value={pa.result} onPick={(r) => onChange(withResult(pa, r))} />
      </Section>
      {pa.result && !NO_BATTED_BALL.has(pa.result) && (
        <BattedBallPicker result={pa.result} value={pa} onChange={(v) => set({ loc: v.loc, traj: v.traj, quality: v.quality })} />
      )}

      {/* running and scoring */}
      <Section title={bat ? '跑壘與得分' : '跑壘與失分'}>
        {bat ? (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-[13px] text-ink-2">代跑<PlayerSelect aria-label="代跑" size="sm" value={bat.runner ?? ''} onChange={(v) => set({ runner: v || undefined })} names={names.filter((n) => n !== bat.batter)} placeholder="沒有代跑" className="w-[160px]" /></label>
            <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
              <Stepper label="得分" value={bat.run} max={1} onChange={(v) => onChange(withRun(bat, v))} />
              <Stepper label="打點" value={bat.rbi} onChange={(v) => set({ rbi: v })} />
              <Stepper label="盜壘" value={bat.sb} onChange={(v) => set({ sb: v })} />
              <Stepper label="盜壘失敗" value={bat.cs} onChange={(v) => set({ cs: v })} />
              <Stepper label="失誤進壘" value={bat.advOnError} onChange={(v) => set({ advOnError: v })} />
              <Stepper label="壘死" value={bat.outOnBase} onChange={(v) => set({ outOnBase: v })} />
            </div>
          </div>
        ) : pit && (
          <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
            <Stepper label="被盜壘" value={pit.sba} onChange={(v) => set({ sba: v })} />
            <Stepper label="阻殺" value={pit.cs} onChange={(v) => set({ cs: v })} />
            <Stepper label="暴投" value={pit.wp} onChange={(v) => set({ wp: v })} />
            <Stepper label="捕逸" value={pit.pb} onChange={(v) => set({ pb: v })} />
            <Stepper label="牽制出局" value={pit.pk} onChange={(v) => set({ pk: v })} />
          </div>
        )}
      </Section>

      <Section title="結果代碼" aside={<span className="text-[11px] text-muted">I／II／III 這個打席造成第幾個出局；L 殘壘；R 得分{side === 'pit' ? '（非自責）；ER 自責分' : ''}</span>}>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={!pa.code} onClick={() => { const n = { ...pa }; delete n.code; onChange(n) }} className={chipBtn(!pa.code)}>無</button>
          {codes.map((k) => <button key={k} type="button" aria-pressed={pa.code === k} onClick={() => set({ code: k })} className={chipBtn(pa.code === k)}>{k}<span className="ml-1 text-[11px] opacity-70">{CODE_LABEL[k]}</span></button>)}
        </div>
      </Section>

      <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-2">備註<Input value={pa.note ?? ''} onChange={(e) => set({ note: e.target.value || undefined })} /></label>

      {issues.length > 0 && (
        <div role="status" className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 text-[12px] text-ink flex flex-col gap-1">
          {issues.map((m) => <div key={m} className="flex items-start gap-1.5"><AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-warning" />{m}</div>)}
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-border">
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onInsert(index)}>在前面插入</Button>
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onInsert(index + 1)}>在後面插入</Button>
        <Button size="sm" variant="ghost" icon={<ArrowUp />} aria-label="往前移" title="往前移" onClick={() => onMove(-1)} disabled={index === 0} />
        <Button size="sm" variant="ghost" icon={<ArrowDown />} aria-label="往後移" title="往後移" onClick={() => onMove(1)} disabled={index >= total - 1} />
        <Button size="sm" variant="ghost" icon={<Trash2 />} className="ml-auto text-critical hover:text-critical" onClick={() => { if (window.confirm(`刪除第 ${index + 1} 個打席？（按「儲存修改」後才會生效）`)) onDelete() }}>刪除這個打席</Button>
      </div>
    </div>
  )
}
