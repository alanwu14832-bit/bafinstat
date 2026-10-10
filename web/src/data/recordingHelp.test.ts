import { describe, expect, it } from 'vitest'
import { contactShare } from './recordingHelp'

describe('contactShare', () => {
  const r = (result: string, quality?: string) => ({ result, quality })
  it('shares of 強／中／弱 over balls in play that have one', () => {
    const s = contactShare({ batting: [r('一安', '強'), r('內滾', '中'), r('三振', '強'), r('外飛')] as never, pitching: [r('內飛', '弱'), r('突破僵局', '中'), r('雙殺', '中')] as never })
    expect(s.n).toBe(4)
    expect(s.強).toBe(0.25)
    expect(s.中).toBe(0.5)
    expect(s.弱).toBe(0.25)
    expect(contactShare({ batting: [], pitching: [] })).toEqual({ 強: 0, 中: 0, 弱: 0, n: 0 })
  })
})
