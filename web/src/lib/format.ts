export type NumberFormat = 'int' | 'decimal3' | 'pct' | 'ratio' | 'era'

/** Baseball-style number formatting. decimal3 drops the leading zero (".312"). */
export function formatNumber(value: number, format: NumberFormat = 'int'): string {
  switch (format) {
    case 'int':
      return Math.round(value).toLocaleString('en-US')
    case 'decimal3': {
      const s = value.toFixed(3)
      return value < 1 && value >= 0 ? s.replace(/^0/, '') : s
    }
    case 'pct':
      return `${value.toFixed(1)}%`
    case 'ratio':
    case 'era':
      return value.toFixed(2)
  }
}

export function signed(value: number, digits = 0): string {
  const s = value.toFixed(digits)
  return value > 0 ? `+${s}` : s
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
