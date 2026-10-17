/**
 * The buttons of the 紀錄比賽 screen — pitch pad, result chips, batted-ball picker — shared with the post-game
 * plate-appearance editor, so fixing a game later looks and works exactly like recording it.
 */
import { LOC_HOLES, OUT_AT_LABEL, posNum, type OutAt } from '../data/types'
import { FIELD_POSITIONS, UNKNOWN_FIELDER } from '../data/errors'
import { cx } from '../lib/format'
import { OUT_RESULTS } from './model'

export const PITCH_BUTTONS: Array<{ code: string; label: string; hint: string }> = [
  { code: 'B', label: '壞球', hint: 'B' }, { code: 'CS', label: '好球・未揮', hint: 'CS' }, { code: 'SS', label: '揮空', hint: 'SS' }, { code: 'F', label: '界外', hint: 'F' }, { code: 'IP', label: '擊進場內', hint: 'IP' },
]
export const RESULT_GROUPS: Array<{ label: string; items: string[] }> = [
  { label: '安打', items: ['一安', '內安', '二安', '場地二安', '三安', '全壘打'] },
  { label: '上壘', items: ['保送', '故四', '觸身', '失誤', '野選', '妨礙'] },
  { label: '出局', items: ['三振', '內滾', '內飛', '外飛', '界外飛', '犧觸', '犧飛', '雙殺'] },
]
/** Gap codes for a ball nobody touched (三游穿越安打 → 56), shown under the nine fielder buttons. */
const LOC_HOLE_KEYS = [56, 46, 34, 78, 89]
const LOC_GRID: Array<Array<number | null>> = [[7, 8, 9], [5, 6, 4], [null, 1, 3], [null, 2, null]]
const LOC_LABEL: Record<number, string> = { 1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF' }
/** Results without a batted ball: no 落點／軌跡／強度 to pick (one list for the stats and the screens: data/types). */
export { NO_BATTED_BALL } from '../data/types'

export const bigBtn = 'h-12 rounded-[var(--radius-sm)] border border-border bg-surface text-[14px] font-medium text-ink hover:bg-surface-2 active:bg-surface-3 cursor-pointer transition-colors motion-reduce:transition-none'
export const chipBtn = (active: boolean) => cx('h-9 px-3 rounded-[var(--radius-sm)] border text-[13px] font-medium cursor-pointer transition-colors motion-reduce:transition-none', active ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink hover:bg-surface-2')

/** 壘死 / 壘上出局: which base he was put out at (1B 2B 3B 本壘). `value` undefined = not said yet (older records read as his own base). */
const OUT_AT_CHOICES: OutAt[] = [1, 2, 3, 'home']
export function OutAtChips({ value, onPick, name }: { value?: OutAt; onPick: (at: OutAt) => void; name?: string }) {
  return (
    <div className="basis-full flex items-center gap-1.5 flex-wrap" role="group" aria-label={`${name ? `${name} ` : ''}死在哪個壘包`}>
      <span className="text-[12px] text-ink-2 mr-0.5">死在</span>
      {OUT_AT_CHOICES.map((b) => <button key={String(b)} type="button" aria-label={`死在${OUT_AT_LABEL[b]}`} aria-pressed={value === b} onClick={() => onPick(b)} className={cx(chipBtn(value === b), 'h-9 pointer-fine:h-8 min-w-9 px-2.5 text-[12px]')}>{OUT_AT_LABEL[b]}</button>)}
    </div>
  )
}

/** The five big pitch buttons. */
export function PitchPad({ onPitch, disabled }: { onPitch: (code: string) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {PITCH_BUTTONS.map((b) => (
        <button key={b.code} type="button" onClick={() => onPitch(b.code)} disabled={disabled} className={cx(bigBtn, 'flex flex-col items-center justify-center leading-tight disabled:opacity-40')}>
          <span>{b.label}</span><span className="text-[10px] text-muted tnum">{b.hint}</span>
        </button>
      ))}
    </div>
  )
}

/** 安打／上壘／出局 result chips; `value` is shown selected. With `only`, the other results are greyed out (after IP: a ball in play). */
export function ResultChips({ value, onPick, only, disabled }: { value?: string; onPick: (result: string) => void; only?: Set<string>; /** all greyed out (a question to answer first) */ disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      {RESULT_GROUPS.map((g) => (
        <div key={g.label} className="flex items-start gap-2">
          <span className="text-[12px] text-muted w-8 shrink-0 h-9 inline-flex items-center">{g.label}</span>
          <div className="flex flex-wrap gap-1.5">{g.items.map((r) => <button key={r} type="button" aria-pressed={value === r} disabled={disabled || (!!only && !only.has(r))} onClick={() => onPick(r)} className={cx(chipBtn(value === r), 'disabled:opacity-30 disabled:cursor-default')}>{r}</button>)}</div>
        </div>
      ))}
    </div>
  )
}

export interface BattedBall { loc?: number; traj?: string; quality?: string }
/** 落點 (fielder grid + gaps for hits), 軌跡 and 強度; tapping the selected one again clears it. With `required`, a
 *  missing 落點 or 軌跡 (both required for a batted ball) is highlighted; 強度 stays optional. */
export function BattedBallPicker({ result, value, onChange, required }: { result: string; value: BattedBall; onChange: (v: BattedBall) => void; required?: boolean }) {
  const set = (patch: BattedBall) => onChange({ ...value, ...patch })
  const needLoc = !!required && !value.loc
  const needTraj = !!required && !value.traj
  const ring = 'rounded-[var(--radius-sm)] outline-2 outline-offset-4 outline-dashed outline-[color-mix(in_srgb,var(--critical)_55%,transparent)]'
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3">
      <div role="group" aria-label="落點" data-missing={needLoc || undefined} className={cx('w-fit', needLoc && ring)}>
        <div className={cx('text-[12px] mb-1', needLoc ? 'text-critical font-medium' : 'text-ink-2')}>落點{needLoc ? '（必填，點接球或落地的位置）' : ''}</div>
        <div className="grid grid-cols-3 gap-1 w-[150px]">
          {LOC_GRID.flat().map((n, i) => n === null ? <span key={i} /> : (
            <button key={i} type="button" aria-pressed={value.loc === n} onClick={() => set({ loc: value.loc === n ? undefined : n })} className={cx('h-9 rounded-[6px] border text-[12px] font-medium tnum cursor-pointer', value.loc === n ? 'border-ink bg-ink text-bg' : 'border-border bg-surface hover:bg-surface-2')}>{n} <span className="opacity-70">{LOC_LABEL[n]}</span></button>
          ))}
        </div>
        {!OUT_RESULTS.has(result) && result !== '野選' && (
          <div className="mt-2 w-[150px]">
            <div className="text-[11px] text-muted mb-1">穿越／落地的縫隙</div>
            <div className="flex flex-wrap gap-1">
              {LOC_HOLE_KEYS.map((n) => <button key={n} type="button" aria-pressed={value.loc === n} onClick={() => set({ loc: value.loc === n ? undefined : n })} className={cx('h-7 px-2 rounded-[6px] border text-[11px] font-medium cursor-pointer', value.loc === n ? 'border-ink bg-ink text-bg' : 'border-dashed border-border bg-surface hover:bg-surface-2')}>{LOC_HOLES[n]}</button>)}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div role="group" aria-label="軌跡" data-missing={needTraj || undefined} className={cx(needTraj && ring)}><div className={cx('text-[12px] mb-1', needTraj ? 'text-critical font-medium' : 'text-ink-2')}>軌跡{needTraj ? '（必填）' : ''}</div><div className="flex gap-1.5 flex-wrap">{(['G', 'F', 'L', 'P'] as const).map((t) => <button key={t} type="button" aria-pressed={value.traj === t} onClick={() => set({ traj: value.traj === t ? undefined : t })} className={chipBtn(value.traj === t)}>{t === 'G' ? '滾地 G' : t === 'F' ? '飛球 F' : t === 'L' ? '平飛 L' : '內野飛球 P'}</button>)}</div></div>
        <div><div className="text-[12px] text-ink-2 mb-1">強度{required ? <span className="text-muted">（預設中）</span> : null}</div><div className="flex gap-1.5">{(['強', '中', '弱'] as const).map((q) => <button key={q} type="button" aria-pressed={value.quality === q} onClick={() => set({ quality: value.quality === q ? undefined : q })} className={chipBtn(value.quality === q)}>{q}</button>)}</div></div>
      </div>
    </div>
  )
}

export type ExtraBases = 'throw' | 'err'
/** What the two chips mean, in one line (shown once under the runners). */
export const ADV_HINT = '趁傳：守備傳別的壘或回傳時多跑，不算誰失誤；失誤進壘：漏接、暴傳等守備失誤讓他多跑，算一次失誤（那一分也不算打點）'
/**
 * Next to someone who ended further than the result alone takes him: how he got the extra bases — 趁傳 (on the throw,
 * nobody's fault, no error) or 失誤進壘 (a fielder's error: theirs while we bat, ours while we field; counted in E).
 * Tap the lit one again to clear it.
 */
export function AdvChoice({ kind, onPick, name, erring }: { kind: ExtraBases | null; onPick: (k: ExtraBases | null) => void; name: string; /** whose error a 失誤進壘 is: we field (us) or we bat (them) */ erring?: 'us' | 'them' }) {
  const opts: Array<{ k: ExtraBases; l: string }> = [{ k: 'throw', l: '趁傳（不算失誤）' }, { k: 'err', l: erring === 'us' ? '我隊失誤進壘' : erring === 'them' ? '對方失誤進壘' : '失誤進壘' }]
  return (
    <div className="inline-flex items-center gap-1 flex-wrap" role="group" aria-label={`${name} 多跑的壘怎麼來的`}>
      {!kind && <span className="text-[11px] text-muted mr-0.5">多跑的壘：</span>}
      {opts.map((o) => {
        const on = kind === o.k
        return (
          <button key={o.k} type="button" aria-pressed={on} aria-label={`${name} ${o.l}`} onClick={() => onPick(on ? null : o.k)}
            className={cx('h-9 pointer-fine:h-8 px-2.5 rounded-full border text-[12px] font-medium cursor-pointer transition-colors motion-reduce:transition-none',
              on ? (o.k === 'err' ? 'border-[color-mix(in_srgb,var(--warning)_60%,transparent)] bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] text-ink' : 'border-[color-mix(in_srgb,var(--accent)_70%,transparent)] bg-accent-soft text-ink') : 'border-dashed border-border-strong text-ink-2 hover:text-ink')}>
            {on ? `✓ ${o.l}` : o.l}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 誰失誤: position chips (one tap each; tap again to take it off). With `unknown`, a 「不知道」 chip too (their errors:
 * the recorder may not see who it was).
 */
export function ErrorByChips({ value, onChange, unknown, label = '誰失誤' }: { value: string[]; onChange: (v: string[]) => void; unknown?: boolean; label?: string }) {
  const opts = [...FIELD_POSITIONS, ...(unknown ? [UNKNOWN_FIELDER] : [])]
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {opts.map((pos) => {
        const on = value.includes(pos)
        return <button key={pos} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== pos) : [...value, pos])} className={cx(chipBtn(on), 'min-w-11 h-9 px-2.5 text-[12px]')}>{pos === UNKNOWN_FIELDER ? '不知道' : posNum(pos)}</button>
      })}
    </div>
  )
}
