import { describe, expect, it } from 'vitest'
import { assetUrl, resolveTeam, TEAM_DEFAULTS } from './teamDefaults'

describe('team config', () => {
  it('keeps BaFiN when nothing is set', () => {
    expect(resolveTeam({})).toEqual(TEAM_DEFAULTS)
  })
  it('takes VITE_TEAM_* over the defaults, ignoring blanks and bad numbers', () => {
    const t = resolveTeam({ VITE_TEAM_NAME: ' 台大棒球 ', VITE_TEAM_ORG: '', VITE_TEAM_INNINGS: '9', VITE_TEAM_SEED: '0' })
    expect(t.name).toBe('台大棒球')
    expect(t.org).toBe(TEAM_DEFAULTS.org)
    expect(t.innings).toBe(9)
    expect(t.seed).toBe(false)
    expect(resolveTeam({ VITE_TEAM_INNINGS: 'nine' }).innings).toBe(7)
    expect(resolveTeam({ VITE_TEAM_SEED: 'yes' }).seed).toBe(true)
  })
  it('resolves assets against the base path, leaving URLs alone', () => {
    expect(assetUrl('mark.png', '/bafinstat/')).toBe('/bafinstat/mark.png')
    expect(assetUrl('/team/mark.png', '/')).toBe('/team/mark.png')
    expect(assetUrl('https://x.org/a.png', '/b/')).toBe('https://x.org/a.png')
  })
})
