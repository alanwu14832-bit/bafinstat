import { describe, expect, it } from 'vitest'
import { checkEditorEmail, checkNewPassword, type Editor } from './editors'

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

describe('第一次使用：設定密碼', () => {
  it('needs 6 characters typed the same twice', () => {
    expect(checkNewPassword('1234567', '1234567')).toBe('密碼至少 8 個字元')
    expect(checkNewPassword('12345678', '12345679')).toBe('兩次輸入的密碼不一樣')
    expect(checkNewPassword('12345678', '12345678')).toBeNull()
  })
})
