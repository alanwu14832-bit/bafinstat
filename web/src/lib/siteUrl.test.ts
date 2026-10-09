import { describe, expect, it } from 'vitest'
import { buildSiteUrl } from './siteUrl'

describe('buildSiteUrl', () => {
  it('a plain build links to the page', () => {
    expect(buildSiteUrl({ origin: 'https://bafinstat.vercel.app', pathname: '/games/G1' }, '/', false, 'games/G1')).toBe('https://bafinstat.vercel.app/games/G1')
  })
  it('an archived copy links to the live site', () => {
    expect(buildSiteUrl({ origin: 'https://bafinstat.vercel.app', pathname: '/v/20261009-1200-abc1234/games/G1' }, '/', false, 'games/G1')).toBe('https://bafinstat.vercel.app/games/G1')
  })
  it('a hash build keeps its file and uses #/', () => {
    expect(buildSiteUrl({ origin: 'https://x', pathname: '/index.html' }, '/', true, 'games/G1')).toBe('https://x/index.html#/games/G1')
  })
})
