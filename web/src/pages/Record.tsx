import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRightLeft, CloudDownload, Flag, Maximize2, Minimize2, RefreshCw, Save, Type, X } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Checkbox, Field, Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Tabs } from '../components/ui/Tabs'
import { CloudPanel } from '../components/ui/CloudPanel'
import { BattingPlayByPlay, PitchingPlayByPlay, PitchPlays } from '../components/ui/PlayByPlay'
import { Toast, type ToastData } from '../components/ui/Toast'
import { dropCloudCache, useDataStore } from '../store/data'
import { deleteCloudDraft, listCloudDrafts, saveCloudDraft, type CloudDraft } from '../data/supabase'
import { useFilterOptions } from '../hooks/useStats'
import { TEAM_NAME } from '../data/seed'
import { activeNames, candidateNames, PlayerChips, PlayerSelect } from '../components/ui/PlayerSelect'
import { RosterSortToggle, useRosterSort } from '../components/ui/RosterSortToggle'
import { Badge } from '../components/ui/Badge'
import { Sheet } from '../components/ui/Sheet'
import { BOARD, PlateBadge } from '../components/ui/Scoreboard'
import { POSITIONS, type Game, type Registration } from '../data/types'
import { playedGames } from '../data/filters'
import { registrationByKey, registrationFor } from '../data/registrations'
import { gameLabel, scheduledGames } from '../data/schedule'
import { DAY_ROSTER_UNSUPPORTED } from '../data/gameRoster'
import { RECORD_FIELDS_MIGRATION } from '../data/recordFields'
import { lastOppLineup, oppBatterNames, oppPitcherOptions } from '../data/opponents'
import { durationMinutes, formatDuration, isLongGame, LONG_GAME_NOTE } from '../data/gameTime'
import { hhmm, localDate } from '../lib/dates'
import { HoldPicker } from '../components/ui/HoldPicker'
import { FIELD_POSITIONS } from '../data/errors'
import { cx } from '../lib/format'
import {
  addError, addExtra, addPitch, beyondDefault, BIP_RESULTS, removeError, changePitcher, commitPA, count, defaultPlan, defaultRbi, endHalf, impliedResult, newGame, nextGameId, offense, planProblems, runnerEvent, setRbi, wildPitch, score, setOppOrder, setReentry, setSlot, subCandidates, substitute, toGameEdit, toggleEarned, undoPitch,
  finishTimes, oppBatterOf, reliefPitchers, setOppLineup, setOppNames, setOppPitcher, skipOppHand, stampTimes,
  type Dest, type LineupSlot, type PAPlan, type RecordState,
} from '../record/model'
import { LastOppLineupButton, OppLineupFields, OppLineupSheet, oppPitcherLabel, OppPitcherSheet, OppPitcherStrip } from '../record/OppParts'
import { describeChange } from '../record/summary'
import { earnedAll } from '../record/earned'
import { LiveBar, RunnerSheet, SubSheet } from '../record/LiveParts'

import { readDraft, writeDraft } from '../record/draft'
import { readLineup, toLineupSlots } from '../record/lineup'
import { TEAM } from '../config/team'
import { AdvChoice, BattedBallPicker, chipBtn, NO_BATTED_BALL, PitchPad, ResultChips, type ExtraBases } from '../record/widgets'

