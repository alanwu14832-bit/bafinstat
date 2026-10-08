import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Trash2, UserPlus } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { Field, Input } from './Input'
import { addEditor, listEditors, removeEditor, resetEditor } from '../../data/supabase'
import { checkEditorEmail, editorState, formatInviteCode, type Editor } from '../../data/editors'
import { cx } from '../../lib/format'
import { useDataStore } from '../../store/data'

/** 紀錄員名單: recorders add and remove recorders here (no Supabase dashboard). Shown only to signed-in recorders. */
export function EditorsPanel() {
  const cloud = useDataStore((s) => s.cloud)
  const me = cloud.user?.email?.toLowerCase() ?? ''
  // (a 快速登入 session cannot read or change the list: the database keeps it for own-account recorders)
  const show = cloud.configured && !!cloud.user && cloud.isEditor && !cloud.user.is_anonymous
  const [editors, setEditors] = useState<Editor[] | null>(null)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // the one-time 邀請碼 just made (shown once: only its hash is stored)
  const [issued, setIssued] = useState<{ email: string; code: string } | null>(null)

  const reload = useCallback(async () => {
    try { setEditors(await listEditors()) } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }, [])
  useEffect(() => { if (show) void reload() }, [show, reload])
  if (!show) return null

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg(ok); await reload() } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const add = () => {
    const checked = checkEditorEmail(email, editors ?? [])
    if ('error' in checked) { setMsg(checked.error); return }
    void run(async () => { const code = await addEditor(checked.email, note); setIssued(code ? { email: checked.email, code } : null); setEmail(''); setNote('') },
      `已新增 ${checked.email}。`)
  }
  const reissue = (target: string) => {
    if (!window.confirm(`重發 ${target} 的邀請碼？對方目前的帳號會先失去紀錄權限，直到用新的邀請碼重新啟用（忘記密碼、換帳號時用）。`)) return
    void run(async () => setIssued({ email: target, code: await resetEditor(target) }), `已重發 ${target} 的邀請碼`)
  }

  return (
    <Card title="紀錄員名單" subtitle="名單內的人登入後才能紀錄與修改">
      <div className="flex flex-col gap-3 text-[13px]">
        <ul className="flex flex-col divide-y divide-border rounded-[var(--radius-sm)] border border-border">
          {editors === null && <li className="px-3 py-2.5 text-muted">載入中…</li>}
          {editors?.map((e) => (
            <li key={e.email} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-ink">{e.email}{e.email.toLowerCase() === me && <span className="text-muted">（你）</span>}</div>
                {e.note && <div className="truncate text-xs text-muted">{e.note}</div>}
                {editorState(e).label && <div className={cx('text-xs', editorState(e).tone === 'good' ? 'text-good' : 'text-warning')}>{editorState(e).label}</div>}
              </div>
              {e.email.toLowerCase() !== me && e.user_id !== undefined && (
                <Button size="sm" variant="ghost" icon={<KeyRound />} aria-label={`重發 ${e.email} 的邀請碼`} disabled={busy} onClick={() => reissue(e.email)}>重發邀請碼</Button>
              )}
              {e.email.toLowerCase() !== me && (
                <Button size="sm" variant="ghost" icon={<Trash2 />} aria-label={`移除 ${e.email}`} disabled={busy}
                  onClick={() => { if (window.confirm(`確定把 ${e.email} 移出紀錄員名單？對方之後只能瀏覽。`)) void run(() => removeEditor(e.email), `已移除 ${e.email}`) }}>移除</Button>
              )}
            </li>
          ))}
        </ul>
        <form className="flex flex-col gap-2" onSubmit={(ev) => { ev.preventDefault(); add() }}>
          <Field label="新增紀錄員"><Input type="email" placeholder="email" value={email} onChange={(ev) => setEmail(ev.target.value)} aria-label="新紀錄員 email" /></Field>
          <Input placeholder="備註（例：大一紀錄員）" value={note} onChange={(ev) => setNote(ev.target.value)} aria-label="備註" />
          <Button type="submit" size="sm" icon={<UserPlus />} disabled={busy || !email.trim()} className="self-start">新增</Button>
        </form>
        {issued && (
          <div role="status" className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-accent-soft px-3 py-2.5 flex flex-col gap-1.5">
            <div className="text-xs text-ink-2">{issued.email} 的邀請碼（7 天內有效，只會顯示這一次）</div>
            <div className="flex items-center gap-2">
              <span className="figure text-[22px] font-bold tracking-wider text-ink tnum select-all">{formatInviteCode(issued.code)}</span>
              <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(formatInviteCode(issued.code)).then(() => setMsg('已複製邀請碼'))}>複製</Button>
            </div>
            <div className="text-xs text-ink-2">請私下傳給對方（不要貼在群組）：打開網站「資料匯入」→ 登入框選「第一次使用」→ 輸入 email、這個邀請碼並設定密碼。</div>
          </div>
        )}
        <p className="text-xs text-muted leading-relaxed">新增後會出現一組邀請碼，對方要用它在「第一次使用」啟用；沒有邀請碼，就算有人用這個 email 註冊也不能寫入。忘記密碼或換帳號時按「重發邀請碼」。不能移除自己，所以名單不會變成空的。</p>
        {msg && <div role="status" className="text-xs text-ink-2">{msg}</div>}
      </div>
    </Card>
  )
}
