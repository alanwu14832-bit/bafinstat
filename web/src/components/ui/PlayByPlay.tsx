import { Fragment } from 'react'
import type { BattingPA, PitchingPA } from '../../data/types'
import { pitchTotals, isHitResult } from '../../data/stats'
import { POSITION_BY_NUMBER } from '../../data/types'
import { cx } from '../../lib/format'
import { Badge } from './Badge'
import { AlertTriangle } from 'lucide-react'

/** Pitch code → chip. 好球類：S/SS/CS/IP；界外 F；壞球 B */
const PITCH_STYLE: Record<string, { label: string; cls: string; title: string }> = {
  SS: { label: 'SS', cls: 'bg-[color-mix(in_srgb,var(--series-8)_18%,transparent)] text-ink', title: '揮棒落空' },
  CS: { label: 'CS', cls: 'bg-[color-mix(in_srgb,var(--series-1)_18%,transparent)] text-ink', title: '未揮棒好球' },
  S: { label: 'S', cls: 'bg-[color-mix(in_srgb,var(--series-1)_18%,transparent)] text-ink', title: '好球' },
  F: { label: 'F', cls: 'bg-[color-mix(in_srgb,var(--series-2)_22%,transparent)] text-ink', title: '界外' },
  IP: { label: 'IP', cls: 'bg-[color-mix(in_srgb,var(--series-3)_20%,transparent)] text-ink', title: '擊進場內' },
  B: { label: 'B', cls: 'bg-surface-3 text-ink-2', title: '壞球' },
}

export function PitchChips({ pitches }: { pitches: string[] }) {
  if (!pitches.length) return <span className="text-muted">—</span>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {pitches.map((p, i) => {
        const s = PITCH_STYLE[p] ?? { label: p, cls: 'bg-surface-2 text-ink-2', title: p }
        return <span key={i} title={`第 ${i + 1} 球：${s.title}`} className={cx('inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-[4px] text-[11px] font-medium tnum', s.cls)}>{s.label}</span>
      })}
    </span>
  )
}

const CODE_LABEL: Record<string, string> = { I: '1 出局', II: '2 出局', III: '3 出局', L: '殘壘', R: '得分', ER: '自責分' }
const codeBadge = (code?: string) => {
  if (!code) return null
  const out = code === 'I' || code === 'II' || code === 'III'
  const run = code === 'R' || code === 'ER'
  return <Badge variant={run ? 'good' : out ? 'neutral' : 'outline'}>{CODE_LABEL[code] ?? code}</Badge>
}

const resultCls = (r: string) => (isHitResult(r) ? 'font-semibold text-ink' : r === '保送' || r === '故四' || r === '觸身' ? 'text-ink' : 'text-ink-2')
const hitLoc = (loc?: number, traj?: string, quality?: string) => [loc ? `${loc} ${POSITION_BY_NUMBER[loc] ?? ''}` : '', traj ? ({ G: '滾地', F: '飛球', L: '平飛' } as Record<string, string>)[traj] ?? traj : '', quality ?? ''].filter(Boolean).join('・')

function InningHeader({ inning, half }: { inning: number; half: string }) {
  return (
    <tr className="bg-surface-2/60">
      <td colSpan={9} className="px-4 py-1.5 text-[11px] font-medium text-ink-2">第 {inning} 局<span className="text-muted">・{half}</span></td>
    </tr>
  )
}

const th = 'px-3 first:pl-4 last:pr-4 h-9 text-left text-[12px] font-medium text-muted whitespace-nowrap'
const td = 'px-3 first:pl-4 last:pr-4 py-2 align-top'