/* ------------------------------------------------------------------ setup */
function Setup({ onStart }: { onStart: (s: RecordState) => void }) {
  const base = useDataStore((s) => s.base)
  const registrations = useDataStore((s) => s.registrations)
  const opts = useFilterOptions()
  const today = localDate()
  const last = useMemo(() => playedGames(base).slice(-1)[0], [base])
  const scheduled = useMemo(() => scheduledGames(base.games), [base.games])
  // the lineup drawn up on the 先發陣容 page, read first: the game it was drawn up for is the default game
  const stored = useMemo(() => readLineup(), [])
  // ?game= (賽程's 去紀錄, 先發陣容's 帶到紀錄比賽) picks that entry; then the lineup's own game; otherwise the next one coming up
  const [params] = useSearchParams()
  const initial = scheduled.find((g) => g.id === params.get('game')) ?? scheduled.find((g) => g.id === stored?.gameId) ?? scheduled.find((g) => g.date >= today)
  const [fromSchedule, setFromSchedule] = useState<string>(() => initial?.id ?? '')
  // a lineup drawn up for another game (or one already played) is not carried into this one: last week's bench would leak in
  const [applied, setApplied] = useState(() => !!stored && (!stored.gameId || stored.gameId === initial?.id))
  const saved = applied && stored?.order.some(Boolean) ? stored : null
  // brought in from the schedule / the 先發陣容 page: a summary first, 修改 opens the fields
  const [infoOpen, setInfoOpen] = useState(() => !initial)
  const [lineupOpen, setLineupOpen] = useState(() => !saved)
  // a lineup drawn up for a 報名名單 whose game is not on the schedule yet: start with that tournament, so the same list applies
  const lineupReg = !initial && applied ? registrationByKey(registrations, stored?.regKey) : undefined
  const [game, setGame] = useState<Game>(() => { const s = initial; return s ? { ...s, recorder: '' } : { id: '', date: today, tournament: lineupReg?.tournament ?? last?.tournament ?? '友誼賽', opponent: '', homeAway: '主', venue: last?.venue ?? '', innings: TEAM.innings, recorder: '' } })
  const [lineup, setLineup] = useState<LineupSlot[]>(() => {
    if (saved) return toLineupSlots(saved)
    const slots: LineupSlot[] = Array.from({ length: 9 }, () => ({ name: '', pos: '' }))
    if (last) for (const p of base.batting.filter((b) => b.gameId === last.id)) { const i = (p.order ?? 0) - 1; if (i >= 0 && i < 9 && !slots[i].name) slots[i] = { name: p.batter, pos: p.pos ?? '' } }
    return slots
  })
  const [pitcher, setPitcher] = useState(() => saved?.field.P || (last ? base.pitching.find((p) => p.gameId === last.id)?.pitcher ?? '' : ''))
  const [bench, setBench] = useState<string[]>(() => (applied && stored ? stored.bench : []))
  const [reentry, setAllowReentry] = useState(() => (applied && stored ? stored.reentry : false))
  // 記對方打者姓名: off unless this device ticked it last time
  const [oppNames, setOppNamesOn] = useState(() => { try { return localStorage.getItem(OPP_NAMES_KEY) === '1' } catch { return false } })
  const toggleOppNames = (on: boolean) => { setOppNamesOn(on); try { localStorage.setItem(OPP_NAMES_KEY, on ? '1' : '0') } catch { /* storage unavailable */ } }
  const [oppLineup, setOppLineupNames] = useState<string[]>(() => Array(9).fill(''))
  const oppNameList = useMemo(() => oppBatterNames(base, game.opponent), [base, game.opponent])
  const lastOpp = useMemo(() => lastOppLineup(base, game.opponent), [base, game.opponent])
  const pickSchedule = (id: string) => {
    setFromSchedule(id)
    const s = scheduled.find((g) => g.id === id)
    if (s) setGame({ ...s, recorder: game.recorder }); else { setGame((g) => ({ ...g, id: '', status: undefined })); setInfoOpen(true) }
    // switching away from the lineup's own game drops what it carried (its bench and re-entry belong to that game)
    if (applied && stored?.gameId && stored.gameId !== id) { setBench([]); setAllowReentry(false); setApplied(false) }
    // picking the game the 先發陣容 lineup was drawn up for brings it in now
    if (!applied && stored?.gameId && stored.gameId === id) {
      if (stored.order.some(Boolean)) { setLineup(toLineupSlots(stored)); if (stored.field.P) setPitcher(stored.field.P) }
      setBench(stored.bench); setAllowReentry(stored.reentry); setApplied(true)
    }
  }
  const lineupGame = stored?.gameId ? base.games.find((g) => g.id === stored.gameId) : undefined
  const lineupNote = !applied && stored?.gameId ? `先發陣容頁的陣容是給 ${lineupGame ? `${lineupGame.date} vs ${lineupGame.opponent}` : stored.gameId} 那場的，這場沒有帶入` : null
  // candidates follow the game being set up: its year + tournament's 報名名單 when there is one (the recorder can widen it)
  const reg = useMemo(() => registrationFor(registrations, game), [registrations, game])
  const listed = !!reg?.players.length
  const [everyone, setEveryone] = useState(false)
  const sortMode = useRosterSort()
  const names = useMemo(() => candidateNames(base.roster, everyone ? undefined : reg, sortMode), [base.roster, reg, everyone, sortMode])
  const inLineup = useMemo(() => new Set(lineup.map((l) => l.name).filter(Boolean)), [lineup])
  const starting = useMemo(() => new Set([...inLineup, pitcher]), [inLineup, pitcher])
  const benchNames = useMemo(() => {
    const active = activeNames(base.roster)
    return [...new Set([...names.filter((n) => active.has(n)), ...bench])].filter((n) => !starting.has(n))
  }, [names, base.roster, bench, starting])
  const benchCount = bench.filter((n) => !starting.has(n)).length
  // like 先發陣容: a bench player picked into the lineup is marked, and leaves the bench when the game starts
  const benchTag = (n: string) => (bench.includes(n) && !starting.has(n) ? '（板凳）' : undefined)
  const [error, setError] = useState<string | null>(null)
  const g = <K extends keyof Game>(k: K, v: Game[K]) => setGame((s) => ({ ...s, [k]: v }))
  const start = () => {
    if (!game.opponent.trim()) { setError('請填對手'); setInfoOpen(true); return }
    if (!lineup.some((l) => l.name.trim())) { setError('請至少填一位先發打者'); setLineupOpen(true); return }
    if (!pitcher.trim()) { setError('請填先發投手'); setLineupOpen(true); return }
    // a scheduled game keeps its id (the schedule entry turns into the record); otherwise a new id
    const id = fromSchedule && game.id === fromSchedule ? game.id : nextGameId(game.date, base.games.map((x) => x.id))
    const slots = lineup.filter((l) => l.name.trim()).map((l) => ({ name: l.name.trim(), pos: l.pos }))
    // Setup may have promoted a bench player: the bench is whoever is left over
    const sp = pitcher.trim()
    onStart(newGame({ ...game, id, status: undefined, opponent: game.opponent.trim(), tournament: game.tournament.trim() || '未分類', venue: game.venue || undefined, recorder: game.recorder || undefined }, slots, sp, { bench: bench.filter((n) => n !== sp && !slots.some((l) => l.name === n)), reentry, ...(oppNames ? { oppNames: true, oppLineup } : {}) }))
  }
  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 md:gap-5 items-start">
      <Card className="xl:col-span-2" title="比賽資訊" subtitle={infoOpen ? '比賽ID 會依日期自動編號' : '已從賽程帶入'}>
        <datalist id="rec-tournaments">{opts.tournaments.map((t) => <option key={t} value={t} />)}</datalist>
        <datalist id="rec-opponents">{opts.opponents.map((t) => <option key={t} value={t} />)}</datalist>
        {!infoOpen ? (
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <div className="text-[16px] font-semibold text-ink tnum">{game.date}{game.time ? ` ${game.time}` : ''}・vs {game.opponent || '（未填對手）'}</div>
              <div className="text-[13px] text-ink-2">{[game.tournament, game.homeAway === '主' ? '主場（對方先攻）' : '客場（我隊先攻）', game.venue, `${game.innings ?? TEAM.innings} 局`].filter(Boolean).join('・')}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setInfoOpen(true)} className="shrink-0 -mt-1">修改</Button>
          </div>
        ) : <>
        {scheduled.length > 0 && <Field label="從賽程帶入" className="mb-3"><Select value={fromSchedule} onChange={(e) => pickSchedule(e.target.value)} className="w-full" options={[{ value: '', label: '不用，手動填' }, ...scheduled.map((g) => ({ value: g.id, label: gameLabel(g) }))]} /></Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="日期"><Input type="date" value={game.date} onChange={(e) => g('date', e.target.value)} className="tnum" /></Field>
          <Field label="時間"><Input type="time" value={game.time ?? ''} onChange={(e) => g('time', e.target.value || undefined)} className="tnum" /></Field>
          <Field label="杯賽"><Input list="rec-tournaments" value={game.tournament} onChange={(e) => g('tournament', e.target.value)} /></Field>
          <Field label="對手"><Input list="rec-opponents" value={game.opponent} onChange={(e) => g('opponent', e.target.value)} placeholder="必填" /></Field>
          <Field label="主客"><Select value={game.homeAway} onChange={(e) => g('homeAway', e.target.value as Game['homeAway'])} options={[{ value: '主', label: '主場（對方先攻）' }, { value: '客', label: '客場（我隊先攻）' }]} className="w-full" /></Field>
          <Field label="預定局數"><Input type="number" min={1} max={12} value={game.innings ?? TEAM.innings} onChange={(e) => g('innings', Number(e.target.value) || TEAM.innings)} className="tnum" /></Field>
          <Field label="場地"><Input value={game.venue ?? ''} onChange={(e) => g('venue', e.target.value)} /></Field>
          <Field label="紀錄者"><Input value={game.recorder ?? ''} onChange={(e) => g('recorder', e.target.value)} /></Field>
        </div>
        </>}
        {/* 記對方打者姓名: shown folded or open */}
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-2">
          <Checkbox className="min-h-9 pointer-fine:min-h-7" label="記對方打者姓名（選填）" checked={oppNames} onChange={toggleOppNames} />
          <p className="text-[12px] text-muted -mt-1">不勾就只記對方第幾棒，和現在一樣；勾了可以先填對方打序，也可以比賽中再填</p>
          {oppNames && <>
            {lastOpp && game.opponent.trim() && <LastOppLineupButton opponent={game.opponent.trim()} date={lastOpp.date} onClick={() => setOppLineupNames(lastOpp.names)} />}
            <OppLineupFields value={oppLineup} onChange={setOppLineupNames} names={oppNameList} idPrefix="setup-opp" cols="sm:grid-cols-3 xl:grid-cols-2" />
            <p className="text-[12px] text-muted">現在不填也可以</p>
          </>}
        </div>
      </Card>
      <Card className="xl:col-span-3" title="先發打序與守位" action={<RosterSortToggle />} subtitle={[lineupNote, saved ? (lineupOpen ? '已帶入「先發陣容」頁排好的陣容，可直接修改' : '已帶入「先發陣容」頁排好的陣容') : last ? `已帶入上一場（${last.date} vs ${last.opponent}）的打序，可直接修改` : '選九位先發'].filter(Boolean).join('；')}
>
        {/* also decides who the bench chips offer, so it stays when the lineup is folded */}
        {listed && <RegistrationHint reg={reg!} everyone={everyone} onToggle={() => setEveryone(!everyone)} className="mb-3" />}
        {!lineupOpen ? (
          <div className="flex flex-col gap-3">
            <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5">
              {lineup.map((l, i) => l.name ? (
                <li key={i} className="flex items-center gap-2 text-[14px] min-w-0">
                  <PlateBadge size={24}>{i + 1}</PlateBadge>
                  <span className="font-medium text-ink truncate">{l.name}</span>
                  <span className="text-[12px] text-muted">{l.pos}</span>
                </li>
              ) : null)}
            </ol>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-ink-2 min-w-0 flex-1">先發投手 <span className="font-medium text-ink">{pitcher || '—'}</span></span>
              <Button variant="ghost" size="sm" onClick={() => setLineupOpen(true)} className="shrink-0">修改打序</Button>
            </div>
          </div>
        ) : <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2">
          {lineup.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <PlateBadge size={28} active={!!l.name}>{i + 1}</PlateBadge>
              <PlayerSelect aria-label={`第 ${i + 1} 棒`} value={l.name} onChange={(v) => setLineup((ls) => ls.map((x, k) => (k === i ? { ...x, name: v } : x)))} names={names} taken={inLineup} tag={benchTag} placeholder="球員" className="flex-1 min-w-0" />
              <Select value={l.pos} onChange={(e) => setLineup((ls) => ls.map((x, k) => (k === i ? { ...x, pos: e.target.value } : x)))} options={[{ value: '', label: '守位' }, ...POSITIONS.map((p) => ({ value: p, label: p }))]} className="w-[92px]" />
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <Field label="先發投手"><PlayerSelect value={pitcher} onChange={setPitcher} names={names} tag={benchTag} placeholder="必填" className="w-full" /></Field>
        </div>
        </>}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[13px] font-medium text-ink">板凳（今天有到）</span>
            <Badge variant={benchCount ? 'neutral' : 'outline'}>{benchCount} 人</Badge>
            <div className="ml-auto flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => setBench((b) => [...new Set([...b, ...benchNames])])}>全選</Button><Button variant="ghost" size="sm" onClick={() => setBench([])}>清除</Button></div>
          </div>
          <p className="text-[12px] text-muted mb-2">先發以外、今天到場可以上場的人；換人時會優先列出</p>
          <PlayerChips names={benchNames} selected={bench} onToggle={(n) => setBench((b) => (b.includes(n) ? b.filter((x) => x !== n) : [...b, n]))} empty="先發以外沒有其他現役球員" />
          <Checkbox className="mt-3 min-h-9 pointer-fine:min-h-7" label="允許被換下的球員再上場" checked={reentry} onChange={setAllowReentry} />
        </div>
        <div className="mt-4 pt-4 border-t border-border flex flex-col gap-2 sm:items-end">
          {error && <span className="text-[13px] text-critical">{error}</span>}
          <Button variant="primary" size="lg" onClick={start} className="w-full sm:w-auto">開始紀錄</Button>
        </div>
      </Card>
    </div>
  )
}

/** Which names the dropdowns offer when the game has a 報名名單, with a way out when someone is missing from it. */
function RegistrationHint({ reg, everyone, onToggle, className }: { reg: Registration; everyone: boolean; onToggle: () => void; className?: string }) {
  return (
    <div className={cx('text-[12px] text-muted flex items-center gap-x-2 gap-y-1 flex-wrap', className)}>
      <span>{everyone ? '列出全隊（不限報名名單）' : `依「${reg.season} ${reg.tournament}」報名名單（${reg.players.length} 人）`}</span>
      <button type="button" onClick={onToggle} className="h-9 pointer-fine:h-7 text-ink-2 hover:text-ink underline underline-offset-2 cursor-pointer">{everyone ? '只列報名名單' : '名單外的人？列出全隊'}</button>
    </div>
  )
}

