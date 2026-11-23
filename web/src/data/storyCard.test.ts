import { describe, expect, it } from 'vitest'
import { batHeadline, gameBatCard, gamePitCard, pitHeadline, seasonBatCard, seasonPitCard, storyCard, storyFileName, storyGames, storyPlayers, type StorySource } from './storyCard'
import { SEED_DATASET } from './seed'
import { battingLines, pitchingLines, summarizeGame } from './stats'
import { DEFAULT_PARAMS } from './types'
import { photoRect, panView, DEFAULT_VIEW, STORY_W } from '../lib/storyImage'

const src: StorySource = { team: '喝FIN就好BA', site: 'https://example.test/', full: SEED_DATASET, counted: SEED_DATASET, params: DEFAULT_PARAMS, season: true }
const game = SEED_DATASET.games[0]
const batRows = SEED_DATASET.batting.filter((p) => p.gameId === game.id)
const pitRows = SEED_DATASET.pitching.filter((p) => p.gameId === game.id)
const hitter = battingLines(SEED_DATASET, batRows).sort((a, b) => b.h - a.h || b.pa - a.pa)[0]
const pitcher = pitchingLines(pitRows, [game]).sort((a, b) => b.outs - a.outs)[0]

describe('限時動態: the cards', () => {
  it('單場打擊: the numbers are the box score\'s, the score is ours first, the season line is on it', () => {
    const c = gameBatCard(src, game.id, hitter.name)!
    const sum = summarizeGame(SEED_DATASET, game)
    expect(c.kind).toBe('game-bat')
    expect(c.title).toBe(`vs ${game.opponent}`)
    expect(c.result?.text).toMatch(new RegExp(`^(勝|敗|和) ${sum.runsUs}:${sum.runsOpp}$`))
    expect(c.result?.win).toBe(sum.result === 'W')
    expect(c.sub).toContain(game.date.replaceAll('-', '.'))
    expect(c.big[0]).toEqual({ label: '打數–安打', value: `${hitter.ab}-${hitter.h}` })
    expect(c.big).toHaveLength(3)
    expect(c.headline).toContain(`${hitter.ab} 打數 ${hitter.h} 安打`)
    expect(c.footer).toMatch(/打擊率 .+・\d+ 全壘打・\d+ 打點$/)
    expect(c.site).toBe('example.test')
    expect(c.number).toBe(SEED_DATASET.roster.find((p) => p.name === hitter.name)?.number || undefined)
  })
  it('單場投球: 局數／三振／失分 in large type, the 好球率 bar when pitches were recorded', () => {
    const c = gamePitCard(src, game.id, pitcher.name)!
    expect(c.big.map((b) => b.value)).toEqual([pitcher.ipDisplay, String(pitcher.k), String(pitcher.r)])
    expect(c.bar).toEqual({ strikes: pitcher.strikes, balls: pitcher.balls })
    expect(c.role).toBe(pitRows.find((p) => p.pitcher)?.pitcher === pitcher.name ? '先發投手' : '後援投手')
    expect(c.headline).toContain(`${pitcher.ipDisplay} 局 ${pitcher.k} 三振`)
    expect(c.footer).toMatch(/防禦率 .+・\d+ 勝 \d+ 敗・\d+ 三振$/)
  })
  it('no card for someone who did not play; a game kind needs its game', () => {
    expect(gameBatCard(src, game.id, '不存在的人')).toBeNull()
    expect(gamePitCard(src, game.id, '不存在的人')).toBeNull()
    expect(storyCard(src, 'game-bat', hitter.name)).toBeNull()
    expect(storyCard(src, 'game-bat', hitter.name, game.id)?.name).toBe(hitter.name)
  })
  it('本季: every counted game of the season of his newest game', () => {
    const c = seasonBatCard(src, hitter.name)!
    expect(c.title).toMatch(/累計$/)
    expect(c.big.map((b) => b.label)).toEqual(['打擊率', '全壘打', '打點'])
    expect(c.sub).toMatch(/^\d+ 場・截至 \d{4}\.\d{2}\.\d{2}$/)
    expect(seasonPitCard(src, pitcher.name)?.big.map((b) => b.label)).toEqual(['防禦率', '局數', '三振'])
  })
  it('a reader who may only see single games gets no season card and no season line', () => {
    const closed = { ...src, season: false }
    expect(seasonBatCard(closed, hitter.name)).toBeNull()
    expect(seasonPitCard(closed, pitcher.name)).toBeNull()
    expect(gameBatCard(closed, game.id, hitter.name)?.footer).toBe('')
    expect(gamePitCard(closed, game.id, pitcher.name)?.footer).toBe('')
  })
  it('the players of a game and the games of a player (newest first)', () => {
    const names = storyPlayers(SEED_DATASET, game.id)
    expect(names).toContain(hitter.name)
    expect(names).toContain(pitcher.name)
    expect(new Set(names).size).toBe(names.length)
    const g = storyGames(SEED_DATASET, hitter.name)
    expect(g.bat.map((x) => x.id)).toContain(game.id)
    expect([...g.bat].sort((a, b) => (a.date < b.date ? 1 : -1)).map((x) => x.date)).toEqual(g.bat.map((x) => x.date))
  })
  it('the sentences: 簡潔數據風', () => {
    expect(batHeadline({ ab: 4, h: 3, hr: 1, rbi: 2, r: 1, sb: 0, bb: 0, hbp: 0 })).toBe('猛打賞：4 打數 3 安打，1 全壘打、2 打點、1 得分')
    expect(batHeadline({ ab: 3, h: 1, hr: 0, rbi: 0, r: 0, sb: 0, bb: 1, hbp: 0 })).toBe('3 打數 1 安打，1 保送')
    expect(batHeadline({ ab: 0, h: 0, hr: 0, rbi: 0, r: 1, sb: 1, bb: 1, hbp: 1 })).toBe('1 得分、1 盜壘、2 四死球')
    expect(batHeadline({ ab: 2, h: 0, hr: 0, rbi: 0, r: 0, sb: 0, bb: 0, hbp: 0 })).toBe('2 打數 0 安打')
    expect(pitHeadline({ ipDisplay: '6.0', k: 8, r: 1, w: 1, l: 0, sv: 0, hld: 0 })).toBe('勝投：6.0 局 8 三振，失 1 分')
    expect(pitHeadline({ ipDisplay: '1.0', k: 2, r: 0, w: 0, l: 0, sv: 1, hld: 0 })).toBe('救援成功：1.0 局 2 三振，無失分')
    expect(pitHeadline({ ipDisplay: '2.1', k: 1, r: 3, w: 0, l: 1, sv: 0, hld: 0 })).toBe('2.1 局 1 三振，失 3 分')
  })
  it('the file name carries the player and the day', () => {
    const c = gameBatCard(src, game.id, hitter.name)!
    expect(storyFileName(c, game.date)).toBe(`限動_${hitter.name}_${game.date}.png`)
  })
})

