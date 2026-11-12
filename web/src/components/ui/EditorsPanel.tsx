import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, KeyRound, Trash2, UserPlus, UsersRound } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import { Field, Input } from './Input'
import { Select } from './Select'
import { Tabs } from './Tabs'
import { addMember, listEditors, removeEditor, resetEditor, setMemberRole, type Role } from '../../data/supabase'
import { MEMBER_BATCH_MAX, checkEditorEmail, editorState, formatInviteCode, inviteMessage, readMemberList, type Editor, type MemberLine } from '../../data/editors'
import { cx } from '../../lib/format'
import { useDataStore } from '../../store/data'
import { ROLE_LABEL, useAccess } from '../../hooks/useAccess'
import { TEAM } from '../../config/team'

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'player', label: '球員（看全部數據）' },
  { value: 'coach', label: '教練（看全部數據，和球員一樣）' },
  { value: 'recorder', label: '紀錄員（還能紀錄、修改）' },
  { value: 'admin', label: '管理者（還能管理帳號）' },
]
const ROLE_SHORT = ROLE_OPTIONS.map((o) => ({ value: o.value, label: ROLE_LABEL[o.value] }))

/** One account of a 整批新增: its one-time 邀請碼, or why it was not added. */
interface BatchRow extends MemberLine { role: Role; code?: string; error?: string }
// The 邀請碼 of this visit's 整批新增 stay on screen while the site stays open, so that opening another page and coming
// back does not lose them. Never stored (the database keeps only their hashes) and dropped when the account changes.
let kept: { for: string; rows: BatchRow[] } = { for: '', rows: [] }
const AREA = 'w-full min-w-0 rounded-[10px] border border-transparent bg-surface-3/60 px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-muted resize-y hover:bg-surface-3 focus:bg-surface focus:border-[color-mix(in_srgb,var(--ink)_30%,transparent)] focus:outline-none transition-colors motion-reduce:transition-none disabled:opacity-50'
const copyText = (text: string) => navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('這個瀏覽器不能自動複製，請自己選取文字複製'))