/* ------------------------------------------------------------------ live */
/** Saving while recording: every play goes to the cloud by itself, so there is only a status line — and a button when
 *  that is not running (no cloud: save into this site) or the last automatic save failed (retry). */
/** A progress that would replace more plate appearances than it has (see RecordPage's sync). */
interface StaleDraft { gameId: string; draftPAs: number; cloudPAs: number }
/**
 * May this progress write its game's rows? 'wait' while the cloud's games are loading; a StaleDraft when the cloud has
 * more plate appearances of this game than the progress (writing would delete them); null when it may.
 */
export function staleAgainstCloud(s: RecordState, store: { base: { batting: { gameId: string }[]; pitching: { gameId: string }[] }; cloud: { configured: boolean; status: string } }): StaleDraft | 'wait' | null {
  if (!store.cloud.configured) return null
  if (store.cloud.status !== 'ready') return 'wait'
  const id = s.game.id
  const cloudPAs = store.base.batting.filter((p) => p.gameId === id).length + store.base.pitching.filter((p) => p.gameId === id).length
  const draftPAs = s.batting.length + s.pitching.length
  return cloudPAs > draftPAs ? { gameId: id, draftPAs, cloudPAs } : null
}

/** tone: ok = in the cloud (or saved on this device), pending = a change not synced yet, failed = not saved */
interface SaveState { tone: 'ok' | 'pending' | 'failed'; status: string; button: string | null; saving: boolean; onSave: () => void }

