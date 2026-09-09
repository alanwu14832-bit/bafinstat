import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightLeft, ChevronDown, CloudDownload, Flag, RefreshCw, Save, Undo2, X } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Tabs } from '../components/ui/Tabs'
import { CloudPanel } from '../components/ui/CloudPanel'
import { BattingPlayByPlay, PitchChips, PitchingPlayByPlay } from '../components/ui/PlayByPlay'
import { useDataStore } from '../store/data'
import { deleteCloudDraft, listCloudDrafts, saveCloudDraft, type CloudDraft } from '../data/supabase'
import { useFilterOptions } from '../hooks/useStats'
import { TEAM_NAME } from '../data/seed'
import { POSITIONS, type Game } from '../data/types'
import { cx } from '../lib/format'
import {
  addExtra, addPitch, changePitcher, commitPA, count, defaultPlan, defaultRbi, endHalf, impliedResult, newGame, nextGameId, offense, runnerEvent, score, setOppBatter, setOppOrder, setSlot, substitute, toGameEdit, toggleEarned, undoPitch,
  type Dest, type LineupSlot, type PAPlan, type RecordState, type Runner, type RunnerEvent,
} from '../record/model'

const DRAFT_KEY = 'bafin.record.draft.v1'
const readDraft = (): RecordState | null => { try { const v = localStorage.getItem(DRAFT_KEY); return v ? (JSON.parse(v) as RecordState) : null } catch { return null } }
const writeDraft = (s: RecordState | null) => { try { if (s) localStorage.setItem(DRAFT_KEY, JSON.stringify(s)); else localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ } }

