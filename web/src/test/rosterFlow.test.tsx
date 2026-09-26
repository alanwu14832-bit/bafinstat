/**
 * 當日登錄名單 + 報名名單 end to end in local mode: a registration list narrows the 先發陣容 candidates, the lineup's
 * bench and re-entry reach 紀錄比賽, a live substitution is logged, the saved game carries its day roster to the game
 * detail, the cloud row, the Excel backup, a roster rename, and the Players page 已報名 view.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useDataStore } from '../store/data'
import { SEED_DATASET } from '../data/seed'
import { LineupPage } from '../pages/Lineup'
import { RecordPage } from '../pages/Record'
import { GamesPage } from '../pages/Games'
import { PlayersPage } from '../pages/Players'
import { readDraft, writeDraft } from '../record/draft'
import { changePitcher, toGameEdit, type RecordState } from '../record/model'
import { rowsToDataset, toGameRow } from '../data/supabase'
import { datasetToWorkbook, parseWorkbook } from '../data/xlsx'
import { gameAppearances } from '../data/gameRoster'
import type { BattingPA, Game, PitchingPA } from '../data/types'

const SCHED: Game = { id: 'G20261003-01', date: '2026-10-03', time: '13:00', tournament: '大專盃', opponent: '台大', homeAway: '客', status: 'scheduled' }
const REG = ['蘇柏愷', '陳威儒', '曾亭維', '林昱丞', '陳威任', '吳藹倫', '蔡奇霖', '劉品辰', '許振謙', '謝昊瑾', '劉哲宏', '嚴敬翔']
const FIELD: Array<[string, string]> = [['P', '林昱丞'], ['C', '曾亭維'], ['1B', '陳威任'], ['2B', '劉品辰'], ['3B', '吳藹倫'], ['SS', '蔡奇霖'], ['LF', '蘇柏愷'], ['CF', '劉哲宏'], ['RF', '陳威儒']]

const optionTexts = (sel: HTMLElement) => [...sel.querySelectorAll('option')].map((o) => o.textContent ?? '')
const bat = (i: number, s: RecordState, batter: string, order: number): BattingPA => ({ gameId: s.game.id, inning: 1 + Math.floor(i / 3), order, pos: s.lineup[order - 1]?.pos, batter, pitches: ['B', 'IP'], result: '內滾', sb: 0, cs: 0, advOnError: 0, outOnBase: 0, run: 0, rbi: 0 })
const pit = (i: number, s: RecordState, pitcher: string): PitchingPA => ({ gameId: s.game.id, inning: 1 + Math.floor(i / 3), oppOrder: (i % 9) + 1, pitcher, pitches: ['S', 'IP'], result: '內滾', sba: 0, cs: 0, wp: 0, pb: 0, pk: 0 })

describe('roster feature end to end (local mode)', () => {
  beforeAll(() => {
    localStorage.clear()
    useDataStore.setState({ base: { ...SEED_DATASET, games: [...SEED_DATASET.games, SCHED] }, demo: false, registrations: [] })
  })
  afterEach(() => cleanup())

  it('registration → lineup → record setup → live sub → save → games detail → cloud row → excel → rename → players', async () => {
    // 1) registration list saved locally
    await act(async () => { await useDataStore.getState().saveRegistration({ season: 2026, tournament: ' 大專盃 ', players: REG }) })
    expect(useDataStore.getState().registrations).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem('bafin.registrations.v1')!)[0].players).toHaveLength(12)

    // 2) lineup page: choose the game, candidates narrowed to the list, bench + reentry
    render(<MemoryRouter initialEntries={['/lineup']}><Routes><Route path="/lineup" element={<LineupPage />} /><Route path="/record" element={<RecordPage />} /></Routes></MemoryRouter>)
    expect(screen.getByText('未選比賽：列出全隊')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('未指定（不依賽事篩選）'), { target: { value: SCHED.id } })
    expect(screen.getByText('依「2026 大專盃」報名名單（12 人）')).toBeInTheDocument()
    const pSel = document.querySelector<HTMLSelectElement>('select[aria-label^="P "]')!
    expect(optionTexts(pSel)).not.toContain('梁睿至')
    expect(optionTexts(pSel)).toContain('林昱丞')
    for (const [p, n] of FIELD) fireEvent.change(document.querySelector<HTMLSelectElement>(`select[aria-label^="${p} "]`)!, { target: { value: n } })
    fireEvent.click(screen.getByRole('button', { name: /依守位填入/ }))
    // bench chips: registered, active, not starting
    expect(screen.queryByRole('button', { name: '梁睿至' })).toBeNull()
    expect(screen.queryByRole('button', { name: '林昱丞' })).toBeNull()
    for (const n of ['許振謙', '謝昊瑾', '嚴敬翔']) fireEvent.click(screen.getByRole('button', { name: n }))
    fireEvent.click(screen.getByLabelText('允許被換下的球員再上場'))
    expect(screen.getByText('陣容完整')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /帶到紀錄比賽/ }))

    // 3) record setup: the lineup, bench and reentry came with it
    expect(screen.getByText(/已帶入「先發陣容」頁排好的陣容/)).toBeInTheDocument()
    expect(screen.getByDisplayValue(`${SCHED.date} ${SCHED.time} vs ${SCHED.opponent}（${SCHED.tournament}）`)).toBeInTheDocument()
    for (const n of ['許振謙', '謝昊瑾', '嚴敬翔']) expect(screen.getByRole('button', { name: n })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('允許被換下的球員再上場')).toBeChecked()
    expect(screen.getByText('依「2026 大專盃」報名名單（12 人）')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '開始紀錄' }))
    let s = readDraft()!
    expect(s.game.id).toBe(SCHED.id)
    expect(s.bench).toEqual(['許振謙', '謝昊瑾', '嚴敬翔'])
    expect(s.reentry).toBe(true)
    expect(s.startingPitcher).toBe('林昱丞')

    // 4) live: pinch hitter for the first batter, bench first
    fireEvent.click(screen.getByRole('button', { name: /代打／換人/ }))
    const who = screen.getByDisplayValue('不換人，只改守位')
    const opts = optionTexts(who)
    expect(opts.slice(1, 4)).toEqual(['許振謙（板凳）', '謝昊瑾（板凳）', '嚴敬翔（板凳）'])
    expect(opts).not.toContain('梁睿至')
    fireEvent.change(who, { target: { value: '謝昊瑾' } })
    fireEvent.click(screen.getByRole('button', { name: '確定' }))
    s = readDraft()!
    expect(s.subs).toEqual([expect.objectContaining({ kind: 'PH', in: '謝昊瑾', out: s.starters![0].name, inning: 1, half: 'top', slot: 0 })])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /儲存到雲端/ })); await new Promise((r) => setTimeout(r, 0)) })
    expect(useDataStore.getState().base.games.find((g) => g.id === SCHED.id)?.dayRoster?.subs).toHaveLength(1)
    cleanup()

    // 5) a few plays and a pitching change, then 結束 through the store
    s = { ...s, batting: [0, 1, 2].map((i) => bat(i, s, s.lineup[i].name, i + 1)), pitching: [0, 1, 2].map((i) => pit(i, s, '林昱丞')), inning: 1, half: 'bottom' }
    s = changePitcher(s, '許振謙')
    s = { ...s, pitching: [...s.pitching, pit(3, s, '許振謙')], finished: true }
    writeDraft(null)
    await act(async () => { await useDataStore.getState().saveGame(toGameEdit(s)) })
    const saved = useDataStore.getState().base.games.find((g) => g.id === SCHED.id)!
    expect(saved.status).toBeUndefined()
    expect(saved.dayRoster).toMatchObject({ bench: ['許振謙', '謝昊瑾', '嚴敬翔'], reentry: true })
    expect(saved.dayRoster!.starters).toHaveLength(9)
    expect(saved.dayRoster!.subs!.map((x) => x.kind)).toEqual(['PH', 'P'])
    const a = gameAppearances(useDataStore.getState().base, saved)
    expect(a.inferred).toBe(false)
    expect(a.bench).toEqual(['嚴敬翔'])

    // 6) game detail sheet
    render(<MemoryRouter initialEntries={[`/games?game=${SCHED.id}`]}><Routes><Route path="/games" element={<GamesPage />} /></Routes></MemoryRouter>)
    const scope = within(screen.getByText('當日登錄名單').closest('section')!)
    expect(scope.getByText('允許再上場')).toBeInTheDocument()
    expect(scope.getByText('代打')).toBeInTheDocument()
    expect(scope.getByText('換投')).toBeInTheDocument()
    expect(scope.getByRole('button', { name: '嚴敬翔' })).toBeInTheDocument()
    expect(scope.getByText(/第1局上・替/)).toBeInTheDocument()
    cleanup()

    // 7) cloud row round trip; a game without a roster leaves the key out
    const row = toGameRow(saved)
    expect(row.day_roster).toEqual(saved.dayRoster)
    expect('day_roster' in toGameRow(SEED_DATASET.games[0])).toBe(false)
    const back = rowsToDataset({ players: [], games: [row, toGameRow(SEED_DATASET.games[0])], batting: [], pitching: [], fielding: [] })
    expect(back.games[0].dayRoster).toEqual(saved.dayRoster)
    expect(back.games[1].dayRoster).toBeUndefined()

    // 8) excel backup round trip
    const wb = datasetToWorkbook(useDataStore.getState().base)
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const parsed = parseWorkbook(buf, 'backup.xlsx').dataset
    expect(parsed.games.find((g) => g.id === SCHED.id)?.dayRoster).toEqual(saved.dayRoster)

    // 9) renaming a bench player reaches the roster of that game and the registration list
    const p = useDataStore.getState().base.roster.find((x) => x.name === '嚴敬翔')!
    await act(async () => { await useDataStore.getState().saveRoster({ players: [{ original: '嚴敬翔', player: { ...p, name: '嚴敬翔二' } }], removed: [] }) })
    const renamed = useDataStore.getState().base.games.find((g) => g.id === SCHED.id)!.dayRoster!
    expect(renamed.bench).toContain('嚴敬翔二')
    expect(useDataStore.getState().registrations[0].players).toContain('嚴敬翔二')
    expect(useDataStore.getState().registrations[0].players).not.toContain('嚴敬翔')

    // 10) players page 區隔 under the 杯賽 filter
    useDataStore.setState({ filters: { ...useDataStore.getState().filters, tournament: '大專盃' } })
    render(<MemoryRouter initialEntries={['/players']}><Routes><Route path="/players" element={<PlayersPage />} /></Routes></MemoryRouter>)
    const toggle = document.querySelector<HTMLButtonElement>('button[aria-controls="roster-panel"]')!
    fireEvent.click(toggle)
    expect(screen.getByText(/2026 大專盃 報名 12 人/)).toBeInTheDocument()
    expect(screen.getAllByText('已報名')).toHaveLength(12)
    fireEvent.click(screen.getByRole('tab', { name: '報名名單' }))
    expect(screen.getByText('12 / 17 人')).toBeInTheDocument()
  })
})
