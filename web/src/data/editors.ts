/**
 * 紀錄員名單 (the `editors` table): who may write. Editors manage it on the site; a new recorder is added by email,
 * then sets their own password with 「第一次使用」 on the sign-in form. Nobody needs the Supabase dashboard.
 */
export interface Editor {
  email: string; note: string | null; created_at: string
  /** the bound account (null: not activated yet) — after the 2026-10-08 security migration */
  user_id?: string | null; bound_at?: string | null; invite_expires?: string | null
}

/** 10-character 邀請碼 shown as K7Q2M-9XAPD. */
export const formatInviteCode = (code: string) => (code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code)

/** Where a recorder stands: activated, waiting for the 邀請碼 to be used (until when), or neither. */
export function editorState(e: Editor, now = new Date()): { label: string; tone: 'good' | 'warn' | 'muted' } {
  if (e.user_id === undefined) return { label: '', tone: 'muted' }   // database without the security migration
  if (e.user_id) return { label: '已啟用', tone: 'good' }
  if (e.invite_expires && new Date(e.invite_expires) > now) return { label: `等待啟用（邀請碼 ${new Date(e.invite_expires).toLocaleDateString('zh-TW')} 前有效）`, tone: 'warn' }
  return { label: '未啟用（請重發邀請碼）', tone: 'warn' }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The email as stored (trimmed, lower-case), or an error message to show. */
export function checkEditorEmail(raw: string, existing: Editor[]): { email: string } | { error: string } {
  const email = raw.trim().toLowerCase()
  if (!email) return { error: '請輸入 email' }
  if (!EMAIL.test(email)) return { error: 'email 格式不對' }
  if (existing.some((e) => e.email.toLowerCase() === email)) return { error: '這個 email 已經在名單裡' }
  return { email }
}

/** Sign-up form: what is wrong with the password pair, or null (at least 8 characters). */
export function checkNewPassword(password: string, again: string): string | null {
  if (password.length < 8) return '密碼至少 8 個字元'
  if (password !== again) return '兩次輸入的密碼不一樣'
  return null
}