describe('限時動態: the photo always covers its frame', () => {
  it('a wide photo fills the height and can be moved sideways only; zoom lets it move both ways', () => {
    const r = photoRect(1600, 1200, DEFAULT_VIEW)
    expect(r.h).toBeCloseTo(1040)
    expect(r.w).toBeGreaterThan(STORY_W)
    expect(r.x).toBeLessThanOrEqual(0); expect(r.x + r.w).toBeGreaterThanOrEqual(STORY_W)
    const moved = panView(DEFAULT_VIEW, 100000, 100000, 1600, 1200)          // dragged far right / down: stops at the edge
    expect(moved.fx).toBe(0); expect(moved.fy).toBe(DEFAULT_VIEW.fy)
    const zoomed = panView({ ...DEFAULT_VIEW, zoom: 2 }, 0, -100000, 1600, 1200)
    expect(zoomed.fy).toBe(1)
    const z = photoRect(1600, 1200, { fx: 1, fy: 1, zoom: 2 })
    expect(z.x + z.w).toBeCloseTo(STORY_W); expect(z.y + z.h).toBeCloseTo(1040)
  })
  it('a tall photo fills the width', () => {
    const r = photoRect(900, 1600, { fx: 0.5, fy: 0, zoom: 1 })
    expect(r.w).toBeCloseTo(STORY_W); expect(r.y).toBeCloseTo(0); expect(r.h).toBeGreaterThan(1040)
  })
})