/** Pitch-by-pitch log of our batters for one game. */
export function BattingPlayByPlay({ pas, flags }: { pas: BattingPA[]; flags?: Map<number, string[]> }) {
  if (!pas.length) return <div className="text-[13px] text-muted px-4 py-8 text-center">沒有逐打席紀錄</div>
  let lastInning = 0
  return (
    <div className="overflow-x-auto scroll-x">
      <table className="w-full text-[13px] border-collapse min-w-[760px]">
        <thead className="sticky top-0 bg-surface z-[1]">
          <tr className="border-b border-border"><th className={th}>局面</th><th className={th}>棒次</th><th className={th}>打者</th><th className={th}>逐球</th><th className={th}>球數</th><th className={th}>結果</th><th className={th}>擊球</th><th className={th}>跑壘</th><th className={th}>狀態</th></tr>
        </thead>
        <tbody className="tnum">
          {pas.map((p, i) => {
            const pt = pitchTotals(p.pitches)
            const header = p.inning !== lastInning
            lastInning = p.inning
            const running = [p.sb ? `盜壘 ${p.sb}` : '', p.cs ? `盜壘失敗 ${p.cs}` : '', p.advOnError ? `失誤進壘 ${p.advOnError}` : '', p.outOnBase ? `壘死 ${p.outOnBase}` : '', p.rbi ? `打點 ${p.rbi}` : ''].filter(Boolean).join('・')
            return (
              <Fragment key={i}>
                {header && <InningHeader inning={p.inning} half="我隊進攻" />}
                <tr className={cx('border-t border-border hover:bg-surface-2/60', flags?.has(i) && 'bg-[color-mix(in_srgb,var(--warning)_9%,transparent)]')}>
                  <td className={cx(td, 'text-muted whitespace-nowrap')}>{flags?.has(i) && <span title={flags.get(i)!.join('\n')} className="inline-flex align-middle mr-1 text-warning"><AlertTriangle className="size-3.5" /></span>}{p.outsBefore !== undefined ? `${p.outsBefore} 出局` : ''}{p.basesBefore && p.basesBefore !== '無' ? `・壘上 ${p.basesBefore}` : ''}</td>
                  <td className={td}>{p.order ?? ''}</td>
                  <td className={cx(td, 'font-medium whitespace-nowrap')}>{p.batter}{p.pos ? <span className="text-muted font-normal text-xs ml-1">{p.pos}</span> : null}</td>
                  <td className={td}><PitchChips pitches={p.pitches} /></td>
                  <td className={cx(td, 'text-muted whitespace-nowrap')}>{pt.pitches} 球・{pt.strikes}S {pt.balls}B</td>
                  <td className={cx(td, resultCls(p.result))}>{p.result || '—'}</td>
                  <td className={cx(td, 'text-ink-2 whitespace-nowrap')}>{hitLoc(p.loc, p.traj, p.quality) || '—'}</td>
                  <td className={cx(td, 'text-ink-2 whitespace-nowrap')}>{running || '—'}</td>
                  <td className={td}>{codeBadge(p.code)}{p.note && <div className="text-[11px] text-muted mt-1">{p.note}</div>}</td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Pitch-by-pitch log of our pitchers vs the opponent for one game. */
export function PitchingPlayByPlay({ pas, flags }: { pas: PitchingPA[]; flags?: Map<number, string[]> }) {
  if (!pas.length) return <div className="text-[13px] text-muted px-4 py-8 text-center">沒有逐打席紀錄</div>
  let lastInning = 0
  let lastPitcher = ''
  return (
    <div className="overflow-x-auto scroll-x">
      <table className="w-full text-[13px] border-collapse min-w-[760px]">
        <thead className="sticky top-0 bg-surface z-[1]">
          <tr className="border-b border-border"><th className={th}>局面</th><th className={th}>對方棒次</th><th className={th}>投手</th><th className={th}>逐球</th><th className={th}>球數</th><th className={th}>結果</th><th className={th}>擊球</th><th className={th}>跑壘／守備</th><th className={th}>狀態</th></tr>
        </thead>
        <tbody className="tnum">
          {pas.map((p, i) => {
            const pt = pitchTotals(p.pitches)
            const header = p.inning !== lastInning
            const changed = !header && p.pitcher !== lastPitcher
            lastInning = p.inning; lastPitcher = p.pitcher
            const extras = [p.sba ? `被盜壘 ${p.sba}` : '', p.cs ? `阻殺 ${p.cs}` : '', p.wp ? `暴投 ${p.wp}` : '', p.pb ? `捕逸 ${p.pb}` : '', p.pk ? `牽制出局 ${p.pk}` : ''].filter(Boolean).join('・')
            return (
              <Fragment key={i}>
                {header && <InningHeader inning={p.inning} half="對方進攻" />}
                <tr className={cx('border-t border-border hover:bg-surface-2/60', changed && 'border-t-2 border-t-[color-mix(in_srgb,var(--accent)_55%,transparent)]', flags?.has(i) && 'bg-[color-mix(in_srgb,var(--warning)_9%,transparent)]')}>
                  <td className={cx(td, 'text-muted whitespace-nowrap')}>{flags?.has(i) && <span title={flags.get(i)!.join('\n')} className="inline-flex align-middle mr-1 text-warning"><AlertTriangle className="size-3.5" /></span>}{p.outsBefore !== undefined ? `${p.outsBefore} 出局` : ''}{p.basesBefore && p.basesBefore !== '無' ? `・壘上 ${p.basesBefore}` : ''}</td>
                  <td className={td}>{p.oppOrder ?? ''}{p.oppBatter ? <span className="text-muted text-xs ml-1">{p.oppBatter}</span> : null}</td>
                  <td className={cx(td, 'font-medium whitespace-nowrap')}>{p.pitcher}{changed && <Badge variant="accent" className="ml-1.5">換投</Badge>}</td>
                  <td className={td}><PitchChips pitches={p.pitches} /></td>
                  <td className={cx(td, 'text-muted whitespace-nowrap')}>{pt.pitches} 球・{pt.strikes}S {pt.balls}B</td>
                  <td className={cx(td, resultCls(p.result))}>{p.result || '—'}</td>
                  <td className={cx(td, 'text-ink-2 whitespace-nowrap')}>{hitLoc(p.loc, p.traj, p.quality) || '—'}</td>
                  <td className={cx(td, 'text-ink-2 whitespace-nowrap')}>{extras || '—'}</td>
                  <td className={td}>{codeBadge(p.code)}{p.note && <div className="text-[11px] text-muted mt-1">{p.note}</div>}</td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PitchLegend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
      {Object.entries(PITCH_STYLE).map(([k, v]) => (
        <span key={k} className="inline-flex items-center gap-1"><span className={cx('inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-[3px] font-medium', v.cls)}>{v.label}</span>{v.title}</span>
      ))}
    </div>
  )
}
