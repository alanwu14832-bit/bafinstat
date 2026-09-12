import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PitchChips } from '../components/ui/PlayByPlay'
import { Badge } from '../components/ui/Badge'
import { Diamond } from '../record/Diamond'
import { BOARD, CountLights, LineScoreBoard } from '../components/ui/Scoreboard'
import { readDraft } from '../record/draft'
import { count, offense, score, type RecordState } from '../record/model'
import { cloudConfigured, listCloudDrafts } from '../data/supabase'
import { useDataStore } from '../store/data'
import { TEAM_NAME } from '../data/seed'
import { cx } from '../lib/format'

const POLL_MS = 5000

/** Public live scoreboard. Reads the in-progress state the recorder's device keeps in sync (cloud), or this device's own draft. */
export function LivePage() {
  const [drafts, setDrafts] = useState<Array<{ state: RecordState; updatedAt: string; by?: string | null }>>([])
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const base = useDataStore((s) => s.base)
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        if (cloudConfigured) {
          const d = await listCloudDrafts<RecordState>()
          if (!alive) return
          if (d === null) { setError('雲端尚未建立 record_drafts 表，無法顯示即時比分'); return }
          setDrafts(d.map((x) => ({ state: x.state, updatedAt: x.updated_at, by: x.updated_by })))
        } else {
          const local = readDraft()
          setDrafts(local ? [{ state: local, updatedAt: local.updatedAt ?? local.startedAt }] : [])
        }
        setError(null)
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)) }
    }
    void load()
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') { void load(); setTick((t) => t + 1) } }, POLL_MS)
    return () => { alive = false; window.clearInterval(id) }
  }, [])

  const live = useMemo(() => drafts.filter((d) => !d.state.finished).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0] ?? null, [drafts])
  const lastFinal = useMemo(() => [...base.games].filter((g) => !g.status).sort((a, b) => (a.date < b.date ? 1 : -1))[0], [base.games])
  const today = new Date().toISOString().slice(0, 10)
  const nextGame = useMemo(() => base.games.filter((g) => g.status === 'scheduled' && g.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0], [base.games, today])
  void tick

  if (!live) {
    return (
      <>
        <PageHeader title="即時比分" description="紀錄員在「紀錄比賽」逐球輸入時，這一頁會每 5 秒自動更新，不需登入。" />
        <Card>
          <EmptyState title="目前沒有進行中的比賽" description={error ?? (nextGame ? `下一場：${nextGame.date}${nextGame.time ? ` ${nextGame.time}` : ''} vs ${nextGame.opponent}${nextGame.venue ? `・${nextGame.venue}` : ''}` : lastFinal ? `最近一場：${lastFinal.date} vs ${lastFinal.opponent}，到「比賽」頁查看完整成績。` : undefined)}
            action={<span className="inline-flex gap-4 text-[13px]">{nextGame && <Link to="/schedule" className="underline underline-offset-2 text-ink">看賽程</Link>}{lastFinal && <Link to={`/games?game=${encodeURIComponent(lastFinal.id)}`} className="underline underline-offset-2 text-ink">看最近一場</Link>}</span>} />
        </Card>
      </>
    )
  }

  const s = live.state
  const sc = score(s)
  const side = offense(s)
  const c = count(s.pitches)
  const weTop = s.game.homeAway === '客'
  const rows = side === 'us' ? s.batting : s.pitching
  const recent = rows.slice(-6).reverse()
  const batter = side === 'us' ? `${s.slot + 1} 棒 ${s.lineup[s.slot]?.name ?? ''}` : `對方 ${s.oppOrder} 棒${s.oppBatter ? ` ${s.oppBatter}` : ''}`
  const n = Math.max(sc.lineUs.length, s.game.innings ?? 0)
  const hitsUs = s.batting.filter((p) => ['一安', '二安', '三安', '全壘打'].includes(p.result)).length
  const hitsOpp = s.pitching.filter((p) => ['一安', '二安', '三安', '全壘打'].includes(p.result)).length

  return (
    <>
      <PageHeader title="即時比分" description={`${s.game.date}・${s.game.tournament}・${s.game.venue ?? ''}${live.by ? `・紀錄 ${live.by}` : ''}・每 5 秒更新，最後更新 ${new Date(live.updatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}${error ? '・重新連線中' : ''}`}
        actions={<Badge variant="good"><span className="inline-block size-1.5 rounded-full bg-good mr-1 animate-pulse" />進行中</Badge>} />
      <div className="rounded-[var(--radius)] overflow-hidden" style={{ background: BOARD.bg, color: BOARD.ink, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 md:gap-8 text-center p-5 md:p-8">
          <div><div className="text-[13px] md:text-[15px] truncate" style={{ color: BOARD.muted }}>{weTop ? TEAM_NAME : s.game.opponent}</div><div className="figure text-[56px] md:text-[84px] font-semibold leading-none mt-1">{weTop ? sc.us : sc.opp}</div></div>
          <div className="flex flex-col items-center gap-2">
            <div className="text-[18px] md:text-[22px] font-semibold">第 {s.inning} 局{s.half === 'top' ? '上' : '下'}</div>
            <Diamond runners={s.runners} size={96} onBoard />
            <CountLights balls={c.balls} strikes={c.strikes} outs={s.outs} size="lg" onBoard />
          </div>
          <div><div className="text-[13px] md:text-[15px] truncate" style={{ color: BOARD.muted }}>{weTop ? s.game.opponent : TEAM_NAME}</div><div className="figure text-[56px] md:text-[84px] font-semibold leading-none mt-1">{weTop ? sc.opp : sc.us}</div></div>
        </div>
        <LineScoreBoard className="rounded-none" innings={n} current={{ inning: s.inning, half: s.half }} showErrors={false}
          top={weTop ? { name: TEAM_NAME, line: sc.lineUs, r: sc.us, h: hitsUs, us: true } : { name: s.game.opponent, line: sc.lineOpp, r: sc.opp, h: hitsOpp }}
          bottom={weTop ? { name: s.game.opponent, line: sc.lineOpp, r: sc.opp, h: hitsOpp } : { name: TEAM_NAME, line: sc.lineUs, r: sc.us, h: hitsUs, us: true }} />
      </div>
      <Card bodyClassName="p-4 md:p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[13px]">
          <div><div className="text-[12px] text-muted">現在{side === 'us' ? '打擊' : '對方打者'}</div><div className="text-[15px] font-semibold text-ink mt-0.5">{batter}</div></div>
          <div><div className="text-[12px] text-muted">{side === 'us' ? '壘上' : '我隊投手'}</div><div className="text-[15px] font-semibold text-ink mt-0.5">{side === 'us' ? (s.runners.length ? s.runners.map((r) => `${r.base}B ${r.name}`).join('・') : '無人') : s.pitcher}</div></div>
          <div><div className="text-[12px] text-muted">球數</div><div className="text-[15px] font-semibold text-ink mt-0.5 tnum">B {c.balls} – S {c.strikes} <span className="ml-2 font-normal"><PitchChips pitches={s.pitches} /></span></div></div>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 md:gap-5">
        <Card title={side === 'us' ? '我隊最近打席' : '對方最近打席'} flush>
          <ul className="divide-y divide-[var(--border)] text-[13px]">
            {recent.length === 0 && <li className="px-4 py-6 text-center text-muted">這個半局還沒有打席</li>}
            {recent.map((p, i) => (
              <li key={i} className="px-4 py-2 flex items-center gap-3">
                <span className="text-muted tnum w-8 shrink-0">{p.inning}{'batter' in p ? '' : ''}局</span>
                <span className="font-medium text-ink truncate flex-1">{'batter' in p ? p.batter : (p.oppBatter || `對方 ${p.oppOrder} 棒`)}</span>
                <span className={cx(['一安', '二安', '三安', '全壘打'].includes(p.result) ? 'font-semibold text-ink' : 'text-ink-2')}>{p.result || '—'}</span>
                {p.code && <Badge variant={p.code === 'R' || p.code === 'ER' ? 'good' : 'neutral'}>{p.code}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
