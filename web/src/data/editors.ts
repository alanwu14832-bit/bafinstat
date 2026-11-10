/**
 * 紀錄員名單 (the `editors` table): who may write. Editors manage it on the site; a new recorder is added by email,
 * then sets their own password with 「第一次使用」 on the sign-in form. Nobody needs the Supabase dashboard.
 */
export interface Editor {
  email: string; note: string | null; created_at: string
  /** the bound account (null: not activated yet) — after the 2026-10-08 security migration */
  user_id?: string | null; bound_at?: string | null; invite_expires?: string | null
  /** 'player' 球員 / 'recorder' 紀錄員 / 'admin' 管理者 — after the 2026-11-05 roles migration */
  role?: 'player' | 'recorder' | 'admin'
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

/** One person from a pasted list: the email as stored, and whatever else was on the line (name, number) as the 備註. */
export interface MemberLine { email: string; note: string }
/** 整批新增: what a pasted list holds. */
export interface MemberList {
  /** new people, in the order pasted */
  add: MemberLine[]
  /** already on the list: left alone */
  listed: string[]
  /** pasted more than once: added once */
  repeated: string[]
  /** lines with no email in them (a header row, a typo), shortened */
  unread: string[]
}
/** 整批新增 adds at most this many at a time. */
export const MEMBER_BATCH_MAX = 100

// an email inside a pasted line: "a@x.com", "王小明 <a@x.com>", "18\t王小明\ta@x.com", "a@x.com, b@x.com"
const BREAK = '\\s@,;，；、<>()（）\\[\\]"\'：:'
const EMAIL_IN_TEXT = new RegExp(`[^${BREAK}]+@[^${BREAK}]+\\.[^${BREAK}]+`, 'g')
const BETWEEN = new RegExp(`[${BREAK.replace('@', '')}]+`, 'g')

/**
 * Reads a pasted list, one person per line: the email, with anything else on the line (name, number; in any order, as
 * copied from a spreadsheet or a mail program) kept as the 備註. A line of several emails is several people.
 */
export function readMemberList(text: string, existing: Editor[]): MemberList {
  const out: MemberList = { add: [], listed: [], repeated: [], unread: [] }
  const have = new Set(existing.map((e) => e.email.toLowerCase()))
  const seen = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const found = (line.match(EMAIL_IN_TEXT) ?? []).map((m) => m.replace(/[.。]+$/, '').toLowerCase()).filter((m) => EMAIL.test(m))
    if (!found.length) { out.unread.push(line.length > 40 ? `${line.slice(0, 40)}…` : line); continue }
    const note = found.length === 1 ? line.replace(EMAIL_IN_TEXT, ' ').replace(BETWEEN, ' ').trim().slice(0, 60) : ''
    for (const email of found) {
      if (seen.has(email)) { if (!out.repeated.includes(email)) out.repeated.push(email); continue }
      seen.add(email)
      if (have.has(email)) out.listed.push(email)
      else out.add.push({ email, note })
    }
  }
  return out
}

/** What to send someone with their 邀請碼: where to go and what to type. */
export function inviteMessage(o: { team: string; url: string; email: string; role: string; code: string }): string {
  return [
    `${o.team} 數據網站幫你開好帳號了（${o.role}）。`,
    `1. 打開 ${o.url}`,
    '2. 點「登入」（手機：左上角 ≡ 選單的最下面；電腦：左下角）→ 選「第一次使用」',
    `3. 輸入 email：${o.email}、邀請碼：${formatInviteCode(o.code)}，再自己設定密碼`,
    '邀請碼 7 天內有效、只能用一次，請不要轉給別人。',
  ].join('\n')
}

/** Sign-up form: what is wrong with the password pair, or null (at least 8 characters). */
export function checkNewPassword(password: string, again: string): string | null {
  if (password.length < 8) return '密碼至少 8 個字元'
  if (password !== again) return '兩次輸入的密碼不一樣'
  return null
}
