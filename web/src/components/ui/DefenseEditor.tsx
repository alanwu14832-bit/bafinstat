/**
 * 修改資料, batch 17: who stood where in each inning we fielded (the 當日登錄名單 with every change, data/gameRoster
 * defenseTimeline), a 守位變動 added by hand when 紀錄比賽 missed it, and the 守備 lines' 失誤 put back on the players who
 * stood at those positions (data/edit fieldingErrorFixes). Errors, putouts and assists follow this alignment.
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from './Button'
import { cx } from '../../lib/format'
import { defenseTimeline } from '../../data/gameRoster'
import { FIELD_POSITIONS, posNum, type DayRosterSub, type GameDayRoster, type HomeAway } from '../../data/types'
import type { ErrorFix } from '../../data/edit'

const chip = (on: boolean) => cx('h-9 pointer-fine:h-8 min-w-9 px-2.5 rounded-[var(--radius-sm)] border text-[12px] font-medium tnum cursor-pointer transition-colors', on ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink-2 hover:bg-surface-2')

/**
 * 每局守備: pick an inning, see who stood at each position, and change one in three taps — the position, the player, 確認.
 * Someone not in the game at that inning comes in for whoever stood there (a 守備 substitution, with that batting slot);
 * someone in the game moves there (a 守位變動; the position he left is flagged as empty until it is filled). The changes
 * of the inning are listed under the grid, each with its own delete.
 */
