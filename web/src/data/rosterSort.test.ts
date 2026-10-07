import { describe, expect, it } from 'vitest'
import { sortNames, sortRoster, withNumbers } from './rosterSort'

const roster = [
  { name: '蔡奇霖', number: '7' }, { name: '王廷宇', number: '18' }, { name: '吳藹倫', number: '2' },
  { name: '林禹鞍' }, { name: '柯福恩', number: '10' }, { name: '陳畢業', number: '1', status: '畢業' },
]

describe('球員排序', () => {
  it('背號: numeric (2 before 10), no number last, players who left after everyone', () => {
    expect(sortRoster(roster, 'number').map((p) => p.name)).toEqual(['吳藹倫', '蔡奇霖', '柯福恩', '王廷宇', '林禹鞍', '陳畢業'])
  })
  it('姓氏: by the surname\'s strokes (王 4, 吳 7, 林 8, 柯 9, 蔡 17)', () => {
    expect(sortRoster(roster, 'surname').map((p) => p.name)).toEqual(['王廷宇', '吳藹倫', '林禹鞍', '柯福恩', '蔡奇霖', '陳畢業'])
  })
  it('sorts plain names with numbers from the roster, and gives tables a numeric 背號', () => {
    expect(sortNames(['柯福恩', '吳藹倫', '路人'], roster, 'number')).toEqual(['吳藹倫', '柯福恩', '路人'])
    expect(withNumbers([{ name: '柯福恩' }, { name: '林禹鞍' }], roster)).toEqual([{ name: '柯福恩', number: 10 }, { name: '林禹鞍', number: null }])
  })
})