function Live({ state, apply, undo, canUndo, onFinish, onAbandon, save, focus, onToggleFocus, large, onToggleLarge, oppHandOn }: { state: RecordState; apply: (fn: (s: RecordState) => RecordState) => void; undo: () => void; canUndo: boolean; onFinish: () => void; onAbandon: () => void; save: SaveState; focus: boolean; onToggleFocus: () => void; large: boolean; onToggleLarge: () => void; /** the cloud has the 對方投手 columns (or there is no cloud) */ oppHandOn: boolean }) {
  const base = useDataStore((s) => s.base)
  const registrations = useDataStore((s) => s.registrations)
  const reg = useMemo(() => registrationFor(registrations, state.game), [registrations, state.game])
  // mid-game nobody may get stuck: if the 報名名單 is missing someone, the recorder can list the whole team
  const [everyone, setEveryone] = useState(false)
  const sortMode = useRosterSort()
  const pool = useMemo(() => candidateNames(base.roster, everyone ? undefined : reg, sortMode), [base.roster, reg, everyone, sortMode])
  // today's bench first, players already substituted out last (greyed out unless re-entry is allowed)
  const pitcherCands = useMemo(() => subCandidates(state, pool, 'pitcher'), [state, pool])
  const batterCands = useMemo(() => subCandidates(state, pool, 'batter'), [state, pool])
  const [newPitcher, setNewPitcher] = useState('')
  const [sub, setSub] = useState<{ slot: number; name: string; pos: string }>({ slot: 0, name: '', pos: 'PH' })
  const side = offense(state)
  const sc = score(state)
  const c = count(state.pitches)
  const [plan, setPlan] = useState<PAPlan | null>(null)
  const [rbiTouched, setRbiTouched] = useState(false)
  const [runnerOpen, setRunnerOpen] = useState(false)
  const [runnerPick, setRunnerPick] = useState<number | null>(null)
  const [tool, setTool] = useState<'none' | 'pitcher' | 'lineup'>('none')
  const [errOpen, setErrOpen] = useState(false)
  // 對方投手 / 對方打序 sheets
  const [oppPitcherOpen, setOppPitcherOpen] = useState(false)
  const [oppLineupOpen, setOppLineupOpen] = useState(false)
  const oppOptions = useMemo(() => oppPitcherOptions(base, state.game.opponent, state.batting), [base, state.game.opponent, state.batting])
  const oppNameList = useMemo(() => (state.oppNames ? oppBatterNames(base, state.game.opponent) : []), [base, state.game.opponent, state.oppNames])
  const lastOpp = useMemo(() => (state.oppNames ? lastOppLineup(base, state.game.opponent) : null), [base, state.game.opponent, state.oppNames])
  const oppName = oppBatterOf(state)
  const askOppHand = side === 'us' && oppHandOn && !state.oppPitcher && !state.oppHandOff
  const halfRowsWithoutOpp = side === 'us' ? state.batting.filter((b) => b.inning === state.inning && !b.oppHand && !b.oppPitcher).length : 0
  const [logTab, setLogTab] = useState<'bat' | 'pit'>(side === 'us' ? 'bat' : 'pit')
  useEffect(() => { setLogTab(side === 'us' ? 'bat' : 'pit'); setPlan(null); setRunnerOpen(false) }, [side, state.inning])
  // every play ends with one line saying what went in, and a way to take it back
  const [toast, setToast] = useState<ToastData | null>(null)
  const act = (fn: (s: RecordState) => RecordState) => {
    const next = fn(state)
    apply(() => next)
    const text = describeChange(state, next)
    if (text) setToast({ id: Date.now(), text, action: { label: '復原', onClick: () => { undo(); setToast({ id: Date.now() + 1, text: '已復原上一步' }) } } })
  }
  const openRunners = (row: number | null = null) => { setRunnerPick(row); setRunnerOpen(true); setToast(null) }
  const implied = impliedResult(state.pitches)
  useEffect(() => { if (implied && !plan) choose(implied) /* eslint-disable-line react-hooks/exhaustive-deps */ }, [implied])

  const params = useDataStore((st) => st.params)
  const pitchCount = useMemo(() => { const m = new Map<string, number>(); for (const p of state.pitching) m.set(p.pitcher, (m.get(p.pitcher) ?? 0) + p.pitches.length); return m }, [state.pitching])
  const currentCount = (pitchCount.get(state.pitcher) ?? 0) + (side === 'opp' ? state.pitches.length : 0)
  const countTone = currentCount >= params.pitchMax ? 'critical' : currentCount >= params.pitchWarn ? 'warning' : 'ok'
  const batterSlot = state.lineup[state.slot]
  const choose = (result: string) => { setPlan(defaultPlan(state, result)); setRbiTouched(false) }
  const setDest = (row: number | 'batter', d: Dest) => setPlan((p) => {
    if (!p) return p
    const moved = row === 'batter' ? { ...p, batter: d } : { ...p, runners: { ...p.runners, [row]: d } }
    // a 趁傳 mark goes away once he no longer goes further than the result gives
    // (a 壘死 mark goes away once he is no longer out)
    const next = { ...moved, throws: (moved.throws ?? []).filter((w) => beyondDefault(state, moved, w)), errAdv: (moved.errAdv ?? []).filter((w) => beyondDefault(state, moved, w)), runningOuts: (moved.runningOuts ?? []).filter((w) => moved.runners[w] === 'out') }
    return rbiTouched ? next : { ...next, rbi: defaultRbi(next) }
  })
  const problems = plan ? planProblems(state, plan) : []
  // after 擊進場內 the plate appearance must end on a ball-in-play result, and every batted ball needs its 落點
  const inPlay = state.pitches[state.pitches.length - 1] === 'IP'
  // 擊進場內 → straight to the results (just below the scoreboard bar)
  const resultsRef = useRef<HTMLDivElement>(null)
  const jump = useRef(false)
  const toResults = () => { jump.current = true }
  useEffect(() => {
    if (!inPlay || !jump.current) return
    jump.current = false
    resultsRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [inPlay])
  const needLoc = !!plan && !NO_BATTED_BALL.has(plan.result) && !plan.loc
  // 失誤進壘 while we field needs whose error it was
  const needErrBy = !!plan && side === 'opp' && !!plan.errAdv?.length && !plan.errBy?.length
  // past where the result alone takes him: on the throw (趁傳進壘) or on a fielding error (失誤進壘, no RBI for that run;
  // while we field it is our error, and the rules make a run that scores this way unearned)
  const throwToggle = (who: number | 'batter', name: string) => {
    if (!plan || !beyondDefault(state, plan, who)) return undefined
    const kind = plan.errAdv?.includes(who) ? 'err' : plan.throws?.includes(who) ? 'throw' : null
    const pick = (k: ExtraBases | null) => {
      const next: PAPlan = { ...plan, throws: (plan.throws ?? []).filter((w) => w !== who), errAdv: (plan.errAdv ?? []).filter((w) => w !== who) }
      if (k === 'throw') next.throws!.push(who)
      if (k === 'err') next.errAdv!.push(who)
      setPlan(rbiTouched ? next : { ...next, rbi: defaultRbi(next) })
    }
    return <AdvChoice name={name} kind={kind} onPick={pick} />
  }
  const confirm = () => { if (!plan || problems.length || needLoc || needErrBy) return; act((s) => commitPA(s, plan)); setPlan(null) }
  // the opponent's runs on this play, called by the rules (record/earned.ts) on the inning as it would stand; tap one to call it by hand
  const runCalls = (() => {
    if (!plan || side !== 'opp') return []
    const row = state.pitching.length
    const who = [
      ...state.runners.filter((r) => r.side === 'opp' && plan.runners[r.row] === 'home').map((r) => ({ key: String(r.row), row: r.row, name: r.name })),
      ...(plan.batter === 'home' ? [{ key: 'batter', row, name: oppName || `對方第 ${state.oppOrder} 棒` }] : []),
    ]
    if (!who.length) return []
    const after = commitPA(state, { ...plan, earnedBy: undefined })
    const calls = earnedAll(after.pitching)
    return who.map((w) => ({ ...w, earned: plan.earnedBy?.[w.key] ?? after.pitching[w.row]?.code === 'ER', why: calls.get(w.row)?.why, byHand: plan.earnedBy?.[w.key] !== undefined }))
  })()
  const liveCalls = logTab === 'pit' ? earnedAll(state.pitching) : new Map<number, { why?: string }>()
  const willEnd = plan ? state.outs + (plan.batter === 'out' ? 1 : 0) + Object.values(plan.runners).filter((d) => d === 'out').length >= 3 : false
  // substitutions: 換人 works in both halves (defensive changes happen while we field) on any slot, defaulting to the current batter
  // while fielding the 守位 box starts from the slot's position — except a P that is no longer the pitcher (after a fielder
  // moved to the mound), which would put a second P in the lineup
  const fieldPos = (i: number) => { const l = state.lineup[i]; return !l || (l.pos === 'P' && l.name !== state.pitcher) ? '' : l.pos }
  const openTool = (t: 'pitcher' | 'lineup') => {
    if (tool === t) { setTool('none'); return }
    if (t === 'lineup') setSub({ slot: state.slot, name: '', pos: side === 'us' ? 'PH' : fieldPos(state.slot) })
    setTool(t)
    setToast(null)
  }
  // 代跑 from the runner's own menu: that runner's batting slot, as PR
  const slotOfRunner = (r: { row: number; name: string }) => { const o = state.batting[r.row]?.order; return o && state.lineup[o - 1]?.name === r.name ? o - 1 : state.lineup.findIndex((l) => l.name === r.name) }
  const openSub = (slot: number, pos: string) => { setSub({ slot, name: '', pos }); setTool('lineup'); setRunnerOpen(false) }
  const pickSubPos = (pos: string) => setSub((x) => {
    // picking PR on a slot that is not on base jumps to the lead runner's slot
    const runners = state.runners.filter((r) => r.side === 'us').sort((a, b) => b.base - a.base)
    const onBase = runners.some((r) => slotOfRunner(r) === x.slot)
    const lead = runners.map(slotOfRunner).find((i) => i >= 0)
    return { ...x, pos, slot: pos === 'PR' && !onBase && lead !== undefined ? lead : x.slot }
  })
  // while we field, everyone needs a real position: a PH / PR left as is, or two players at one spot, is flagged
  const posIssues = side !== 'opp' ? [] : state.lineup.flatMap((l, i) => {
    if (!l.name) return []
    if (l.pos === 'PH' || l.pos === 'PR' || !l.pos) return [{ slot: i, text: `第 ${i + 1} 棒 ${l.name} 還是${l.pos === 'PR' ? '代跑' : l.pos === 'PH' ? '代打' : '沒有守位'}` }]
    const twin = state.lineup.findIndex((o, k) => k < i && o.name && o.pos === l.pos && l.pos !== 'DH')
    return twin >= 0 ? [{ slot: i, text: `第 ${twin + 1} 棒 ${state.lineup[twin].name} 和第 ${i + 1} 棒 ${l.name} 都守 ${l.pos}` }] : []
  })
  const subSlot = state.lineup[sub.slot]
  // a position-only change is allowed, but a bare PH / PR with nobody picked is not (it would restamp the batter's position)
  const canSub = !!subSlot && (!!sub.name || (!!sub.pos && sub.pos !== subSlot.pos && sub.pos !== 'PH' && sub.pos !== 'PR'))
  const confirmSub = () => { if (!canSub) return; act((s) => substitute(s, sub.slot, sub.name, sub.pos)); setSub({ slot: state.slot, name: '', pos: 'PH' }); setTool('none') }
  // without a DH the old pitcher bats as P: say what 換投 does to the lineup
  const pSlot = state.lineup.findIndex((l) => l.name === state.pitcher && l.pos === 'P')
  const pitcherHint = !newPitcher || pSlot < 0 ? null
    : state.lineup.some((l) => l.name === newPitcher) ? `${newPitcher} 改守投手；${state.pitcher} 還在第 ${pSlot + 1} 棒，接著用「換人」換掉他或改他的守位` : `${newPitcher} 接替 ${state.pitcher} 的第 ${pSlot + 1} 棒`
  const toolExtras = (
    <div className="basis-full flex items-center gap-x-4 gap-y-1 flex-wrap">
      <Checkbox label="允許再上場" className="min-h-9 pointer-fine:min-h-7" checked={!!state.reentry} onChange={() => apply((s) => setReentry(s, !s.reentry))} />
      <Checkbox label="記對方打者姓名" className="min-h-9 pointer-fine:min-h-7" checked={!!state.oppNames} onChange={(on) => apply((s) => setOppNames(s, on))} />
      {!!reg?.players.length && <RegistrationHint reg={reg} everyone={everyone} onToggle={() => setEveryone(!everyone)} />}
    </div>
  )

  const offRunners = state.runners.filter((r) => r.side === side)
  const who = side === 'us'
    ? <>第 {state.slot + 1} 棒 <span style={{ color: BOARD.ink }} className="font-medium">{batterSlot?.name ?? '—'}</span> {batterSlot?.pos}</>
    : <>對方第 {state.oppOrder} 棒{oppName ? ` ${oppName}` : ''}・投手 <span style={{ color: BOARD.ink }} className="font-medium">{state.pitcher}</span> <span className={cx('tnum', countTone === 'critical' ? 'text-critical' : countTone === 'warning' ? 'text-warning' : '')}>{currentCount} 球</span></>
  // 暴投／捕逸 from the pitch row: one tap, everyone moves up (復原 if only some did, then use the runner sheet)
  const allUp = (kind: 'wp' | 'pb') => { act((s) => wildPitch(s, kind)); setRunnerOpen(false) }
  const quick = 'h-10 pointer-fine:h-9 px-3 rounded-[var(--radius-sm)] border border-border bg-surface text-[13px] font-medium text-ink hover:bg-surface-2 active:bg-surface-3 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default'
  const secondary = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[12px] text-muted min-h-9">
        <span role="status" className={cx('min-w-0 inline-flex items-center gap-1.5', save.tone === 'failed' && 'text-critical font-medium', save.tone === 'pending' && 'text-warning')}>
          <span aria-hidden className={cx('size-2 rounded-full shrink-0', save.tone === 'failed' ? 'bg-critical' : save.tone === 'pending' ? 'bg-warning' : 'bg-good')} />{save.status}
        </span>
        {state.firstPitchAt && <span className="tnum shrink-0" title="比賽時間會依第一球和最後一個打席的時間自動帶入">{hhmm(state.firstPitchAt)} 開賽</span>}
        {save.button && <Button variant={save.tone === 'failed' ? 'outline' : 'ghost'} size="sm" icon={<Save />} onClick={save.onSave} disabled={save.saving}>{save.saving ? '儲存中…' : save.button}</Button>}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="ghost" size="sm" icon={focus ? <Minimize2 /> : <Maximize2 />} onClick={onToggleFocus} aria-pressed={focus}>{focus ? '離開全螢幕' : '全螢幕'}</Button>
        <Button variant="ghost" size="sm" icon={<Type />} onClick={onToggleLarge} aria-pressed={large} title="按鈕和字放大一級，大太陽下比較好看（這台裝置會記住）">{large ? '一般字' : '大字'}</Button>
        <Button variant="ghost" size="sm" onClick={() => { if (window.confirm('確定手動結束這個半局？壘上跑者會記為殘壘。')) act(endHalf) }}>結束半局</Button>
        <Button variant="ghost" size="sm" icon={<RefreshCw />} onClick={onAbandon}>放棄這場</Button>
        <Button variant="outline" size="sm" icon={<Flag />} onClick={onFinish} className="ml-auto">結束比賽</Button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {/* the scoreboard keeps its size under 大字 (it is big already; the team name needs the width) */}
      <LiveBar state={state} us={sc.us} opp={sc.opp} balls={c.balls} strikes={c.strikes} side={side} who={who} onRunners={() => openRunners()} onUndo={undo} canUndo={canUndo} focus={focus} />
      <div className="record-zoom grid grid-cols-1 xl:grid-cols-12 [@media_(orientation:landscape)_and_(max-height:520px)]:grid-cols-12 gap-4 md:gap-5 items-start">
        <div className="xl:col-span-8 [@media_(orientation:landscape)_and_(max-height:520px)]:col-span-8 flex flex-col gap-4 min-w-0">
          <Card still bodyClassName="p-4 md:p-5 flex flex-col gap-4">
            {/* 對方投手: asked once while we bat (one tap, or 不記) */}
            {askOppHand && <OppPitcherStrip onHand={(hand) => act((s) => setOppPitcher(s, { hand }))} onName={() => { setOppPitcherOpen(true); setToast(null) }} onSkip={() => act(skipOppHand)} />}
            {/* who is up */}
            <div className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap">
              {side === 'us' ? (
                <div className="flex items-center gap-3 min-w-0">
                  <PlateBadge size={44}>{state.slot + 1}</PlateBadge>
                  <div className="min-w-0"><div className="text-[12px] text-muted">我隊打者・第 {state.slot + 1} 棒</div><div className="font-display text-[22px] font-bold text-ink leading-7 truncate">{batterSlot?.name ?? '—'} <span className="font-sans text-muted font-normal text-[13px]">{batterSlot?.pos}</span></div></div>
                </div>
              ) : (
                <div className="flex items-center gap-3 min-w-0">
                  <PlateBadge size={44} active={false}>{state.oppOrder}</PlateBadge>
                  <div className="min-w-0"><div className="text-[12px] text-muted truncate">我隊投手 {state.pitcher}・用球 <span className={cx('tnum font-semibold', countTone === 'critical' ? 'text-critical' : countTone === 'warning' ? 'text-warning' : 'text-ink')} title={`提醒 ${params.pitchWarn} 球、上限 ${params.pitchMax} 球（可在資料匯入頁調整）`}>{currentCount}{countTone === 'critical' ? '・已達上限' : countTone === 'warning' ? '・注意' : ''}</span></div><div className="font-display text-[22px] font-bold text-ink leading-7 truncate">對方第 {state.oppOrder} 棒{oppName && <span className="ml-1.5">{oppName}</span>}</div>
                    {state.oppNames && <button type="button" onClick={() => { setOppLineupOpen(true); setToast(null) }} className="h-9 pointer-fine:h-7 text-[12px] text-ink-2 hover:text-ink underline underline-offset-2 cursor-pointer">{state.oppLineup?.[state.oppOrder - 1] ? '改姓名／代打' : '＋填姓名'}</button>}</div>
                </div>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                {side === 'opp' && <Button variant="outline" size="sm" onClick={() => openTool('pitcher')} icon={<ArrowRightLeft />}>換投</Button>}
                <Button variant="outline" size="sm" onClick={() => openTool('lineup')} icon={<ArrowRightLeft />}>{side === 'us' ? '代打' : '換人'}</Button>
                {side === 'us' && oppHandOn && !askOppHand && <Button variant="outline" size="sm" onClick={() => { setOppPitcherOpen(true); setToast(null) }} title="對方換投時點這裡">{oppPitcherLabel(state.oppPitcher)}</Button>}
              </div>
            </div>

            {posIssues.length > 0 && (
              <div role="status" className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2 flex flex-col gap-1">
                {posIssues.map((x) => (
                  <div key={x.slot} className="flex items-center gap-2 text-[12px] text-ink">
                    <span className="flex-1 min-w-0">{x.text}，守備位置要改一下</span>
                    <button type="button" onClick={() => openSub(x.slot, '')} className="shrink-0 h-9 pointer-fine:h-7 text-ink-2 hover:text-ink underline underline-offset-2 cursor-pointer">設定守位</button>
                  </div>
                ))}
              </div>
            )}

            {/* pitches, with the runner plays between them */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 min-h-8">
                <span className="text-[12px] text-muted shrink-0">逐球</span>
                <PitchPlays pitches={state.pitches} events={state.plays} />
                {state.pitches.length > 0 && <button type="button" onClick={() => apply(undoPitch)} className="ml-auto shrink-0 h-9 pointer-fine:h-7 text-[12px] text-ink-2 hover:text-ink cursor-pointer underline underline-offset-2">刪最後一球</button>}
              </div>
              <PitchPad onPitch={(code) => { if (inPlay) return; apply((s) => addPitch(s, code)); if (code === 'IP') toResults() }} disabled={!!plan || inPlay} />
            </div>

            {/* between pitches: runners, wild pitches, our errors */}
            {(offRunners.length > 0 || side === 'opp') && (
              <div className="flex flex-wrap items-center gap-1.5">
                {offRunners.length > 0 && (
                  <button type="button" onClick={() => openRunners()} className={cx(quick, 'border-ink/30')}>
                    壘上跑者<span className="ml-1.5 text-muted tnum">{[...offRunners].sort((a, b) => a.base - b.base).map((r) => `${r.base}B`).join(' ')}</span>
                  </button>
                )}
                {offRunners.length > 0 && <button type="button" onClick={() => allUp('wp')} className={quick} title="壘上跑者各進一壘">暴投{side === 'opp' && state.extras.wp > 0 && <span className="tnum ml-1">×{state.extras.wp}</span>}</button>}
                {offRunners.length > 0 && <button type="button" onClick={() => allUp('pb')} className={quick} title="壘上跑者各進一壘">捕逸{side === 'opp' && state.extras.pb > 0 && <span className="tnum ml-1">×{state.extras.pb}</span>}</button>}
                {side === 'opp' && offRunners.length === 0 && (['wp', 'pb'] as const).map((k) => <button key={k} type="button" onClick={() => apply((s) => addExtra(s, k))} className={quick}>{k === 'wp' ? '暴投' : '捕逸'}{state.extras[k] > 0 && <span className="tnum ml-1">×{state.extras[k]}</span>}</button>)}
                {side === 'opp' && (
                  <button type="button" aria-expanded={errOpen} onClick={() => setErrOpen(!errOpen)} className={cx(quick, errOpen && 'border-ink bg-ink text-bg hover:bg-ink')}>我隊失誤{state.extras.errors?.length ? <span className="tnum ml-1">×{state.extras.errors.length}</span> : null}</button>
                )}
                {state.extras.pka > 0 && <span className="inline-flex items-center text-[12px] text-ink-2 h-9 px-2 rounded-[6px] bg-surface-2">牽制 <span className="tnum text-ink font-medium ml-1">×{state.extras.pka}</span></span>}
                {side === 'opp' && errOpen && (
                  <div className="basis-full flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-muted basis-full">誰失誤（例如一安＋左外野漏接點 LF）</span>
                    {FIELD_POSITIONS.map((pos) => {
                      const n = (state.extras.errors ?? []).filter((x) => x === pos).length
                      return (
                        <span key={pos} className="inline-flex items-center rounded-[var(--radius-sm)] border border-border overflow-hidden text-[13px]">
                          <button type="button" onClick={() => act((s) => addError(s, pos))} className="h-10 pointer-fine:h-9 px-3 hover:bg-surface-2 cursor-pointer">{pos}{n > 0 && <span className="tnum font-medium ml-1">×{n}</span>}</button>
                          {n > 0 && <button type="button" aria-label={`${pos} 失誤減一`} onClick={() => apply((s) => removeError(s, pos))} className="h-10 pointer-fine:h-9 px-2 border-l border-border text-muted hover:text-ink cursor-pointer">−</button>}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* the result */}
            {!plan ? (
              <div ref={resultsRef} className="flex flex-col gap-2.5 scroll-mt-[196px] sm:scroll-mt-[150px]">
                {inPlay && (
                  <div role="status" className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-accent-soft pl-3 pr-1.5 py-1.5 text-[13px] text-ink">
                    <span className="flex-1 min-w-0">擊進場內：請選這球的打擊結果</span>
                    <button type="button" onClick={() => apply(undoPitch)} className="shrink-0 h-9 px-3 rounded-[var(--radius-sm)] text-[12px] text-ink-2 hover:text-ink hover:bg-surface/60 underline underline-offset-2 cursor-pointer">點錯了，刪掉 IP</button>
                  </div>
                )}
                <ResultChips onPick={choose} only={inPlay ? BIP_RESULTS : undefined} />
              </div>
            ) : (
              <div className="rounded-[var(--radius-sm)] border border-ink/20 bg-surface-2/50 p-3 md:p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[15px] font-semibold text-ink">{plan.result}<span className="text-muted font-normal text-[12px] ml-2">{plan.result === '界外飛' ? '接殺的界外球記為 IP，落點填接球的守備員' : '確認細節後送出'}</span></div>
                  <button type="button" onClick={() => setPlan(null)} className="h-9 text-[12px] text-ink-2 hover:text-ink cursor-pointer inline-flex items-center gap-1"><X className="size-3.5" />改結果</button>
                </div>
                {!NO_BATTED_BALL.has(plan.result) && <BattedBallPicker result={plan.result} value={plan} onChange={(v) => setPlan({ ...plan, ...v })} requireLoc />}
                <div>
                  <div className="text-[12px] text-ink-2 mb-1">跑者去向</div>
                  <div className="flex flex-col gap-1.5">
                    {[...state.runners].sort((a, b) => b.base - a.base).map((r) => (
                      <DestRow key={r.row} label={`${r.base}B ${r.name}`} value={plan.runners[r.row] ?? r.base} onChange={(d) => setDest(r.row, d)} min={r.base} extra={throwToggle(r.row, r.name)}
                        mistake={side === 'us' ? { on: !!plan.runningOuts?.includes(r.row), set: (on) => { setDest(r.row, 'out'); setPlan((p) => (p ? { ...p, runningOuts: [...(p.runningOuts ?? []).filter((w) => w !== r.row), ...(on ? [r.row] : [])] } : p)) } } : undefined} />
                    ))}
                    <DestRow label={`打者 ${side === 'us' ? batterSlot?.name ?? '' : oppName || `對方第 ${state.oppOrder} 棒`}`} value={plan.batter} onChange={(d) => setDest('batter', d)} min={1} batter extra={throwToggle('batter', '打者')} />
                  </div>
                </div>
                {side === 'opp' && !!plan.errAdv?.length && (
                  // 失誤進壘 while we field: whose error it was (counted as our error on this plate appearance)
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[12px] text-ink-2">誰失誤<span className="text-muted ml-1.5">算我隊守備失誤；兩人都有就都點</span></div>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="誰失誤">
                      {FIELD_POSITIONS.map((pos) => {
                        const on = !!plan.errBy?.includes(pos)
                        return <button key={pos} type="button" aria-pressed={on} onClick={() => setPlan({ ...plan, errBy: on ? plan.errBy!.filter((x) => x !== pos) : [...(plan.errBy ?? []), pos] })} className={cx(chipBtn(on), 'min-w-11 h-9 px-2.5 text-[12px]')}>{pos}</button>
                      })}
                    </div>
                  </div>
                )}
                {problems.length > 0 && <div role="alert" className="text-[12px] text-critical flex flex-col gap-0.5">{problems.map((m) => <span key={m}>{m}，請調整跑者去向</span>)}</div>}
                <div className="flex items-center gap-4 flex-wrap">
                  {side === 'us' && (
                    <div className="inline-flex items-center gap-2 text-[13px]"><span className="text-ink-2">打點</span>
                      <button type="button" onClick={() => { setRbiTouched(true); setPlan({ ...plan, rbi: Math.max(0, plan.rbi - 1) }) }} className="size-9 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer">−</button>
                      <span className="tnum font-semibold w-4 text-center">{plan.rbi}</span>
                      <button type="button" onClick={() => { setRbiTouched(true); setPlan({ ...plan, rbi: plan.rbi + 1 }) }} className="size-9 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer">＋</button>
                    </div>
                  )}
                  {runCalls.length > 0 && (
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <span className="text-[12px] text-ink-2">失分（依規則判定，點一下可改）</span>
                      <div className="flex flex-wrap gap-1.5">
                        {runCalls.map((c) => (
                          <button key={c.key} type="button" aria-pressed={c.earned} title={c.why} onClick={() => setPlan({ ...plan, earnedBy: { ...plan.earnedBy, [c.key]: !c.earned } })}
                            className={cx('h-9 px-3 rounded-full border text-[12px] font-medium cursor-pointer', c.earned ? 'border-border bg-surface text-ink' : 'border-[color-mix(in_srgb,var(--warning)_55%,transparent)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-ink')}>
                            {c.name}：{c.earned ? '自責分' : '非自責分'}{c.byHand ? '（手動）' : ''}
                          </button>
                        ))}
                      </div>
                      {runCalls.filter((c) => !c.earned && c.why && !c.byHand).map((c) => <span key={c.key} className="text-[11px] text-muted">{c.name} 非自責：{c.why}</span>)}
                    </div>
                  )}
                  <div className="ml-auto max-sm:w-full flex flex-col items-end gap-1">
                    {needLoc && <span className="text-[12px] text-critical">還沒點落點</span>}
                    {needErrBy && <span className="text-[12px] text-critical">還沒點誰失誤</span>}
                    <Button variant="primary" size="lg" onClick={confirm} disabled={problems.length > 0 || needLoc || needErrBy} className="max-sm:w-full">{willEnd ? '送出並結束半局' : '送出這個打席'}</Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
          {secondary}
        </div>

        <div className="xl:col-span-4 [@media_(orientation:landscape)_and_(max-height:520px)]:col-span-4 flex flex-col gap-4 md:gap-5 min-w-0">
          <Card still title="打線" subtitle="點棒次可跳到該打者" flush>
            <ul className="divide-y divide-[var(--border)]">
              {state.lineup.map((l, i) => (
                <li key={i}>
                  <button type="button" onClick={() => apply((s) => setSlot(s, i))} className={cx('w-full flex items-center gap-3 px-4 py-2 text-left cursor-pointer', i === state.slot && side === 'us' ? 'bg-surface-2' : 'hover:bg-surface-2/60')}>
                    <PlateBadge size={28} active={i === state.slot}>{i + 1}</PlateBadge>
                    <span className="text-[13px] font-medium text-ink flex-1 truncate">{l.name}</span>
                    <span className="text-[12px] text-muted">{l.pos}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2.5 border-t border-border text-[12px] text-ink-2 flex items-center justify-between">
              <span>投手 <span className="font-medium text-ink">{state.pitcher}</span></span>
              {side === 'opp' && <button type="button" onClick={() => apply((s) => setOppOrder(s, s.oppOrder + 1))} className="h-9 pointer-fine:h-7 underline underline-offset-2 hover:text-ink cursor-pointer">跳過對方這棒</button>}
            </div>
          </Card>
          <Card still title="逐打席" action={<Tabs size="sm" aria-label="紀錄" value={logTab} onChange={setLogTab} items={[{ value: 'bat', label: '打擊', count: state.batting.length }, { value: 'pit', label: '投球', count: state.pitching.length }]} />} flush>
            <div className="max-h-[420px] overflow-y-auto">
              {logTab === 'bat' ? <BattingPlayByPlay pas={state.batting} onRbi={(i, rbi) => apply((s) => setRbi(s, i, rbi))} /> : <PitchingPlayByPlay pas={state.pitching} />}
            </div>
            {logTab === 'pit' && state.pitching.some((p) => p.code === 'R' || p.code === 'ER') && (
              <div className="px-4 py-2.5 border-t border-border text-[12px] text-ink-2 flex flex-wrap gap-2 items-center">
                <span>失分性質：</span>
                {state.pitching.map((p, i) => (p.code === 'R' || p.code === 'ER') ? <button key={i} type="button" onClick={() => apply((s) => toggleEarned(s, i))} title={liveCalls.get(i)?.why ?? '點一下切換自責／非自責'} className="h-7 px-2 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer tnum">{p.inning} 局 {p.oppBatter || `${p.oppOrder} 棒`}：<span className="font-medium text-ink">{p.code === 'ER' ? '自責' : '非自責'}</span></button> : null)}
              </div>
            )}
          </Card>
        </div>
      </div>

      <RunnerSheet open={runnerOpen && offRunners.length > 0} onClose={() => setRunnerOpen(false)} runners={state.runners} side={side} picked={runnerPick} onPick={setRunnerPick}
        context={`${state.outs} 出局・${state.pitches.length ? `第 ${state.pitches.length} 球後` : '第一球前'}`}
        onEvent={(r, ev) => { act((s) => runnerEvent(s, r.row, r.side, ev)); setRunnerOpen(false) }}
        onAll={allUp}
        pinch={side === 'us' ? { names: batterCands.names, disabled: batterCands.disabled, tag: batterCands.tag, can: (r) => slotOfRunner(r) >= 0, onPinch: (r, name) => { act((s) => substitute(s, slotOfRunner(r), name, 'PR')); setRunnerOpen(false) } } : undefined} />
      <SubSheet open={tool !== 'none'} onClose={() => setTool('none')} mode={tool === 'pitcher' ? 'pitcher' : 'lineup'} onMode={(m) => openTool(m)} state={state} side={side}
        batters={batterCands} pitchers={pitcherCands} pitchCount={pitchCount} pitchTone={(n) => (n >= params.pitchMax ? 'critical' : n >= params.pitchWarn ? 'warning' : 'ok')}
        sub={sub} setSub={setSub} onPickPos={pickSubPos} canSub={canSub} onConfirmSub={confirmSub} fieldPos={fieldPos}
        newPitcher={newPitcher} setNewPitcher={setNewPitcher} pitcherHint={pitcherHint} onConfirmPitcher={() => { if (newPitcher) { act((s) => changePitcher(s, newPitcher)); setNewPitcher(''); setTool('none') } }}
        extras={toolExtras} />
      <OppPitcherSheet open={oppPitcherOpen} onClose={() => setOppPitcherOpen(false)} current={state.oppPitcher} options={oppOptions} earlierRows={halfRowsWithoutOpp}
        onConfirm={(p) => act((s) => setOppPitcher(s, p))} />
      {state.oppNames && <OppLineupSheet open={oppLineupOpen} onClose={() => setOppLineupOpen(false)} lineup={state.oppLineup ?? Array(9).fill('')} current={state.oppOrder} names={oppNameList} last={lastOpp} opponent={state.game.opponent}
        onDone={(names) => act((s) => setOppLineup(s, names))} />}
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  )
}


function DestRow({ label, value, onChange, min, batter, extra, mistake }: { label: string; value: Dest; onChange: (d: Dest) => void; min: number; batter?: boolean; extra?: ReactNode; mistake?: { on: boolean; set: (on: boolean) => void } }) {
  // a runner of ours can also be 壘死: out by his own baserunning mistake (charged to him), next to a plain 出局
  type Opt = { v: Dest; l: string; m?: boolean }
  const opts: Opt[] = [{ v: 'out', l: '出局', m: false }, ...(mistake ? [{ v: 'out' as Dest, l: '壘死', m: true }] : []), { v: 1, l: '1B' }, { v: 2, l: '2B' }, { v: 3, l: '3B' }, { v: 'home', l: '得分' }]
  const isOn = (o: Opt) => value === o.v && (o.m === undefined || !mistake || mistake.on === o.m)
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[13px] text-ink w-[132px] truncate">{label}</span>
      <div className="inline-flex rounded-[var(--radius-sm)] bg-surface p-0.5 gap-0.5 border border-border flex-wrap">
        {opts.filter((o) => batter || o.v === 'out' || o.v === 'home' || (typeof o.v === 'number' && o.v >= min)).map((o) => (
          <button key={o.l} type="button" aria-pressed={isOn(o)} onClick={() => (o.m !== undefined && mistake ? mistake.set(o.m) : onChange(o.v))}
            title={o.m ? '自己跑壘失誤出局（算這位跑者的壘死）' : o.m === false && mistake ? '被守備刺殺／封殺出局' : undefined}
            className={cx('h-8 px-2.5 rounded-[6px] text-[12px] font-medium cursor-pointer', isOn(o) ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink hover:bg-surface-2', o.v === 'out' && !isOn(o) && 'text-critical')}>{o.l}</button>
        ))}
      </div>
      {extra}
    </div>
  )
}

/* ------------------------------------------------------------------ page */
const LARGE_KEY = 'bafin.record.large'
const OPP_NAMES_KEY = 'bafin.record.oppNames'
/** 結束比賽: decisions, 中繼, and the times captured when the dialog opened (the recorder may change them). */
interface FinishForm { w: string; l: string; sv: string; holds: string[]; start: string; end: string; live: boolean }
export function RecordPage() {
  const navigate = useNavigate()
  const cloud = useDataStore((s) => s.cloud)
  const saveGame = useDataStore((s) => s.saveGame)
  const dayRosterSupported = useDataStore((s) => s.dayRosterSupported)
  const recordFields = useDataStore((s) => s.recordFields)
  const oppHandOn = !cloud.configured || recordFields.oppPitcher
  const [state, setState] = useState<RecordState | null>(() => readDraft())
  const [history, setHistory] = useState<RecordState[]>([])
  const [finish, setFinish] = useState<FinishForm | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [autoSaved, setAutoSaved] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  // focus mode: the live sheet fills the screen (real fullscreen where the browser allows it; iPhones just get the overlay)
  const [focus, setFocus] = useState(false)
  const toggleFocus = () => {
    if (!focus) { setFocus(true); void document.documentElement.requestFullscreen?.().catch(() => undefined) }
    else { setFocus(false); if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined) }
  }
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setFocus(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && focus && !document.fullscreenElement) setFocus(false) }
    document.addEventListener('fullscreenchange', onChange); window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('fullscreenchange', onChange); window.removeEventListener('keydown', onKey) }
  }, [focus])
  useEffect(() => { if (!state && focus) setFocus(false) }, [state, focus])
  // 大字: the recording screen and its sheets one size up (for sunlight), remembered on this device
  const [large, setLarge] = useState(() => { try { return localStorage.getItem(LARGE_KEY) === '1' } catch { return false } })
  const toggleLarge = () => setLarge((v) => { try { localStorage.setItem(LARGE_KEY, v ? '0' : '1') } catch { /* storage unavailable */ } return !v })
  const recording = !!state
  useEffect(() => {
    document.documentElement.classList.toggle('record-large', large && recording)
    return () => document.documentElement.classList.remove('record-large')
  }, [large, recording])
  // 1) every change is written to this device immediately (survives refresh, closing the tab, the phone dying);
  // if the browser refuses (storage full), the cloud copy of the stats is only a cache: drop it and try again
  const [localOk, setLocalOk] = useState(true)
  useEffect(() => {
    let ok = writeDraft(state)
    if (!ok && cloud.configured) { dropCloudCache(); ok = writeDraft(state) }
    setLocalOk(ok)
  }, [state, cloud.configured])
  // 2) in cloud mode every change is pushed a moment later: the progress (record_drafts: other devices and the 即時比分
  // page see the count and the runners) each time, the game's rows (the stats everyone loads) only when they changed
  const latest = useRef(state)
  latest.current = state
  const rowsSaved = useRef('')
  const syncing = useRef<Promise<boolean> | null>(null)
  const again = useRef(false)
  const [synced, setSynced] = useState<string | null>(null)   // updatedAt of the last state fully in the cloud
  // A progress this page has not written yet (left on this device, or a cloud draft) never replaces a game the cloud
  // has more plate appearances of: an old practice left on a phone wiped the 9/28 game that way (2026-10-08).
  // Checked once per game; the recorder then decides (stale), and nothing syncs meanwhile.
  const trustedFor = useRef<string | null>(null)
  const [stale, setStale] = useState<StaleDraft | null>(null)
  /** true once the latest state is in the cloud */
  const sync = (force = false): Promise<boolean> => {
    if (force) rowsSaved.current = ''
    if (syncing.current) { again.current = true; return syncing.current }
    const run = (async () => {
      await Promise.resolve()   // let syncing.current be set before anything below can finish
      try {
        do {
          again.current = false
          const s = latest.current
          if (!s) break
          if (trustedFor.current !== s.game.id) {
            const verdict = staleAgainstCloud(s, useDataStore.getState())
            if (verdict === 'wait') return false   // the cloud's games are still loading: the next change tries again
            if (verdict) { setStale(verdict); return false }
            trustedFor.current = s.game.id
          }
          const edit = toGameEdit(s)
          const key = JSON.stringify(edit)
          if ((s.batting.length || s.pitching.length) && key !== rowsSaved.current) { await saveGame(edit); rowsSaved.current = key }
          if (latest.current?.game.id !== s.game.id) break   // finished or abandoned meanwhile: leave its progress gone
          const ok = await saveCloudDraft(s.game.id, s, cloud.user?.email)
          if (ok === false) setDraftsSupported(false)
          setSaveFailed(false); setSynced(s.updatedAt ?? null)
          setAutoSaved(new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
        } while (again.current)
        return true
      } catch (e) { setSaveFailed(true); setMsg(`自動儲存失敗：${e instanceof Error ? e.message : String(e)}`); return false }
      finally { syncing.current = null }
    })()
    syncing.current = run
    return run
  }
  const cloudSync = !!state && cloud.configured && !!cloud.user && cloud.isEditor
  useEffect(() => {
    if (!cloudSync) return
    const t = window.setTimeout(() => void sync(), 1000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // cloud.status: a progress that waited for the cloud's games to load syncs as soon as they are in
  }, [state?.updatedAt, state?.game.id, cloudSync, cloud.status])

  // (the first pitch and every plate appearance are timed for 比賽時間; undo goes back to the state without the stamp)
  const apply = (fn: (s: RecordState) => RecordState) => setState((s) => { if (!s) return s; setHistory((h) => [...h.slice(-59), s]); const now = new Date().toISOString(); const next = fn(s); return { ...stampTimes(s, next, now), updatedAt: now } })
  // cloud drafts: what other devices left in progress
  const [cloudDrafts, setCloudDrafts] = useState<CloudDraft<RecordState>[] | null>(null)
  const [draftsSupported, setDraftsSupported] = useState(true)
  const refreshDrafts = async () => {
    if (!cloud.configured || !cloud.user) return
    try { const d = await listCloudDrafts<RecordState>(); if (d === null) setDraftsSupported(false); else setCloudDrafts(d) } catch { /* offline: ignore */ }
  }
  useEffect(() => { void refreshDrafts() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [cloud.user])
  const newerCloud = state && cloudDrafts ? cloudDrafts.find((d) => d.game_id === state.game.id && (!state.updatedAt || d.updated_at > state.updatedAt) && d.state.updatedAt !== state.updatedAt) ?? null : null
  const resume = (d: CloudDraft<RecordState>) => { trustedFor.current = null; setStale(null); setState(d.state); setHistory([]); setMsg(`已載入 ${d.game_id} 的進度（${new Date(d.updated_at).toLocaleString('zh-TW')}）`) }
  const undo = () => setHistory((h) => { const prev = h[h.length - 1]; if (prev) setState(prev); return h.slice(0, -1) })
  const usedPitchers = useMemo(() => (state ? [...new Set([state.pitcher, ...state.pitching.map((p) => p.pitcher)])].filter(Boolean) : []), [state])
  const relievers = useMemo(() => (state ? reliefPitchers(state) : []), [state])
  const openFinish = () => { if (state) setFinish({ w: '', l: '', sv: '', holds: [], ...finishTimes(state) }) }
  // one pitcher gets only one of 勝投／中繼／救援: picking him as 勝投 or 救援 takes him off 中繼
  const pickDecision = (k: 'w' | 'l' | 'sv', v: string) => setFinish((f) => (f ? { ...f, [k]: v, holds: k === 'l' ? f.holds : f.holds.filter((h) => h !== v) } : f))
  const canEdit = !cloud.configured || (!!cloud.user && cloud.isEditor)

  if (!canEdit) {
    return (
      <>
        <PageHeader title="紀錄比賽" description="紀錄員登入後就能在這裡逐球紀錄，不必再用 Excel 匯入。" />
        <div className="max-w-md"><CloudPanel /></div>
      </>
    )
  }
  const saveDraft = async (): Promise<boolean> => {
    if (!state) return false
    setMsg(null)
    if (cloud.configured) {
      // the autosave, now and in full (another device then gets the latest substitutions too)
      const ok = await sync(true)
      if (ok) setMsg('已儲存，全隊現在就看得到這場的進度')
      return ok
    }
    try {
      const w = await saveGame(toGameEdit(state))
      setMsg(w.length ? `已儲存（${w.length} 則提醒，結束比賽時會列出）` : '已儲存')
      return true
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); return false }
  }
  const abandon = () => {
    if (!state || !window.confirm('放棄這場未完成的紀錄？（已儲存到雲端的打席不受影響，只會清掉接續用的進度）')) return
    const id = state.game.id
    writeDraft(null); setState(null); setHistory([])
    // after a save still on its way, so it cannot put the progress back
    if (cloud.configured) void Promise.resolve(syncing.current).then(() => deleteCloudDraft(id)).catch(() => undefined).then(() => refreshDrafts())
  }
  // with the cloud every play is saved by itself: a status line, and a button only to retry a failed save
  const pending = !!state && state.updatedAt !== synced
  const save: SaveState = cloud.configured
    ? saveFailed ? { tone: 'failed', status: localOk ? '同步失敗：最新進度只在這台裝置' : '同步失敗，這台裝置也存不下：先別關掉這頁', button: '重試儲存', saving: cloud.pushing, onSave: () => void saveDraft() }
      : { tone: pending ? 'pending' : 'ok', status: pending ? '尚未同步…' : autoSaved ? `已同步到雲端 ${autoSaved}` : '每次點選都會自動同步到雲端', button: null, saving: cloud.pushing, onSave: () => void saveDraft() }
    : localOk ? { tone: 'ok', status: '進度存在這台裝置；關掉再打開這頁可以接續', button: '儲存', saving: cloud.pushing, onSave: () => void saveDraft() }
      : { tone: 'failed', status: '這台裝置的儲存空間已滿，進度沒有存起來：先別關掉這頁', button: '儲存', saving: cloud.pushing, onSave: () => void saveDraft() }
  const complete = async () => {
    if (!state || !finish) return
    setMsg(null)
    try {
      // the actual first-pitch time replaces the schedule's planned one
      const w = await saveGame(toGameEdit({ ...state, finished: true }, { winningPitcher: finish.w || undefined, losingPitcher: finish.l || undefined, savePitcher: finish.sv || undefined, holds: finish.holds.length ? finish.holds : undefined, time: finish.start || undefined, endTime: finish.end || undefined }))
      const id = state.game.id
      if (cloud.configured) void Promise.resolve(syncing.current).then(() => deleteCloudDraft(id)).catch(() => undefined)
      writeDraft(null); setState(null); setHistory([]); setFinish(null)
      navigate(`/games?game=${encodeURIComponent(id)}`)
      if (w.length) window.alert(`已儲存。請核對：\n${w.map((x) => `・${x.message}`).join('\n')}`)
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <>
      {/* during a game the scoreboard bar is the top of the page (the top bar already says 紀錄比賽) */}
      {state ? <h1 className="sr-only">紀錄比賽：{state.game.date} vs {state.game.opponent}</h1>
        : <PageHeader title="紀錄比賽" description="填好比賽資訊與先發，就能逐球紀錄；每個打席會自動寫成和總表一樣的格式。" />}
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
      {cloud.configured && !dayRosterSupported && state && <div className="text-[12px] text-muted">{DAY_ROSTER_UNSUPPORTED}（比分與打席照常儲存）</div>}
      {cloud.configured && !oppHandOn && state && <div className="text-[12px] text-muted">對方投手（左投／右投）要等管理員在 Supabase 執行 {RECORD_FIELDS_MIGRATION} 才會記（比分與打席照常儲存）</div>}
      {state && stale && stale.gameId === state.game.id ? (
        <Card title="這份紀錄進度比雲端舊" subtitle={`${state.game.date} vs ${state.game.opponent}`}>
          <div className="flex flex-col gap-3 text-[13px] text-ink-2 leading-relaxed">
            <p>這台裝置留著這場的一份紀錄進度（<span className="tnum">{stale.draftPAs}</span> 個打席{state.updatedAt ? `，最後修改 ${new Date(state.updatedAt).toLocaleString('zh-TW')}` : ''}），但雲端這場已經有 <span className="font-medium text-ink tnum">{stale.cloudPAs}</span> 個打席。為了不蓋掉雲端的紀錄，這份進度沒有同步。</p>
            <p>通常是以前開始記、後來沒記完的舊進度：選「丟掉這份舊進度」就好，雲端的紀錄不受影響。</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={() => { writeDraft(null); setState(null); setHistory([]); setStale(null) }}>丟掉這份舊進度</Button>
              <Button variant="outline" size="sm" onClick={() => {
                if (!window.confirm(`確定用這台的 ${stale.draftPAs} 個打席取代雲端的 ${stale.cloudPAs} 個打席？雲端多出來的紀錄會不見。`)) return
                trustedFor.current = state.game.id; setStale(null); void sync(true)
              }}>用這台的進度取代雲端</Button>
            </div>
          </div>
        </Card>
      ) : !state ? <Setup onStart={(s) => { setState(s); setHistory([]); document.scrollingElement?.scrollTo?.({ top: 0 }) }} /> : (
        <>
          {focus ? createPortal(
            <div className="fixed inset-0 z-[60] bg-bg text-ink overflow-y-auto" role="region" aria-label="全螢幕紀錄">
              <div className="max-w-[var(--content-max)] mx-auto px-3 py-3 md:px-6 md:py-5 flex flex-col gap-4">
                <div className="flex items-center gap-3 text-[12px] text-muted"><span className="font-medium text-ink truncate">{state.game.date}・vs {state.game.opponent}</span><span className={cx('truncate', save.tone === 'failed' && 'text-critical font-medium', save.tone === 'pending' && 'text-warning')}>{save.status}</span><button type="button" onClick={toggleFocus} className="ml-auto inline-flex items-center gap-1 text-ink-2 hover:text-ink cursor-pointer"><Minimize2 className="size-3.5" />離開全螢幕</button></div>
                <Live state={state} apply={apply} undo={undo} canUndo={history.length > 0} save={save} onAbandon={abandon} onFinish={openFinish} focus onToggleFocus={toggleFocus} large={large} onToggleLarge={toggleLarge} oppHandOn={oppHandOn} />
              </div>
            </div>, document.body)
            : <Live state={state} apply={apply} undo={undo} canUndo={history.length > 0} save={save} onAbandon={abandon} onFinish={openFinish} focus={false} onToggleFocus={toggleFocus} large={large} onToggleLarge={toggleLarge} oppHandOn={oppHandOn} />}
        </>
      )}
      <Sheet open={!!finish && !!state} onClose={() => setFinish(null)} ariaLabel="結束比賽" side="bottom" desktopFrom="sm" panelClassName="sm:max-w-md" contentClassName="record-zoom">
        {finish && state && (
          <div className="p-5 flex flex-col gap-4">
            <div><div className="text-[16px] font-semibold text-ink">結束比賽</div><div className="text-[13px] text-ink-2 mt-1 tnum">{TEAM_NAME} {score(state).us} : {score(state).opp} {state.game.opponent}・{state.inning} 局{state.runners.length ? '・壘上跑者會記為殘壘' : ''}</div></div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-2">比賽時間</span>
              {/* (two columns on phones: a time input with 下午 needs the width; the total goes under them) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
                <Field label="開賽"><Input type="time" value={finish.start} onChange={(e) => setFinish({ ...finish, start: e.target.value })} className="tnum" /></Field>
                <Field label="結束"><Input type="time" value={finish.end} onChange={(e) => setFinish({ ...finish, end: e.target.value })} className="tnum" /></Field>
                {(() => {
                  const d = durationMinutes(finish.start, finish.end)
                  return <span className={cx('col-span-2 sm:col-span-1 sm:h-10 sm:pointer-fine:h-9 flex items-center text-[13px] tnum', isLongGame(d) ? 'text-warning' : 'text-ink')}>{d ? (isLongGame(d) ? LONG_GAME_NOTE : `共 ${formatDuration(d)}`) : ''}</span>
                })()}
              </div>
              <p className="text-[12px] text-muted">{finish.live ? '依第一球和最後一個打席的時間自動帶入；看影片補記的話請改成實際時間' : '這場不是現場即時紀錄，時間可以自己填或留空'}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="勝投"><PlayerSelect value={finish.w} onChange={(v) => pickDecision('w', v)} names={usedPitchers} placeholder="—" className="w-full" /></Field>
              <Field label="敗投"><PlayerSelect value={finish.l} onChange={(v) => pickDecision('l', v)} names={usedPitchers} placeholder="—" className="w-full" /></Field>
              <Field label="救援"><PlayerSelect value={finish.sv} onChange={(v) => pickDecision('sv', v)} names={usedPitchers} placeholder="—" className="w-full" /></Field>
            </div>
            {relievers.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-2">中繼（可複選，選填）</span>
                <HoldPicker names={relievers} value={finish.holds} onChange={(holds) => setFinish({ ...finish, holds })} disabled={[finish.w, finish.sv]} />
                <span className="text-[12px] text-muted">勝投、中繼、救援只能擇一</span>
              </div>
            )}
            <p className="text-[12px] text-muted">儲存後會跳到這場比賽的頁面；之後仍可用「修改資料」調整。</p>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setFinish(null)}>再想想</Button><Button variant="primary" onClick={() => void complete()} disabled={cloud.pushing}>儲存並結束</Button></div>
          </div>
        )}
      </Sheet>
    </>
  )
}
