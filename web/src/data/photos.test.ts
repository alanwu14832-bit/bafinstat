import { describe, expect, it } from 'vitest'
import { albumKey, zipBytes } from './photos'

describe('photo albums', () => {
  it('folders: game ids stay, names become safe slugs', () => {
    expect(albumKey('G20260301-01')).toBe('G20260301-01')
    expect(albumKey(' 2026 春訓 / 第一週 ')).toBe('2026-春訓-第一週')
    expect(albumKey('***')).toBe('album')
  })

  it('writes a zip the standard tools can read', async () => {
    const enc = new TextEncoder()
    const buf = zipBytes([{ name: 'a.txt', data: enc.encode('hello') }, { name: 'b.jpg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }])
    // local header signature, then the end-of-central-directory record at the tail
    expect([...buf.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    const end = buf.slice(buf.length - 22)
    expect([...end.slice(0, 4)]).toEqual([0x50, 0x4b, 0x05, 0x06])
    expect(end[10] | (end[11] << 8)).toBe(2)
    const { writeFileSync } = await import('node:fs')
    writeFileSync('/tmp/claude-0/-home-user-bafinstat/d0bb42b6-9c16-5b1d-8e2e-a9617d2329fb/scratchpad/test.zip', buf)
  })
})
