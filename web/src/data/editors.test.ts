import { describe, expect, it } from 'vitest'
import { checkEditorEmail, checkNewPassword, inviteMessage, readMemberList, type Editor } from './editors'

const list: Editor[] = [{ email: 'coach@gmail.com', note: '管理員', created_at: '2026-10-01T00:00:00Z' }]

describe('紀錄員名單', () => {
  it('stores emails trimmed and lower-case', () => {
    expect(checkEditorEmail('  New.Recorder@Gmail.com ', list)).toEqual({ email: 'new.recorder@gmail.com' })
  })
  it('refuses blanks, bad formats and people already on the list', () => {
    expect(checkEditorEmail('  ', list)).toEqual({ error: '請輸入 email' })
    expect(checkEditorEmail('not-an-email', list)).toEqual({ error: 'email 格式不對' })
    expect(checkEditorEmail('COACH@gmail.com', list)).toEqual({ error: '這個 email 已經在名單裡' })
  })
})

describe('整批新增：a pasted list', () => {
  it('reads one person per line, with the rest of the line as the 備註', () => {
    const r = readMemberList([
      'wang@gmail.com 王小明 #18',
      '18\t李大華\tLee.DH@Gmail.com',
      '陳教練 <coach2@ntu.edu.tw>',
      'email: chang@yahoo.com.tw。',
      '',
    ].join('\n'), list)
    expect(r.add).toEqual([
      { email: 'wang@gmail.com', note: '王小明 #18' },
      { email: 'lee.dh@gmail.com', note: '18 李大華' },
      { email: 'coach2@ntu.edu.tw', note: '陳教練' },
      { email: 'chang@yahoo.com.tw', note: 'email' },
    ])
    expect(r.listed).toEqual([]); expect(r.repeated).toEqual([]); expect(r.unread).toEqual([])
  })
  it('a row of addresses is several people; the listed, the repeated and the unreadable are set aside', () => {
    const r = readMemberList('a@x.com, b@x.com；COACH@gmail.com\n姓名\temail\nA@x.com 再貼一次\nnot-an-email@\n', list)
    expect(r.add).toEqual([{ email: 'a@x.com', note: '' }, { email: 'b@x.com', note: '' }])
    expect(r.listed).toEqual(['coach@gmail.com'])
    expect(r.repeated).toEqual(['a@x.com'])
    expect(r.unread).toEqual(['姓名\temail', 'not-an-email@'])
  })
  it('writes the message to send with the code', () => {
    const m = inviteMessage({ team: 'NTU BaFiN', url: 'https://bafinstat.vercel.app', email: 'wang@gmail.com', role: '球員', code: 'K7Q2M9XAPD' })
    expect(m).toContain('https://bafinstat.vercel.app')
    expect(m).toContain('email：wang@gmail.com、邀請碼：K7Q2M-9XAPD')
    expect(m).toContain('「第一次使用」')
  })
})

describe('第一次使用：設定密碼', () => {
  it('needs 6 characters typed the same twice', () => {
    expect(checkNewPassword('1234567', '1234567')).toBe('密碼至少 8 個字元')
    expect(checkNewPassword('12345678', '12345679')).toBe('兩次輸入的密碼不一樣')
    expect(checkNewPassword('12345678', '12345678')).toBeNull()
  })
})
