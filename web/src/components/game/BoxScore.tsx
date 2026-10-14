import type { ReactNode } from 'react'
import { DataTable, type Column } from '../ui/DataTable'
import { Badge } from '../ui/Badge'
import { cx } from '../../lib/format'
import type { BoxBatter, BoxBatting, BoxNote, BoxOppPitcher, BoxPitcher, BoxScore as Box } from '../../data/boxScore'

const num = <R,>(key: keyof R & string, header: string): Column<R> => ({ key, header, align: 'right', sortable: false })
const COUNT_COLS = <R extends BoxBatter,>(): Column<R>[] => [num('ab', '打數'), num('r', '得分'), num('h', '安打'), num('rbi', '打點'), num('bb', '四死'), num('so', '三振')]

/** 棒次・守位・姓名 in the pinned column; a substitute is indented under the player he came in for. */
const batterCell = (r: BoxBatter): ReactNode => (
  <span className="inline-flex items-baseline gap-1.5" title={r.atBat ? '打擊中' : undefined}>
    <span className="w-4 shrink-0 text-center text-muted tnum">{r.first ? r.slot ?? '—' : ''}</span>
    <span className={cx('inline-flex items-baseline gap-1.5', !r.first && 'pl-3')}>
      <span className="min-w-7 text-[11px] text-muted">{r.pos}</span>
      <span className="font-medium text-ink">{r.name}</span>
      {r.atBat && <span className="sr-only">（打擊中）</span>}
    </span>
  </span>
)
const batCols: Column<BoxBatter>[] = [{ key: 'name', header: '打者', sortable: false, format: (_, r) => batterCell(r) }, ...COUNT_COLS<BoxBatter>()]
const pitCols: Column<BoxPitcher>[] = [
  { key: 'name', header: '投手', sortable: false, format: (_, r) => <span className="inline-flex items-center gap-1.5"><span className="font-medium">{r.name}</span>{r.now && <Badge variant="accent">投球中</Badge>}</span> },
  { key: 'ip', header: '局數', align: 'right', sortable: false }, num('h', '安打'), num('r', '失分'), num('er', '自責'), num('bb', '四死'), num('k', '三振'), num('pc', '用球數'),
]
const oppPitCols: Column<BoxOppPitcher>[] = [
  { key: 'label', header: '投手', sortable: false, format: (_, r) => <span className="inline-flex items-center gap-1.5"><span className="font-medium">{r.label}</span>{r.now && <Badge variant="accent">投球中</Badge>}</span> },
  num('pa', '打席'), num('h', '安打'), num('bb', '四死'), num('k', '三振'), num('pc', '用球數'),
]

/** 「二安 甲 2・全壘打 乙」, the small print under a batting table. */
function Notes({ notes }: { notes: BoxNote[] }) {
  if (!notes.length) return null
  return (
    <p className="px-4 py-2 text-[12px] text-ink-2 leading-relaxed border-t border-border">
      {notes.map((n, i) => <span key={n.label}>{i > 0 && <span className="text-muted">・</span>}<span className="text-muted">{n.label}</span> {n.text}</span>)}
    </p>
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="border-t border-border first:border-t-0">
      <h4 className="px-4 pt-3 pb-1.5 text-[12px] font-semibold text-ink-2">{title}</h4>
      {children}
    </section>
  )
}

function Batting({ side, empty }: { side: BoxBatting; empty: string }) {
  const at = side.rows.find((r) => r.atBat)
  return (
    <>
      <DataTable columns={batCols} rows={side.rows} rowKey={(r) => r.key} dense emptyTitle={empty} highlightKey={at?.key} scrollToHighlight={false}
        footer={side.rows.length ? { name: '合計', ab: side.total.ab, r: side.total.r, h: side.total.h, rbi: side.total.rbi, bb: side.total.bb, so: side.total.so } : undefined} />
      <Notes notes={side.notes} />
    </>
  )
}

/**
 * Box Score (data/boxScore.ts), the newspaper way: 我隊打擊, 我隊投球, 對方打擊, 對方投手. Each table scrolls sideways
 * inside the card with the name column pinned, so a phone never scrolls the page sideways. 即時比分 uses it.
 */
export function BoxScore({ box }: { box: Box }) {
  return (
    <div>
      <Part title="我隊打擊"><Batting side={box.us} empty="還沒有打席" /></Part>
      <Part title="我隊投球"><DataTable columns={pitCols} rows={box.pitching} rowKey={(r) => r.name} dense emptyTitle="還沒有投球" /></Part>
      <Part title="對方打擊"><Batting side={box.opp} empty="還沒有打席" /></Part>
      {box.oppPitchers.length > 0 && <Part title="對方投手"><DataTable columns={oppPitCols} rows={box.oppPitchers} rowKey={(r) => r.key} dense /></Part>}
    </div>
  )
}
