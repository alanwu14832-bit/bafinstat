import { describe, expect, it } from 'vitest'
import { albumProvider, gameMedia, isVideoLink, isVideoUrl, VIDEO_TITLE, type AlbumLink } from './albums'

const a = (p: Partial<AlbumLink>): AlbumLink => ({ id: Math.random().toString(36), url: 'https://drive.google.com/drive/folders/abc', updatedAt: '2026-10-01T00:00:00Z', ...p })

describe('game videos in the albums table', () => {
  it('isVideoUrl: video sites only', () => {
    for (const u of ['https://youtu.be/x', 'https://www.youtube.com/watch?v=x', 'https://m.youtube.com/watch?v=x', 'https://vimeo.com/1', 'https://fb.watch/abc']) expect(isVideoUrl(u)).toBe(true)
    expect(isVideoUrl('https://drive.google.com/drive/folders/abc')).toBe(false)
    expect(isVideoUrl('not a url')).toBe(false)
    expect(isVideoUrl('https://notyoutube.com/x')).toBe(false)
  })
  it('isVideoLink: the 比賽影片 title or a video site', () => {
    expect(isVideoLink(a({ gameId: 'G1', title: VIDEO_TITLE }))).toBe(true)
    expect(isVideoLink(a({ gameId: 'G1' }))).toBe(false)
    expect(isVideoLink(a({ title: '春訓', url: 'https://youtu.be/x' }))).toBe(true)
  })
  it('albumProvider names the video sites', () => {
    expect(albumProvider('https://youtu.be/x')).toBe('YouTube')
    expect(albumProvider('https://vimeo.com/1')).toBe('Vimeo')
    expect(albumProvider('https://fb.watch/x')).toBe('Facebook')
  })
  it('gameMedia splits one game\'s photos and videos', () => {
    const list = [a({ gameId: 'G1' }), a({ gameId: 'G1', title: VIDEO_TITLE }), a({ gameId: 'G1', url: 'https://youtu.be/y' }), a({ gameId: 'G2', title: VIDEO_TITLE }), a({ title: '春訓' })]
    const m = gameMedia(list, 'G1')
    expect(m.photos).toHaveLength(1)
    expect(m.videos).toHaveLength(2)
  })
})
