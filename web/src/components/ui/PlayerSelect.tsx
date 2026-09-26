import { Select, type SelectProps } from './Select'
import { eligibleNames } from '../../data/registrations'
import type { Player, Registration } from '../../data/types'
import { cx } from '../../lib/format'

/** Roster names for a dropdown: active players first, then by jersey number, then name. */
export function rosterNames(roster: Player[]): string[] {
  const active = (p: Player) => !p.status || p.status === '現役'
  const num = (p: Player) => { const n = Number(p.number); return Number.isFinite(n) && p.number !== '' && p.number !== undefined ? n : 999 }
  return [...roster]
    .sort((a, b) => Number(active(b)) - Number(active(a)) || num(a) - num(b) || a.name.localeCompare(b.name, 'zh-Hant'))
    .map((p) => p.name)
    .filter((n, i, arr) => n && arr.indexOf(n) === i)
}

/** The one entry point for "who can be picked": the roster in dropdown order, narrowed to the game's 報名名單 when it has one. */
export function candidateNames(roster: Player[], reg?: Registration): string[] {
  return eligibleNames(rosterNames(roster), reg)
}

/** Players still with the team (no status, or 現役): bench and registration chips leave the others out. */
export function activeNames(roster: Player[]): Set<string> {
  return new Set(roster.filter((p) => !p.status || p.status === '現役').map((p) => p.name))
}

// `disabled` is a set of names here (never the whole control), so the native attribute is left out
export interface PlayerSelectProps extends Omit<SelectProps, 'options' | 'value' | 'onChange' | 'disabled'> {
  value: string
  onChange: (name: string) => void
  /** Names to offer; the current value is kept as an option even when it is not in this list. */
  names: string[]
  /** Text of the empty option. */
  placeholder?: string
  /** Names already used elsewhere (shown but marked). */
  taken?: Set<string>
  /** Names shown but not pickable (e.g. substituted out when re-entry is off). The current value is never disabled. */
  disabled?: Set<string>
  /** Suffix after a name, e.g. （板凳） or （已下場）; `taken` keeps its own （已排） label. */
  tag?: (name: string) => string | undefined
}

/** Every place a player's name is entered uses this dropdown, so nobody has to type names on a phone. */
export function PlayerSelect({ value, onChange, names, placeholder = '選擇球員', taken, disabled, tag, ...rest }: PlayerSelectProps) {
  const list = value && !names.includes(value) ? [value, ...names] : names
  const label = (n: string) => (taken?.has(n) && n !== value ? `${n}（已排）` : `${n}${tag?.(n) ?? ''}`)
  const options = [{ value: '', label: placeholder }, ...list.map((n) => ({ value: n, label: label(n), disabled: n !== value && !!disabled?.has(n) }))]
  return <Select value={value} onChange={(e) => onChange(e.target.value)} options={options} {...rest} />
}

/** Multi-pick as wrap-around toggle chips (板凳): tap a name to add or remove it. Selected chips are filled. */
export function PlayerChips({ names, selected, onToggle, className, empty = '沒有可以選的球員' }: { names: string[]; selected: string[]; onToggle: (name: string) => void; className?: string; empty?: string }) {
  const on = new Set(selected)
  if (!names.length) return <p className={cx('text-[12px] text-muted', className)}>{empty}</p>
  return (
    <div className={cx('flex flex-wrap gap-1.5', className)}>
      {names.map((n) => (
        <button key={n} type="button" aria-pressed={on.has(n)} onClick={() => onToggle(n)}
          className={cx('h-9 min-w-9 px-3 rounded-[var(--radius-sm)] border text-[13px] font-medium cursor-pointer transition-colors motion-reduce:transition-none', on.has(n) ? 'border-ink bg-ink text-bg' : 'border-border bg-surface text-ink hover:bg-surface-2')}>{n}</button>
      ))}
    </div>
  )
}
