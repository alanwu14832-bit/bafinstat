import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Button } from './Button'
import { Checkbox, Field, Input, inputCls } from './Input'
import { Select } from './Select'
import { Tabs } from './Tabs'
import { cx } from '../../lib/format'
import { applyErrorFixes, fieldingErrorFixes, reconcileFielding, type GameEdit } from '../../data/edit'
import { fieldersOf, rowCharges, rowsInInning } from '../../data/normalize'
import { DefenseByInning, ErrorFixNotice } from './DefenseEditor'
import { useRegistrationMoveNote } from '../../hooks/useRegistrationMoves'
import { cleanErrors, cleanOppErrors, errorsText, oppErrorList, oppErrorsForResult, UNKNOWN_FIELDER } from '../../data/errors'
import { HIT_BASE_COUNT, LOC_CODES, locLabel, orderCycle, MISSING_BALL_TAGS, missingBattedBallCounts, OPP_PR_UNNAMED, oppBatterName, oppPrMarks, withOppPrMark, PA_RESULTS, POSITIONS, posNum, RELIEF, TIEBREAK, type BattingPA, type DayRosterSub, type FieldingLine, type Game, type GameDayRoster, type GameRules, type OutAt, type PitchingPA, type PlayEvent } from '../../data/types'
import { dayRosterNames, isMove, parseDayRoster, SUB_KIND_LABEL } from '../../data/gameRoster'
import { PlayerSelect } from './PlayerSelect'
import { RosterSortToggle } from './RosterSortToggle'
import { PaList, PaPanel, type PaSide } from './PaEditor'
import { auditGame } from '../../data/audit'
import { applyOppBats, applyOppPitcher, blankBattingAt, oppSlotRowsOf, oppStintOf, blankPitchingAt, rowName, shiftOrders, stillOn } from '../../record/paEdit'
import { HoldPicker } from './HoldPicker'
import { holdCandidates, reliefEntries, runsByInning } from '../../data/pitchingSituations'
import { durationMinutes, formatDuration, isLongGame, LONG_GAME_NOTE } from '../../data/gameTime'
import { addPlay, applyPlayCounts, batterEndFor, deriveHalf, homesIn, inferAll, inningsOf, isBatterOutMark, batterOutMark, midOf, reachedOn, rebuildHalf, removePlay, scored, setBatterResult, setEnd, stepProblems, type End, type Half } from '../../record/timeline'
import { withResult } from '../../record/paEdit'
import type { TimelineProps } from './PaEditor'
import type { ExtraBases } from '../../record/widgets'
import { applyEarned, earnedAll, type EarnedCall } from '../../record/earned'
import { addPlacedRows, extraInnings, removePlacedRows } from '../../record/tiebreak'
import { missingBattedBall, outAtAsked, type Base } from '../../record/model'
import { ipDisplay } from '../../data/stats'
import { changeCount, hashOf, readEditDraft, writeEditDraft, type EditSnap } from './editDraft'
import { setUnsaved } from '../../lib/unsaved'

/** 結果 options of the tables: the plate-appearance results, and 突破僵局 for a runner the tie-break rule put on */
const RESULT_OPTIONS = [...PA_RESULTS, TIEBREAK]
/** Rows inserted (k > 0) or removed (k < 0) at `at`: the earned calls move with their rows. */
function shiftCalls(m: Map<number, EarnedCall>, at: number, k: number): Map<number, EarnedCall> {
  const out = new Map<number, EarnedCall>()
  for (const [row, c] of m) { if (row < at) out.set(row, c); else if (k > 0 || row >= at - k) out.set(row + k, c) }
  return out
}
/** Runs in an inning's timeline (between pitches, on the plays, the batters). */
const runsOfHalf = (h: Half | null | undefined) => (h ? h.steps.reduce((a, st) => a + homesIn(st) + st.moves.filter((m) => m.to === 'home').length, 0) : 0)

/* ------------------------------------------------------------------ generic editable table */
type Kind = 'text' | 'int' | 'select' | 'name' | 'ip'
/** innings written the baseball way: 8.1 = 8⅓, 8.2 = 8⅔ (stored as 8.333…); another decimal is taken as it is */
export const ipText = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? ipDisplay(Math.round(v * 3)) : '')
export function parseIp(raw: string): number | undefined {
  const t = raw.trim()
  if (!t) return undefined
  const m = /^(\d+)(?:\.([0-2]))?$/.exec(t)
  if (m) return Number(m[1]) + Number(m[2] ?? 0) / 3
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}
interface Col<T> { key: keyof T & string; label: string; kind: Kind; options?: readonly string[]; optionLabel?: (v: string) => string; w?: number; list?: string }

const cell = cx(inputCls('sm'), 'h-7 px-1.5 text-[12px] rounded-[6px] w-full')

function EditableTable<T extends object>({ rows, cols, onChange, blank, listId, names }: { rows: T[]; cols: Col<T>[]; onChange: (rows: T[]) => void; blank: (prev?: T) => T; listId: string; names: string[] }) {
  const update = (i: number, key: keyof T, raw: string, kind: Kind) => {
    const next = rows.slice()
    let v: unknown = raw
    if (kind === 'int') v = raw.trim() === '' ? undefined : Number(raw)
    if (kind === 'ip') v = parseIp(raw)
    next[i] = { ...next[i], [key]: v }
    onChange(next)
  }
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= rows.length) return; const next = rows.slice(); [next[i], next[j]] = [next[j], next[i]]; onChange(next) }
  return (
    <div className="overflow-x-auto scroll-x border border-border rounded-[var(--radius-sm)]">
      <table className="border-collapse text-[12px] min-w-full">
        <thead className="bg-surface-2/60">
          <tr>
            {/* (# and the name stay in view while the table scrolls sideways on a phone) */}
            <th className="px-2 h-8 text-left text-[11px] font-medium text-muted w-8 sticky left-0 z-[1] bg-surface-2">#</th>
            {cols.map((c) => <th key={c.key} className={cx('px-1 h-8 text-left text-[11px] font-medium text-muted whitespace-nowrap', c.kind === 'name' && 'sticky left-8 z-[1] bg-surface-2')} style={{ minWidth: c.w ?? 64 }}>{c.label}</th>)}
            <th className="px-2 h-8 w-[88px]" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="px-2 py-1 text-muted tnum sticky left-0 z-[1] bg-surface">{i + 1}</td>
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
                    <td key={c.key} className="px-1 py-1 sticky left-8 z-[1] bg-surface">
                      <select value={str} onChange={(e) => update(i, c.key, e.target.value, c.kind)} className={cx(cell, 'appearance-none pr-1 cursor-pointer')} style={{ width: c.w ?? 96 }} aria-label={c.label} data-list={listId}>
                        <option value=""></option>
                        {(str && !names.includes(str) ? [str, ...names] : names).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  )
                }
                // (innings: typed freely, read when the cell is left — 8.1 stays 8.1 while typing)
                if (c.kind === 'ip') return (
                  <td key={c.key} className="px-1 py-1">
                    <input key={`${i}:${str}`} defaultValue={ipText(v)} inputMode="decimal" aria-label={c.label} title="局數：8.1＝8⅓ 局、8.2＝8⅔ 局"
                      onBlur={(e) => { if (e.target.value !== ipText(v)) update(i, c.key, e.target.value, c.kind) }} className={cx(cell, 'tnum text-right')} style={{ width: c.w ?? 64 }} />
                  </td>
                )
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
type BatDraft = Omit<BattingPA, 'pitches' | 'errors'> & { pitchesText: string; errorsText: string }
type PitDraft = Omit<PitchingPA, 'pitches' | 'errors'> & { pitchesText: string; errorsText: string }
const toBatDraft = (p: BattingPA): BatDraft => { const { pitches, errors, ...rest } = p; return { ...rest, pitchesText: pitches.join(' '), errorsText: errorsText(errors) } }
const toPitDraft = (p: PitchingPA): PitDraft => { const { pitches, errors, ...rest } = p; return { ...rest, pitchesText: pitches.join(' '), errorsText: errorsText(errors) } }
const parsePitches = (t: string) => t.toUpperCase().split(/[\s,，、/]+/).filter(Boolean)
const fromBatDraft = (d: BatDraft): BattingPA => { const { pitchesText, errorsText: et, ...rest } = d; const errors = cleanOppErrors(et); return { ...rest, ...(errors.length ? { errors } : {}), pitches: parsePitches(pitchesText), sb: +rest.sb || 0, cs: +rest.cs || 0, advOnError: +rest.advOnError || 0, outOnBase: +rest.outOnBase || 0, ...(+(rest.baserunningOuts ?? 0) ? { baserunningOuts: +(rest.baserunningOuts ?? 0) } : {}), run: +rest.run || 0, rbi: +rest.rbi || 0, inning: +rest.inning || 0 } }
const fromPitDraft = (d: PitDraft): PitchingPA => { const { pitchesText, errorsText: et, rbi, oppBats, ...rest } = d; const errors = cleanErrors(et); const r = Math.max(0, Math.min(4, +(rbi ?? 0) || 0)); return { ...rest, ...(errors.length ? { errors } : {}), ...(r ? { rbi: r } : {}), ...(oppBats === 'L' || oppBats === 'R' ? { oppBats } : {}), pitches: parsePitches(pitchesText), sba: +rest.sba || 0, cs: +rest.cs || 0, wp: +rest.wp || 0, pb: +rest.pb || 0, pk: +rest.pk || 0, inning: +rest.inning || 0 } }

