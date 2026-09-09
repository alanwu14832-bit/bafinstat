import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from './Button'
import { Field, Input, inputCls } from './Input'
import { Select } from './Select'
import { Tabs } from './Tabs'
import { cx } from '../../lib/format'
import type { GameEdit } from '../../data/edit'
import { PA_RESULTS, POSITIONS, type BattingPA, type FieldingLine, type Game, type PitchingPA } from '../../data/types'

/* ------------------------------------------------------------------ generic editable table */
type Kind = 'text' | 'int' | 'select' | 'name'
interface Col<T> { key: keyof T & string; label: string; kind: Kind; options?: readonly string[]; w?: number; list?: string }

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
      <datalist id={listId}>{names.map((n) => <option key={n} value={n} />)}</datalist>
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
                        {c.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                  )
                }
                return (
                  <td key={c.key} className="px-1 py-1">
                    <input value={str} list={c.kind === 'name' ? listId : undefined} inputMode={c.kind === 'int' ? 'numeric' : undefined}
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
type PitDraft = Omit<PitchingPA, 'pitches'> & { pitchesText: string }
const toBatDraft = (p: BattingPA): BatDraft => { const { pitches, ...rest } = p; return { ...rest, pitchesText: pitches.join(' ') } }
const toPitDraft = (p: PitchingPA): PitDraft => { const { pitches, ...rest } = p; return { ...rest, pitchesText: pitches.join(' ') } }
const parsePitches = (t: string) => t.toUpperCase().split(/[\s,，、/]+/).filter(Boolean)
const fromBatDraft = (d: BatDraft): BattingPA => { const { pitchesText, ...rest } = d; return { ...rest, pitches: parsePitches(pitchesText), sb: +rest.sb || 0, cs: +rest.cs || 0, advOnError: +rest.advOnError || 0, outOnBase: +rest.outOnBase || 0, run: +rest.run || 0, rbi: +rest.rbi || 0, inning: +rest.inning || 0 } }
const fromPitDraft = (d: PitDraft): PitchingPA => { const { pitchesText, ...rest } = d; return { ...rest, pitches: parsePitches(pitchesText), sba: +rest.sba || 0, cs: +rest.cs || 0, wp: +rest.wp || 0, pb: +rest.pb || 0, pk: +rest.pk || 0, inning: +rest.inning || 0 } }

const CODES = ['I', 'II', 'III', 'L', 'R', 'ER'] as const
const BASES = ['無', '1', '2', '3', '12', '13', '23', '123'] as const
const TRAJ = ['G', 'F', 'L'] as const
const QUAL = ['強', '中', '弱'] as const
const LOCS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

const batCols: Col<BatDraft>[] = [
  { key: 'inning', label: '局', kind: 'int', w: 40 }, { key: 'outsBefore', label: '出局前', kind: 'int', w: 48 }, { key: 'basesBefore', label: '壘上前', kind: 'select', options: BASES, w: 64 },
  { key: 'order', label: '棒次', kind: 'int', w: 44 }, { key: 'pos', label: '守位', kind: 'select', options: POSITIONS, w: 60 }, { key: 'batter', label: '打者', kind: 'name', w: 96 },
  { key: 'pitchesText', label: '逐球（SS CS S F IP B）', kind: 'text', w: 170 }, { key: 'result', label: '結果', kind: 'select', options: PA_RESULTS, w: 76 },
  { key: 'loc', label: '落點', kind: 'select', options: LOCS, w: 52 }, { key: 'traj', label: '軌跡', kind: 'select', options: TRAJ, w: 52 }, { key: 'quality', label: '強度', kind: 'select', options: QUAL, w: 52 },
  { key: 'sb', label: '盜壘', kind: 'int', w: 44 }, { key: 'cs', label: '盜失', kind: 'int', w: 44 }, { key: 'advOnError', label: '失誤進壘', kind: 'int', w: 56 }, { key: 'outOnBase', label: '壘死', kind: 'int', w: 44 },
  { key: 'run', label: '得分', kind: 'int', w: 44 }, { key: 'rbi', label: '打點', kind: 'int', w: 44 }, { key: 'code', label: '代碼', kind: 'select', options: CODES, w: 56 }, { key: 'note', label: '備註', kind: 'text', w: 120 },
]
const pitCols: Col<PitDraft>[] = [
  { key: 'inning', label: '局', kind: 'int', w: 40 }, { key: 'outsBefore', label: '出局前', kind: 'int', w: 48 }, { key: 'basesBefore', label: '壘上前', kind: 'select', options: BASES, w: 64 },
  { key: 'oppOrder', label: '對方棒次', kind: 'int', w: 56 }, { key: 'pitcher', label: '投手', kind: 'name', w: 96 }, { key: 'oppBatter', label: '對方打者', kind: 'text', w: 88 },
  { key: 'pitchesText', label: '逐球（SS CS S F IP B）', kind: 'text', w: 170 }, { key: 'result', label: '結果', kind: 'select', options: PA_RESULTS, w: 76 },
  { key: 'loc', label: '落點', kind: 'select', options: LOCS, w: 52 }, { key: 'traj', label: '軌跡', kind: 'select', options: TRAJ, w: 52 }, { key: 'quality', label: '強度', kind: 'select', options: QUAL, w: 52 },
  { key: 'sba', label: '被盜', kind: 'int', w: 44 }, { key: 'cs', label: '阻殺', kind: 'int', w: 44 }, { key: 'wp', label: '暴投', kind: 'int', w: 44 }, { key: 'pb', label: '捕逸', kind: 'int', w: 44 }, { key: 'pk', label: '牽制', kind: 'int', w: 44 },
  { key: 'code', label: '代碼', kind: 'select', options: CODES, w: 56 }, { key: 'note', label: '備註', kind: 'text', w: 120 },
]
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
  const [tab, setTab] = useState<'bat' | 'pit' | 'fld'>('bat')
  const [error, setError] = useState<string | null>(null)
  const names = useMemo(() => [...new Set([...roster, ...bat.map((p) => p.batter), ...pit.map((p) => p.pitcher)])].filter(Boolean), [roster, bat, pit])
  const g = <K extends keyof Game>(k: K, v: Game[K]) => setGame((s) => ({ ...s, [k]: v }))
  const text = (k: keyof Game) => (e: React.ChangeEvent<HTMLInputElement>) => g(k, (e.target.value || undefined) as never)

  const save = async () => {
    setError(null)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(game.date)) { setError('日期格式需為 YYYY-MM-DD'); return }
    if (!game.opponent?.trim()) { setError('請填對手'); return }
    try {
      await onSave({ game: { ...game, tournament: game.tournament?.trim() || '未分類', opponent: game.opponent.trim() }, batting: bat.map(fromBatDraft).filter((p) => p.batter.trim()), pitching: pit.map(fromPitDraft).filter((p) => p.pitcher.trim()), fielding: fld.filter((f) => f.player.trim()).map((f) => ({ ...f, po: +f.po || 0, a: +f.a || 0, e: +f.e || 0, dp: +f.dp || 0, pb: +f.pb || 0, sb: +f.sb || 0, cs: +f.cs || 0 })) })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const blankBat = (prev?: BatDraft): BatDraft => ({ gameId: game.id, inning: prev?.inning ?? 1, batter: '', pitchesText: '', result: '', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0, order: prev?.order ? (prev.order % 9) + 1 : undefined })
  const blankPit = (prev?: PitDraft): PitDraft => ({ gameId: game.id, inning: prev?.inning ?? 1, pitcher: prev?.pitcher ?? '', pitchesText: '', result: '', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0, oppOrder: prev?.oppOrder ? (prev.oppOrder % 9) + 1 : undefined })
  const blankFld = (): FieldingLine => ({ gameId: game.id, player: '', pos: '', innings: game.innings, po: 0, a: 0, e: 0, dp: 0, pb: 0, sb: 0, cs: 0 })

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <div className="text-[13px] font-semibold text-ink">比賽資訊 <span className="text-muted font-normal ml-1 tnum">{game.id}</span></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="日期"><Input type="date" value={game.date} onChange={(e) => g('date', e.target.value)} className="tnum" /></Field>
          <Field label="時間"><Input type="time" value={game.time ?? ''} onChange={text('time')} className="tnum" /></Field>
          <Field label="杯賽"><Input value={game.tournament} onChange={(e) => g('tournament', e.target.value)} /></Field>
          <Field label="對手"><Input value={game.opponent} onChange={(e) => g('opponent', e.target.value)} /></Field>
          <Field label="主客"><Select value={game.homeAway} onChange={(e) => g('homeAway', e.target.value as Game['homeAway'])} options={[{ value: '主', label: '主場' }, { value: '客', label: '客場' }]} className="w-full" /></Field>
          <Field label="場地"><Input value={game.venue ?? ''} onChange={text('venue')} /></Field>
          <Field label="天氣"><Input value={game.weather ?? ''} onChange={text('weather')} /></Field>
          <Field label="局數"><Input type="number" min={1} max={12} value={game.innings ?? ''} onChange={(e) => g('innings', e.target.value ? Number(e.target.value) : undefined)} className="tnum" /></Field>
          <Field label="勝投"><Input list="game-editor-names" value={game.winningPitcher ?? ''} onChange={text('winningPitcher')} /></Field>
          <Field label="敗投"><Input list="game-editor-names" value={game.losingPitcher ?? ''} onChange={text('losingPitcher')} /></Field>
          <Field label="救援"><Input list="game-editor-names" value={game.savePitcher ?? ''} onChange={text('savePitcher')} /></Field>
          <Field label="紀錄者"><Input value={game.recorder ?? ''} onChange={text('recorder')} /></Field>
          <Field label="備註" className="col-span-2 md:col-span-4"><Input value={game.note ?? ''} onChange={text('note')} /></Field>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Tabs size="sm" aria-label="編輯區" value={tab} onChange={setTab} items={[{ value: 'bat', label: '我隊打擊', count: bat.length }, { value: 'pit', label: '我隊投球', count: pit.length }, { value: 'fld', label: '守備', count: fld.length }]} />
          <span className="text-xs text-muted">局／出局(前) 留空會由結果代碼自動補算；守備留空會由打席推定。</span>
        </div>
        {tab === 'bat' && <EditableTable rows={bat} cols={batCols} onChange={setBat} blank={blankBat} listId="game-editor-names" names={names} />}
        {tab === 'pit' && <EditableTable rows={pit} cols={pitCols} onChange={setPit} blank={blankPit} listId="game-editor-names" names={names} />}
        {tab === 'fld' && <EditableTable rows={fld} cols={fldCols} onChange={setFld} blank={blankFld} listId="game-editor-names" names={names} />}
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
