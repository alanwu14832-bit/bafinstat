import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Tabs } from '../components/ui/Tabs'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Checkbox, Input } from '../components/ui/Input'
import { EmptyState } from '../components/ui/EmptyState'
import dictionary from '../data/seed/stat_dictionary.json'

interface Term { key: string; zh: string; en: string; group: string; formula: string; status: '現有' | '新增'; priority: 'P0' | 'P1' | 'P2'; note: string }
const TERMS = dictionary as Term[]
const GROUPS = ['全部', '打擊', '打擊過程', '投球', '守備', '球隊'] as const
type Group = (typeof GROUPS)[number]
const PRIORITY_LABEL: Record<Term['priority'], string> = { P0: '核心', P1: '重要', P2: '進階' }

export function DictionaryPage() {
  const [group, setGroup] = useState<Group>('全部')
  const [q, setQ] = useState('')
  const [onlyNew, setOnlyNew] = useState(false)
  const rows = useMemo(() => TERMS.filter((t) => (group === '全部' || t.group === group) && (!onlyNew || t.status === '新增') && (!q || `${t.key} ${t.zh} ${t.en} ${t.formula} ${t.note}`.toLowerCase().includes(q.toLowerCase()))), [group, q, onlyNew])
  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g, TERMS.filter((t) => g === '全部' || t.group === g).length])), [])
  const newCount = TERMS.filter((t) => t.status === '新增').length
  // Keep terms grouped when showing everything, so the list reads like a reference.
  const sections = useMemo(() => {
    const order = GROUPS.slice(1) as readonly string[]
    const map = new Map<string, Term[]>()
    for (const t of rows) { if (!map.has(t.group)) map.set(t.group, []); map.get(t.group)!.push(t) }
    return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  }, [rows])

  return (
    <>
      <PageHeader title="數據字典" description={`${TERMS.length} 項指標，其中 ${newCount} 項為本平台新增。定義與總表『數據字典』工作表一致。`} />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs size="sm" aria-label="類別" value={group} onChange={setGroup} items={GROUPS.map((g) => ({ value: g, label: g, count: counts[g] }))} />
        <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋指標、公式" aria-label="搜尋" className="w-[240px]" size="sm" />
        <Checkbox label="只看新增" checked={onlyNew} onChange={setOnlyNew} />
        <span className="text-xs text-muted ml-auto tnum">{rows.length} 項</span>
      </div>
      <Card flush>
        {rows.length === 0 ? (
          <EmptyState title="沒有符合的指標" description="換個關鍵字或類別試試。" compact />
        ) : (
          sections.map(([g, terms]) => (
            <section key={g}>
              <div className="px-5 h-9 flex items-center bg-surface-2/60 border-b border-border text-[12px] font-medium text-ink-2 sticky top-0 z-[1]">{g}<span className="text-muted ml-2 tnum">{terms.length}</span></div>
              <ul className="divide-y divide-[var(--border)]">
                {terms.map((t) => (
                  <li key={t.key} className="px-5 py-3.5 grid grid-cols-1 md:grid-cols-[150px_minmax(0,1fr)_auto] gap-x-6 gap-y-2 items-start">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-ink tnum">{t.key}</div>
                      <div className="text-[12px] text-ink-2 mt-0.5">{t.zh}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] text-muted">{t.en}</div>
                      {t.formula && <code className="block mt-1.5 text-[12px] text-ink-2 font-mono bg-surface-2 rounded-[6px] px-2.5 py-1.5 break-words whitespace-pre-wrap">{t.formula}</code>}
                      {t.note && <p className="text-[12px] text-muted mt-1.5 leading-relaxed">{t.note}</p>}
                    </div>
                    <div className="flex gap-1.5 md:justify-end">
                      {t.status === '新增' && <Badge variant="accent">新增</Badge>}
                      <Badge variant={t.priority === 'P0' ? 'neutral' : 'outline'}>{t.priority} {PRIORITY_LABEL[t.priority]}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </Card>
    </>
  )
}
