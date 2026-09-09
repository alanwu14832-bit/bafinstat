import { Select, type SelectProps } from './Select'
import type { Player } from '../../data/types'

/** Roster names for a dropdown: active players first, then by jersey number, then name. */
export function rosterNames(roster: Player[]): string[] {
  const active = (p: Player) => !p.status || p.status === '現役'
  const num = (p: Player) => { const n = Number(p.number); return Number.isFinite(n) && p.number !== '' && p.number !== undefined ? n : 999 }
  return [...roster]
    .sort((a, b) => Number(active(b)) - Number(active(a)) || num(a) - num(b) || a.name.localeCompare(b.name, 'zh-Hant'))
    .map((p) => p.name)
    .filter((n, i, arr) => n && arr.indexOf(n) === i)
}

export interface PlayerSelectProps extends Omit<SelectProps, 'options' | 'value' | 'onChange'> {
  value: string
  onChange: (name: string) => void
  /** Names to offer; the current value is kept as an option even when it is not in this list. */
  names: string[]
  /** Text of the empty option. */
  placeholder?: string
  /** Names already used elsewhere (shown but marked). */
  taken?: Set<string>
}

/** Every place a player's name is entered uses this dropdown, so nobody has to type names on a phone. */
export function PlayerSelect({ value, onChange, names, placeholder = '選擇球員', taken, ...rest }: PlayerSelectProps) {
  const list = value && !names.includes(value) ? [value, ...names] : names
  const options = [{ value: '', label: placeholder }, ...list.map((n) => ({ value: n, label: taken?.has(n) && n !== value ? `${n}（已排）` : n }))]
  return <Select value={value} onChange={(e) => onChange(e.target.value)} options={options} {...rest} />
}
