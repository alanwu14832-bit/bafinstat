import { describe, expect, it } from 'vitest'
import { hintFor } from './glossary'
import { statLink } from './statLinks'
import dictionary from './seed/stat_dictionary.json'
import glossarySource from './glossary.ts?raw'

describe('wording: 自責分 everywhere, and every new header has a hint', () => {
  it('ER is 自責分; nothing says 責失分 any more', () => {
    expect(hintFor('ER')?.title).toBe('自責分')
    expect(hintFor('ERA')?.text).toContain('自責分')
    expect(glossarySource.replace(/自責分/g, '')).not.toContain('責失分')
    expect(JSON.stringify(dictionary).replace(/自責分/g, '')).not.toContain('責失分')
  })
  it('the new pitching columns, tiles and QAB kinds explain themselves', () => {
    for (const h of ['IR', 'IRS%', 'BS', '保送得分%', 'GO/AO', '首打者出局%', '三上三下', '13球內局%', '繼承失分', '救援失敗', '首打出局', '被打擊', '被上壘', '6球以上', '兩好球纏鬥'])
      expect(hintFor(h), h).not.toBeNull()
    expect(hintFor('QAB%')?.text).toContain('兩好球後又看了 3 球以上')
  })
  it('the 數據字典 links the new terms to their columns', () => {
    expect(statLink('BS')).toBe('/pitching?view=advanced&sort=bs')
    expect(statLink('IRS%')).toBe('/pitching?view=advanced&sort=irsPct&dir=asc')
    expect(statLink('GO/AO')).toBe('/pitching?view=process&sort=goAo')
    expect(statLink('兩好球纏鬥')).toBe('/batting?view=process&sort=twoStrikeBattles')
    expect(statLink('QualPA')).toBe('/batting?sort=pa')
    const keys = (dictionary as Array<{ key: string }>).map((d) => d.key)
    for (const k of ['GO/AO', 'IR', 'IRS%', 'BS', 'BBS%', 'LOO%', '123INN', '13P%', 'QualPA', 'QualIP', '兩好球纏鬥', '6球以上']) {
      expect(keys, k).toContain(k)
      expect(statLink(k), k).not.toBeNull()
    }
  })
})
