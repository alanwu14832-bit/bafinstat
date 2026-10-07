import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Button } from './Button'
import { Checkbox, Field, Input, inputCls } from './Input'
import { Select } from './Select'
import { Tabs } from './Tabs'
import { cx } from '../../lib/format'
import { reconcileFielding, type GameEdit } from '../../data/edit'
import { cleanErrors, errorsText } from '../../data/errors'
import { HIT_BASE_COUNT, LOC_CODES, locLabel, PA_RESULTS, POSITIONS, type BattingPA, type DayRosterSub, type FieldingLine, type Game, type GameDayRoster, type PitchingPA, type PlayEvent } from '../../data/types'
import { dayRosterNames, parseDayRoster, SUB_KIND_LABEL } from '../../data/gameRoster'
import { PlayerSelect } from './PlayerSelect'
import { RosterSortToggle } from './RosterSortToggle'
import { PaList, PaPanel, type PaSide } from './PaEditor'
import { auditGame } from '../../data/audit'
import { blankBattingAt, blankPitchingAt, stillOn } from '../../record/paEdit'
import { addPlay, batterEndFor, deriveHalf, homesIn, inferAll, inningsOf, midOf, rebuildHalf, removePlay, scored, setBatterResult, setEnd, stepProblems, type End, type Half, type Move } from '../../record/timeline'
import { withResult } from '../../record/paEdit'
import type { TimelineProps } from './PaEditor'
import type { ExtraBases } from '../../record/widgets'

/* ------------------------------------------------------------------ generic editable table */
type Kind = 'text' | 'int' | 'select' | 'name'
interface Col<T> { key: keyof T & string; label: string; kind: Kind; options?: readonly string[]; optionLabel?: (v: string) => string; w?: number; list?: string }

const cell = cx(inputCls('sm'), 'h-7 px-1.5 text-[12px] rounded-[6px] w-full')

function EditableTable<T extends object>({ rows, cols, onChange, blank, listId, names }: { rows: T[]; cols: Col<T>[]; onChange: (rows: T[]) => void; blank: (prev?: T) => T; listId: string; names: string[] }) {
  const update = (i: number, key: keyof T, raw: string, kind: Kind) => {
    const next = rows.slice()
    let v: unknown = raw
    if (kind === 'int') v = raw.trim() === '' ? undefined : Number(raw)
    next[i] = { ...next[i], [key]: v }
    onChange(next)
  }
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= rows.length) return; const next = rows.slice(); [next[i], next[j]] = [next[j], next[i]]; onChange(next) }
  return (
    <div className="overflow-x-auto scroll-x border border-border rounded-[var(--radius-sm)]">
      <table className="border-collapse text-[12px] min-w-full">
        <thead className="bg-surface-2/60">
          <tr>
            <th className="px-2 h-8 text-left text-[11px] font-medium text-muted w-8">#</th>
            {cols.map((c) => <th key={c.key} className="px-1 h-8 text-left text-[11px] font-medium text-muted whitespace-nowrap" style={{ minWidth: c.w ?? 64 }}>{c.label}</th>)}
            <th className="px-2 h-8 w-[88px]" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="px-2 py-1 text-muted tnum">{i + 1}</td>
              {cols.map((c) => {
                const v = (r as Record<string, unknown>)[c.key]
                const str = v === undefined || v === null ? '' : String(v)
                if (c.kind === 'select') {
                  return (
                    <td key={c.key} className="px-1 py-1">
                      <select value={str} onChange={(e) => update(i, c.key, e.target.value, c.kind)} className={cx(cell, 'appearance-none pr-1 cursor-pointer')}>
                        <option value=""></option>
                        {c.options?.map((o) => <option key={o} value={o}>{c.optionLabel ? c.optionLabel(o) : o}</option>)}
                      </select>
                    </td>
                  )
                }
                if (c.kind === 'name') {
                  // names come from the roster dropdown; a name that is not on the roster stays selectable so nothing is lost
                  return (
                    <td key={c.key} className="px-1 py-1">
                      <select value={str} onChange={(e) => update(i, c.key, e.target.value, c.kind)} className={cx(cell, 'appearance-none pr-1 cursor-pointer')} style={{ width: c.w ?? 96 }} aria-label={c.label} data-list={listId}>
                        <option value=""></option>
                        {(str && !names.includes(str) ? [str, ...names] : names).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  )
                }
                return (
                  <td key={c.key} className="px-1 py-1">
                    <input value={str} inputMode={c.kind === 'int' ? 'numeric' : undefined}
                      onChange={(e) => update(i, c.key, e.target.value, c.kind)} className={cx(cell, c.kind === 'int' && 'tnum text-right')} style={{ width: c.w ?? 64 }} />
                  </td>
                )
              })}
              <td className="px-1 py-1 whitespace-nowrap">
                <button type="button" title="上移" aria-label="上移" onClick={() => move(i, -1)} className="size-6 inline-flex items-center justify-center rounded text-muted hover:text-ink hover:bg-surface-2 cursor-pointer disabled:opacity-30" disabled={i === 0}><ArrowUp className="size-3.5" /></button>
                <button type="button" title="下移" aria-label="下移" onClick={() => move(i, 1)} className="size-6 inline-flex items-center justify-center rounded text-muted hover:text-ink hover:bg-surface-2 cursor-pointer disabled:opacity-30" disabled={i === rows.length - 1}><ArrowDown className="size-3.5" /></button>
                <button type="button" title="刪除此列" aria-label="刪除此列" onClick={() => onChange(rows.filter((_, k) => k !== i))} className="size-6 inline-flex items-center justify-center rounded text-muted hover:text-critical hover:bg-surface-2 cursor-pointer"><Trash2 className="size-3.5" /></button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr className="border-t border-border"><td colSpan={cols.length + 2} className="px-3 py-5 text-center text-muted">沒有資料</td></tr>}
        </tbody>
      </table>
      <div className="px-2 py-2 border-t border-border">
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onChange([...rows, blank(rows[rows.length - 1])])}>新增一列</Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ drafts: pitches edited as text */
type BatDraft = Omit<BattingPA, 'pitches'> & { pitchesText: string }
type PitDraft = Omit<PitchingPA, 'pitches' | 'errors'> & { pitchesText: string; errorsText: string }
const toBatDraft = (p: BattingPA): BatDraft => { const { pitches, ...rest } = p; return { ...rest, pitchesText: pitches.join(' ') } }
const toPitDraft = (p: PitchingPA): PitDraft => { const { pitches, errors, ...rest } = p; return { ...rest, pitchesText: pitches.join(' '), errorsText: errorsText(errors) } }
const parsePitches = (t: string) => t.toUpperCase().split(/[\s,，、/]+/).filter(Boolean)
const fromBatDraft = (d: BatDraft): BattingPA => { const { pitchesText, ...rest } = d; return { ...rest, pitches: parsePitches(pitchesText), sb: +rest.sb || 0, cs: +rest.cs || 0, advOnError: +rest.advOnError || 0, outOnBase: +rest.outOnBase || 0, ...(+(rest.baserunningOuts ?? 0) ? { baserunningOuts: +(rest.baserunningOuts ?? 0) } : {}), run: +rest.run || 0, rbi: +rest.rbi || 0, inning: +rest.inning || 0 } }
const fromPitDraft = (d: PitDraft): PitchingPA => { const { pitchesText, errorsText: et, ...rest } = d; const errors = cleanErrors(et); return { ...rest, ...(errors.length ? { errors } : {}), pitches: parsePitches(pitchesText), sba: +rest.sba || 0, cs: +rest.cs || 0, wp: +rest.wp || 0, pb: +rest.pb || 0, pk: +rest.pk || 0, inning: +rest.inning || 0 } }