const CODES = ['I', 'II', 'III', 'L', 'R', 'ER'] as const
const BASES = ['無', '1', '2', '3', '12', '13', '23', '123'] as const
const TRAJ = ['G', 'F', 'L', 'P', 'B'] as const
const QUAL = ['強', '中', '弱'] as const
const LOCS = LOC_CODES.map(String)
const locOption = (v: string) => (Number(v) > 9 ? `${v} ${locLabel(Number(v))}` : v)

const batCols: Col<BatDraft>[] = [
  { key: 'inning', label: '局', kind: 'int', w: 40 }, { key: 'outsBefore', label: '出局前', kind: 'int', w: 48 }, { key: 'basesBefore', label: '壘上前', kind: 'select', options: BASES, w: 64 },
  { key: 'order', label: '棒次', kind: 'int', w: 44 }, { key: 'pos', label: '守位', kind: 'select', options: POSITIONS, optionLabel: posNum, w: 64 }, { key: 'batter', label: '打者', kind: 'name', w: 96 },
  { key: 'pitchesText', label: '逐球（SS CS S F IP B）', kind: 'text', w: 170 }, { key: 'result', label: '結果', kind: 'select', options: RESULT_OPTIONS, w: 76 },
  { key: 'loc', label: '落點', kind: 'select', options: LOCS, optionLabel: locOption, w: 64 }, { key: 'traj', label: '軌跡', kind: 'select', options: TRAJ, w: 52 }, { key: 'quality', label: '強度', kind: 'select', options: QUAL, w: 52 },
  { key: 'runner', label: '代跑', kind: 'name', w: 96 },
  { key: 'sb', label: '盜壘', kind: 'int', w: 44 }, { key: 'cs', label: '盜失', kind: 'int', w: 44 }, { key: 'advOnError', label: '失誤進壘', kind: 'int', w: 56 }, { key: 'outOnBase', label: '壘上出局', kind: 'int', w: 56 }, { key: 'baserunningOuts', label: '壘死', kind: 'int', w: 44 },
  { key: 'run', label: '得分', kind: 'int', w: 44 }, { key: 'rbi', label: '打點', kind: 'int', w: 44 }, { key: 'code', label: '代碼', kind: 'select', options: CODES, w: 56 }, { key: 'note', label: '備註', kind: 'text', w: 120 },
  { key: 'errorsText', label: '對方失誤（守位）', kind: 'text', w: 96 },
  { key: 'oppPitcher', label: '對方投手', kind: 'text', w: 88 }, { key: 'oppHand', label: '對方左右', kind: 'select', options: ['L', 'R'], optionLabel: (v) => (v === 'L' ? '左投' : '右投'), w: 64 },
]
const pitCols: Col<PitDraft>[] = [
  { key: 'inning', label: '局', kind: 'int', w: 40 }, { key: 'outsBefore', label: '出局前', kind: 'int', w: 48 }, { key: 'basesBefore', label: '壘上前', kind: 'select', options: BASES, w: 64 },
  { key: 'oppOrder', label: '對方棒次', kind: 'int', w: 56 }, { key: 'pitcher', label: '投手', kind: 'name', w: 96 }, { key: 'oppBatter', label: '對方打者', kind: 'text', w: 88 },
  { key: 'pitchesText', label: '逐球（SS CS S F IP B）', kind: 'text', w: 170 }, { key: 'result', label: '結果', kind: 'select', options: RESULT_OPTIONS, w: 76 },
  { key: 'loc', label: '落點', kind: 'select', options: LOCS, optionLabel: locOption, w: 64 }, { key: 'traj', label: '軌跡', kind: 'select', options: TRAJ, w: 52 }, { key: 'quality', label: '強度', kind: 'select', options: QUAL, w: 52 },
  { key: 'runner', label: '代跑', kind: 'text', w: 80 },
  { key: 'sba', label: '被盜', kind: 'int', w: 44 }, { key: 'cs', label: '阻殺', kind: 'int', w: 44 }, { key: 'wp', label: '暴投', kind: 'int', w: 44 }, { key: 'pb', label: '捕逸', kind: 'int', w: 44 }, { key: 'pk', label: '牽制', kind: 'int', w: 44 },
  { key: 'errorsText', label: '守備失誤（守位）', kind: 'text', w: 96 },
  { key: 'rbi', label: '打點', kind: 'int', w: 44 },
  { key: 'code', label: '代碼', kind: 'select', options: CODES, w: 56 }, { key: 'note', label: '備註', kind: 'text', w: 120 },
  // 對方打者左右打 (empty = 不知道)
  { key: 'oppBats', label: '左右打', kind: 'select', options: ['L', 'R'], optionLabel: (v) => (v === 'L' ? '左打' : '右打'), w: 64 },
]
type StarterDraft = GameDayRoster['starters'][number]
/** what 修改資料 keeps on this device until it is saved (editDraft.ts) */
interface EditDraft { rules?: GameRules; game: Game; bat: BatDraft[]; pit: PitDraft[]; fld: FieldingLine[]; starters: StarterDraft[]; bench: string[]; subs: DayRosterSub[]; reentry: boolean; basis: { game: Game; batting: BattingPA[]; pitching: PitchingPA[] }; touched: string[] }
const starterCols: Col<StarterDraft>[] = [{ key: 'order', label: '棒次', kind: 'int', w: 44 }, { key: 'pos', label: '守位', kind: 'select', options: POSITIONS, optionLabel: posNum, w: 64 }, { key: 'name', label: '球員', kind: 'name', w: 110 }]
const chip = (active: boolean) => cx('h-9 pointer-fine:h-8 px-3 rounded-[var(--radius-sm)] border text-[13px] font-medium cursor-pointer transition-colors motion-reduce:transition-none', active ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink hover:bg-surface-2')
const subText = (s: DayRosterSub) => `${s.inning ? `${s.inning}局${s.half === 'bottom' ? '下' : '上'} ` : ''}${isMove(s) ? `換守位 ${s.in} 改守 ${s.pos}` : `${SUB_KIND_LABEL[s.kind]} ${s.in}${s.out ? ` 替 ${s.out}` : ''}${s.pos ? `（${s.pos}）` : ''}`}`

/** The 守備 table's rows with a player, numbers as numbers (cells hold what was typed). */
const numericLines = (fld: FieldingLine[]): FieldingLine[] => fld.filter((f) => f.player.trim()).map((f) => ({ ...f, po: +f.po || 0, a: +f.a || 0, e: +f.e || 0, dp: +f.dp || 0, pb: +f.pb || 0, sb: +f.sb || 0, cs: +f.cs || 0 }))

const fldCols: Col<FieldingLine>[] = [
  { key: 'player', label: '球員', kind: 'name', w: 96 }, { key: 'pos', label: '守位', kind: 'select', options: POSITIONS, optionLabel: posNum, w: 64 }, { key: 'innings', label: '局數', kind: 'ip', w: 48 },
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
  // the rules it was played by (紀錄比賽 saves them; an older game's can be set here): 獲勝機率 reads them
  const [rules, setRules] = useState<GameRules | undefined>(initial.game.dayRoster?.rules)
  const [tab, setTab] = useState<'bat' | 'pit' | 'fld' | 'roster'>('bat')
  // plate appearances: tap one to edit it with the recording buttons (default), or the whole table at once
  const [paView, setPaView] = useState<'tap' | 'table'>('tap')
  const [sel, setSel] = useState<{ side: PaSide; index: number } | null>(null)
  const batRows = useMemo(() => bat.map(fromBatDraft), [bat])
  const pitRows = useMemo(() => pit.map(fromPitDraft), [pit])
  // who stood where in each inning we fielded (the 登錄名單 as edited): names next to 我隊守備失誤, 失誤 SS（王鼎鈞）
  const rosterNow = useMemo(() => parseDayRoster({ starters: starters.filter((x) => x.name.trim()), bench: [], subs, reentry: false }), [starters, subs])
  const fielderAt = useMemo(() => {
    const g = { homeAway: game.homeAway, dayRoster: rosterNow }
    const t = fieldersOf(g)
    if (!t) return undefined
    const rows = rowsInInning(pitRows)
    const charges = rowCharges(g, pitRows)
    // (`index`: the opponent row, for a change made in the middle of the half; `nth`: which of that row's errors at
    // `pos`, for a change made in the middle of that plate appearance)
    return (inning: number, pos: string, index?: number, nth?: number) => {
      if (index === undefined) return t(inning).get(pos)
      const own = nth === undefined ? undefined : charges[index]?.errors.filter((e) => e.pos === pos)[nth]
      return (own?.at ?? t(inning, rows[index])).get(pos)
    }
  }, [rosterNow, game.homeAway, pitRows])
  // what the save reconciles the 守備 lines from: the game as it was opened, or as it was when 依登錄名單重算失誤 was
  // pressed (the lines already follow the 登錄名單 from then on: the save must not move those errors a second time)
  const [basis, setBasis] = useState(() => ({ game: initial.game, batting: initial.batting, pitching: initial.pitching }))
  const gameNow = useMemo<Game>(() => ({ ...game, dayRoster: rosterNow }), [game, rosterNow])
  const playsNow = useMemo(() => ({ batting: batRows.filter((p) => p.batter.trim()), pitching: pitRows.filter((p) => p.pitcher.trim()) }), [batRows, pitRows])
  // the 守備 lines as the save would write them, and their 失誤 against who stood there (a game saved before every
  // position change was logged)
  const linesNow = useMemo(() => reconcileFielding(numericLines(fld), basis.game, basis, playsNow, gameNow), [fld, basis, playsNow, gameNow])
  const errorFixes = useMemo(() => fieldingErrorFixes(linesNow, gameNow, playsNow.batting, playsNow.pitching), [linesNow, gameNow, playsNow])
  const applyFixes = () => { setFld(applyErrorFixes(linesNow, gameNow, errorFixes)); setBasis({ game: gameNow, ...playsNow }) }
  const flags = useMemo(() => {
    const out = { bat: new Map<number, string[]>(), pit: new Map<number, string[]>() }
    for (const i of auditGame(batRows, pitRows, 'editor')) out[i.side].set(i.index, [...(out[i.side].get(i.index) ?? []), i.message])
    return out
  }, [batRows, pitRows])
  // batted balls without their 落點／軌跡 (required while recording; old games are not blocked, only counted)
  // (per tab: the count names 我隊打擊／我隊投球, so it adds up with the tags the recorder sees on each list)
  const missingBall = useMemo(() => missingBattedBallCounts(batRows.filter((r) => missingBattedBall(r).length).length, pitRows.filter((r) => missingBattedBall(r).length).length), [batRows, pitRows])
  // 自責／非自責 that followed the rules before an edit of the opponent's plate appearances follow them after it;
  // a call made by hand stays (record/earned.ts)
  const earnedNow = useMemo(() => earnedAll(pitRows), [pitRows])
  const withEarned = (next: PitchingPA[], shift?: { at: number; k: number }) => applyEarned(next, shift ? shiftCalls(earnedNow, shift.at, shift.k) : earnedNow, earnedAll(next))
  const setRows = (side: PaSide, fn: <T>(rows: T[]) => T[]) => (side === 'bat' ? setBat((b) => fn(b)) : setPit((p) => fn(p)))
  // the half-innings a plate appearance was inserted into or deleted from: their runners must add up again before saving
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const touch = (side: PaSide, inning: number) => setTouched((t) => new Set(t).add(`${side}:${inning}`))
  // the table changed a result, the bases or the outs of a row (or added / removed one): that half must add up again too
  const touchTable = (side: PaSide, was: Array<BatDraft | PitDraft>, next: Array<BatDraft | PitDraft>) => {
    const key = (r?: BatDraft | PitDraft) => (r ? `${r.inning}|${r.result}|${r.basesBefore ?? ''}|${r.outsBefore ?? ''}|${r.code ?? ''}` : '')
    for (let i = 0; i < Math.max(was.length, next.length); i++) if (key(was[i]) !== key(next[i])) for (const r of [was[i], next[i]]) if (r) touch(side, +r.inning || 1)
  }
  const insertPa = (side: PaSide, at: number, inning?: number) => {
    const rows = side === 'bat' ? batRows : pitRows
    // after a half that already has its third out: it goes into the next inning (unless the recorder says otherwise)
    const prev = rows[at - 1]
    if (prev && prev.code === 'III' && (inning === undefined || inning === prev.inning) && at === rows.filter((r) => r.inning <= prev.inning).length
      && window.confirm(`第 ${prev.inning} 局已經三出局：新的打席加在第 ${prev.inning + 1} 局？（按「取消」仍加在第 ${prev.inning} 局）`)) inning = prev.inning + 1
    // the plate appearances after it: one slot further along the order (棒次 and who holds it), if that is what happened
    const later = rows.slice(at).filter((r) => (side === 'bat' ? (r as BattingPA).order : (r as PitchingPA).oppOrder) && r.result).length
    const shift = later > 0 && window.confirm(`後面 ${later} 個打席的棒次要一起往後順延一棒嗎？（漏記一個打席時通常要；只是補一列就按「取消」）`)
    if (side === 'bat') setBat((b) => { const rows2 = [...b.slice(0, at).map(fromBatDraft), blankBattingAt(b.map(fromBatDraft), at, game.id, inning), ...b.slice(at).map(fromBatDraft)]; return (shift ? shiftOrders(rows2, at + 1, 1) : rows2).map(toBatDraft) })
    else setPit((p) => { const rows2 = [...p.slice(0, at).map(fromPitDraft), blankPitchingAt(p.map(fromPitDraft), at, game.id, inning), ...p.slice(at).map(fromPitDraft)]; return (shift ? shiftOrders(rows2, at + 1, 1) : rows2).map(toPitDraft) })
    touch(side, inning ?? rows[at - 1]?.inning ?? rows[at]?.inning ?? 1)
    setSel({ side, index: at })
  }
  // 換投後未面對打者: a row for a reliever who made an out on the bases before facing anyone, at the end of that inning
  const addRelief = (inning: number) => {
    const last = pitRows.reduce((m, r, i) => (r.inning === inning ? i : m), -1)
    const at = last + 1
    const row: PitchingPA = { gameId: game.id, inning, outsBefore: Math.min(2, pitRows[last]?.outsBefore ?? 0), pitcher: '', pitches: [], result: RELIEF, sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 }
    setPit((p) => [...p.slice(0, at), toPitDraft(row), ...p.slice(at)])
    setSel({ side: 'pit', index: at })
  }
  // the runner timeline of every inning that can be followed (rows with 壘上(前) / 出局(前) throughout)
  const halves = useMemo(() => ({ bat: inferAll(batRows, 'bat'), pit: inferAll(pitRows, 'pit') }), [batRows, pitRows])
  const [tlNotice, setTlNotice] = useState<string | null>(null)
  // where the runners were going when this plate appearance was opened: changing the result starts from there,
  // so trying 保送 and going back to 三振 undoes the runners it forced
  const baseline = useRef(new Map<string, Record<number, End>>())
  useEffect(() => { setTlNotice(null); baseline.current.clear() }, [sel])
  const nameOf = (side: PaSide) => (row: number) => rowName(side, side === 'bat' ? batRows[row] : pitRows[row])
  /** the man who batted on that row (not his 代跑) */
  const batterOf = (side: PaSide) => (row: number) => rowName(side, side === 'bat' ? batRows[row] : pitRows[row], true)
  /** Check an edited inning, then write it onto the rows (or say why not). */
  /** `was` and `shift`: the inning before the change with its rows moved (rows were added or removed in front of it) */
  const commitHalf = (side: PaSide, rows: Array<BattingPA | PitchingPA>, half: Half, was?: Half, shift?: { at: number; k: number }): string | null => {
    const runner = nameOf(side), batter = batterOf(side)
    let outs = 0
    for (let j = 0; j < half.steps.length; j++) {
      const st = half.steps[j]
      // on his own plate appearance the row's man is the batter, later he is the runner (or his 代跑)
      const p = stepProblems(st, (row) => (row === st.index ? batter(row) : runner(row)))
      if (p.length) { const m = `${p[0]}，這個改法沒有套用`; setTlNotice(m); return m }
      outs += st.moves.filter((m) => m.to === 'out').length
      if (outs >= 3) { const m = '跑壘出局已經是這局第三個出局，這個打席不會有結果；請改在上一個打席把這位跑者設為出局'; setTlNotice(m); return m }
      outs += st.outs.length
      if (outs > 3) { const m = '這局會超過 3 個出局，請先把另一個出局改掉'; setTlNotice(m); return m }
      if (outs === 3 && j < half.steps.length - 1) { const m = '第三個出局之後這局還有打席，請先刪除或移動後面的打席'; setTlNotice(m); return m }
    }
    setTlNotice(null)
    // the counts follow the plays: the difference between the inning's plays before and after this edit
    const before = was ?? (side === 'bat' ? halves.bat : halves.pit).get(half.inning)
    if (side === 'bat') setBat(deriveHalf(applyPlayCounts(rows as BattingPA[], before, half, 'bat'), half, 'bat').map(toBatDraft))
    else setPit(withEarned(deriveHalf(applyPlayCounts(rows as PitchingPA[], before, half, 'pit'), half, 'pit'), shift).map(toPitDraft))
    return null
  }
  // what deleting plate appearance i takes with it: the runs of its inning (as they are, and once its runners are laid
  // out again from the results, which the save asks for) and its 打點, which no other row picks up
  const deleteNote = (side: PaSide, i: number): string => {
    const rows: Array<BattingPA | PitchingPA> = side === 'bat' ? batRows : pitRows
    const inning = rows[i].inning
    const rest = rows.filter((_, k) => k !== i)
    const idx = inningsOf(rest).get(inning) ?? []
    const now = runsOfHalf(halves[side].get(inning))
    let after = 0
    try { after = idx.length ? runsOfHalf(rebuildHalf(rest, idx, side)) : 0 } catch { after = now }
    const rbi = rows[i].rbi ?? 0
    return [
      now === after ? `第 ${inning} 局仍是 ${now} 分。` : `第 ${inning} 局原本 ${now} 分，刪掉後依打擊結果重建跑者是 ${after} 分。`,
      rbi ? `這個打席的 ${rbi} 分打點會一起拿掉，其他打席的打點不會自動改，請自己核對。` : '',
    ].join('')
  }
  // 突破僵局 runners added in front of an extra inning, or taken off it: rows in or out, the inning carried through
  const addPlaced = (side: PaSide, inning: number, bases: Base[]) => {
    const rows = side === 'bat' ? batRows : pitRows
    const r = addPlacedRows<BattingPA | PitchingPA>(rows, inning, side, bases, game.id)
    if ('reason' in r) { window.alert(r.reason); return }
    const runs = runsOfHalf((side === 'bat' ? halves.bat : halves.pit).get(inning)), now = runsOfHalf(r.half)
    if (!window.confirm(`在第 ${inning} 局最前面加上突破僵局跑者（${r.text}）。後面打席的壘上跑者會跟著更新；這局原本 ${runs} 分，加上後是 ${now} 分，打點請自己核對。按「儲存修改」才會生效。`)) return
    const why = commitHalf(side, r.rows, r.half, r.before, { at: r.at, k: r.shift })
    if (why) window.alert(`沒辦法加上：${why}`)
  }
  const removePlaced = (side: PaSide, inning: number) => {
    const rows = side === 'bat' ? batRows : pitRows
    const r = removePlacedRows<BattingPA | PitchingPA>(rows, inning, side)
    if ('reason' in r) { window.alert(r.reason); return }
    const runs = runsOfHalf((side === 'bat' ? halves.bat : halves.pit).get(inning)), now = runsOfHalf(r.half)
    if (!window.confirm(`刪除第 ${inning} 局的突破僵局跑者（${r.text}）？後面打席的壘上跑者會跟著更新；這局原本 ${runs} 分，刪除後是 ${now} 分，打點請自己核對。按「儲存修改」才會生效。`)) return
    const why = commitHalf(side, r.rows, r.half, r.before, { at: r.at, k: r.shift })
    if (why) { window.alert(`沒辦法刪除：${why}`); return }
    // stay on the inning's leadoff
    setSel(r.rows[r.at] ? { side, index: r.at } : null)
  }
  // the innings that can be extra innings, read off the game (the planned 局數 is not saved)
  const extraInningSet = useMemo(() => extraInnings(batRows, pitRows), [batRows, pitRows])
  const timelineFor = (side: PaSide, i: number): TimelineProps | undefined => {
    const rows = side === 'bat' ? batRows : pitRows
    const half = rows[i] ? (side === 'bat' ? halves.bat : halves.pit).get(rows[i].inning) : null
    const step = half?.steps.find((st) => st.index === i)
    if (!half || !step) return undefined
    if (!baseline.current.has(`${side}-${i}`)) baseline.current.set(`${side}-${i}`, { ...step.dest })
    // no RBI on an error, a double play or a strikeout (a run then scored on a wild pitch, a steal…)
    const noRbi = rows[i].result === '失誤' || rows[i].result === '雙殺' || rows[i].result === '三振'
    // 打點 on either side (theirs is PitchingPA.rbi, left out at 0)
    const rbiOf = (r: BattingPA | PitchingPA) => r.rbi ?? 0
    const withRbi = <T extends BattingPA | PitchingPA>(r: T, d: number): T => {
      const v = Math.max(0, Math.min(4, rbiOf(r) + d))
      if (side === 'bat') return { ...r, rbi: v }
      const { rbi: _x, ...rest } = r as PitchingPA; void _x
      return (v ? { ...rest, rbi: v } : rest) as T
    }
    // 對方失誤 (we bat): a 失誤進壘 is one of their errors; the row's list ('?' = 不知道) follows it (an older row
    // without a list gets its implied errors written out first). Taking one off: the batted ball's 失誤進壘 is the
    // list's last entry (紀錄比賽 writes the fielder picked for it last, this editor adds its '?' last); one between
    // pitches is a '?' if the list has one, else the last entry.
    const oppErrDelta = (r: BattingPA, d: 1 | -1, onPlay = false): BattingPA => {
      const list = oppErrorList(r)
      if (d > 0) return { ...r, errors: [...list, UNKNOWN_FIELDER] }
      const q = list.lastIndexOf(UNKNOWN_FIELDER)
      const k = onPlay || q < 0 ? list.length - 1 : q
      const next = k >= 0 ? list.filter((_, j) => j !== k) : list
      const { errors: _e, ...rest } = r; void _e
      return next.length ? { ...rest, errors: next } : rest
    }
    const onEnd = (who: number | 'batter', end: End, base: Array<BattingPA | PitchingPA> = rows) => {
      let next = base
      const old = who === 'batter' ? step.batter : step.dest[who]
      // a 失誤進壘 mark on the play goes once he ends somewhere else: its bases come off his 失誤進壘 count
      const err = end !== old ? playOf(who, old) : undefined
      if (side === 'bat' && err?.kind === 'err') next = next.map((r, k) => (k === rowOf(who) ? { ...r, advOnError: Math.max(0, (r as BattingPA).advOnError - basesOf(err)) } : r))
      // a run brought home by this batter's play is his RBI (not on an error or a double play)
      if (!noRbi) {
        const d = end === 'home' && old !== 'home' ? 1 : old === 'home' && end !== 'home' && err?.kind !== 'err' ? -1 : 0
        if (d) next = next.map((r, k) => (k === i ? withRbi(r, d) : r))
      }
      // the 失誤進壘 mark is gone: so is its error (their list while we bat; ours is picked by hand)
      if (side === 'bat' && err?.kind === 'err' && rows[i].result !== '失誤' && !(rows[i].events ?? []).some((e) => e.play && e.kind === 'err' && e !== err)) next = next.map((r, k) => (k === i ? oppErrDelta(r as BattingPA, -1, true) : r))
      commitHalf(side, next, setEnd(half, i, who, end))
    }
    // a runner play between pitches: its counts (盜壘 on the runner's row for us, 被盜壘 / 阻殺 / 牽制 / 暴投 / 捕逸 on this
    // plate appearance for the opponent) follow from commitHalf, which counts every play the inning has before and after
    // (a 失誤進壘 between pitches: their error while we bat goes on the list as 不知道; ours needs the fielder, picked
    // in 我隊守備失誤 — saving is blocked until then)
    const onPlay = (pitch: number, kind: string, who: number[], outAt?: OutAt) => {
      const { half: h, added } = addPlay(half, i, pitch, kind, who, outAt)
      if (!added.length) return
      const errs = side === 'bat' ? added.filter((m) => m.kind === 'err').length : 0
      let next: Array<BattingPA | PitchingPA> = rows
      for (let k = 0; k < errs; k++) next = next.map((r, j) => (j === i ? oppErrDelta(r as BattingPA, 1) : r))
      commitHalf(side, next, h)
    }
    const onRemovePlay = (n: number) => {
      const { half: h, removed } = removePlay(half, i, n)
      if (!removed) return
      commitHalf(side, side === 'bat' && removed.kind === 'err' ? rows.map((r, j) => (j === i ? oppErrDelta(r as BattingPA, -1) : r)) : rows, h)
    }
    // a new result: the batter goes where it puts him, runners in his way are forced ahead (and those runs are his RBI)
    const onResult = (result: string) => {
      let h = half
      for (const [row, d] of Object.entries(baseline.current.get(`${side}-${i}`) ?? {})) if (midOf(step).some((o) => o.row === Number(row))) h = setEnd(h, i, Number(row), d)
      h = setBatterResult(h, i, result)
      const st = h.steps.find((x) => x.index === i)!
      const next = rows.map((r, k) => {
        if (k !== i) return r
        let n = withResult(r, result)
        // 對方失誤 follows the 失誤進壘 on the batted ball the way 紀錄比賽 writes it (none extra on a 失誤 result)
        if (side === 'bat') {
          const { errors: _e, ...rest } = n as BattingPA; void _e
          const errors = oppErrorsForResult(r as BattingPA, result)
          n = (errors.length ? { ...rest, errors } : rest) as typeof n
        }
        if (['失誤', '雙殺', '三振'].includes(result)) return n
        return withRbi(n, homesIn(st) - homesIn(step))
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
        // and it is one of their errors (one for the play, whoever moved; none extra on a 失誤 result)
        const otherErr = rest.some((e) => e.play && e.kind === 'err')
        const dErr = rows[i].result === '失誤' || otherErr ? 0 : (mark?.kind === 'err' ? 1 : 0) - (old?.kind === 'err' ? 1 : 0)
        setBat((b) => b.map((x, k) => {
          let r = fromBatDraft(x)
          if (k === i) r = patch(r)
          if (k === rowOf(who) && dAdv) r = { ...r, advOnError: Math.max(0, r.advOnError + dAdv) }
          if (k === i && dRbi) r = { ...r, rbi: Math.max(0, Math.min(4, r.rbi + dRbi)) }
          if (k === i && dErr) r = oppErrDelta(r, dErr as 1 | -1, true)
          return k === i || k === rowOf(who) ? toBatDraft(r) : x
        }))
      } else {
        // while we field it is our error (pick the fielder in 我隊守備失誤 below); the rules then make a run scored on it
        // unearned, and it is no RBI
        const dRbi = to === 'home' && !noRbi ? (old?.kind === 'err' ? 1 : 0) - (mark?.kind === 'err' ? 1 : 0) : 0
        setPit(withEarned(pitRows.map((x, k) => (k === i ? (dRbi ? withRbi(patch(x), dRbi) : patch(x)) : x))).map(toPitDraft))
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
    const outMarkAny = (row: number) => (rows[i].events ?? []).find((e) => e.play && !e.batter && e.to === 'out' && (e.kind === 'out' || e.kind === 'tag') && e.from === midBase(row))
    const outMark = (row: number) => { const e = outMarkAny(row); return e?.kind === 'out' ? e : undefined }
    // a runner put out on a ball that put the batter on (or on a double play) is marked too (kind 'tag', 被刺殺／封殺), so the base can be said
    const live = outAtAsked(rows[i].result)
    const markAt = (kind: string, from: 1 | 2 | 3, outAt?: OutAt): PlayEvent => ({ at: rows[i].pitches.length, kind, from, to: 'out' as const, play: true as const, ...(outAt ? { outAt } : {}) })
    const withEvents = (events: PlayEvent[], row: number, drop?: (r: BattingPA | PitchingPA) => void) => rows.map((r, k) => {
      if (k === i) { const n = { ...r, events }; if (!events.length) delete (n as { events?: unknown }).events; return n }
      if (drop && k === row) { const n = { ...r } as BattingPA | PitchingPA; drop(n); return n }
      return r
    })
    // (their runner too: only the mark, they have no 壘死 column)
    const runningOut = {
      of: (row: number) => step.dest[row] === 'out' && !!outMark(row),
      set: (row: number, on: boolean, outAt?: OutAt) => {
        const from = midBase(row)
        if (!from) return
        const was = outMarkAny(row)
        const keep = outAt ?? was?.outAt
        const rest = (rows[i].events ?? []).filter((e) => e !== was)
        const kind = on ? 'out' : live ? 'tag' : null
        const events = kind ? [...rest, markAt(kind, from, keep)] : rest
        onEnd(row, 'out', withEvents(events, row, side === 'bat' && !on ? (n) => { delete (n as BattingPA).baserunningOuts } : undefined))
      },
    }
    // 死在哪個壘包: for a runner out on the play (a 壘死 or a ball that put the batter on) and for the batter put out after reaching
    const outAt = {
      runner: (row: number) => ({ can: step.dest[row] === 'out' && (!!outMarkAny(row) || live), at: outMarkAny(row)?.outAt }),
      setRunner: (row: number, at: OutAt) => {
        const from = midBase(row)
        if (!from) return
        const was = outMarkAny(row)
        const events = [...(rows[i].events ?? []).filter((e) => e !== was), markAt(was?.kind ?? 'tag', from, at)]
        onEnd(row, 'out', withEvents(events, row))
      },
      batter: { can: step.batter === 'out' && reachedOn(rows[i].result), at: (rows[i].events ?? []).find(isBatterOutMark)?.outAt },
      setBatter: (at: OutAt) => {
        const marked = (evs: PlayEvent[] | undefined): PlayEvent[] => {
          const list = evs ?? []
          return list.some(isBatterOutMark) ? list.map((e) => (isBatterOutMark(e) ? { ...e, outAt: at } : e)) : [...list, batterOutMark(rows[i].result, rows[i].pitches.length, at)]
        }
        if (side === 'bat') setBat((b) => b.map((x, k) => (k === i ? { ...x, outOnBase: Math.max(1, +x.outOnBase || 0), events: marked(x.events) } : x)))
        else setPit((p) => p.map((x, k) => (k === i ? { ...x, events: marked(x.events) } : x)))
      },
    }
    const pinch = side === 'bat' ? {
      onPinchRunner: (row: number, name: string) => setBat((b) => b.map((x, k) => { if (k !== row) return x; const n = { ...x, runner: name || undefined }; if (!name) delete n.runner; return n })),
      pinchNames: names,
      runnerOf: (row: number) => batRows[row]?.runner,
    } : {
      // 對方代跑: typed (a name or jersey number), on the row where that runner reached; when he came in is noted on the
      // plate appearance it happened during (data/types oppPrMark), so a renamed or removed 代跑 carries it along
      onPinchRunner: (row: number, name: string) => setPit((p) => p.map((x, k) => {
        if (k === row) { const n = { ...x, runner: name || undefined }; if (!name) delete n.runner; return n }
        const was = p[row].runner
        const mark = was && k > row && x.inning === p[row].inning ? oppPrMarks(x.note).find((m) => m.label === was) : undefined
        if (!mark) return x
        const note = withOppPrMark(withOppPrMark(x.note, was!), name, name ? mark.at : undefined)
        const n = { ...x, note }; if (!note) delete n.note; return n
      })),
      pinchNames: oppNames,
      pinchText: true,
      runnerOf: (row: number) => pitRows[row]?.runner,
      prAt: {
        of: (row: number) => { const r = pitRows[row]?.runner; return r ? oppPrMarks(pitRows[i].note).find((m) => m.label === r)?.at : undefined },
        // one plate appearance holds it: taken off the others of the inning
        set: (row: number, at: number | undefined) => setPit((p) => p.map((x, k) => {
          const r = p[row].runner
          if (!r || k <= row || x.inning !== p[row].inning) return x
          const note = withOppPrMark(x.note, r, k === i ? at : undefined)
          if (note === x.note) return x
          const n = { ...x, note }; if (!note) delete n.note; return n
        })),
      },
    }
    // our batter put out on his own play after he reached (記成壘上出局 by the timeline): 跑壘失誤（壘死） or not
    const me = side === 'bat' ? (rows[i] as BattingPA) : null
    const batterMistake = me ? {
      can: reachedOn(me.result),
      on: (me.baserunningOuts ?? 0) > 0,
      set: (on: boolean) => setBat((b) => b.map((x, k) => {
        if (k !== i) return x
        const n = { ...x, outOnBase: Math.max(1, +x.outOnBase || 0) }
        if (!(n.events ?? []).some(isBatterOutMark)) n.events = [...(n.events ?? []), batterOutMark(me.result, me.pitches.length)]
        if (on) n.baserunningOuts = 1; else delete n.baserunningOuts
        return n
      })),
    } : undefined
    return { step, nameOf: nameOf(side), batterOf: batterOf(side), onEnd: (who, end) => onEnd(who, end), onPlay, onRemovePlay, throwOf, onThrow, onThrowUp, onResult, runningOut, outAt, batterMistake,
      ...(side === 'pit' ? { earned: { of: (row: number) => pitRows[row]?.code !== 'R', rule: (row: number) => earnedNow.get(row), toggle: (row: number) => setPit((p) => p.map((x, k) => (k === row && (x.code === 'R' || x.code === 'ER') ? { ...x, code: x.code === 'R' ? 'ER' : 'R' } : x))) } } : {}), notice: tlNotice, ...pinch }
  }
  // 下一個缺落點／軌跡的: after this one, then from the top; none left (or only this one) = no button
  const nextMissingFrom = (rows: Array<BattingPA | PitchingPA>, i: number) => {
    const all = rows.flatMap((r, k) => (k !== i && missingBattedBall(r).length ? [k] : []))
    return all.find((k) => k > i) ?? all[0]
  }
  // a plate appearance's batter changed to someone who had not been in the game: a 代打 the recorder missed — offered
  // to the 登錄名單 (replacing whoever had that slot), so the box, the 逐局表 and the 文字轉播 say so too
  const missedSub = (was: BattingPA, now: BattingPA) => {
    const name = now.batter.trim()
    if (!name || name === was.batter || !was.batter || !now.order) return
    const appeared = batRows.some((r) => r.batter === name || r.runner === name) || starters.some((x) => x.name === name) || subs.some((x) => x.in === name)
    if (appeared) return
    if (!window.confirm(`把 ${name} 記成代打（第 ${now.inning} 局，替 ${was.batter}，第 ${now.order} 棒）？會加進「登錄名單」的替補紀錄；按「取消」只改這個打席的名字。`)) return
    setSubs((l) => [...l, { kind: 'PH', in: name, out: was.batter, pos: 'PH', inning: now.inning, half: game.homeAway === '客' ? 'top' : 'bottom', slot: now.order! - 1 }])
  }
  // two starters' 棒次 traded (the order was written down wrong): their plate appearances can trade names too
  // (against the 登錄名單 as the game was opened: the two 棒次 are typed one at a time; asked once per pair)
  const swapAsked = useRef(new Set<string>())
  const swapSlots = (was: StarterDraft[], next: StarterDraft[]) => {
    const before = new Map(was.map((x) => [x.name, x.order]))
    const moved = next.flatMap((x) => { const from = before.get(x.name); return x.name && from && x.order && from !== x.order ? [{ name: x.name, from, to: x.order }] : [] })
    if (moved.length !== 2 || moved[0].from !== moved[1].to || moved[1].from !== moved[0].to) return
    const [a, b] = moved
    const pair = [a.name, b.name].sort().join('|')
    if (swapAsked.current.has(pair)) return
    swapAsked.current.add(pair)
    const count = batRows.filter((r) => (r.order === a.from && r.batter === a.name) || (r.order === b.from && r.batter === b.name)).length
    if (!count || !window.confirm(`${a.name} 改第 ${a.to} 棒、${b.name} 改第 ${b.to} 棒：這兩棒的 ${count} 個打席要一起換人嗎？（第 ${a.from} 棒的打席改成 ${b.name}，第 ${b.from} 棒的打席改成 ${a.name}）`)) return
    setBat((rows) => rows.map((r) => (r.order === a.from && r.batter === a.name ? { ...r, batter: b.name } : r.order === b.from && r.batter === b.name ? { ...r, batter: a.name } : r)))
  }
  // someone put in for another in 每局守備: the one who left still batting after it is most likely the one who came in
  const laterBats = (x: DayRosterSub) => {
    if (!x.out || x.out === x.in) return
    const ourHalf = game.homeAway === '客' ? 'top' : 'bottom'
    const after = (r: BattingPA) => r.inning > x.inning || (r.inning === x.inning && (x.half === ourHalf ? false : ourHalf === 'bottom'))
    const rows = batRows.filter((r) => r.batter === x.out && after(r))
    if (!rows.length || !window.confirm(`${x.out} 在第 ${x.inning} 局被換下，但之後還有 ${rows.length} 個打席記在他名下：要改成 ${x.in} 嗎？`)) return
    setBat((b) => b.map((d) => { const r = fromBatDraft(d); return r.batter === x.out && after(r) ? { ...d, batter: x.in } : d }))
  }
  const paPanel = (side: PaSide) => {
    const rows = side === 'bat' ? batRows : pitRows
    if (!sel || sel.side !== side || !rows[sel.index]) return null
    const i = sel.index
    return (
      <PaPanel side={side} pa={rows[i]} index={i} total={rows.length} issues={flags[side].get(i) ?? []} names={names} pitcherNames={pitcherNames} nextMissing={nextMissingFrom(rows, i)}
        onChange={(pa) => { if (side === 'bat') missedSub(rows[i] as BattingPA, pa as BattingPA); return side === 'bat' ? setBat((b) => b.map((x, k) => (k === i ? toBatDraft(pa as BattingPA) : x))) : setPit(withEarned(pitRows.map((x, k) => (k === i ? (pa as PitchingPA) : x))).map(toPitDraft)) }}
        onNav={(k) => setSel({ side, index: k })} onClose={() => setSel(null)}
        onDelete={() => {
          touch(side, rows[i].inning)
          // the plate appearances after it: one slot back along the order, if this one was recorded by mistake
          const later = rows.slice(i + 1).filter((r) => (side === 'bat' ? (r as BattingPA).order : (r as PitchingPA).oppOrder) && r.result).length
          const shift = later > 0 && window.confirm(`後面 ${later} 個打席的棒次要一起往前移一棒嗎？（多記了一個打席時通常要）`)
          if (side === 'bat') setBat((b) => { const rows2 = b.filter((_, k) => k !== i).map(fromBatDraft); return (shift ? shiftOrders(rows2, i, -1) : rows2).map(toBatDraft) })
          else setPit((p) => { const rows2 = p.filter((_, k) => k !== i).map(fromPitDraft); return (shift ? shiftOrders(rows2, i, -1) : rows2).map(toPitDraft) })
          setSel(rows.length > 1 ? { side, index: Math.min(i, rows.length - 2) } : null)
        }}
        deleteNote={() => deleteNote(side, i)}
        onInsert={(at, inning) => insertPa(side, at, inning)}
        onMove={(d) => { const j = i + d; if (j < 0 || j >= rows.length) return; setRows(side, (r) => { const n = r.slice(); [n[i], n[j]] = [n[j], n[i]]; return n }); setSel({ side, index: j }) }}
        // runners of this inning who reached before this plate appearance and are still out there
        timeline={timelineFor(side, i)}
        onRemovePlaced={() => removePlaced(side, rows[i].inning)}
        onOppPitcher={side === 'bat' ? (next, mode) => setBat((b) => applyOppPitcher(b.map(fromBatDraft), i, next, mode).map(toBatDraft)) : undefined}
        oppStint={side === 'bat' ? oppStintOf(batRows, i) : undefined}
        onOppBats={side === 'pit' ? (bats, mode) => setPit((p) => applyOppBats(p.map(fromPitDraft), i, bats, mode).map(toPitDraft)) : undefined}
        oppSlotCount={side === 'pit' ? oppSlotRowsOf(pitRows, i).length : undefined}
        onRebuild={() => {
          const rows = side === 'bat' ? batRows : pitRows
          const idx = inningsOf(rows).get(rows[i].inning) ?? []
          const rb = rebuildHalf(rows, idx, side)
          const before = idx.filter((k) => scored(rows[k], side)).length
          const after = rb.steps.reduce((a, st) => a + homesIn(st), 0)
          // the plays between pitches it keeps, and the ones it cannot (their runner is no longer on that base)
          const had = idx.reduce((a, k) => a + (rows[k].events ?? []).filter((e) => !e.play).length, 0)
          const kept = rb.steps.reduce((a, st) => a + st.moves.length, 0)
          const plays = had ? `\n投球之間的跑壘事件（盜壘、暴投、牽制…）保留 ${kept} 個${had > kept ? `，${had - kept} 個因為跑者位置不同無法保留` : ''}。` : ''
          if (window.confirm(`依打擊結果重建第 ${rows[i].inning} 局的跑者：安打依壘數推進、保送擠壘、犧飛回本壘、雙殺與野選讓被封殺的跑者出局。\n這局原本記 ${before} 分，重建後是 ${after} 分。${plays}\n之後可以在壘包圖上逐一修正。按「儲存修改」才會生效。`)) { const why = commitHalf(side, rows, rb); if (why) window.alert(`沒辦法重建：${why}`) }
        }}
        others={side === 'bat' ? batRows.slice(0, i).map((pa, k) => ({ index: k, pa })).filter((o) => o.pa.inning === batRows[i].inning && stillOn(o.pa)) : []}
        onChangeOther={(k, pa) => setBat((b) => b.map((x, m) => (m === k ? toBatDraft(pa) : x)))} fielderAt={fielderAt} />
    )
  }
  const [error, setError] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  // renaming the 杯賽: its 報名名單 follows on save (one line says so)
  const regMove = useRegistrationMoveNote(game)
  // names already in this game's roster stay selectable even when they left the team roster
  const names = useMemo(() => [...new Set([...roster, ...bat.map((p) => p.batter), ...pit.map((p) => p.pitcher), ...dayRosterNames(initial.game.dayRoster)])].filter(Boolean), [roster, bat, pit, initial.game.dayRoster])
  // 對方代跑 suggestions: the opponent names already in this game
  const oppNames = useMemo(() => [...new Set(pit.flatMap((p) => [oppBatterName(p.oppBatter), p.runner ?? '']))].filter((n) => n.trim() && n !== OPP_PR_UNNAMED), [pit])
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
  // 中繼: the pitchers after the first (the starter) in the rows being edited, plus any hold already saved
  const holdNames = useMemo(() => { const used = [...new Set(pit.map((p) => p.pitcher.trim()).filter(Boolean))].slice(1); return [...used, ...(game.holds ?? []).filter((h) => !used.includes(h))] }, [pit, game.holds])
  // 中繼 the score suggests, from the rows being edited (a hint: nothing is ticked for the recorder)
  const holdHints = useMemo(() => holdCandidates(reliefEntries(pitRows, { homeAway: game.homeAway, ourLine: runsByInning(batRows) }), [game.winningPitcher, game.savePitcher]), [pitRows, batRows, game.homeAway, game.winningPitcher, game.savePitcher])
  const duration = durationMinutes(game.time, game.endTime)
  // one pitcher gets only one of 勝投／中繼／救援: picking him as 勝投 or 救援 takes him off 中繼
  const decide = (k: 'winningPitcher' | 'savePitcher', v: string) => setGame((s) => { const holds = (s.holds ?? []).filter((h) => h !== v); return { ...s, [k]: v || undefined, holds: holds.length ? holds : undefined } })
  const g = <K extends keyof Game>(k: K, v: Game[K]) => setGame((s) => ({ ...s, [k]: v }))
  const text = (k: keyof Game) => (e: React.ChangeEvent<HTMLInputElement>) => g(k, (e.target.value || undefined) as never)

  // 修改到一半: how many changes are not saved yet (asked before leaving, shown on the bar below), and the changes kept
  // on this device until they are saved (editDraft.ts) — the next 修改資料 offers 接著改／丟掉
  const snap = (x: { game: Game; batting: BattingPA[]; pitching: PitchingPA[]; fielding: FieldingLine[]; roster: unknown }): EditSnap => ({
    game: JSON.stringify(x.game), roster: JSON.stringify(x.roster), fielding: JSON.stringify(x.fielding),
    batting: x.batting.map((p) => JSON.stringify(p)), pitching: x.pitching.map((p) => JSON.stringify(p)),
  })
  const [pristine] = useState(() => snap({ game: { ...initial.game }, batting: initial.batting.map((p) => fromBatDraft(toBatDraft(p))), pitching: initial.pitching.map((p) => fromPitDraft(toPitDraft(p))), fielding: initial.fielding.map((f) => ({ ...f })),
    roster: { starters: initial.game.dayRoster?.starters ?? [], bench: initial.game.dayRoster?.bench ?? [], subs: initial.game.dayRoster?.subs ?? [], reentry: !!initial.game.dayRoster?.reentry, rules: initial.game.dayRoster?.rules } }))
  const [baseKey] = useState(() => hashOf(initial))
  const changes = useMemo(() => changeCount(pristine, snap({ game, batting: batRows, pitching: pitRows, fielding: fld, roster: { starters, bench, subs, reentry, rules } })), [pristine, game, batRows, pitRows, fld, starters, bench, subs, reentry, rules])
  // a draft left on this device: shown (instead of the editor) until 接著改 or 丟掉 is picked
  const [stored, setStored] = useState(() => readEditDraft<EditDraft>(initial.game.id))
  useEffect(() => {
    if (stored) return
    writeEditDraft<EditDraft>(game.id, changes ? { savedAt: new Date().toISOString(), base: baseKey, changes, game, bat, pit, fld, starters, bench, subs, reentry, rules, basis, touched: [...touched] } : null)
  }, [stored, changes, baseKey, game, bat, pit, fld, starters, bench, subs, reentry, rules, basis, touched])
  const changesRef = useRef(changes)
  useEffect(() => { changesRef.current = changes }, [changes])
  useEffect(() => { setUnsaved(() => changesRef.current); return () => setUnsaved(null) }, [])
  // a reload or closing the tab while changes are unsaved: the browser asks too
  useEffect(() => {
    if (!changes) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [changes])
  const resume = (d: EditDraft) => {
    setGame(d.game); setBat(d.bat); setPit(d.pit); setFld(d.fld); setStarters(d.starters); setBench(d.bench); setSubs(d.subs); setReentry(d.reentry); setRules(d.rules)
    setBasis(d.basis); setTouched(new Set(d.touched)); setSel(null); setStored(null)
  }
  const cancel = () => {
    if (changes && !window.confirm(`放棄這 ${changes} 處修改？放棄後不會留下。`)) return
    writeEditDraft(game.id, null)
    onCancel()
  }

  const save = async () => {
    setError(null)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(game.date)) { setInfoOpen(true); setError('日期格式需為 YYYY-MM-DD'); return }
    if (!game.opponent?.trim()) { setInfoOpen(true); setError('請填對手'); return }
    const listed = starters.filter((x) => x.name.trim())
    const dupName = listed.map((x) => x.name.trim()).find((n, i, a) => a.indexOf(n) !== i)
    if (dupName) { setTab('roster'); setError(`登錄名單的先發有重複的球員：${dupName}`); return }
    const dupOrder = listed.map((x) => x.order).find((o, i, a) => o !== undefined && Number.isFinite(o) && a.indexOf(o) !== i)
    if (dupOrder !== undefined) { setTab('roster'); setError(`登錄名單的先發有兩個第 ${dupOrder} 棒`); return }
    // 失誤進壘 on their plate appearance is our error: whose (like 紀錄比賽, which does not send it without one)
    const noFielder = pitRows.findIndex((p) => (p.events ?? []).some((e) => e.kind === 'err') && !p.errors?.length && !(p.result === '失誤' && !(p.events ?? []).some((e) => e.kind === 'err' && !e.play)))
    if (noFielder >= 0) { setTab('pit'); setSel({ side: 'pit', index: noFielder }); setError(`投球紀錄第 ${noFielder + 1} 個打席有「失誤進壘」，請在「我隊守備失誤」點是誰失誤再儲存`); return }
    // a plate appearance inserted or deleted: that half's runners must add up again (rebuilt from the results, which keeps
    // the steals and wild pitches) — saved as they are, the bases would be wrong from that batter on
    for (const key of touched) {
      const [side, inn] = key.split(':') as [PaSide, string]
      const rows = side === 'bat' ? batRows : pitRows
      const idx = inningsOf(rows).get(Number(inn))
      if (!idx?.length || halves[side].get(Number(inn)) || idx.some((k) => !rows[k].result)) continue
      setTab(side); setPaView('tap'); setSel({ side, index: idx[0] })
      setError(`第 ${inn} 局（${side === 'bat' ? '我隊打擊' : '我隊投球'}）插入或刪除打席後，壘上的跑者接不起來：請在這局的打席按「依打擊結果重建這局的跑者」（盜壘、暴投會保留），再儲存`)
      return
    }
    // parseDayRoster trims, drops bench names that are starters and returns undefined for a roster with no names and no
    // rules (a game with only 預定局數／突破僵局 set keeps them)
    // (a 隊內賽 keeps its other side: its lineup and substitutions are not edited here)
    const dayRoster = parseDayRoster({ starters: listed, bench, subs, reentry, rules, intra: initial.game.dayRoster?.intra })
    try {
      const batting = bat.map(fromBatDraft).filter((p) => p.batter.trim())
      const pitching = pit.map(fromPitDraft).filter((p) => p.pitcher.trim())
      const lines = numericLines(fld)
      // errors / putouts changed in plate appearances move onto the fielders; numbers typed in the 守備 table stay
      // (and a change in the 登錄名單 — a 守備調動 added, a substitute's position fixed — moves them to whoever stood there)
      const fielding = reconcileFielding(lines, basis.game, basis, { batting, pitching }, { ...game, ...(dayRoster ? { dayRoster } : { dayRoster: undefined }) })
      await onSave({ game: { ...game, tournament: game.tournament?.trim() || '未分類', opponent: game.opponent.trim(), dayRoster }, batting, pitching, fielding })
      writeEditDraft(game.id, null)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const blankBat = (prev?: BatDraft): BatDraft => ({ gameId: game.id, inning: prev?.inning ?? 1, batter: '', pitchesText: '', errorsText: '', result: '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, order: prev?.order ? (prev.order % orderCycle(bat.map((x) => x.order))) + 1 : undefined })
  const blankPit = (prev?: PitDraft): PitDraft => ({ gameId: game.id, inning: prev?.inning ?? 1, pitcher: prev?.pitcher ?? '', pitchesText: '', errorsText: '', result: '', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, oppOrder: prev?.oppOrder ? (prev.oppOrder % orderCycle(pit.map((x) => x.oppOrder))) + 1 : undefined })
  const blankStarter = (prev?: StarterDraft): StarterDraft => ({ order: prev ? (prev.order && prev.order < 9 ? prev.order + 1 : undefined) : 1, pos: '', name: '' })
  const blankFld = (): FieldingLine => ({ gameId: game.id, player: '', pos: '', innings: game.innings, po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 })

  if (stored) {
    const at = new Date(stored.savedAt)
    const when = Number.isNaN(at.getTime()) ? '' : `，最後改在 ${at.getMonth() + 1}/${at.getDate()} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    return (
      <div role="region" aria-label="還沒儲存的修改" className="flex flex-col gap-3 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-4 py-3.5">
        <p className="text-[14px] font-semibold text-ink">這台裝置上有這場還沒儲存的修改</p>
        <p className="text-[13px] text-ink-2 leading-5">
          {stored.changes} 處修改{when}。
          {stored.base !== baseKey && <span className="text-ink">這場之後有被修改過（可能是別的裝置或別的紀錄員）；接著改再儲存，會用你這份蓋過那些修改。</span>}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="primary" onClick={() => resume(stored)}>接著改</Button>
          <Button variant="outline" onClick={() => { writeEditDraft(game.id, null); setStored(null) }}>丟掉，從目前的資料開始改</Button>
          <Button variant="ghost" onClick={onCancel}>先不要改</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        {/* folded by default: most fixes are to plate appearances, which then sit right under the tabs */}
        <button type="button" aria-expanded={infoOpen} onClick={() => setInfoOpen(!infoOpen)} className="flex items-center gap-2 text-left cursor-pointer min-h-9 pointer-fine:min-h-7 group">
          <ChevronRight className={cx('size-4 text-muted transition-transform motion-reduce:transition-none', infoOpen && 'rotate-90')} />
          <span className="text-[13px] font-semibold text-ink whitespace-nowrap shrink-0">比賽資訊</span>
          <span className="text-[12px] text-muted tnum truncate min-w-0">{game.id}{infoOpen ? '' : `・${game.date}・vs ${game.opponent}・${game.homeAway === '主' ? '主場' : '客場'}${game.winningPitcher ? `・勝投 ${game.winningPitcher}` : ''}${game.holds?.length ? `・中繼 ${game.holds.join('、')}` : ''}`}</span>
          <span className="ml-auto text-[12px] text-ink-2 group-hover:text-ink underline underline-offset-2 shrink-0">{infoOpen ? '收起' : '修改'}</span>
        </button>
        {infoOpen && <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="日期"><Input type="date" value={game.date} onChange={(e) => g('date', e.target.value)} className="tnum" /></Field>
          <Field label="開賽時間"><Input type="time" value={game.time ?? ''} onChange={text('time')} className="tnum" /></Field>
          <Field label="結束時間" hint={duration ? (isLongGame(duration) ? <span className="text-warning">{LONG_GAME_NOTE}</span> : `比賽時間 ${formatDuration(duration)}`) : undefined}><Input type="time" value={game.endTime ?? ''} onChange={text('endTime')} className="tnum" /></Field>
          <Field label="杯賽" hint={regMove || undefined}><Input value={game.tournament} onChange={(e) => g('tournament', e.target.value)} /></Field>
          <Field label="對手"><Input value={game.opponent} onChange={(e) => g('opponent', e.target.value)} /></Field>
          <Field label="主客"><Select value={game.homeAway} onChange={(e) => g('homeAway', e.target.value as Game['homeAway'])} options={[{ value: '主', label: '主場' }, { value: '客', label: '客場' }]} className="w-full" /></Field>
          <Field label="場地"><Input value={game.venue ?? ''} onChange={text('venue')} /></Field>
          <Field label="天氣"><Input value={game.weather ?? ''} onChange={text('weather')} /></Field>
          <Field label="局數"><Input type="number" min={1} max={12} value={game.innings ?? ''} onChange={(e) => g('innings', e.target.value ? Number(e.target.value) : undefined)} className="tnum" /></Field>
          <Field label="勝投"><PlayerSelect value={game.winningPitcher ?? ''} onChange={(v) => decide('winningPitcher', v)} names={pitcherNames} placeholder="—" className="w-full" /></Field>
          <Field label="敗投"><PlayerSelect value={game.losingPitcher ?? ''} onChange={(v) => g('losingPitcher', v || undefined)} names={pitcherNames} placeholder="—" className="w-full" /></Field>
          <Field label="救援"><PlayerSelect value={game.savePitcher ?? ''} onChange={(v) => decide('savePitcher', v)} names={pitcherNames} placeholder="—" className="w-full" /></Field>
          {/* not a <label>: a click on its padding would press the first chip */}
          <div className="col-span-2 md:col-span-4 flex flex-col gap-1.5 min-w-0">
            <span className="text-xs font-medium text-ink-2">中繼（可複選）</span>
            <HoldPicker names={holdNames} value={game.holds ?? []} onChange={(list) => g('holds', list.length ? list : undefined)} disabled={[game.winningPitcher, game.savePitcher]} suggested={holdHints} />
            {holdHints.length > 0 && <span className="text-[12px] text-muted">建議：救援情境上場、拿到至少 1 個出局、退場時仍領先（勝投、救援不算）</span>}
          </div>
          <Field label="紀錄者"><Input value={game.recorder ?? ''} onChange={text('recorder')} /></Field>
          {/* (stored with the 當日登錄名單; blank: the team's rules) */}
          <Field label="預定局數" hint="算獲勝機率用"><Input type="number" min={1} max={12} value={rules?.innings ?? ''} onChange={(e) => { const n = Number(e.target.value); setRules(n ? { innings: n, tiebreakFrom: rules?.tiebreakBases ? n + 1 : null, tiebreakBases: rules?.tiebreakBases ?? '' } : undefined) }} className="tnum" /></Field>
          <Field label="突破僵局"><Select value={rules?.tiebreakBases ?? ''} disabled={!rules} onChange={(e) => rules && setRules({ ...rules, tiebreakBases: e.target.value, tiebreakFrom: e.target.value ? rules.innings + 1 : null })} options={[{ value: '', label: '不採用' }, { value: '12', label: '下一局起一、二壘' }, { value: '2', label: '下一局起二壘' }, { value: '123', label: '下一局起滿壘' }]} className="w-full" /></Field>
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
        {tab === 'bat' && (paView === 'table' ? <EditableTable rows={bat} cols={batCols} onChange={(next) => { touchTable('bat', bat, next); setBat(next) }} blank={blankBat} listId="game-editor-names" names={names} />
          : paPanel('bat') ?? <PaList side="bat" rows={batRows} flags={flags.bat} onOpen={(i) => setSel({ side: 'bat', index: i })} onInsert={(at) => insertPa('bat', at)} extraInnings={extraInningSet} onAddPlaced={(inning, b) => addPlaced('bat', inning, b)} />)}
        {tab === 'pit' && (paView === 'table' ? <EditableTable rows={pit} cols={pitCols} onChange={(next) => { touchTable('pit', pit, next); setPit(next) }} blank={blankPit} listId="game-editor-names" names={names} />
          : paPanel('pit') ?? <PaList side="pit" rows={pitRows} flags={flags.pit} fielderAt={fielderAt} onOpen={(i) => setSel({ side: 'pit', index: i })} onInsert={(at) => insertPa('pit', at)} onAddRelief={addRelief} extraInnings={extraInningSet} onAddPlaced={(inning, b) => addPlaced('pit', inning, b)} />)}
        {tab === 'fld' && (
          <div className="flex flex-col gap-3">
            <ErrorFixNotice fixes={errorFixes} onApply={applyFixes} />
            <EditableTable rows={fld} cols={fldCols} onChange={setFld} blank={blankFld} listId="game-editor-names" names={names} />
          </div>
        )}
        {tab === 'roster' && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[12px] font-medium text-ink-2">先發 <span className="text-muted font-normal">棒次留空＝不打擊的投手（指定打擊時）</span></div>
                {starters.length === 0 && bat.some((p) => p.order) && <Button size="sm" variant="ghost" onClick={inferStarters}>由打席推定先發</Button>}
              </div>
              <EditableTable rows={starters} cols={starterCols} onChange={(next) => { swapSlots(initial.game.dayRoster?.starters ?? [], next); setStarters(next) }} blank={blankStarter} listId="game-editor-names" names={names} />
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
                  {/* in game order (inning, top before bottom, then the row), whatever order they were added in */}
                  {subs.map((x, i) => [x, i] as const).sort(([a], [b]) => (a.inning - b.inning) || (a.half === b.half ? 0 : a.half === 'top' ? -1 : 1) || ((a.row ?? 0) - (b.row ?? 0))).map(([x, i]) => (
                    <li key={i} className="pl-3 pr-1 py-1 tnum flex items-center gap-2 min-h-10">
                      <span className="flex-1 min-w-0">{subText(x)}</span>
                      <button type="button" aria-label={`刪除這筆替補紀錄：${subText(x)}`} onClick={() => setSubs((l) => l.filter((_, k) => k !== i))} className="shrink-0 size-9 pointer-fine:size-8 inline-flex items-center justify-center rounded-[6px] text-muted hover:text-critical hover:bg-surface-2 cursor-pointer"><Trash2 className="size-4" /></button>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-[12px] text-muted">沒有替補紀錄</p>}
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-[12px] font-medium text-ink-2">每局守備 <span className="text-muted font-normal">依先發與替補紀錄；失誤、刺殺、助殺算給當時守那個位置的人</span></div>
              <DefenseByInning roster={rosterNow} innings={Math.max(game.innings ?? 0, ...pitRows.map((p) => p.inning), ...batRows.map((p) => p.inning), 1)} homeAway={game.homeAway} names={names} bench={bench} subs={subs} reentry={reentry}
                onAdd={(x) => { setSubs((l) => [...l, x]); laterBats(x) }} onRemove={(i) => setSubs((l) => l.filter((_, k) => k !== i))} battersIn={(inn) => pitRows.filter((r) => r.inning === inn).length} />
            </div>
          </div>
        )}
      </section>

      {error && <div role="alert" className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--critical)_35%,transparent)] bg-[color-mix(in_srgb,var(--critical)_8%,transparent)] px-3 py-2.5 text-[13px] text-ink"><AlertTriangle className="size-4 shrink-0 mt-0.5 text-critical" />{error}</div>}

      {/* phones: the save bar stays at the bottom of the screen while scrolling through the plate appearances */}
      <div className="flex items-center gap-2 flex-wrap justify-end pt-1 max-sm:sticky max-sm:bottom-2 max-sm:z-10 max-sm:rounded-[var(--radius-sm)] max-sm:border max-sm:border-border max-sm:bg-surface max-sm:px-3 max-sm:py-2 max-sm:shadow-[0_6px_24px_-8px_rgba(0,0,0,0.35)]">
        {changes > 0 && <span aria-live="polite" className="text-[12px] font-medium text-ink-2 tnum mr-auto">{changes} 處修改還沒儲存</span>}
        {missingBall && <span role="status" className="text-[12px] text-warning basis-full sm:basis-auto text-right">{missingBall}<span className="inline-block max-sm:hidden">（清單上標{MISSING_BALL_TAGS}，</span><span className="inline-block max-sm:hidden">可以先儲存）</span></span>}
        <Button variant="outline" onClick={cancel} disabled={busy}>取消</Button>
        <Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? '儲存中…' : '儲存修改'}</Button>
      </div>
      <Button variant="ghost" icon={<Trash2 />} className="self-start -mt-2 text-critical hover:text-critical" disabled={busy} onClick={() => { if (window.confirm(`確定刪除 ${game.id}（${game.date} vs ${game.opponent}）？這會移除這場所有打席與守備紀錄。`)) void onDelete() }}>刪除這場比賽</Button>
    </div>
  )
}
