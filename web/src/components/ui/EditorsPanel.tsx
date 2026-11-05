import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Trash2, UserPlus } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { Field, Input } from './Input'
import { Select } from './Select'
import { addMember, listEditors, removeEditor, resetEditor, setMemberRole, type Role } from '../../data/supabase'
import { checkEditorEmail, editorState, formatInviteCode, type Editor } from '../../data/editors'
import { cx } from '../../lib/format'
import { useDataStore } from '../../store/data'
import { ROLE_LABEL, useAccess } from '../../hooks/useAccess'

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'player', label: '球員（看全部數據）' },
  { value: 'recorder', label: '紀錄員（還能紀錄、修改）' },
  { value: 'admin', label: '管理者（還能管理帳號）' },
]
const ROLE_SHORT = ROLE_OPTIONS.map((o) => ({ value: o.value, label: ROLE_LABEL[o.value] }))

/** 帳號管理: admins add accounts with a role (球員 / 紀錄員 / 管理者), change roles, re-issue 邀請碼 and remove people. */
export function EditorsPanel() {
  const cloud = useDataStore((s) => s.cloud)
  const access = useAccess()
  const me = cloud.user?.email?.toLowerCase() ?? ''
  // (a 快速登入 session never manages accounts: the database keeps the list for admins on their own accounts)
  const show = cloud.configured && !!cloud.user && !cloud.user.is_anonymous && access.level >= 3
  const [editors, setEditors] = useState<Editor[] | null>(null)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [role, setRole] = useState<Role>('player')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // the one-time 邀請碼 just made (shown once: only its hash is stored)
  const [issued, setIssued] = useState<{ email: string; code: string } | null>(null)

  const reload = useCallback(async () => {
    try { setEditors(await listEditors()) } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }, [])
  useEffect(() => { if (show) void reload() }, [show, reload])
  if (!show) return null
  // a database before the roles migration has no roles: everyone listed is a recorder there
  const rolesKnown = !!editors?.some((e) => e.role)

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg(ok); await reload() } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const add = () => {
    const checked = checkEditorEmail(email, editors ?? [])
    if ('error' in checked) { setMsg(checked.error); return }
    void run(async () => { const code = await addMember(checked.email, role, note); setIssued(code ? { email: checked.email, code } : null); setEmail(''); setNote('') },
      `已新增 ${checked.email}（${ROLE_LABEL[role]}）。`)
  }
  const reissue = (target: string) => {
    if (!window.confirm(`重發 ${target} 的邀請碼？對方目前的帳號會先失去權限，直到用新的邀請碼重新啟用（忘記密碼、換帳號時用）。`)) return
    void run(async () => setIssued({ email: target, code: await resetEditor(target) }), `已重發 ${target} 的邀請碼`)
  }
  const changeRole = (target: string, next: Role) => {
    if (!window.confirm(`把 ${target} 改成${ROLE_LABEL[next]}？`)) return
    void run(() => setMemberRole(target, next), `${target} 改成${ROLE_LABEL[next]}了`)
  }

  return (
    <Card title="帳號管理" subtitle="球員登入看全部數據；紀錄員還能紀錄與修改；管理者還能管理帳號">
      <div className="flex flex-col gap-3 text-[13px]">
        <ul className="flex flex-col divide-y divide-border rounded-[var(--radius-sm)] border border-border">
          {editors === null && <li className="px-3 py-2.5 text-muted">載入中…</li>}
          {editors?.map((e) => {
            const mine = e.email.toLowerCase() === me
            return (
              <li key={e.email} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1 basis-48">
                  <div className="truncate text-ink">{e.email}{mine && <span className="text-muted">（你）</span>}</div>
                  {e.note && <div className="truncate text-xs text-muted">{e.note}</div>}
                  {editorState(e).label && <div className={cx('text-xs', editorState(e).tone === 'good' ? 'text-good' : 'text-warning')}>{editorState(e).label}</div>}
                </div>
                {rolesKnown && e.role && (mine
                  ? <span className="text-xs font-medium text-ink-2 px-2">{ROLE_LABEL[e.role]}</span>
                  : <Select size="sm" aria-label={`${e.email} 的身分`} value={e.role} disabled={busy} onChange={(ev) => changeRole(e.email, ev.target.value as Role)} options={ROLE_SHORT} className="w-[96px]" />)}
                {!mine && e.user_id !== undefined && (
                  <Button size="sm" variant="ghost" icon={<KeyRound />} aria-label={`重發 ${e.email} 的邀請碼`} disabled={busy} onClick={() => reissue(e.email)}>重發邀請碼</Button>
                )}
                {!mine && (
                  <Button size="sm" variant="ghost" icon={<Trash2 />} aria-label={`移除 ${e.email}`} disabled={busy}
                    onClick={() => { if (window.confirm(`確定移除 ${e.email} 的帳號？對方之後只能看不用登入的頁面。`)) void run(() => removeEditor(e.email), `已移除 ${e.email}`) }}>移除</Button>
                )}
              </li>
            )
          })}
        </ul>
        <form className="flex flex-col gap-2" onSubmit={(ev) => { ev.preventDefault(); add() }}>
          <Field label="新增帳號"><Input type="email" placeholder="email" value={email} onChange={(ev) => setEmail(ev.target.value)} aria-label="新帳號 email" /></Field>
          <Select aria-label="新帳號的身分" value={role} onChange={(ev) => setRole(ev.target.value as Role)} options={ROLE_OPTIONS} className="w-full" />
          <Input placeholder="備註（例：投手 #18、紀錄組）" value={note} onChange={(ev) => setNote(ev.target.value)} aria-label="備註" />
          <Button type="submit" size="sm" icon={<UserPlus />} disabled={busy || !email.trim()} className="self-start">新增</Button>
        </form>
        {issued && (
          <div role="status" className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-accent-soft px-3 py-2.5 flex flex-col gap-1.5">
            <div className="text-xs text-ink-2">{issued.email} 的邀請碼（7 天內有效，只會顯示這一次）</div>
            <div className="flex items-center gap-2">
              <span className="figure text-[22px] font-bold tracking-wider text-ink tnum select-all">{formatInviteCode(issued.code)}</span>
              <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(formatInviteCode(issued.code)).then(() => setMsg('已複製邀請碼'))}>複製</Button>
            </div>
            <div className="text-xs text-ink-2">請私下傳給對方（不要貼在群組）：打開網站 → 左下角「登入」→ 選「第一次使用」→ 輸入 email、這個邀請碼並設定密碼。</div>
          </div>
        )}
        <p className="text-xs text-muted leading-relaxed">新增後會出現一組邀請碼，對方要用它在「第一次使用」啟用；沒有邀請碼，就算有人用這個 email 註冊也不能登入成員帳號。忘記密碼或換帳號時按「重發邀請碼」。不能移除或改自己的身分，所以一定留著一位管理者。</p>
        {msg && <div role="status" className="text-xs text-ink-2">{msg}</div>}
      </div>
    </Card>
  )
}