const PITCH_BUTTONS: Array<{ code: string; label: string; hint: string }> = [
  { code: 'B', label: '壞球', hint: 'B' }, { code: 'CS', label: '好球・未揮', hint: 'CS' }, { code: 'SS', label: '揮空', hint: 'SS' }, { code: 'F', label: '界外', hint: 'F' }, { code: 'IP', label: '擊進場內', hint: 'IP' },
]
const RESULT_GROUPS: Array<{ label: string; items: string[] }> = [
  { label: '安打', items: ['一安', '二安', '三安', '全壘打'] },
  { label: '上壘', items: ['保送', '故四', '觸身', '失誤', '野選', '妨礙'] },
  { label: '出局', items: ['三振', '內滾', '內飛', '外飛', '犧觸', '犧飛', '雙殺'] },
]
const LOC_GRID: Array<Array<number | null>> = [[7, 8, 9], [5, 6, 4], [null, 1, 3], [null, 2, null]]
const LOC_LABEL: Record<number, string> = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF' }
const RUNNER_EVENTS: Array<{ ev: RunnerEvent; label: string; side?: 'us' | 'opp' }> = [
  { ev: 'sb', label: '盜壘' }, { ev: 'cs', label: '盜壘失敗' }, { ev: 'wp', label: '暴投進壘', side: 'opp' }, { ev: 'pb', label: '捕逸進壘', side: 'opp' }, { ev: 'err', label: '失誤進壘', side: 'us' },
  { ev: 'advance', label: '進一個壘' }, { ev: 'pk', label: '牽制出局' }, { ev: 'score', label: '得分' }, { ev: 'out', label: '壘死' },
]
const big = 'h-12 rounded-[var(--radius-sm)] border border-border bg-surface text-[14px] font-medium text-ink hover:bg-surface-2 active:bg-surface-3 cursor-pointer transition-colors motion-reduce:transition-none'
const chip = (active: boolean) => cx('h-9 px-3 rounded-[var(--radius-sm)] border text-[13px] font-medium cursor-pointer transition-colors motion-reduce:transition-none', active ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink hover:bg-surface-2')

/* ------------------------------------------------------------------ setup */
function Setup({ onStart }: { onStart: (s: RecordState) => void }) {
  const base = useDataStore((s) => s.base)
  const opts = useFilterOptions()
  const roster = base.roster.map((p) => p.name)
  const today = new Date().toISOString().slice(0, 10)
  const last = useMemo(() => [...base.games].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [base.games])
  const [game, setGame] = useState<Game>({ id: '', date: today, tournament: last?.tournament ?? '友誼賽', opponent: '', homeAway: '主', venue: last?.venue ?? '', innings: 7, recorder: '' })
  const [lineup, setLineup] = useState<LineupSlot[]>(() => {
    const slots: LineupSlot[] = Array.from({ length: 9 }, () => ({ name: '', pos: '' }))
    if (last) for (const p of base.batting.filter((b) => b.gameId === last.id)) { const i = (p.order ?? 0) - 1; if (i >= 0 && i < 9 && !slots[i].name) slots[i] = { name: p.batter, pos: p.pos ?? '' } }
    return slots
  })
  const [pitcher, setPitcher] = useState(() => (last ? base.pitching.find((p) => p.gameId === last.id)?.pitcher ?? '' : ''))
  const [error, setError] = useState<string | null>(null)
  const g = <K extends keyof Game>(k: K, v: Game[K]) => setGame((s) => ({ ...s, [k]: v }))
  const start = () => {
    if (!game.opponent.trim()) { setError('請填對手'); return }
    if (!lineup.some((l) => l.name.trim())) { setError('請至少填一位先發打者'); return }
    if (!pitcher.trim()) { setError('請填先發投手'); return }
    const id = nextGameId(game.date, base.games.map((x) => x.id))
    onStart(newGame({ ...game, id, opponent: game.opponent.trim(), tournament: game.tournament.trim() || '未分類', venue: game.venue || undefined, recorder: game.recorder || undefined }, lineup.filter((l) => l.name.trim()).map((l) => ({ name: l.name.trim(), pos: l.pos })), pitcher.trim()))
  }
  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 md:gap-5 items-start">
      <Card className="xl:col-span-2" title="比賽資訊" subtitle="比賽ID 會依日期自動編號">
        <datalist id="rec-roster">{roster.map((n) => <option key={n} value={n} />)}</datalist>
        <datalist id="rec-tournaments">{opts.tournaments.map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="rec-opponents">{opts.opponents.map((t) => <option key={t} value={t} />)}</datalist>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日期"><Input type="date" value={game.date} onChange={(e) => g('date', e.target.value)} className="tnum" /></Field>
          <Field label="時間"><Input type="time" value={game.time ?? ''} onChange={(e) => g('time', e.target.value || undefined)} className="tnum" /></Field>
          <Field label="杯賽"><Input list="rec-tournaments" value={game.tournament} onChange={(e) => g('tournament', e.target.value)} /></Field>
          <Field label="對手"><Input list="rec-opponents" value={game.opponent} onChange={(e) => g('opponent', e.target.value)} placeholder="必填" /></Field>
          <Field label="主客"><Select value={game.homeAway} onChange={(e) => g('homeAway', e.target.value as Game['homeAway'])} options={[{ value: '主', label: '主場（對方先攻）' }, { value: '客', label: '客場（我隊先攻）' }]} className="w-full" /></Field>
          <Field label="預定局數"><Input type="number" min={1} max={12} value={game.innings ?? 7} onChange={(e) => g('innings', Number(e.target.value) || 7)} className="tnum" /></Field>
          <Field label="場地"><Input value={game.venue ?? ''} onChange={(e) => g('venue', e.target.value)} /></Field>
          <Field label="紀錄者"><Input value={game.recorder ?? ''} onChange={(e) => g('recorder', e.target.value)} /></Field>
        </div>
      </Card>
      <Card className="xl:col-span-3" title="先發打序與守位" subtitle={last ? `已帶入上一場（${last.date} vs ${last.opponent}）的打序，可直接修改` : '輸入九位先發'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
          {lineup.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="size-7 rounded-[6px] bg-surface-2 text-[12px] font-semibold grid place-items-center tnum shrink-0">{i + 1}</span>
              <Input list="rec-roster" value={l.name} onChange={(e) => setLineup((ls) => ls.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="球員" className="flex-1" />
              <Select value={l.pos} onChange={(e) => setLineup((ls) => ls.map((x, k) => (k === i ? { ...x, pos: e.target.value } : x)))} options={[{ value: '', label: '守位' }, ...POSITIONS.map((p) => ({ value: p, label: p }))]} className="w-[92px]" />
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <Field label="先發投手"><Input list="rec-roster" value={pitcher} onChange={(e) => setPitcher(e.target.value)} placeholder="必填" /></Field>
          <div className="flex flex-col gap-2 sm:items-end">
            {error && <span className="text-[13px] text-critical">{error}</span>}
            <Button variant="primary" size="lg" onClick={start} className="w-full sm:w-auto">開始紀錄</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ live */
function Diamond({ runners }: { runners: Runner[] }) {
  const on = (b: number) => runners.some((r) => r.base === b)
  const sq = (cx_: number, cy: number, b: number) => <rect key={b} x={cx_ - 9} y={cy - 9} width={18} height={18} transform={`rotate(45 ${cx_} ${cy})`} fill={on(b) ? 'var(--ink)' : 'var(--surface-3)'} stroke="var(--border-strong)" strokeWidth={1} />
  return <svg viewBox="0 0 100 80" className="w-[84px] h-[68px] shrink-0" aria-hidden>{sq(78, 46, 1)}{sq(50, 18, 2)}{sq(22, 46, 3)}<rect x={44} y={64} width={12} height={12} transform="rotate(45 50 70)" fill="var(--surface-3)" stroke="var(--border-strong)" /></svg>
}

function Live({ state, apply, undo, canUndo, onFinish, onSaveDraft, saving }: { state: RecordState; apply: (fn: (s: RecordState) => RecordState) => void; undo: () => void; canUndo: boolean; onFinish: () => void; onSaveDraft: () => void; saving: boolean }) {
  const base = useDataStore((s) => s.base)
  const roster = base.roster.map((p) => p.name)
  const side = offense(state)
  const sc = score(state)
  const c = count(state.pitches)
  const [plan, setPlan] = useState<PAPlan | null>(null)
  const [rbiTouched, setRbiTouched] = useState(false)
  const [runnerMenu, setRunnerMenu] = useState<number | null>(null)
  const [tool, setTool] = useState<'none' | 'pitcher' | 'lineup'>('none')
  const [logTab, setLogTab] = useState<'bat' | 'pit'>(side === 'us' ? 'bat' : 'pit')
  useEffect(() => { setLogTab(side === 'us' ? 'bat' : 'pit'); setPlan(null); setRunnerMenu(null) }, [side, state.inning])
  const implied = impliedResult(state.pitches)
  useEffect(() => { if (implied && !plan) choose(implied) /* eslint-disable-line react-hooks/exhaustive-deps */ }, [implied])

  const batterSlot = state.lineup[state.slot]
  const choose = (result: string) => { setPlan(defaultPlan(state, result)); setRbiTouched(false) }
  const setDest = (row: number | 'batter', d: Dest) => setPlan((p) => {
    if (!p) return p
    const next = row === 'batter' ? { ...p, batter: d } : { ...p, runners: { ...p.runners, [row]: d } }
    return rbiTouched ? next : { ...next, rbi: defaultRbi(next) }
  })
  const confirm = () => { if (!plan) return; apply((s) => commitPA(s, plan)); setPlan(null) }
  const halfLabel = `${state.inning} ${state.half === 'top' ? '上' : '下'}`
  const oppName = state.game.opponent
  const willEnd = plan ? state.outs + (plan.batter === 'out' ? 1 : 0) + Object.values(plan.runners).filter((d) => d === 'out').length >= 3 : false

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-5 items-start">
      <div className="xl:col-span-8 flex flex-col gap-4 md:gap-5 min-w-0">
        {/* scoreboard */}
        <Card bodyClassName="p-4 md:p-5">
          <div className="flex items-center gap-4 md:gap-6 flex-wrap">
            <div className="flex items-center gap-3 tnum">
              <div className="text-right"><div className="text-[12px] text-muted truncate max-w-[120px]">{TEAM_NAME}</div><div className="text-[28px] font-semibold leading-none tracking-[-0.02em]">{sc.us}</div></div>
              <span className="text-muted text-[20px]">:</span>
              <div><div className="text-[12px] text-muted truncate max-w-[120px]">{oppName}</div><div className="text-[28px] font-semibold leading-none tracking-[-0.02em]">{sc.opp}</div></div>
            </div>
            <div className="h-10 w-px bg-border hidden sm:block" />
            <div className="flex items-center gap-3">
              <div>
                <div className="text-[15px] font-semibold text-ink">第 {halfLabel}</div>
                <div className="text-[12px] text-ink-2">{side === 'us' ? '我隊進攻' : '對方進攻'}・{state.outs} 出局</div>
                <div className="flex gap-1 mt-1" aria-label={`${state.outs} 出局`}>{[0, 1, 2].map((i) => <span key={i} className={cx('size-2.5 rounded-full', i < state.outs ? 'bg-ink' : 'bg-surface-3')} />)}</div>
              </div>
              <Diamond runners={state.runners} />
            </div>
            <div className="ml-auto flex items-center gap-1.5 flex-wrap">
              <Button variant="ghost" size="sm" icon={<Undo2 />} onClick={undo} disabled={!canUndo}>復原</Button>
              <Button variant="ghost" size="sm" icon={<Save />} onClick={onSaveDraft} disabled={saving}>{saving ? '儲存中…' : '儲存到雲端'}</Button>
              <Button variant="outline" size="sm" icon={<Flag />} onClick={onFinish}>結束比賽</Button>
            </div>
          </div>
          {state.runners.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2 items-start">
              <span className="text-[12px] text-muted h-8 inline-flex items-center">壘上</span>
              {state.runners.map((r) => (
                <div key={`${r.side}-${r.row}`} className="relative">
                  <button type="button" onClick={() => setRunnerMenu(runnerMenu === r.row ? null : r.row)} className={cx(chip(runnerMenu === r.row), 'h-8 inline-flex items-center gap-1.5')}>
                    <span className="text-muted tnum">{r.base}B</span>{r.name}<ChevronDown className="size-3.5 text-muted" />
                  </button>
                  {runnerMenu === r.row && (
                    <div className="absolute left-0 top-9 z-20 bg-surface border border-border rounded-[var(--radius-sm)] shadow-[var(--shadow-hover)] p-1.5 grid grid-cols-2 gap-1 w-[220px]">
                      {RUNNER_EVENTS.filter((e) => !e.side || e.side === r.side).map((e) => (
                        <button key={e.ev} type="button" onClick={() => { apply((s) => runnerEvent(s, r.row, r.side, e.ev)); setRunnerMenu(null) }}
                          className={cx('h-8 px-2 rounded-[6px] text-[12px] font-medium text-left hover:bg-surface-2 cursor-pointer', (e.ev === 'cs' || e.ev === 'pk' || e.ev === 'out') && 'text-critical')}>{e.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* current plate appearance */}
        <Card bodyClassName="p-4 md:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {side === 'us' ? (
              <div className="flex items-center gap-3 min-w-0">
                <span className="size-10 rounded-[8px] bg-ink text-bg grid place-items-center text-[14px] font-semibold tnum shrink-0">{state.slot + 1}</span>
                <div className="min-w-0"><div className="text-[16px] font-semibold text-ink leading-5 truncate">{batterSlot?.name ?? '—'} <span className="text-muted font-normal text-[13px]">{batterSlot?.pos}</span></div><div className="text-[12px] text-ink-2">我隊打者・第 {state.slot + 1} 棒</div></div>
              </div>
            ) : (
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="size-10 rounded-[8px] bg-surface-2 text-ink grid place-items-center text-[14px] font-semibold tnum shrink-0">{state.oppOrder}</span>
                <div className="min-w-0 flex-1"><Input value={state.oppBatter} onChange={(e) => apply((s) => setOppBatter(s, e.target.value))} placeholder={`對方第 ${state.oppOrder} 棒（姓名可留空）`} size="sm" className="max-w-[260px]" /><div className="text-[12px] text-ink-2 mt-1">我隊投手 <span className="font-medium text-ink">{state.pitcher}</span></div></div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="text-[13px] tnum text-ink-2">B <span className="text-ink font-semibold text-[18px]">{c.balls}</span> <span className="mx-1 text-muted">–</span> S <span className="text-ink font-semibold text-[18px]">{c.strikes}</span></div>
              <Button variant="ghost" size="sm" onClick={() => setTool(tool === 'none' ? (side === 'us' ? 'lineup' : 'pitcher') : 'none')} icon={<ArrowRightLeft />}>{side === 'us' ? '代打／換人' : '換投'}</Button>
            </div>
          </div>
          {tool === 'pitcher' && (
            <div className="mt-3 flex items-end gap-2 flex-wrap">
              <Field label="換上投手" className="flex-1 min-w-[200px]"><Input list="rec-roster" defaultValue="" placeholder="輸入球員名" onKeyDown={(e) => { if (e.key === 'Enter') { const v = (e.target as HTMLInputElement).value.trim(); if (v) { apply((s) => changePitcher(s, v)); setTool('none') } } }} id="rec-newpitcher" /></Field>
              <Button onClick={() => { const v = (document.getElementById('rec-newpitcher') as HTMLInputElement | null)?.value.trim(); if (v) { apply((s) => changePitcher(s, v)); setTool('none') } }}>確定換投</Button>
              <Button variant="ghost" onClick={() => setTool('none')} icon={<X />} aria-label="取消" />
            </div>
          )}
          {tool === 'lineup' && (
            <div className="mt-3 flex items-end gap-2 flex-wrap">
              <Field label={`第 ${state.slot + 1} 棒換成`} className="flex-1 min-w-[180px]"><Input list="rec-roster" placeholder="球員名" id="rec-sub-name" /></Field>
              <Field label="守位／代打"><Select id="rec-sub-pos" defaultValue="PH" options={POSITIONS.map((p) => ({ value: p, label: p }))} /></Field>
              <Button onClick={() => { const n = (document.getElementById('rec-sub-name') as HTMLInputElement | null)?.value.trim(); const p = (document.getElementById('rec-sub-pos') as HTMLSelectElement | null)?.value ?? ''; if (n) { apply((s) => substitute(s, s.slot, n, p)); setTool('none') } }}>確定</Button>
              <Button variant="ghost" onClick={() => setTool('none')} icon={<X />} aria-label="取消" />
            </div>
          )}
          <datalist id="rec-roster">{roster.map((n) => <option key={n} value={n} />)}</datalist>

          <div className="mt-4 flex items-center gap-2 min-h-7">
            <span className="text-[12px] text-muted shrink-0">逐球</span>
            <PitchChips pitches={state.pitches} />
            {state.pitches.length > 0 && <button type="button" onClick={() => apply(undoPitch)} className="ml-auto text-[12px] text-ink-2 hover:text-ink cursor-pointer underline underline-offset-2">刪最後一球</button>}
          </div>
          <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
            {PITCH_BUTTONS.map((b) => (
              <button key={b.code} type="button" onClick={() => apply((s) => addPitch(s, b.code))} disabled={!!plan} className={cx(big, 'flex flex-col items-center justify-center leading-tight disabled:opacity-40')}>
                <span>{b.label}</span><span className="text-[10px] text-muted tnum">{b.hint}</span>
              </button>
            ))}
          </div>
          {side === 'opp' && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {([['wp', '暴投'], ['pb', '捕逸'], ['pk', '牽制出局']] as const).map(([k, label]) => (
                <span key={k} className="inline-flex items-center gap-1 text-[12px] text-ink-2">
                  <button type="button" onClick={() => apply((s) => addExtra(s, k))} className="h-7 px-2 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer">{label}</button>
                  {state.extras[k] > 0 && <span className="tnum text-ink font-medium">×{state.extras[k]}</span>}
                </span>
              ))}
              <span className="text-[11px] text-muted self-center ml-1">跑者的盜壘、進壘請點上方壘上的跑者</span>
            </div>
          )}

          {!plan ? (
            <div className="mt-4 flex flex-col gap-2.5">
              {RESULT_GROUPS.map((g) => (
                <div key={g.label} className="flex items-start gap-2">
                  <span className="text-[12px] text-muted w-8 shrink-0 h-9 inline-flex items-center">{g.label}</span>
                  <div className="flex flex-wrap gap-1.5">{g.items.map((r) => <button key={r} type="button" onClick={() => choose(r)} className={chip(false)}>{r}</button>)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[var(--radius-sm)] border border-ink/20 bg-surface-2/50 p-3 md:p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[14px] font-semibold text-ink">{plan.result}<span className="text-muted font-normal text-[12px] ml-2">確認細節後送出</span></div>
                <button type="button" onClick={() => setPlan(null)} className="text-[12px] text-ink-2 hover:text-ink cursor-pointer inline-flex items-center gap-1"><X className="size-3.5" />改結果</button>
              </div>
              {plan.result !== '三振' && plan.result !== '保送' && plan.result !== '故四' && plan.result !== '觸身' && plan.result !== '妨礙' && (
                <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3">
                  <div>
                    <div className="text-[12px] text-ink-2 mb-1">落點</div>
                    <div className="grid grid-cols-3 gap-1 w-[150px]">
                      {LOC_GRID.flat().map((n, i) => n === null ? <span key={i} /> : (
                        <button key={i} type="button" onClick={() => setPlan({ ...plan, loc: plan.loc === n ? undefined : n })} className={cx('h-9 rounded-[6px] border text-[12px] font-medium tnum cursor-pointer', plan.loc === n ? 'border-ink bg-ink text-bg' : 'border-border bg-surface hover:bg-surface-2')}>{n} <span className="opacity-70">{LOC_LABEL[n]}</span></button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div><div className="text-[12px] text-ink-2 mb-1">軌跡</div><div className="flex gap-1.5">{(['G', 'F', 'L'] as const).map((t) => <button key={t} type="button" onClick={() => setPlan({ ...plan, traj: plan.traj === t ? undefined : t })} className={chip(plan.traj === t)}>{t === 'G' ? '滾地 G' : t === 'F' ? '飛球 F' : '平飛 L'}</button>)}</div></div>
                    <div><div className="text-[12px] text-ink-2 mb-1">強度</div><div className="flex gap-1.5">{(['強', '中', '弱'] as const).map((q) => <button key={q} type="button" onClick={() => setPlan({ ...plan, quality: plan.quality === q ? undefined : q })} className={chip(plan.quality === q)}>{q}</button>)}</div></div>
                  </div>
                </div>
              )}
              <div>
                <div className="text-[12px] text-ink-2 mb-1">跑者去向</div>
                <div className="flex flex-col gap-1.5">
                  {[...state.runners].sort((a, b) => b.base - a.base).map((r) => (
                    <DestRow key={r.row} label={`${r.base}B ${r.name}`} value={plan.runners[r.row] ?? r.base} onChange={(d) => setDest(r.row, d)} min={r.base} />
                  ))}
                  <DestRow label={`打者 ${side === 'us' ? batterSlot?.name ?? '' : state.oppBatter || `第 ${state.oppOrder} 棒`}`} value={plan.batter} onChange={(d) => setDest('batter', d)} min={1} batter />
                </div>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                {side === 'us' && (
                  <div className="inline-flex items-center gap-2 text-[13px]"><span className="text-ink-2">打點</span>
                    <button type="button" onClick={() => { setRbiTouched(true); setPlan({ ...plan, rbi: Math.max(0, plan.rbi - 1) }) }} className="size-8 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer">−</button>
                    <span className="tnum font-semibold w-4 text-center">{plan.rbi}</span>
                    <button type="button" onClick={() => { setRbiTouched(true); setPlan({ ...plan, rbi: plan.rbi + 1 }) }} className="size-8 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer">＋</button>
                  </div>
                )}
                {side === 'opp' && (Object.values(plan.runners).includes('home') || plan.batter === 'home') && (
                  <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer"><input type="checkbox" checked={plan.earned} onChange={(e) => setPlan({ ...plan, earned: e.target.checked })} className="size-4 accent-[var(--ink)]" />失分為自責分（ER）</label>
                )}
                <div className="ml-auto flex gap-2">
                  <Button variant="primary" size="lg" onClick={confirm}>{willEnd ? '送出並結束半局' : '送出這個打席'}</Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="xl:col-span-4 flex flex-col gap-4 md:gap-5 min-w-0">
        <Card title="打線" subtitle="點棒次可跳到該打者" flush>
          <ul className="divide-y divide-[var(--border)]">
            {state.lineup.map((l, i) => (
              <li key={i}>
                <button type="button" onClick={() => apply((s) => setSlot(s, i))} className={cx('w-full flex items-center gap-3 px-4 py-2 text-left cursor-pointer', i === state.slot && side === 'us' ? 'bg-surface-2' : 'hover:bg-surface-2/60')}>
                  <span className={cx('size-7 rounded-[6px] grid place-items-center text-[12px] font-semibold tnum', i === state.slot ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2')}>{i + 1}</span>
                  <span className="text-[13px] font-medium text-ink flex-1 truncate">{l.name}</span>
                  <span className="text-[12px] text-muted">{l.pos}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="px-4 py-2.5 border-t border-border text-[12px] text-ink-2 flex items-center justify-between">
            <span>投手 <span className="font-medium text-ink">{state.pitcher}</span></span>
            {side === 'opp' && <button type="button" onClick={() => apply((s) => setOppOrder(s, s.oppOrder + 1))} className="underline underline-offset-2 hover:text-ink cursor-pointer">跳過對方這棒</button>}
          </div>
        </Card>
        <Card title="逐打席" action={<div className="flex items-center gap-2"><Tabs size="sm" aria-label="紀錄" value={logTab} onChange={setLogTab} items={[{ value: 'bat', label: '打擊', count: state.batting.length }, { value: 'pit', label: '投球', count: state.pitching.length }]} /><Button variant="ghost" size="sm" onClick={() => { if (window.confirm('確定手動結束這個半局？壘上跑者會記為殘壘。')) apply(endHalf) }}>結束半局</Button></div>} flush>
          <div className="max-h-[420px] overflow-y-auto">
            {logTab === 'bat' ? <BattingPlayByPlay pas={state.batting} /> : <PitchingPlayByPlay pas={state.pitching} />}
          </div>
          {logTab === 'pit' && state.pitching.some((p) => p.code === 'R' || p.code === 'ER') && (
            <div className="px-4 py-2.5 border-t border-border text-[12px] text-ink-2 flex flex-wrap gap-2 items-center">
              <span>失分性質：</span>
              {state.pitching.map((p, i) => (p.code === 'R' || p.code === 'ER') ? <button key={i} type="button" onClick={() => apply((s) => toggleEarned(s, i))} className="h-7 px-2 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer tnum">{p.inning} 局 {p.oppBatter || `${p.oppOrder} 棒`}：<span className="font-medium text-ink">{p.code}</span></button> : null)}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function DestRow({ label, value, onChange, min, batter }: { label: string; value: Dest; onChange: (d: Dest) => void; min: number; batter?: boolean }) {
  const opts: Array<{ v: Dest; l: string }> = [{ v: 'out', l: '出局' }, { v: 1, l: '1B' }, { v: 2, l: '2B' }, { v: 3, l: '3B' }, { v: 'home', l: '得分' }]
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[13px] text-ink w-[132px] truncate">{label}</span>
      <div className="inline-flex rounded-[var(--radius-sm)] bg-surface p-0.5 gap-0.5 border border-border">
        {opts.filter((o) => batter || o.v === 'out' || o.v === 'home' || (typeof o.v === 'number' && o.v >= min)).map((o) => (
          <button key={String(o.v)} type="button" onClick={() => onChange(o.v)} className={cx('h-8 px-2.5 rounded-[6px] text-[12px] font-medium cursor-pointer', value === o.v ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink hover:bg-surface-2', o.v === 'out' && value !== o.v && 'text-critical')}>{o.l}</button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */
export function RecordPage() {
  const navigate = useNavigate()
  const cloud = useDataStore((s) => s.cloud)
  const saveGame = useDataStore((s) => s.saveGame)
  const [state, setState] = useState<RecordState | null>(() => readDraft())
  const [history, setHistory] = useState<RecordState[]>([])
  const [finish, setFinish] = useState<{ w: string; l: string; sv: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [autoSaved, setAutoSaved] = useState<string | null>(null)
  // 1) every change is written to this device immediately (survives refresh, closing the tab, the phone dying)
  useEffect(() => { writeDraft(state) }, [state])
  // 2) in cloud mode, every completed play is pushed to Supabase a moment later, so nothing is lost even if the phone is lost
  const playsKey = state ? `${state.batting.length}/${state.pitching.length}/${state.inning}${state.half}/${state.outs}/${state.batting.map((p) => p.code ?? '').join('')}${state.pitching.map((p) => p.code ?? '').join('')}` : ''
  useEffect(() => {
    if (!state || !cloud.configured || !cloud.user || !(state.batting.length || state.pitching.length)) return
    const t = window.setTimeout(() => {
      void saveGame(toGameEdit(state))
        .then(() => saveCloudDraft(state.game.id, state, cloud.user?.email))
        .then((ok) => { if (ok === false) setDraftsSupported(false); setAutoSaved(new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })) })
        .catch((e) => setMsg(`自動儲存失敗：${e instanceof Error ? e.message : String(e)}`))
    }, 1500)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playsKey, cloud.user])

  const apply = (fn: (s: RecordState) => RecordState) => setState((s) => { if (!s) return s; setHistory((h) => [...h.slice(-59), s]); return { ...fn(s), updatedAt: new Date().toISOString() } })
  // cloud drafts: what other devices left in progress
  const [cloudDrafts, setCloudDrafts] = useState<CloudDraft<RecordState>[] | null>(null)
  const [draftsSupported, setDraftsSupported] = useState(true)
  const refreshDrafts = async () => {
    if (!cloud.configured || !cloud.user) return
    try { const d = await listCloudDrafts<RecordState>(); if (d === null) setDraftsSupported(false); else setCloudDrafts(d) } catch { /* offline: ignore */ }
  }
  useEffect(() => { void refreshDrafts() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [cloud.user])
  const newerCloud = state && cloudDrafts ? cloudDrafts.find((d) => d.game_id === state.game.id && (!state.updatedAt || d.updated_at > state.updatedAt) && d.state.updatedAt !== state.updatedAt) ?? null : null
  const resume = (d: CloudDraft<RecordState>) => { setState(d.state); setHistory([]); setMsg(`已載入 ${d.game_id} 的進度（${new Date(d.updated_at).toLocaleString('zh-TW')}）`) }
  const undo = () => setHistory((h) => { const prev = h[h.length - 1]; if (prev) setState(prev); return h.slice(0, -1) })
  const canEdit = !cloud.configured || !!cloud.user

  if (!canEdit) {
    return (
      <>
        <PageHeader title="紀錄比賽" description="紀錄員登入後就能在這裡逐球紀錄，不必再用 Excel 匯入。" />
        <div className="max-w-md"><CloudPanel /></div>
      </>
    )
  }
  const saveDraft = async () => {
    if (!state) return
    setMsg(null)
    try { const w = await saveGame(toGameEdit(state)); setMsg(w.length ? `已儲存（${w.length} 則提醒，結束比賽時會列出）` : '已儲存，全隊現在就看得到這場的進度') } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }
  const complete = async () => {
    if (!state || !finish) return
    setMsg(null)
    try {
      const w = await saveGame(toGameEdit({ ...state, finished: true }, { winningPitcher: finish.w || undefined, losingPitcher: finish.l || undefined, savePitcher: finish.sv || undefined }))
      const id = state.game.id
      if (cloud.configured) void deleteCloudDraft(id).catch(() => undefined)
      writeDraft(null); setState(null); setHistory([]); setFinish(null)
      navigate(`/games?game=${encodeURIComponent(id)}`)
      if (w.length) window.alert(`已儲存。請核對：\n${w.map((x) => `・${x.message}`).join('\n')}`)
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <>
      <PageHeader title="紀錄比賽" description={state ? `${state.game.date}・${state.game.tournament}・vs ${state.game.opponent}・${state.game.id}` : '填好比賽資訊與先發，就能逐球紀錄；每個打席會自動寫成和總表一樣的格式。'}
        actions={state ? <Button variant="ghost" size="sm" icon={<RefreshCw />} onClick={() => { if (window.confirm('放棄這場未完成的紀錄？（已儲存到雲端的打席不受影響，只會清掉接續用的進度）')) { if (cloud.configured) void deleteCloudDraft(state.game.id).catch(() => undefined); writeDraft(null); setState(null); setHistory([]); void refreshDrafts() } }}>放棄這場</Button> : undefined} />
      {msg && <div role="status" className="rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-ink">{msg}</div>}
      {!state && cloudDrafts && cloudDrafts.length > 0 && (
        <Card title="雲端有進行中的比賽" subtitle="在另一台裝置開始的紀錄，可以在這裡接續" flush>
          <ul className="divide-y divide-[var(--border)]">
            {cloudDrafts.map((d) => (
              <li key={d.game_id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink truncate">{d.state.game.date}・vs {d.state.game.opponent}<span className="text-muted font-normal ml-2 tnum">{d.game_id}</span></div>
                  <div className="text-[12px] text-muted tnum">第 {d.state.inning} {d.state.half === 'top' ? '上' : '下'}・{score(d.state).us} : {score(d.state).opp}・最後更新 {new Date(d.updated_at).toLocaleString('zh-TW')}{d.updated_by ? `・${d.updated_by}` : ''}</div>
                </div>
                <Button size="sm" variant="primary" icon={<CloudDownload />} onClick={() => resume(d)}>接續</Button>
                <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`刪除 ${d.game_id} 的進度？（已儲存的打席不受影響）`)) void deleteCloudDraft(d.game_id).then(refreshDrafts) }}>刪除進度</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {state && newerCloud && (
        <div role="status" className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-ink">
          <CloudDownload className="size-4 text-muted shrink-0" />
          <span className="min-w-0 flex-1">雲端有這場比賽較新的進度（{new Date(newerCloud.updated_at).toLocaleString('zh-TW')}{newerCloud.updated_by ? `・${newerCloud.updated_by}` : ''}），可能是另一台裝置繼續記的。</span>
          <Button size="sm" onClick={() => resume(newerCloud)}>載入較新進度</Button>
        </div>
      )}
      {cloud.configured && !draftsSupported && state && <div className="text-[12px] text-muted">要在別的裝置接續這場，請管理員在 Supabase 執行一次 supabase/migrations/2026-09-10_record_drafts.sql。</div>}
      {!state ? <Setup onStart={(s) => { setState(s); setHistory([]) }} /> : (
        <>
          <div className="text-[12px] text-muted -mt-2 md:-mt-4">{cloud.configured ? (autoSaved ? `已自動儲存到雲端 ${autoSaved}` : '每個打席送出後會自動儲存到雲端') : '進度會自動存在這台裝置的瀏覽器'}・重新整理或關機後再打開這頁即可接續</div>
          <Live state={state} apply={apply} undo={undo} canUndo={history.length > 0} onSaveDraft={() => void saveDraft()} saving={cloud.pushing} onFinish={() => setFinish({ w: '', l: '', sv: '' })} />
        </>
      )}
      {finish && state && (
        <div role="dialog" aria-modal="true" aria-label="結束比賽" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
          <div className="absolute inset-0 bg-black/45" onClick={() => setFinish(null)} />
          <div className="relative w-full sm:max-w-md bg-surface border border-border rounded-t-[14px] sm:rounded-[14px] shadow-[var(--shadow-modal)] p-5 flex flex-col gap-4">
            <div><div className="text-[16px] font-semibold text-ink">結束比賽</div><div className="text-[13px] text-ink-2 mt-1 tnum">{TEAM_NAME} {score(state).us} : {score(state).opp} {state.game.opponent}・{state.inning} 局{state.runners.length ? '・壘上跑者會記為殘壘' : ''}</div></div>
            <datalist id="rec-roster-finish">{[...new Set(state.pitching.map((p) => p.pitcher))].map((n) => <option key={n} value={n} />)}</datalist>
            <div className="grid grid-cols-3 gap-2">
              <Field label="勝投"><Input list="rec-roster-finish" value={finish.w} onChange={(e) => setFinish({ ...finish, w: e.target.value })} /></Field>
              <Field label="敗投"><Input list="rec-roster-finish" value={finish.l} onChange={(e) => setFinish({ ...finish, l: e.target.value })} /></Field>
              <Field label="救援"><Input list="rec-roster-finish" value={finish.sv} onChange={(e) => setFinish({ ...finish, sv: e.target.value })} /></Field>
            </div>
            <p className="text-[12px] text-muted">儲存後會跳到這場比賽的頁面；之後仍可用「修改資料」調整。</p>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setFinish(null)}>再想想</Button><Button variant="primary" onClick={() => void complete()} disabled={cloud.pushing}>儲存並結束</Button></div>
          </div>
        </div>
      )}
    </>
  )
}
