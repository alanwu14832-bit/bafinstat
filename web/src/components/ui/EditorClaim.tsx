import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Button } from './Button'
import { Input } from './Input'
import { setOwnPassword, signOutOtherDevices, type EditorAccess } from '../../data/supabase'
import { useDataStore } from '../../store/data'

const WHY: Partial<Record<EditorAccess, string>> = {
  need_code: '這個帳號還沒啟用紀錄員權限。請輸入管理員（或其他紀錄員）給你的邀請碼，並設定你自己的密碼。',
  bad_code: '邀請碼不對，請再確認一次（輸錯 10 次會鎖住）。',
  expired: '邀請碼已過期（7 天），請對方在紀錄員名單按「重發邀請碼」。',
  locked: '邀請碼輸錯太多次，已鎖住。請對方在紀錄員名單按「重發邀請碼」。',
  taken: '這個 email 的紀錄員權限已綁定在另一個帳號。如果不是你本人做的，請馬上通知管理員重發邀請碼（舊帳號會立刻失去權限）。',
}

/**
 * 啟用紀錄員權限: a listed email whose account is not bound yet enters the one-time 邀請碼 and sets their own password
 * (a password someone else may have set on an account made in their name stops working), then other devices are
 * signed out.
 */
export function EditorClaim() {
  const cloud = useDataStore((s) => s.cloud)
  const claimWithCode = useDataStore((s) => s.claimWithCode)
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const access = cloud.access
  if (!cloud.user || cloud.isEditor || !access || !WHY[access]) return null
  const canEnter = access !== 'taken' && access !== 'locked'
  const submit = async () => {
    if (code.replace(/[^A-Za-z0-9]/g, '').length < 10) { setMsg('邀請碼是 10 個英數字'); return }
    if (pw.length < 8) { setMsg('密碼至少 8 個字元'); return }
    if (pw !== pw2) { setMsg('兩次輸入的密碼不一樣'); return }
    setBusy(true); setMsg(null)
    try {
      await setOwnPassword(pw)
      const a = await claimWithCode(code)
      if (a === 'ok') { await signOutOtherDevices().catch(() => undefined); setMsg('已啟用紀錄員權限') } else setMsg(WHY[a] ?? '沒有啟用，請再試一次')
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return (
    <form className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-3 text-[13px]"
      onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <div className="flex items-start gap-2 text-ink"><KeyRound className="size-4 mt-0.5 shrink-0 text-warning" /><span>{WHY[access]}</span></div>
      {canEnter && (
        <>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="邀請碼（例：K7Q2M-9XAPD）" aria-label="邀請碼" autoComplete="one-time-code" className="tnum tracking-wider" />
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="設定密碼（至少 8 個字元）" aria-label="新密碼" autoComplete="new-password" />
          <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="再輸入一次密碼" aria-label="再輸入一次密碼" autoComplete="new-password" />
          <Button type="submit" variant="primary" disabled={busy} className="self-start">{busy ? '啟用中…' : '啟用紀錄員權限'}</Button>
        </>
      )}
      {msg && <div role="status" className="text-xs text-ink-2">{msg}</div>}
    </form>
  )
}
