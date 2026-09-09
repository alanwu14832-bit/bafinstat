import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { mergeRoster, normalizeHand, normalizePos, parseRosterWorkbook } from './rosterImport'

const wbBuf = (rows: unknown[][], sheet = 'Sheet1') => {
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheet)
  const b = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe('roster import', () => {
  it('maps synonym headers, skips title rows, normalizes positions and hands', () => {
    const r = parseRosterWorkbook(wbBuf([['2026 球員名冊'], [], ['號碼', '名字', '守備位置', '兼守', '左右打', '投球', '身分'], [7, '蔡奇霖', '游擊', 'p', '右', '右', '現役'], ['12', '新人', 'SS/2B', '', '左右', '', '']]))
    expect(r.players).toHaveLength(2)
    expect(r.players[0]).toMatchObject({ name: '蔡奇霖', number: '7', primaryPos: 'SS', secondaryPos: 'P', bats: 'R', throws: 'R', status: '現役' })
    expect(r.players[1]).toMatchObject({ name: '新人', number: '12', primaryPos: 'SS', bats: 'S' })
    expect(r.mapping['姓名']).toBe('名字')
    expect(normalizePos('中外野')).toBe('CF'); expect(normalizePos(6)).toBe('SS'); expect(normalizeHand('左投')).toBe('L')
  })
  it('newest file wins for filled cells, blanks keep old values, new names are added', () => {
    const existing = [{ name: '蔡奇霖', number: '7', primaryPos: 'SS', bats: 'R' as const, status: '現役' }, { name: '許振謙', number: '9', primaryPos: 'P', status: '現役' }]
    const m = mergeRoster(existing, [{ name: '蔡奇霖', number: '17', primaryPos: '2B' }, { name: '新人', number: '3', primaryPos: 'C' }])
    expect(m.added).toEqual(['新人'])
    expect(m.updated).toEqual([{ name: '蔡奇霖', changes: ['背號 7 → 17', '主守位 SS → 2B'] }])
    const c = m.players.find((p) => p.name === '蔡奇霖')!
    expect(c.number).toBe('17'); expect(c.primaryPos).toBe('2B'); expect(c.bats).toBe('R') // blank in file → kept
    expect(m.players.find((p) => p.name === '許振謙')!.number).toBe('9') // not in file → untouched
    expect(m.players.find((p) => p.name === '新人')!.status).toBe('現役')
  })
})