const CODES = ['I', 'II', 'III', 'L', 'R', 'ER'] as const
const BASES = ['無', '1', '2', '3', '12', '13', '23', '123'] as const
const TRAJ = ['G', 'F', 'L', 'P'] as const
const QUAL = ['強', '中', '弱'] as const
const LOCS = LOC_CODES.map(String)
const locOption = (v: string) => (Number(v) > 9 ? `${v} ${locLabel(Number(v))}` : v)

const batCols: Col<BatDraft>[] = [
  { key: 'inning', label: '局', kind: 'int', w: 40 }, { key: 'outsBefore', label: '出局前', kind: 'int', w: 48 }, { key: 'basesBefore', label: '壘上前', kind: 'select', options: BASES, w: 64 },
  { key: 'order', label: '棒次', kind: 'int', w: 44 }, { key: 'pos', label: '守位', kind: 'select', options: POSITIONS, w: 60 }, { key: 'batter', label: '打者', kind: 'name', w: 96 },
  { key: 'pitchesText', label: '逐球（SS CS S F IP B）', kind: 'text', w: 170 }, { key: 'result', label: '結果', kind: 'select', options: PA_RESULTS, w: 76 },
  { key: 'loc', label: '落點', kind: 'select', options: LOCS, optionLabel: locOption, w: 64 }, { key: 'traj', label: '軌跡', kind: 'select', options: TRAJ, w: 52 }, { key: 'quality', label: '強度', kind: 'select', options: QUAL, w: 52 },
  { key: 'runner', label: '代跑', kind: 'name', w: 96 },
  { key: 'sb', label: '盜壘', kind: 'int', w: 44 }, { key: 'cs', label: '盜失', kind: 'int', w: 44 }, { key: 'advOnError', label: '失誤進壘', kind: 'int', w: 56 }, { key: 'outOnBase', label: '壘上出局', kind: 'int', w: 56 }, { key: 'baserunningOuts', label: '壘死', kind: 'int', w: 44 },
  { key: 'run', label: '得分', kind: 'int', w: 44 }, { key: 'rbi', label: '打點', kind: 'int', w: 44 }, { key: 'code', label: '代碼', kind: 'select', options: CODES, w: 56 }, { key: 'note', label: '備註', kind: 'text', w: 120 },
]
const pitCols: Col<PitDraft>[] = [
  { key: 'inning', label: '局', kind: 'int', w: 40 }, { key: 'outsBefore', label: '出局前', kind: 'int', w: 48 }, { key: 'basesBefore', label: '壘上前', kind: 'select', options: BASES, w: 64 },
  { key: 'oppOrder', label: '對方棒次', kind: 'int', w: 56 }, { key: 'pitcher', label: '投手', kind: 'name', w: 96 }, { key: 'oppBatter', label: '對方打者', kind: 'text', w: 88 },
  { key: 'pitchesText', label: '逐球（SS CS S F IP B）', kind: 'text', w: 170 }, { key: 'result', label: '結果', kind: 'select', options: PA_RESULTS, w: 76 },
  { key: 'loc', label: '落點', kind: 'select', options: LOCS, optionLabel: locOption, w: 64 }, { key: 'traj', label: '軌跡', kind: 'select', options: TRAJ, w: 52 }, { key: 'quality', label: '強度', kind: 'select', options: QUAL, w: 52 },
  { key: 'sba', label: '被盜', kind: 'int', w: 44 }, { key: 'cs', label: '阻殺', kind: 'int', w: 44 }, { key: 'wp', label: '暴投', kind: 'int', w: 44 }, { key: 'pb', label: '捕逸', kind: 'int', w: 44 }, { key: 'pk', label: '牽制', kind: 'int', w: 44 },
  { key: 'errorsText', label: '守備失誤（守位）', kind: 'text', w: 96 },
  { key: 'code', label: '代碼', kind: 'select', options: CODES, w: 56 }, { key: 'note', label: '備註', kind: 'text', w: 120 },
]
type StarterDraft = GameDayRoster['starters'][number]
const starterCols: Col<StarterDraft>[] = [{ key: 'order', label: '棒次', kind: 'int', w: 44 }, { key: 'pos', label: '守位', kind: 'select', options: POSITIONS, w: 60 }, { key: 'name', label: '球員', kind: 'name', w: 110 }]
const chip = (active: boolean) => cx('h-9 pointer-fine:h-8 px-3 rounded-[var(--radius-sm)] border text-[13px] font-medium cursor-pointer transition-colors motion-reduce:transition-none', active ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink hover:bg-surface-2')
const subText = (s: DayRosterSub) => `${s.inning ? `${s.inning}局${s.half === 'bottom' ? '下' : '上'} ` : ''}${SUB_KIND_LABEL[s.kind]} ${s.in}${s.out ? ` 替 ${s.out}` : ''}${s.pos ? `（${s.pos}）` : ''}`

const fldCols: Col<FieldingLine>[] = [
  { key: 'player', label: '球員', kind: 'name', w: 96 }, { key: 'pos', label: '守位', kind: 'select', options: POSITIONS, w: 60 }, { key: 'innings', label: '局數', kind: 'int', w: 48 },
  { key: 'po', label: 'PO', kind: 'int', w: 44 }, { key: 'a', label: 'A', kind: 'int', w: 44 }, { key: 'e', label: 'E', kind: 'int', w: 44 }, { key: 'dp', label: 'DP', kind: 'int', w: 44 },
  { key: 'pb', label: 'PB', kind: 'int', w: 44 }, { key: 'sb', label: 'SB', kind: 'int', w: 44 }, { key: 'cs', label: 'CS', kind: 'int', w: 44 }, { key: 'note', label: '備註', kind: 'text', w: 140 },
]

export interface GameEditorProps {
  initial: GameEdit
  roster: string[]
  busy?: boolean
  onSave: (edit: GameEdit) => Promise<void> | void
  onCancel: () => void
  onDelete: () => Promise<void> | void
}

/** Edit every input field of one game: header info, our plate appearances, the opponent's, and fielding lines. */
export function GameEditor({ initial, roster, busy, onSave, onCancel, onDelete }: GameEditorProps) {
  const [game, setGame] = useState<Game>({ ...initial.game })
  const [bat, setBat] = useState<BatDraft[]>(() => initial.batting.map(toBatDraft))
  const [pit, setPit] = useState<PitDraft[]>(() => initial.pitching.map(toPitDraft))
  const [fld, setFld] = useState<FieldingLine[]>(() => initial.fielding.map((f) => ({ ...f })))
  // 當日登錄名單 (optional; games recorded before it existed, imports and old backups have none)
  const [starters, setStarters] = useState<StarterDraft[]>(() => (initial.game.dayRoster?.starters ?? []).map((x) => ({ ...x })))
  const [bench, setBench] = useState<string[]>(() => initial.game.dayRoster?.bench ?? [])
  const [subs, setSubs] = useState<DayRosterSub[]>(() => initial.game.dayRoster?.subs ?? [])
  const [reentry, setReentry] = useState(!!initial.game.dayRoster?.reentry)
  const [tab, setTab] = useState<'bat' | 'pit' | 'fld' | 'roster'>('bat')
  // plate appearances: tap one to edit it with the recording buttons (default), or the whole table at once
  const [paView, setPaView] = useState<'tap' | 'table'>('tap')
  const [sel, setSel] = useState<{ side: PaSide; index: number } | null>(null)
  const batRows = useMemo(() => bat.map(fromBatDraft), [bat])
  const pitRows = useMemo(() => pit.map(fromPitDraft), [pit])
  const flags = useMemo(() => {
    const out = { bat: new Map<number, string[]>(), pit: new Map<number, string[]>() }
    for (const i of auditGame(batRows, pitRows)) out[i.side].set(i.index, [...(out[i.side].get(i.index) ?? []), i.message])
    return out
  }, [batRows, pitRows])
  const setRows = (side: PaSide, fn: <T>(rows: T[]) => T[]) => (side === 'bat' ? setBat((b) => fn(b)) : setPit((p) => fn(p)))
  const insertPa = (side: PaSide, at: number) => {
    if (side === 'bat') setBat((b) => [...b.slice(0, at), toBatDraft(blankBattingAt(b.map(fromBatDraft), at, game.id)), ...b.slice(at)])
    else setPit((p) => [...p.slice(0, at), toPitDraft(blankPitchingAt(p.map(fromPitDraft), at, game.id)), ...p.slice(at)])
    setSel({ side, index: at })
  }
  // the runner timeline of every inning that can be followed (rows with 壘上(前) / 出局(前) throughout)
  const halves = useMemo(() => ({ bat: inferAll(batRows, 'bat'), pit: inferAll(pitRows, 'pit') }), [batRows, pitRows])
  const [tlNotice, setTlNotice] = useState<string | null>(null)
  // where the runners were going when this plate appearance was opened: changing the result starts from there,
  // so trying 保送 and going back to 三振 undoes the runners it forced
  const baseline = useRef(new Map<string, Record<number, End>>())
  useEffect(() => { setTlNotice(null); baseline.current.clear() }, [sel])
  const nameOf = (side: PaSide) => (row: number) => {
    if (side === 'bat') { const r = batRows[row]; return r ? r.runner || r.batter || '（未填）' : '' }
    const r = pitRows[row]
    return r ? `對方${r.oppBatter ? ` ${r.oppBatter}` : r.oppOrder ? ` ${r.oppOrder} 棒` : ''}` : ''
  }
  /** Check an edited inning, then write it onto the rows (or say why not). */
  const commitHalf = (side: PaSide, rows: Array<BattingPA | PitchingPA>, half: Half): string | null => {
    const name = nameOf(side)
    let outs = 0
    for (let j = 0; j < half.steps.length; j++) {
      const st = half.steps[j]
      const p = stepProblems(st, name)
      if (p.length) { const m = `${p[0]}，這個改法沒有套用`; setTlNotice(m); return m }
      outs += st.moves.filter((m) => m.to === 'out').length
      if (outs >= 3) { const m = '跑壘出局已經是這局第三個出局，這個打席不會有結果；請改在上一個打席把這位跑者設為出局'; setTlNotice(m); return m }
      outs += st.outs.length
      if (outs > 3) { const m = '這局會超過 3 個出局，請先把另一個出局改掉'; setTlNotice(m); return m }
      if (outs === 3 && j < half.steps.length - 1) { const m = '第三個出局之後這局還有打席，請先刪除或移動後面的打席'; setTlNotice(m); return m }
    }
    setTlNotice(null)
    if (side === 'bat') setBat(deriveHalf(rows as BattingPA[], half, 'bat').map(toBatDraft))
    else setPit(deriveHalf(rows as PitchingPA[], half, 'pit').map(toPitDraft))
    return null
  }
  const timelineFor = (side: PaSide, i: number): TimelineProps | undefined => {
    const rows = side === 'bat' ? batRows : pitRows
    const half = rows[i] ? (side === 'bat' ? halves.bat : halves.pit).get(rows[i].inning) : null
    const step = half?.steps.find((st) => st.index === i)
    if (!half || !step) return undefined
    if (!baseline.current.has(`${side}-${i}`)) baseline.current.set(`${side}-${i}`, { ...step.dest })
    // no RBI on an error, a double play or a strikeout (a run then scored on a wild pitch, a steal…)
    const noRbi = rows[i].result === '失誤' || rows[i].result === '雙殺' || rows[i].result === '三振'
    const onEnd = (who: number | 'batter', end: End, base: Array<BattingPA | PitchingPA> = rows) => {
      let next = base
      const old = who === 'batter' ? step.batter : step.dest[who]
      // a 失誤進壘 mark on the play goes once he ends somewhere else: its bases come off his 失誤進壘 count
      const err = end !== old ? playOf(who, old) : undefined
      if (side === 'bat' && err?.kind === 'err') next = next.map((r, k) => (k === rowOf(who) ? { ...r, advOnError: Math.max(0, (r as BattingPA).advOnError - basesOf(err)) } : r))
      // a run brought home by this batter's play is his RBI (not on an error or a double play)
      if (side === 'bat' && !noRbi) {
        const d = end === 'home' && old !== 'home' ? 1 : old === 'home' && end !== 'home' && err?.kind !== 'err' ? -1 : 0
        if (d) next = next.map((r, k) => (k === i ? { ...r, rbi: Math.max(0, Math.min(4, (r as BattingPA).rbi + d)) } : r))
      }
      commitHalf(side, next, setEnd(half, i, who, end))
    }
    // a runner play between pitches; the counts follow it: on the runner's own row for us (盜壘, 盜壘失敗, 失誤進壘,
    // 壘死), on this plate appearance for the opponent (被盜壘, 阻殺, 牽制出局; a wild pitch or passed ball once per pitch,
    // however many runners moved on it). A wild pitch while we bat is the other team's: our runner just moves.
    const count = (next: Array<BattingPA | PitchingPA>, m: Move, d: 1 | -1, again: boolean) => next.map((r, k) => {
      const add = (v: number) => Math.max(0, v + d)
      if (side === 'bat' && k === m.row) {
        const b = { ...(r as BattingPA) }
        if (m.kind === 'sb') b.sb = add(b.sb); if (m.kind === 'cs') b.cs = add(b.cs); if (m.kind === 'err') b.advOnError = add(b.advOnError); if (m.kind === 'pk' || m.kind === 'out') b.outOnBase = add(b.outOnBase); if (m.kind === 'out') { const v = add(b.baserunningOuts ?? 0); if (v) b.baserunningOuts = v; else delete b.baserunningOuts }
        return b
      }
      if (side === 'pit' && k === i) {
        const q = { ...(r as PitchingPA) }
        if (m.kind === 'sb') q.sba = add(q.sba); if (m.kind === 'cs') q.cs = add(q.cs); if (m.kind === 'pk') q.pk = add(q.pk)
        if (m.kind === 'wp' && !again) q.wp = add(q.wp); if (m.kind === 'pb' && !again) q.pb = add(q.pb)
        return q
      }
      return r
    })
    const onPlay = (pitch: number, kind: string, who: number[]) => {
      const { half: h, added } = addPlay(half, i, pitch, kind, who)
      if (!added.length) return
      let next: Array<BattingPA | PitchingPA> = rows
      added.forEach((m, n) => { next = count(next, m, 1, step.moves.some((x) => x.at === m.at && x.kind === m.kind) || added.slice(0, n).some((x) => x.kind === m.kind)) })
      commitHalf(side, next, h)
    }
    const onRemovePlay = (n: number) => {
      const { half: h, removed } = removePlay(half, i, n)
      if (!removed) return
      const left = h.steps.find((x) => x.index === i)!.moves
      commitHalf(side, count(rows, removed, -1, left.some((x) => x.at === removed.at && x.kind === removed.kind)), h)
    }
    // a new result: the batter goes where it puts him, runners in his way are forced ahead (and those runs are his RBI)
    const onResult = (result: string) => {
      let h = half
      for (const [row, d] of Object.entries(baseline.current.get(`${side}-${i}`) ?? {})) if (midOf(step).some((o) => o.row === Number(row))) h = setEnd(h, i, Number(row), d)
      h = setBatterResult(h, i, result)
      const st = h.steps.find((x) => x.index === i)!
      const next = rows.map((r, k) => {
        if (k !== i) return r
        const n = withResult(r, result)
        if (side !== 'bat' || ['失誤', '雙殺', '三振'].includes(result)) return n
        return { ...n, rbi: Math.max(0, Math.min(4, (n as BattingPA).rbi + homesIn(st) - homesIn(step))) }
      })
      commitHalf(side, next, h)
    }
    // 趁傳進壘／失誤進壘 on the batted ball: the bases beyond where the result alone put him (a runner: where he stood for it)
    const endOf = (who: number | 'batter') => (who === 'batter' ? step.batter : step.dest[who])
    // where the result alone takes a runner (the way 紀錄比賽 suggests it): a hit moves everyone that many bases, a walk
    // or an infield single pushes the forced runners, a bunt or an error one base, a sacrifice fly scores the man on third
    const runnerNatural = (row: number): number | undefined => {
      const mid = midOf(step), me = mid.find((o) => o.row === row)
      if (!me) return undefined
      const res = rows[i].result
      const hit = res === '內安' ? 0 : HIT_BASE_COUNT[res]
      if (hit) return Math.min(4, me.base + hit)
      const on = (b: number) => mid.some((o) => o.base === b)
      if (['內安', '保送', '故四', '觸身', '妨礙'].includes(res)) return me.base === 1 || (me.base === 2 && on(1)) || (me.base === 3 && on(1) && on(2)) ? me.base + 1 : me.base
      if (res === '犧觸' || res === '失誤') return Math.min(4, me.base + 1)
      if (res === '犧飛' && me.base === 3) return 4
      return me.base
    }
    const natural = (who: number | 'batter') => (who === 'batter' ? batterEndFor(rows[i].result) : runnerNatural(who))
    const num = (e: End | undefined) => (e === 'home' ? 4 : typeof e === 'number' ? e : 0)
    const basesOf = (e: PlayEvent) => num(e.to as End) - e.from
    const rowOf = (who: number | 'batter') => (who === 'batter' ? i : who)
    // his mark on the play (two runners can both score, so a runner's is told apart by where the result put him)
    const playOf = (who: number | 'batter', to: End | undefined = endOf(who)) => {
      const at = (rows[i].events ?? []).filter((e) => e.play && e.to === to && (who === 'batter' ? !!e.batter : !e.batter))
      return at.length > 1 ? at.find((e) => e.from === natural(who)) : at[0]
    }
    const markOf = (who: number | 'batter'): ExtraBases | null => { const k = playOf(who)?.kind; return k === 'throw' || k === 'err' ? k : null }
    const throwOf = (who: number | 'batter') => { const n = natural(who); return { can: typeof n === 'number' && num(endOf(who)) > n, kind: markOf(who) } }
    const onThrow = (who: number | 'batter', kind: ExtraBases | null) => {
      const n = natural(who), to = endOf(who)
      if (typeof n !== 'number' || to === undefined || to === 'out') return
      // from where the result alone put him (like 紀錄比賽)
      const from = Math.min(3, n) as 1 | 2 | 3
      const old = playOf(who)
      const rest = (rows[i].events ?? []).filter((e) => e !== old)
      const mark: PlayEvent | null = kind ? { at: rows[i].pitches.length, kind, from: old?.from ?? from, to, play: true as const, ...(who === 'batter' ? { batter: true as const } : {}) } : null
      const events = mark ? [...rest, mark] : rest
      const patch = <T extends BattingPA | PitchingPA>(r: T): T => { const { events: _old, ...rest2 } = r; void _old; return (events.length ? { ...rest2, events } : rest2) as T }
      const errBases = (e: PlayEvent | null | undefined) => (e?.kind === 'err' ? basesOf(e) : 0)
      if (side === 'bat') {
        // 失誤進壘 while we bat: his own 失誤進壘 count goes up by the bases, and a run scored that way is no RBI
        const dAdv = errBases(mark) - errBases(old)
        const dRbi = to === 'home' && !noRbi ? (old?.kind === 'err' ? 1 : 0) - (mark?.kind === 'err' ? 1 : 0) : 0
        setBat((b) => b.map((x, k) => {
          let r = fromBatDraft(x)
          if (k === i) r = patch(r)
          if (k === rowOf(who) && dAdv) r = { ...r, advOnError: Math.max(0, r.advOnError + dAdv) }
          if (k === i && dRbi) r = { ...r, rbi: Math.max(0, Math.min(4, r.rbi + dRbi)) }
          return k === i || k === rowOf(who) ? toBatDraft(r) : x
        }))
      } else {
        // while we field it is our error (pick the fielder in 我隊守備失誤 below) and a run scored on it is unearned
        setPit((p) => p.map((x, k) => {
          let r = k === i ? patch(fromPitDraft(x)) : null
          if (k === rowOf(who) && mark?.kind === 'err' && to === 'home' && x.code === 'ER') r = { ...(r ?? fromPitDraft(x)), code: 'R' }
          return r ? toPitDraft(r) : x
        }))
      }
    }
    const onThrowUp = (who: number | 'batter') => {
      const cur = endOf(who)
      if (typeof cur !== 'number') return
      const to: End = cur >= 3 ? 'home' : ((cur + 1) as End)
      // an earlier 趁傳 mark on him is extended (一安 → 2B → 3B on the throws), otherwise a new one from where he was
      const old = playOf(who, cur)
      const rest = (rows[i].events ?? []).filter((e) => e !== old)
      const events = [...rest, { at: rows[i].pitches.length, kind: 'throw', from: old?.from ?? (cur as 1 | 2 | 3), to, play: true as const, ...(who === 'batter' ? { batter: true as const } : {}) }]
      onEnd(who, to, rows.map((r, k) => (k === i ? { ...r, events } : r)))
    }
    // 壘死 (we bat): a runner put out on the play by his own baserunning mistake — a mark on this plate appearance
    // (kind 'out' from his base) that the timeline turns into his row's 壘死; 出局 clears it
    const midBase = (row: number) => midOf(step).find((o) => o.row === row)?.base
    const outMark = (row: number) => (rows[i].events ?? []).find((e) => e.play && !e.batter && e.kind === 'out' && e.to === 'out' && e.from === midBase(row))
    const runningOut = side === 'bat' ? {
      of: (row: number) => step.dest[row] === 'out' && !!outMark(row),
      set: (row: number, on: boolean) => {
        const from = midBase(row)
        if (!from) return
        const rest = (rows[i].events ?? []).filter((e) => e !== outMark(row))
        const events = on ? [...rest, { at: rows[i].pitches.length, kind: 'out', from, to: 'out' as const, play: true as const }] : rest
        const next = rows.map((r, k) => {
          if (k === i) { const n = { ...r, events }; if (!events.length) delete (n as { events?: unknown }).events; return n }
          if (k === row && !on) { const n = { ...(r as BattingPA) }; delete n.baserunningOuts; return n }
          return r
        })
        onEnd(row, 'out', next)
      },
    } : undefined
    const pinch = side === 'bat' ? {
      onPinchRunner: (row: number, name: string) => setBat((b) => b.map((x, k) => { if (k !== row) return x; const n = { ...x, runner: name || undefined }; if (!name) delete n.runner; return n })),
      pinchNames: names,
      runnerOf: (row: number) => batRows[row]?.runner,
    } : {}
    return { step, nameOf: nameOf(side), onEnd: (who, end) => onEnd(who, end), onPlay, onRemovePlay, throwOf, onThrow, onThrowUp, onResult, runningOut,
      ...(side === 'pit' ? { earned: { of: (row: number) => pitRows[row]?.code !== 'R', toggle: (row: number) => setPit((p) => p.map((x, k) => (k === row && (x.code === 'R' || x.code === 'ER') ? { ...x, code: x.code === 'R' ? 'ER' : 'R' } : x))) } } : {}), notice: tlNotice, ...pinch }
  }
  const paPanel = (side: PaSide) => {
    const rows = side === 'bat' ? batRows : pitRows
    if (!sel || sel.side !== side || !rows[sel.index]) return null
    const i = sel.index
    return (
      <PaPanel side={side} pa={rows[i]} index={i} total={rows.length} issues={flags[side].get(i) ?? []} names={names} pitcherNames={pitcherNames}
        onChange={(pa) => (side === 'bat' ? setBat((b) => b.map((x, k) => (k === i ? toBatDraft(pa as BattingPA) : x))) : setPit((p) => p.map((x, k) => (k === i ? toPitDraft(pa as PitchingPA) : x))))}
        onNav={(k) => setSel({ side, index: k })} onClose={() => setSel(null)}
        onDelete={() => { setRows(side, (r) => r.filter((_, k) => k !== i)); setSel(rows.length > 1 ? { side, index: Math.min(i, rows.length - 2) } : null) }}
        onInsert={(at) => insertPa(side, at)}
        onMove={(d) => { const j = i + d; if (j < 0 || j >= rows.length) return; setRows(side, (r) => { const n = r.slice(); [n[i], n[j]] = [n[j], n[i]]; return n }); setSel({ side, index: j }) }}
        // runners of this inning who reached before this plate appearance and are still out there
        timeline={timelineFor(side, i)}
        onRebuild={() => {
          const rows = side === 'bat' ? batRows : pitRows
          const idx = inningsOf(rows).get(rows[i].inning) ?? []
          const rb = rebuildHalf(rows, idx, side)
          const before = idx.filter((k) => scored(rows[k], side)).length
          const after = rb.steps.reduce((a, st) => a + homesIn(st), 0)
          if (window.confirm(`依打擊結果重建第 ${rows[i].inning} 局的跑者：安打依壘數推進、保送擠壘、犧飛回本壘、雙殺與野選讓被封殺的跑者出局。\n這局原本記 ${before} 分，重建後是 ${after} 分；之後可以在壘包圖上逐一修正。按「儲存修改」才會生效。`)) { const why = commitHalf(side, rows, rb); if (why) window.alert(`沒辦法重建：${why}`) }
        }}
        others={side === 'bat' ? batRows.slice(0, i).map((pa, k) => ({ index: k, pa })).filter((o) => o.pa.inning === batRows[i].inning && stillOn(o.pa)) : []}
        onChangeOther={(k, pa) => setBat((b) => b.map((x, m) => (m === k ? toBatDraft(pa) : x)))} />
    )
  }
  const [error, setError] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  // names already in this game's roster stay selectable even when they left the team roster
  const names = useMemo(() => [...new Set([...roster, ...bat.map((p) => p.batter), ...pit.map((p) => p.pitcher), ...dayRosterNames(initial.game.dayRoster)])].filter(Boolean), [roster, bat, pit, initial.game.dayRoster])
  const starterSet = useMemo(() => new Set(starters.map((x) => x.name.trim()).filter(Boolean)), [starters])
  const benchChoices = useMemo(() => names.filter((n) => !starterSet.has(n)), [names, starterSet])
  const toggleBench = (n: string) => setBench((b) => (b.includes(n) ? b.filter((x) => x !== n) : [...b, n]))
  // for older games: the first batter per batting order plus the first pitcher (the same rule as the game page)
  const inferStarters = () => {
    const out: StarterDraft[] = []
    for (const p of [...bat].filter((p) => p.order && p.batter.trim()).sort((a, b) => a.order! - b.order!)) if (!out.some((x) => x.order === p.order || x.name === p.batter)) out.push({ order: p.order, pos: p.pos ?? '', name: p.batter })
    const sp = pit.find((p) => p.pitcher.trim())?.pitcher
    if (sp && !out.some((x) => x.name === sp)) out.push({ pos: 'P', name: sp })
    setStarters(out)
  }
  const pitcherNames = useMemo(() => { const used = [...new Set(pit.map((p) => p.pitcher).filter(Boolean))]; return [...used, ...names.filter((n) => !used.includes(n))] }, [pit, names])
  const g = <K extends keyof Game>(k: K, v: Game[K]) => setGame((s) => ({ ...s, [k]: v }))
  const text = (k: keyof Game) => (e: React.ChangeEvent<HTMLInputElement>) => g(k, (e.target.value || undefined) as never)

  const save = async () => {
    setError(null)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(game.date)) { setInfoOpen(true); setError('日期格式需為 YYYY-MM-DD'); return }
    if (!game.opponent?.trim()) { setInfoOpen(true); setError('請填對手'); return }
    const listed = starters.filter((x) => x.name.trim())
    const dupName = listed.map((x) => x.name.trim()).find((n, i, a) => a.indexOf(n) !== i)
    if (dupName) { setTab('roster'); setError(`登錄名單的先發有重複的球員：${dupName}`); return }
    const dupOrder = listed.map((x) => x.order).find((o, i, a) => o !== undefined && Number.isFinite(o) && a.indexOf(o) !== i)
    if (dupOrder !== undefined) { setTab('roster'); setError(`登錄名單的先發有兩個第 ${dupOrder} 棒`); return }
    // parseDayRoster trims, drops bench names that are starters and returns undefined for an empty roster
    const dayRoster = parseDayRoster({ starters: listed, bench, subs, reentry })
    try {
      const batting = bat.map(fromBatDraft).filter((p) => p.batter.trim())
      const pitching = pit.map(fromPitDraft).filter((p) => p.pitcher.trim())
      const lines = fld.filter((f) => f.player.trim()).map((f) => ({ ...f, po: +f.po || 0, a: +f.a || 0, e: +f.e || 0, dp: +f.dp || 0, pb: +f.pb || 0, sb: +f.sb || 0, cs: +f.cs || 0 }))
      // errors / putouts changed in plate appearances move onto the fielders; numbers typed in the 守備 table stay
      const fielding = reconcileFielding(lines, game, { batting: initial.batting, pitching: initial.pitching }, { batting, pitching })
      await onSave({ game: { ...game, tournament: game.tournament?.trim() || '未分類', opponent: game.opponent.trim(), dayRoster }, batting, pitching, fielding })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const blankBat = (prev?: BatDraft): BatDraft => ({ gameId: game.id, inning: prev?.inning ?? 1, batter: '', pitchesText: '', result: '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, order: prev?.order ? (prev.order % 9) + 1 : undefined })
  const blankPit = (prev?: PitDraft): PitDraft => ({ gameId: game.id, inning: prev?.inning ?? 1, pitcher: prev?.pitcher ?? '', pitchesText: '', errorsText: '', result: '', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, oppOrder: prev?.oppOrder ? (prev.oppOrder % 9) + 1 : undefined })
  const blankStarter = (prev?: StarterDraft): StarterDraft => ({ order: prev ? (prev.order && prev.order < 9 ? prev.order + 1 : undefined) : 1, pos: '', name: '' })
  const blankFld = (): FieldingLine => ({ gameId: game.id, player: '', pos: '', innings: game.innings, po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 })

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        {/* folded by default: most fixes are to plate appearances, which then sit right under the tabs */}
        <button type="button" aria-expanded={infoOpen} onClick={() => setInfoOpen(!infoOpen)} className="flex items-center gap-2 text-left cursor-pointer min-h-9 pointer-fine:min-h-7 group">
          <ChevronRight className={cx('size-4 text-muted transition-transform motion-reduce:transition-none', infoOpen && 'rotate-90')} />
          <span className="text-[13px] font-semibold text-ink">比賽資訊</span>
          <span className="text-[12px] text-muted tnum truncate min-w-0">{game.id}{infoOpen ? '' : `・${game.date}・vs ${game.opponent}・${game.homeAway === '主' ? '主場' : '客場'}${game.winningPitcher ? `・勝投 ${game.winningPitcher}` : ''}`}</span>
          <span className="ml-auto text-[12px] text-ink-2 group-hover:text-ink underline underline-offset-2 shrink-0">{infoOpen ? '收起' : '修改'}</span>
        </button>
        {infoOpen && <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="日期"><Input type="date" value={game.date} onChange={(e) => g('date', e.target.value)} className="tnum" /></Field>
          <Field label="時間"><Input type="time" value={game.time ?? ''} onChange={text('time')} className="tnum" /></Field>
          <Field label="杯賽"><Input value={game.tournament} onChange={(e) => g('tournament', e.target.value)} /></Field>
          <Field label="對手"><Input value={game.opponent} onChange={(e) => g('opponent', e.target.value)} /></Field>
          <Field label="主客"><Select value={game.homeAway} onChange={(e) => g('homeAway', e.target.value as Game['homeAway'])} options={[{ value: '主', label: '主場' }, { value: '客', label: '客場' }]} className="w-full" /></Field>
          <Field label="場地"><Input value={game.venue ?? ''} onChange={text('venue')} /></Field>
          <Field label="天氣"><Input value={game.weather ?? ''} onChange={text('weather')} /></Field>
          <Field label="局數"><Input type="number" min={1} max={12} value={game.innings ?? ''} onChange={(e) => g('innings', e.target.value ? Number(e.target.value) : undefined)} className="tnum" /></Field>
          <Field label="勝投"><PlayerSelect value={game.winningPitcher ?? ''} onChange={(v) => g('winningPitcher', v || undefined)} names={pitcherNames} placeholder="—" className="w-full" /></Field>
          <Field label="敗投"><PlayerSelect value={game.losingPitcher ?? ''} onChange={(v) => g('losingPitcher', v || undefined)} names={pitcherNames} placeholder="—" className="w-full" /></Field>
          <Field label="救援"><PlayerSelect value={game.savePitcher ?? ''} onChange={(v) => g('savePitcher', v || undefined)} names={pitcherNames} placeholder="—" className="w-full" /></Field>
          <Field label="紀錄者"><Input value={game.recorder ?? ''} onChange={text('recorder')} /></Field>
          <Field label="備註" className="col-span-2 md:col-span-4"><Input value={game.note ?? ''} onChange={text('note')} /></Field>
        </div>}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs size="sm" aria-label="編輯區" value={tab} onChange={(t) => { setTab(t); setSel(null) }} items={[{ value: 'bat', label: '我隊打擊', count: bat.length }, { value: 'pit', label: '我隊投球', count: pit.length }, { value: 'fld', label: '守備', count: fld.length }, { value: 'roster', label: '登錄名單', count: starterSet.size + bench.filter((n) => !starterSet.has(n)).length }]} />
          {(tab === 'roster' || tab === 'fld' || paView === 'table') && <span className="text-xs text-muted">{tab === 'roster' ? '先發、板凳（到場未先發）與替補紀錄；全部留空＝這場沒有登錄名單。' : tab === 'fld' ? '守備留空會由打席推定。' : '局／出局(前) 留空會由結果代碼自動補算；守備留空會由打席推定。'}</span>}
          <RosterSortToggle className="ml-auto" />
        </div>
        {(tab === 'bat' || tab === 'pit') && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs size="sm" aria-label="打席編輯方式" value={paView} onChange={(v) => { setPaView(v); setSel(null) }} items={[{ value: 'tap', label: '逐打席' }, { value: 'table', label: '表格' }]} />
            {paView === 'table' && <span className="text-xs text-muted">一次看全部欄位，適合大量修改。</span>}
          </div>
        )}
        {tab === 'bat' && (paView === 'table' ? <EditableTable rows={bat} cols={batCols} onChange={setBat} blank={blankBat} listId="game-editor-names" names={names} />
          : paPanel('bat') ?? <PaList side="bat" rows={batRows} flags={flags.bat} onOpen={(i) => setSel({ side: 'bat', index: i })} onInsert={(at) => insertPa('bat', at)} />)}
        {tab === 'pit' && (paView === 'table' ? <EditableTable rows={pit} cols={pitCols} onChange={setPit} blank={blankPit} listId="game-editor-names" names={names} />
          : paPanel('pit') ?? <PaList side="pit" rows={pitRows} flags={flags.pit} onOpen={(i) => setSel({ side: 'pit', index: i })} onInsert={(at) => insertPa('pit', at)} />)}
        {tab === 'fld' && <EditableTable rows={fld} cols={fldCols} onChange={setFld} blank={blankFld} listId="game-editor-names" names={names} />}
        {tab === 'roster' && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[12px] font-medium text-ink-2">先發 <span className="text-muted font-normal">棒次留空＝不打擊的投手（指定打擊時）</span></div>
                {starters.length === 0 && bat.some((p) => p.order) && <Button size="sm" variant="ghost" onClick={inferStarters}>由打席推定先發</Button>}
              </div>
              <EditableTable rows={starters} cols={starterCols} onChange={setStarters} blank={blankStarter} listId="game-editor-names" names={names} />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[12px] font-medium text-ink-2">板凳（到場未先發） <span className="text-muted font-normal tnum">{bench.filter((n) => !starterSet.has(n)).length} 人</span></div>
                {bench.length > 0 && <Button size="sm" variant="ghost" onClick={() => setBench([])}>清除</Button>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {benchChoices.map((n) => <button key={n} type="button" aria-pressed={bench.includes(n)} onClick={() => toggleBench(n)} className={chip(bench.includes(n))}>{n}</button>)}
                {benchChoices.length === 0 && <span className="text-[12px] text-muted">沒有可選的球員</span>}
              </div>
              <Checkbox label="允許被換下的球員再上場" checked={reentry} onChange={setReentry} className="mt-1 min-h-9 pointer-fine:min-h-7" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[12px] font-medium text-ink-2">替補紀錄 <span className="text-muted font-normal tnum">{subs.length} 筆・紀錄比賽時自動記下</span></div>
                {subs.length > 0 && <Button size="sm" variant="ghost" icon={<Trash2 />} className="text-critical hover:text-critical" onClick={() => { if (window.confirm('清除這場所有替補紀錄（代打、代跑、守備、換投）？儲存修改後才會生效。')) setSubs([]) }}>清除替補紀錄</Button>}
              </div>
              {subs.length > 0 ? (
                <ol className="rounded-[var(--radius-sm)] border border-border divide-y divide-[var(--border)] text-[13px] text-ink-2">
                  {subs.map((x, i) => <li key={i} className="px-3 py-2 tnum">{subText(x)}</li>)}
                </ol>
              ) : <p className="text-[12px] text-muted">沒有替補紀錄</p>}
            </div>
          </div>
        )}
      </section>

      {error && <div role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--critical)_35%,transparent)] bg-[color-mix(in_srgb,var(--critical)_8%,transparent)] px-3 py-2.5 text-[13px] text-ink"><AlertTriangle className="size-4 shrink-0 mt-0.5 text-critical" />{error}</div>}

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <Button variant="ghost" icon={<Trash2 />} className="text-critical hover:text-critical" disabled={busy} onClick={() => { if (window.confirm(`確定刪除 ${game.id}（${game.date} vs ${game.opponent}）？這會移除這場所有打席與守備紀錄。`)) void onDelete() }}>刪除這場比賽</Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>取消</Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? '儲存中…' : '儲存修改'}</Button>
        </div>
      </div>
    </div>
  )
}
