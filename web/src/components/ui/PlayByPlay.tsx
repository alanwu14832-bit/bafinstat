import { Fragment } from 'react'
import { isPlaced, OPP_HAND_LABEL, type BattingPA, type PitchingPA, type PlayEvent } from '../../data/types'
import { balksIn, playText, playWhen } from '../../data/plays'
import { inningsOf, placedBases } from '../../record/timeline'
import { pitchTotals, isHitResult } from '../../data/stats'
import { POSITION_BY_NUMBER } from '../../data/types'
import { cx } from '../../lib/format'
import { signedPtsBetween } from '../../lib/fmt'
import { WPA_DISCLAIMER, type RowWin } from '../../data/winTimeline'
import { Badge } from './Badge'
import { AlertTriangle, X } from 'lucide-react'

/** Pitch code → chip. 好球類：S/SS/CS/IP；界外 F；壞球 B */
const PITCH_STYLE: Record<string, { label: string; cls: string; title: string }> = {
  SS: { label: 'SS', cls: 'bg-[color-mix(in_srgb,var(--series-8)_18%,transparent)] text-ink', title: '揮棒落空' },
  CS: { label: 'CS', cls: 'bg-[color-mix(in_srgb,var(--series-7)_18%,transparent)] text-ink', title: '未揮棒好球' },
  S: { label: 'S', cls: 'bg-[color-mix(in_srgb,var(--series-7)_18%,transparent)] text-ink', title: '好球' },
  F: { label: 'F', cls: 'bg-[color-mix(in_srgb,var(--warning)_22%,transparent)] text-ink', title: '界外' },
  IP: { label: 'IP', cls: 'bg-[color-mix(in_srgb,var(--series-3)_20%,transparent)] text-ink', title: '擊進場內' },
  B: { label: 'B', cls: 'bg-surface-3 text-ink-2', title: '壞球' },
}

/** One chip per pitch; with `onRemove` each chip is a button that deletes that pitch. */
export function PitchChips({ pitches, onRemove }: { pitches: string[]; onRemove?: (index: number) => void }) {
  if (!pitches.length) return <span className="text-muted">—</span>
  return (
    <span className="inline-flex flex-wrap gap-1">
      {pitches.map((p, i) => {
        const s = PITCH_STYLE[p] ?? { label: p, cls: 'bg-surface-2 text-ink-2', title: p }
        const cls = cx('inline-flex items-center justify-center px-1 rounded-[4px] font-medium tnum', s.cls)
        return onRemove
          ? <button key={i} type="button" onClick={() => onRemove(i)} title={`刪除第 ${i + 1} 球（${s.title}）`} aria-label={`刪除第 ${i + 1} 球 ${s.title}`} className={cx(cls, 'h-8 min-w-8 text-[12px] cursor-pointer hover:ring-2 hover:ring-[var(--critical)]/50')}>{s.label}</button>
          : <span key={i} title={`第 ${i + 1} 球：${s.title}`} className={cx(cls, 'h-5 min-w-5 text-[11px]')}>{s.label}</span>
      })}
    </span>
  )
}

/** A runner play between pitches, as a pill (with `onRemove`, a button that takes it back). */
function PlayPill({ e, who, big, onRemove }: { e: PlayEvent; who?: string; big?: boolean; onRemove?: () => void }) {
  const text = `${who ? `${who} ` : ''}${playText(e)}`
  const cls = cx('inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap',
    big ? 'h-8 px-2.5 text-[12px]' : 'h-5 px-1.5 text-[11px]',
    e.to === 'out' ? 'border-[color-mix(in_srgb,var(--critical)_45%,transparent)] text-critical' : e.to === 'home' ? 'border-[color-mix(in_srgb,var(--good)_50%,transparent)] text-ink' : 'border-[color-mix(in_srgb,var(--accent)_55%,transparent)] text-ink')
  return onRemove
    ? <button type="button" onClick={onRemove} title={`刪除：${playWhen(e.at)} ${text}`} aria-label={`刪除跑壘事件：${playWhen(e.at)} ${text}`} className={cx(cls, 'cursor-pointer hover:ring-2 hover:ring-[var(--critical)]/40')}>{text}<X className="size-3 opacity-60" /></button>
    : <span title={`${playWhen(e.at)}：${text}`} className={cls}>{text}</span>
}