export function DefenseByInning({ roster, innings, homeAway, names, bench = [], subs = [], reentry = false, onAdd, onRemove, battersIn }: {
  /** how many of their batters came up in an inning (the change can start in the middle of it: 從第 N 位打者起) */
  battersIn?: (inning: number) => number
  roster?: Pick<GameDayRoster, 'starters' | 'subs'>
  innings: number
  homeAway: HomeAway
  /** everyone who can be put at a position */
  names: string[]
  /** 板凳 (到場未先發): listed first among the ones not in the game */
  bench?: string[]
  /** the game's 替補紀錄 (the changes of the shown inning are listed with a delete) */
  subs?: DayRosterSub[]
  /** the game allows a player who left to come back (no re-entry hint then) */
  reentry?: boolean
  onAdd: (sub: DayRosterSub) => void
  onRemove?: (index: number) => void
}) {
  const [inning, setInning] = useState(1)
  const [pos, setPos] = useState('')
  const [who, setWho] = useState('')
  // someone coming in at an empty position: who he replaces (no one stands there to take over from)
  const [forWho, setForWho] = useState('')
  const [fromRow, setFromRow] = useState(0)
  const half: 'top' | 'bottom' = homeAway === '客' ? 'bottom' : 'top'
  const timeline = useMemo(() => defenseTimeline(roster), [roster])
  const n = Math.max(1, innings)
  const at = Math.min(inning, n)
  const d = timeline?.(at, half)
  if (!timeline || !d) return <p className="text-[12px] text-muted">先發填了守位，這裡就會列出每一局誰守哪裡（失誤、刺殺、助殺依這個算給球員）。</p>
  const field = FIELD_POSITIONS.filter((p) => p !== 'P')
  const holder = pos ? d.byPos.get(pos) : undefined
  // who had played by this half (a 已下場 player is one of them who is not in the game now; a later substitute is not)
  const ord = (inn: number, h: 'top' | 'bottom') => inn * 2 + (h === 'bottom' ? 1 : 0)
  const played = new Set([...(roster?.starters ?? []).map((x) => x.name), ...(roster?.subs ?? []).filter((x) => ord(x.inning, x.half) <= ord(at, half)).map((x) => x.in)])
  const outside = names.filter((x) => !d.inGame.has(x))
  const benchFirst = [...outside.filter((x) => bench.includes(x)), ...outside.filter((x) => !bench.includes(x))]
  const onField = [...d.inGame].filter((x) => x !== holder)
  const entering = !!who && !d.inGame.has(who)
  const replaced = holder ?? forWho
  const label = posNum(pos)
  const sentence = !who || !pos ? ''
    : entering ? `第 ${at} 局起：${who} 上場守 ${label}${replaced ? `，替下 ${replaced}` : ''}`
    : `第 ${at} 局起：${who} ${d.byName.get(who) ? `從 ${posNum(d.byName.get(who)!)} ` : ''}改守 ${label}`
  const pick = (p: string) => { setPos(p === pos ? '' : p); setWho(''); setForWho('') }
  const confirm = () => {
    if (!who || !pos) return
    const out = entering ? replaced : who
    if (!out) return
    // the batting slot goes with the change (the Box Score and 逐局表 place him by it): his own, or the one he takes over
    const slot = d.slot.get(out)
    onAdd({ kind: 'DEF', in: who, out, pos, inning: at, half, ...(slot === undefined ? {} : { slot }), ...(fromRow > 0 ? { row: fromRow } : {}) })
    setWho(''); setPos(''); setForWho(''); setFromRow(0)
  }
  // a change counts from the first half we field at or after it (one logged while we bat — a 代打 who stays in — shows
  // in the next inning we field, as the grid already has it)
  const fieldedAt = (x: DayRosterSub) => (x.half === half ? x.inning : half === 'top' ? x.inning + 1 : x.inning)
  const mine = subs.map((x, i) => ({ x, i })).filter(({ x }) => fieldedAt(x) === at)
  // the position each change put someone at (a 代打／代跑 has none of his own: the one he stands at now)
  const changed = new Set(mine.map(({ x }) => (FIELD_POSITIONS.includes(x.pos as never) ? x.pos : d.byName.get(x.in))).filter((p): p is string => !!p && p !== 'P'))
  const KIND: Record<DayRosterSub['kind'], string> = { PH: '代打', PR: '代跑', DEF: '守備', P: '換投' }
  const describe = (x: DayRosterSub) => {
    if (x.in === x.out) return `${x.in} 改守 ${posNum(x.pos)}`
    const at2 = FIELD_POSITIONS.includes(x.pos as never) ? x.pos : d.byName.get(x.in)
    return x.kind === 'DEF' ? `${x.in} 上場${at2 ? `守 ${posNum(at2)}` : ''}，替下 ${x.out}` : `${KIND[x.kind]} ${x.in} 替 ${x.out}${at2 && at2 !== 'P' ? `，守 ${posNum(at2)}` : ''}`
  }
  const empty = field.filter((p) => !d.byPos.get(p))
  const tag = (x: string) => (d.byName.get(x) ? `（${posNum(d.byName.get(x)!)}）` : '')
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="看哪一局的守備">
        {Array.from({ length: n }, (_, i) => i + 1).map((k) => <button key={k} type="button" aria-pressed={k === at} onClick={() => { setInning(k); setPos(''); setWho(''); setForWho('') }} className={chip(k === at)}>{k}</button>)}
      </div>
      <p className="text-[11px] text-muted">點要換人的守位 → 選人 → 確認（從這一局起生效）。投手的失誤算給那個打席的投手；換投請用「我隊投球」。</p>
      <ul className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[13px]" aria-label={`第 ${at} 局守備`}>
        {field.map((p) => {
          const name = d.byPos.get(p)
          return (
            <li key={p} className="min-w-0">
              <button type="button" aria-pressed={pos === p} aria-label={`${posNum(p)} ${name ?? '沒有人'}，換人`} onClick={() => pick(p)}
                className={cx('w-full min-h-10 flex items-center gap-1.5 px-2.5 rounded-[var(--radius-sm)] border text-left cursor-pointer transition-colors',
                  pos === p ? 'border-ink bg-surface-2' : name ? 'border-border bg-surface hover:bg-surface-2' : 'border-dashed border-[color-mix(in_srgb,var(--warning)_60%,transparent)] bg-surface')}>
                <span className="text-[11px] text-muted tnum shrink-0 w-11">{posNum(p)}</span>
                <span className={cx('truncate flex-1', name ? 'text-ink font-medium' : 'text-warning')}>{name ?? '沒有人'}</span>
                {changed.has(p) && <span className="text-[10px] font-medium text-muted border border-border rounded px-1 leading-4 shrink-0">換</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {pos && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 p-3" role="group" aria-label="換成誰">
          <div className="text-[12px] font-medium text-ink">第 {at} 局起，{label}{holder ? `（${holder}）` : ''} 換成：</div>
          {benchFirst.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">板凳／還沒上場（{holder ? `上場替下 ${holder}` : '上場守這個位置'}）</span>
              <div className="flex flex-wrap gap-1.5">
                {benchFirst.map((x) => <button key={x} type="button" aria-pressed={who === x} onClick={() => { setWho(x); setForWho('') }} className={chip(who === x)}>{x}{played.has(x) && !d.inGame.has(x) ? '・已下場' : ''}</button>)}
              </div>
            </div>
          )}
          {onField.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">場上的人（改守 {label}）</span>
              <div className="flex flex-wrap gap-1.5">
                {onField.map((x) => <button key={x} type="button" aria-pressed={who === x} onClick={() => setWho(x)} className={chip(who === x)}>{x}{tag(x)}</button>)}
              </div>
            </div>
          )}
          {entering && !holder && (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">這個守位現在沒有人：{who} 替下誰？</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="替誰">
                {[...d.inGame].map((x) => <button key={x} type="button" aria-pressed={forWho === x} onClick={() => setForWho(x)} className={chip(forWho === x)}>{x}{tag(x)}</button>)}
              </div>
            </div>
          )}
          {/* (the change in the middle of the inning: the errors and putouts before it stay with who stood there then) */}
          {who && (battersIn?.(at) ?? 0) > 1 && (
            <label className="flex items-center gap-2 text-[12px] text-ink-2 flex-wrap">從
              <select value={fromRow} onChange={(e) => setFromRow(Number(e.target.value))} className="h-9 pointer-fine:h-8 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-[13px]">
                {Array.from({ length: battersIn!(at) }, (_, k) => <option key={k} value={k}>{k === 0 ? '這局一開始' : `這局第 ${k + 1} 位打者`}</option>)}
              </select>起生效
            </label>
          )}
          {sentence && <p className="text-[13px] text-ink">{sentence}{entering && played.has(who) && !reentry ? '（他已下場：要在上面的板凳勾「允許被換下的球員再上場」）' : ''}</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setPos(''); setWho(''); setForWho('') }}>取消</Button>
            <Button size="sm" variant="primary" onClick={confirm} disabled={!who || (entering && !replaced)}>確認</Button>
          </div>
        </div>
      )}
      {empty.length > 0 && <p role="status" className="text-[12px] text-warning">第 {at} 局 {empty.map(posNum).join('、')} 沒有人守：點那個守位補人。</p>}
      {mine.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[12px] text-ink-2" aria-label={`第 ${at} 局的變動`}>
          {mine.map(({ x, i }) => (
            <li key={i} className="flex items-center gap-2 min-h-9">
              <span className="flex-1 min-w-0">{describe(x)}</span>
              {onRemove && <button type="button" aria-label={`刪除這個變動：${describe(x)}`} onClick={() => { onRemove(i); setPos(''); setWho(''); setForWho('') }} className="shrink-0 size-9 pointer-fine:size-8 inline-flex items-center justify-center rounded-[6px] text-muted hover:text-critical hover:bg-surface-2 cursor-pointer"><Trash2 className="size-4" /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The 守備 lines' 失誤 do not match who stood there: list them and fix with one tap. */
export function ErrorFixNotice({ fixes, onApply }: { fixes: ErrorFix[]; onApply: () => void }) {
  if (!fixes.length) return null
  return (
    <div role="status" className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)] px-3 py-2.5 text-[12px] text-ink">
      <div className="flex items-start gap-2"><AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" /><span>守備表的失誤和逐打席紀錄＋登錄名單的守位對不起來（換人後的守位以前沒有記下來）：</span></div>
      <ul className="flex flex-col gap-0.5 pl-6 tnum">
        {fixes.map((f) => <li key={`${f.player}|${f.pos}`}>{f.player} {f.pos}：失誤 {f.from} → {f.to}</li>)}
      </ul>
      <div className="pl-6"><Button size="sm" variant="outline" onClick={onApply}>依登錄名單重算失誤</Button><span className="ml-2 text-muted">按「儲存修改」才會生效</span></div>
    </div>
  )
}
