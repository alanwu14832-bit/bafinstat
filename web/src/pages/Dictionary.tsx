import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Tabs } from '../components/ui/Tabs'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import dictionary from '../data/seed/stat_dictionary.json'

interface Term { key: string; zh: string; en: string; group: string; formula: string; status: '現有' | '新增'; priority: 'P0' | 'P1' | 'P2'; note: string }
const TERMS = dictionary as Term[]
const GROUPS = ['全部', '打擊', '打擊過程', '投球', '守備', '球隊'] as const
type Group = (typeof GROUPS)[number]
const PRIORITY_LABEL: Record<Term['priority'], string> = { P0: 'P0 核心', P1: 'P1 重要', P2: 'P2 進階' }

export function DictionaryPage() {
  const [group, setGroup] = useState<Group>('全部')
  const [q, setQ] = useState('')
  const [onlyNew, setOnlyNew] = useState(false)
  const rows = useMemo(() => TERMS.filter((t) => (group === '全部' || t.group === group) && (!onlyNew || t.status === '新增') && (!q || `${t.key} ${t.zh} ${t.en} ${t.formula} ${t.note}`.toLowerCase().includes(q.toLowerCase()))), [group, q, onlyNew])
  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g, TERMS.filter((t) => g === '全部' || t.group === g).length])), [])
  const newCount = TERMS.filter((t) => t.status === '新增').length

  return (
    <>
      <PageHeader eyebrow="Glossary" title="數據字典" description={`${TERMS.length} 項指標；其中 ${newCount} 項為本平台新增（原單場紀錄表沒有）。定義與總表『數據字典』工作表一致。`} />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs size="sm" aria-label="類別" value={group} onChange={setGroup} items={GROUPS.map((g) => ({ value: g, label: g, count: counts[g] }))} />
        <label className="relative">
          <Search className="size-4 text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋指標、公式" aria-label="搜尋" className="h-9 pl-8 pr-3 bg-surface border border-border rounded-[var(--radius-sm)] text-sm w-[220px]" />
        </label>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="accent-[var(--accent)]" /> 只看新增</label>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {rows.map((t) => (
          <Card key={t.key} className="h-full">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-bold text-[20px] leading-none text-ink">{t.key}</span>
                  <span className="text-sm font-medium text-ink">{t.zh}</span>
                  <span className="text-xs text-muted">{t.en}</span>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Badge variant={t.status === '新增' ? 'accent' : 'neutral'}>{t.status}</Badge>
                <Badge variant={t.priority === 'P0' ? 'good' : t.priority === 'P1' ? 'neutral' : 'neutral'}>{PRIORITY_LABEL[t.priority]}</Badge>
              </div>
            </div>
            {t.formula && <div className="mt-3 text-sm text-ink-2 font-mono rounded-[var(--radius-sm)] bg-surface-2 px-3 py-2 break-words">{t.formula}</div>}
            {t.note && <p className="text-xs text-muted mt-2">{t.note}</p>}
            <div className="text-[11px] text-muted mt-2">{t.group}</div>
          </Card>
        ))}
        {rows.length === 0 && <Card className="lg:col-span-2"><div className="text-sm text-muted text-center py-8">沒有符合的指標</div></Card>}
      </div>
    </>
  )
}