/**
 * 逐球 with the runner plays between them: 「B  CS  [暴投 1B→2B]  B  [盜壘 2B→3B]  IP」. With the remove handlers each
 * pitch and play is a button that deletes it (the plate-appearance editor).
 */
export function PitchPlays({ pitches, events, whoOf, onRemovePitch, onRemovePlay }: { pitches: string[]; events?: PlayEvent[]; whoOf?: (n: number) => string | undefined; onRemovePitch?: (index: number) => void; onRemovePlay?: (n: number) => void }) {
  const plays = (events ?? []).map((e, n) => ({ e, n }))
  if (!plays.length) return <PitchChips pitches={pitches} onRemove={onRemovePitch} />
  const at = (k: number) => plays.filter(({ e }) => (k < pitches.length ? e.at === k : e.at >= k))
  const pill = ({ e, n }: { e: PlayEvent; n: number }) => <PlayPill key={`p${n}`} e={e} who={whoOf?.(n)} big={!!onRemovePlay} onRemove={onRemovePlay && (() => onRemovePlay(n))} />
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {at(0).map(pill)}
      {pitches.map((p, i) => (
        <Fragment key={i}>
          <PitchChips pitches={[p]} onRemove={onRemovePitch && (() => onRemovePitch(i))} />
          {at(i + 1).map(pill)}
        </Fragment>
      ))}
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

const BASE_ZH: Record<number, string> = { 1: '一壘', 2: '二壘', 3: '三壘' }
/** 突破僵局 runners: the base each was put on (by row), inning by inning. */
function placedMap(pas: Array<BattingPA | PitchingPA>): Record<number, number> {
  if (!pas.some(isPlaced)) return {}
  const out: Record<number, number> = {}
  for (const idx of inningsOf(pas).values()) Object.assign(out, placedBases(pas, idx))
  return out
}
/** 局面 of a row: a tie-break runner is just 「0 出局」 (he is not a batter who came up with runners on). */
const situation = (p: BattingPA | PitchingPA) => `${p.outsBefore !== undefined ? `${p.outsBefore} 出局` : ''}${!isPlaced(p) && p.basesBefore && p.basesBefore !== '無' ? `・壘上 ${p.basesBefore}` : ''}`
const placedResult = (base?: number) => `突破僵局${base ? `・放上${BASE_ZH[base]}` : ''}`
const resultCls = (r: string) => (isHitResult(r) ? 'font-semibold text-ink' : r === '保送' || r === '故四' || r === '觸身' ? 'text-ink' : 'text-ink-2')
const hitLoc = (loc?: number, traj?: string, quality?: string) => [loc ? `${loc} ${POSITION_BY_NUMBER[loc] ?? ''}` : '', traj ? ({ G: '滾地', F: '飛球', L: '平飛' } as Record<string, string>)[traj] ?? traj : '', quality ?? ''].filter(Boolean).join('・')

function InningHeader({ inning, half, cols = 9 }: { inning: number; half: string; cols?: number }) {
  return (
    <tr id={`inning-${inning}`} className="bg-surface-2/60 scroll-mt-40">
      <td colSpan={cols} className="px-4 py-1.5 text-[11px] font-medium text-ink-2">第 {inning} 局<span className="text-muted">・{half}</span></td>
    </tr>
  )
}

const th = 'px-3 first:pl-4 last:pr-4 h-9 text-left text-[12px] font-medium text-muted whitespace-nowrap'
const td = 'px-3 first:pl-4 last:pr-4 py-2 align-top'

/** 獲勝機率 of a plate appearance (game pages only; 紀錄比賽 never passes it). */
const WPA_TITLE = `這個打席讓我隊獲勝機率變了多少；LI＝局面緊張程度，1.0 是一般情況。${WPA_DISCLAIMER}。`
const pct = (w: number) => `${Math.round(w * 100)}%`
/** 「打席前 45% → 打席後 60%；其中跑壘 +3%、打擊結果 +12%」: every change is between the rounded numbers shown, so it adds up. */
export function wpaTitle(w: RowWin): string {
  const parts = [`打席前 ${pct(w.weBefore)} → 打席後 ${pct(w.weAfter)}`]
  if (pct(w.weResult) !== pct(w.weBefore)) parts.push(`其中跑壘 ${signedPtsBetween(w.weBefore, w.weResult)}、打擊結果 ${signedPtsBetween(w.weResult, w.weAfter)}`)
  if (pct(w.weEnd) !== pct(w.weAfter)) parts.push(`之後的跑壘 ${signedPtsBetween(w.weAfter, w.weEnd)}（下一位打者還沒打完就結束了）`)
  return `${parts.join('；')}${w.approx ? '（這個半局的壘上狀況是推估）' : ''}。${WPA_DISCLAIMER}。`
}
function WpaCell({ w }: { w?: RowWin }) {
  if (!w) return <td className={cx(td, 'text-muted')}>—</td>
  return (
    <td className={cx(td, 'whitespace-nowrap')} title={wpaTitle(w)}>
      <span className={cx('font-medium tnum', w.wpa > 0.005 ? 'text-good' : w.wpa < -0.005 ? 'text-critical' : 'text-ink-2')}>{signedPtsBetween(w.weResult, w.weAfter)}</span>
      {/* FanGraphs: LI above 2 is high leverage, 0.85–2 medium */}
      <div className="mt-1">{w.li > 2 ? <Badge variant="warning">高關鍵 LI {w.li.toFixed(1)}</Badge> : <span className="text-[11px] text-muted tnum">LI {w.li.toFixed(1)}</span>}</div>
    </td>
  )
}

/** Pitch-by-pitch log of our batters for one game. */
/** `onRbi` (紀錄比賽) adds 打點 −／＋ on every row, for a run that was entered after the plate appearance was sent. */
/**
 * The opponent pitcher each of these plate appearances was the first one against (keyed by row index): 「對方先發・右投 王」,
 * later 「對方換投・左投 林」. Rows without any opponent pitcher are skipped (the next one with one starts a new stint).
 */
export function oppPitcherMarks(pas: BattingPA[]): Map<number, string> {
  const out = new Map<number, string>()
  const seen = new Map<string, string>()   // game → the last opponent pitcher key
  pas.forEach((p, i) => {
    if ((!p.oppHand && !p.oppPitcher) || isPlaced(p)) return
    const key = `${p.oppPitcher ?? ''}|${p.oppHand ?? ''}`
    const was = seen.get(p.gameId)
    if (was === key) return
    const who = [p.oppHand ? OPP_HAND_LABEL[p.oppHand] : '', p.oppPitcher ?? ''].filter(Boolean).join(' ')
    out.set(i, `${was === undefined ? '對方先發' : '對方換投'}・${who}`)
    seen.set(p.gameId, key)
  })
  return out
}

/**
 * `win` (game pages): a 「WPA」 column after 結果, by row index. `keyRows`: the 本場關鍵打席 rows — the hook for the
 * 逐球 filter's 關鍵打席 chip (data/pbpFilter's 'key' set).
 */
export function BattingPlayByPlay({ pas, flags, onRbi, win }: { pas: BattingPA[]; flags?: Map<number, string[]>; onRbi?: (index: number, rbi: number) => void; win?: Map<number, RowWin>; keyRows?: Set<number> }) {
  if (!pas.length) return <div className="text-[13px] text-muted px-4 py-8 text-center">沒有逐打席紀錄</div>
  const marks = oppPitcherMarks(pas)
  const placed = placedMap(pas)
  let lastInning = 0
  return (
    <div className="overflow-x-auto scroll-x">
      <table className="w-full text-[13px] border-collapse min-w-[760px]">
        <thead className="sticky top-0 bg-surface z-[1]">
          <tr className="border-b border-border"><th className={th}>局面</th><th className={th}>棒次</th><th className={th}>打者</th><th className={th}>逐球</th><th className={th}>本打席用球</th><th className={th}>結果</th>{win && <th className={th} title={WPA_TITLE}>WPA</th>}<th className={th}>擊球</th><th className={th}>跑壘</th><th className={th}>狀態</th></tr>
        </thead>
        <tbody className="tnum">
          {pas.map((p, i) => {
            const pt = pitchTotals(p.pitches)
            const header = p.inning !== lastInning
            lastInning = p.inning
            const running = [p.runner ? `代跑 ${p.runner}` : '', p.sb ? `盜壘 ${p.sb}` : '', p.cs ? `盜壘失敗 ${p.cs}` : '', p.advOnError ? `失誤進壘 ${p.advOnError}` : '', p.baserunningOuts ? `壘死 ${p.baserunningOuts}` : '', p.outOnBase - (p.baserunningOuts ?? 0) > 0 ? `壘上出局 ${p.outOnBase - (p.baserunningOuts ?? 0)}` : '', !onRbi && p.rbi ? `打點 ${p.rbi}` : ''].filter(Boolean).join('・')
            return (
              <Fragment key={i}>
                {header && <InningHeader inning={p.inning} half="我隊進攻" cols={win ? 10 : 9} />}
                <tr className={cx('border-t border-border hover:bg-surface-2/60', flags?.has(i) && 'bg-[color-mix(in_srgb,var(--warning)_9%,transparent)]')}>
                  <td className={cx(td, 'text-muted whitespace-nowrap')}>{flags?.has(i) && <span title={flags.get(i)!.join('\n')} className="inline-flex align-middle mr-1 text-warning"><AlertTriangle className="size-3.5" /></span>}{situation(p)}</td>
                  <td className={td}>{p.order ?? ''}</td>
                  <td className={cx(td, 'font-medium whitespace-nowrap')}>{p.batter}{p.pos ? <span className="text-muted font-normal text-xs ml-1">{p.pos}</span> : null}{marks.has(i) && <div className="mt-1"><Badge variant="outline">{marks.get(i)}</Badge></div>}</td>
                  <td className={td}><PitchPlays pitches={p.pitches} events={p.events} /></td>
                  <td className={cx(td, 'text-muted whitespace-nowrap')} title={isPlaced(p) ? '延長賽照規則放上壘的跑者，不算打席' : '這個打席總共投了幾球；好球類包含界外與擊進場內，不是當下的球數'}>{isPlaced(p) ? '不算打席' : `用球 ${pt.pitches}（好球類 ${pt.strikes}、壞球 ${pt.balls}）`}</td>
                  <td className={cx(td, 'whitespace-nowrap', isPlaced(p) ? 'text-muted' : resultCls(p.result))}>{isPlaced(p) ? placedResult(placed[i]) : p.result || '—'}</td>
                  {win && <WpaCell w={win.get(i)} />}
                  <td className={cx(td, 'text-ink-2 whitespace-nowrap')}>{hitLoc(p.loc, p.traj, p.quality) || '—'}</td>
                  <td className={cx(td, 'text-ink-2 whitespace-nowrap')}>
                    {/* a 突破僵局 runner never has an RBI: no stepper on his row */}
                    {onRbi && !isPlaced(p) && (
                      <span className="inline-flex items-center gap-1 mr-2 align-middle">
                        打點
                        <button type="button" aria-label={`第 ${i + 1} 個打席 ${p.batter} 打點減一`} disabled={!p.rbi} onClick={() => onRbi(i, p.rbi - 1)} className="size-8 pointer-fine:size-6 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer disabled:opacity-35 disabled:cursor-default">−</button>
                        <span className="w-4 text-center font-medium text-ink">{p.rbi}</span>
                        <button type="button" aria-label={`第 ${i + 1} 個打席 ${p.batter} 打點加一`} disabled={p.rbi >= 4} onClick={() => onRbi(i, p.rbi + 1)} className="size-8 pointer-fine:size-6 rounded-[6px] border border-border hover:bg-surface-2 cursor-pointer disabled:opacity-35 disabled:cursor-default">＋</button>
                      </span>
                    )}
                    {running || (onRbi && !isPlaced(p) ? '' : '—')}
                  </td>
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
export function PitchingPlayByPlay({ pas, flags, win }: { pas: PitchingPA[]; flags?: Map<number, string[]>; win?: Map<number, RowWin>; keyRows?: Set<number> }) {
  if (!pas.length) return <div className="text-[13px] text-muted px-4 py-8 text-center">沒有逐打席紀錄</div>
  const placed = placedMap(pas)
  let lastInning = 0
  let lastPitcher = ''
  return (
    <div className="overflow-x-auto scroll-x">
      <table className="w-full text-[13px] border-collapse min-w-[760px]">
        <thead className="sticky top-0 bg-surface z-[1]">
          <tr className="border-b border-border"><th className={th}>局面</th><th className={th}>對方棒次</th><th className={th}>投手</th><th className={th}>逐球</th><th className={th}>本打席用球</th><th className={th}>結果</th>{win && <th className={th} title={WPA_TITLE}>WPA</th>}<th className={th}>擊球</th><th className={th}>跑壘／守備</th><th className={th}>狀態</th></tr>
        </thead>
        <tbody className="tnum">
          {pas.map((p, i) => {
            const pt = pitchTotals(p.pitches)
            const header = p.inning !== lastInning
            const changed = !header && p.pitcher !== lastPitcher
            lastInning = p.inning; lastPitcher = p.pitcher
            const extras = [p.sba ? `被盜壘 ${p.sba}` : '', p.cs ? `阻殺 ${p.cs}` : '', p.wp ? `暴投 ${p.wp}` : '', p.pb ? `捕逸 ${p.pb}` : '', p.pk ? `牽制出局 ${p.pk}` : '', balksIn(p.events) ? `投手犯規 ${balksIn(p.events)}` : '', p.errors?.length ? `失誤 ${p.errors.join('、')}` : ''].filter(Boolean).join('・')
            return (
              <Fragment key={i}>
                {header && <InningHeader inning={p.inning} half="對方進攻" cols={win ? 10 : 9} />}
                <tr className={cx('border-t border-border hover:bg-surface-2/60', changed && 'border-t-2 border-t-[color-mix(in_srgb,var(--accent)_55%,transparent)]', flags?.has(i) && 'bg-[color-mix(in_srgb,var(--warning)_9%,transparent)]')}>
                  <td className={cx(td, 'text-muted whitespace-nowrap')}>{flags?.has(i) && <span title={flags.get(i)!.join('\n')} className="inline-flex align-middle mr-1 text-warning"><AlertTriangle className="size-3.5" /></span>}{situation(p)}</td>
                  <td className={td}>{p.oppOrder ?? ''}{p.oppBatter ? <span className="text-muted text-xs ml-1">{p.oppBatter}</span> : null}</td>
                  <td className={cx(td, 'font-medium whitespace-nowrap')}>{p.pitcher}{changed && <Badge variant="accent" className="ml-1.5">換投</Badge>}</td>
                  <td className={td}><PitchPlays pitches={p.pitches} events={p.events} /></td>
                  <td className={cx(td, 'text-muted whitespace-nowrap')} title={isPlaced(p) ? '延長賽照規則放上壘的跑者，不算打席' : '這個打席總共投了幾球；好球類包含界外與擊進場內，不是當下的球數'}>{isPlaced(p) ? '不算打席' : `用球 ${pt.pitches}（好球類 ${pt.strikes}、壞球 ${pt.balls}）`}</td>
                  <td className={cx(td, 'whitespace-nowrap', isPlaced(p) ? 'text-muted' : resultCls(p.result))}>{isPlaced(p) ? placedResult(placed[i]) : p.result || '—'}</td>
                  {win && <WpaCell w={win.get(i)} />}
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