/** 帳號管理: admins add accounts with a role (球員 / 紀錄員 / 管理者), one at a time or a pasted list, change roles, re-issue 邀請碼 and remove people. */
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
  // 整批新增: the pasted list, how far the adding is, the codes made so far and which messages were copied
  const [mode, setMode] = useState<'one' | 'many'>('one')
  const [paste, setPaste] = useState('')
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null)
  const [batch, setBatchState] = useState<BatchRow[]>(() => (kept.for === me ? kept.rows : []))
  const [copied, setCopied] = useState<Set<string>>(() => new Set())
  const setBatch = (rows: BatchRow[]) => { kept = { for: me, rows }; setBatchState(rows) }
  useEffect(() => { if (kept.for !== me) setBatchState([]) }, [me])   // (another account never sees the last one's codes)
  const many = useMemo(() => readMemberList(paste, editors ?? []), [paste, editors])
  // (a list of codes that is still on screen: ask before the page is closed or reloaded)
  const unsent = batch.some((r) => r.code)
  useEffect(() => {
    if (!unsent) return
    const ask = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', ask)
    return () => window.removeEventListener('beforeunload', ask)
  }, [unsent])

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
  const addMany = async () => {
    const people = many.add.slice(0, MEMBER_BATCH_MAX)
    if (!people.length) return
    if (!window.confirm(`新增 ${people.length} 個「${ROLE_LABEL[role]}」帳號？每個人會有一組自己的邀請碼。`)) return
    setBusy(true); setMsg(null)
    const rows = [...batch]
    const failed: MemberLine[] = []
    for (const [i, p] of people.entries()) {
      setProgress({ done: i, of: people.length })
      try {
        const code = await addMember(p.email, role, p.note)
        rows.push({ ...p, role, ...(code ? { code } : { error: '已新增，但沒有拿到邀請碼：請在名單上按他的「重發邀請碼」' }) })
      } catch (e) { rows.push({ ...p, role, error: e instanceof Error ? e.message : String(e) }); failed.push(p) }
      setBatch([...rows])
    }
    setProgress(null)
    // what did not go in stays in the box, to try again
    setPaste(failed.map((p) => `${p.email} ${p.note}`.trim()).join('\n'))
    setMsg(failed.length ? `新增了 ${people.length - failed.length} 個，${failed.length} 個沒有成功（原因寫在下面，名單留在輸入框裡可以再試）。` : `已新增 ${people.length} 個${ROLE_LABEL[role]}帳號。邀請碼在下面，請先複製再離開這一頁。`)
    await reload()
    setBusy(false)
  }
  const copyRow = (r: BatchRow) => {
    if (!r.code) return
    void copyText(inviteMessage({ team: TEAM.short, url: TEAM.siteUrl, email: r.email, role: ROLE_LABEL[r.role], code: r.code }))
      .then(() => { setCopied((c) => new Set(c).add(r.email)); setMsg(`已複製要傳給 ${r.email} 的訊息`) }, (e) => setMsg(e instanceof Error ? e.message : String(e)))
  }
  const copyAll = () => {
    const lines = batch.filter((r) => r.code).map((r) => [r.email, r.note, ROLE_LABEL[r.role], formatInviteCode(r.code!)].join('\t'))
    void copyText(['email\t備註\t身分\t邀請碼', ...lines].join('\n')).then(() => setMsg(`已複製 ${lines.length} 個邀請碼（可以貼到試算表）`), (e) => setMsg(e instanceof Error ? e.message : String(e)))
  }
  const clearBatch = () => {
    if (unsent && !window.confirm('清掉之後就看不到這些邀請碼了（沒傳到的人要按「重發邀請碼」）。確定都複製好了嗎？')) return
    setBatch([]); setCopied(new Set())
  }
  const changeRole = (target: string, next: Role) => {
    if (!window.confirm(`把 ${target} 改成${ROLE_LABEL[next]}？`)) return
    void run(() => setMemberRole(target, next), `${target} 改成${ROLE_LABEL[next]}了`)
  }

  return (
    <Card title="帳號管理" subtitle="球員、教練登入看全部數據；紀錄員還能紀錄與修改；管理者還能管理帳號">
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
        <Tabs size="sm" aria-label="新增方式" value={mode} onChange={(m) => { setMode(m); setMsg(null) }} items={[{ value: 'one', label: '新增一個' }, { value: 'many', label: '整批新增' }]} className="self-start" />
        {mode === 'one' ? (
        <form className="flex flex-col gap-2" onSubmit={(ev) => { ev.preventDefault(); add() }}>
          <Field label="新增帳號"><Input type="email" placeholder="email" value={email} onChange={(ev) => setEmail(ev.target.value)} aria-label="新帳號 email" /></Field>
          <Select aria-label="新帳號的身分" value={role} onChange={(ev) => setRole(ev.target.value as Role)} options={ROLE_OPTIONS} className="w-full" />
          <Input placeholder="備註（例：投手 #18、紀錄組）" value={note} onChange={(ev) => setNote(ev.target.value)} aria-label="備註" />
          <Button type="submit" size="sm" icon={<UserPlus />} disabled={busy || !email.trim()} className="self-start">新增</Button>
        </form>
        ) : (
        <form className="flex flex-col gap-2" onSubmit={(ev) => { ev.preventDefault(); void addMany() }}>
          <Field label="整批新增" hint="一行一個人：email，後面可以加名字或背號（會變成備註）。從試算表整欄複製貼上也可以。">
            <textarea rows={6} value={paste} onChange={(ev) => setPaste(ev.target.value)} disabled={busy} aria-label="要新增的 email（一行一個）"
              placeholder={'wang@gmail.com 王小明 #18\nlee@gmail.com 李大華 #7'} spellCheck={false} autoCapitalize="off" autoCorrect="off" className={AREA} />
          </Field>
          <Select aria-label="這批帳號的身分" value={role} onChange={(ev) => setRole(ev.target.value as Role)} options={ROLE_OPTIONS} className="w-full" />
          {paste.trim() && (
            <ul aria-label="這份名單" className="text-xs text-ink-2 leading-relaxed">
              <li><span className="font-medium text-ink tnum">{many.add.length}</span> 個可以新增{many.add.length > MEMBER_BATCH_MAX && `（一次最多 ${MEMBER_BATCH_MAX} 個：先新增前 ${MEMBER_BATCH_MAX} 個，其餘再貼一次）`}</li>
              {many.listed.length > 0 && <li>{many.listed.length} 個已經在名單裡，會略過：{many.listed.slice(0, 3).join('、')}{many.listed.length > 3 && '…'}</li>}
              {many.repeated.length > 0 && <li>{many.repeated.length} 個重複貼了，只新增一次</li>}
              {many.unread.length > 0 && <li className="text-warning">{many.unread.length} 行找不到 email，會略過：{many.unread.slice(0, 3).map((l) => `「${l}」`).join('')}{many.unread.length > 3 && '…'}</li>}
            </ul>
          )}
          <Button type="submit" size="sm" icon={<UsersRound />} disabled={busy || !many.add.length} className="self-start">
            {progress ? `新增中… ${progress.done}/${progress.of}` : `新增 ${Math.min(many.add.length, MEMBER_BATCH_MAX)} 個帳號`}
          </Button>
        </form>
        )}
        {batch.length > 0 && (
          <section aria-label="整批新增的邀請碼" className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-accent-soft px-3 py-2.5 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs text-ink-2 flex-1 basis-56 leading-relaxed">這次整批新增的邀請碼（7 天內有效）。<span className="font-medium text-ink">只會顯示這一次：關掉或重新整理網頁前，請先複製。</span></div>
              <Button size="sm" variant="outline" icon={<Copy />} disabled={!unsent} onClick={copyAll}>複製全部</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={clearBatch}>清除</Button>
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {batch.map((r) => (
                <li key={r.email} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                  <div className="min-w-0 flex-1 basis-44">
                    <div className="truncate text-ink">{r.email}</div>
                    <div className="truncate text-xs text-muted">{ROLE_LABEL[r.role]}{r.note && `・${r.note}`}</div>
                  </div>
                  {r.code ? (
                    <>
                      <span className="figure text-[15px] font-bold tracking-wider text-ink tnum select-all">{formatInviteCode(r.code)}</span>
                      <Button size="sm" variant="ghost" icon={copied.has(r.email) ? <Check /> : <Copy />} aria-label={`複製要傳給 ${r.email} 的訊息`} onClick={() => copyRow(r)}>{copied.has(r.email) ? '已複製' : '複製訊息'}</Button>
                    </>
                  ) : <span className="text-xs text-critical basis-full sm:basis-auto">{r.error}</span>}
                </li>
              ))}
            </ul>
            <div className="text-xs text-ink-2 leading-relaxed">「複製訊息」是可以直接傳給那個人的說明（網址、他的 email 和邀請碼），傳過的會打勾；「複製全部」可以貼到試算表。請一個一個私下傳，不要貼在群組。</div>
          </section>
        )}
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
        <p className="text-xs text-muted leading-relaxed">新增後會出現一組邀請碼（整批新增是每個人一組），對方要用它在「第一次使用」啟用；沒有邀請碼，就算有人用這個 email 註冊也不能登入成員帳號。忘記密碼或換帳號時按「重發邀請碼」。不能移除或改自己的身分，所以一定留著一位管理者。</p>
        {msg && <div role="status" className="text-xs text-ink-2">{msg}</div>}
      </div>
    </Card>
  )
}
