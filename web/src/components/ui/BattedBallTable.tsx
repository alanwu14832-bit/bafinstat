/**
 * 擊球剖面 (Baseball Savant 的 Batted Ball Breakdown 版型): one clean table, columns in groups — 擊球種類 (GB／LD／FB／PU／AIR),
 * 方向 (Pull／Center／Oppo), 強度 (Soft／Med／Hard) and 結果 (HR/FB, BABIP by kind) — one row per player and a 全隊 row to
 * compare with. Each rate has its numerator / denominator in small grey type; it only counts the batted balls that have that
 * detail (軌跡, 落點, 強度), so a missing detail never drags it down. The same table for our batters and our pitchers
 * (data/stats.ts BattedBallCounts / BattedBallRates).
 */
import { Download } from 'lucide-react'
import { Card } from './Card'
import { Button } from './Button'
import type { Column } from './DataTable'
import { EmptyState } from './EmptyState'
import { withFraction } from './jerseyColumn'
import { useStats } from '../../hooks/useStats'
import { useDataStore } from '../../store/data'
import { scopeText } from '../layout/FilterChips'
import { downloadCsv } from '../../lib/csv'
import { f3, pct } from '../../lib/fmt'
import type { BattedBallCounts, BattedBallRates } from '../../data/stats'

export type BattedBallLine = BattedBallCounts & BattedBallRates
const MIN_BIP = 10

/** The columns of the 擊球剖面, for a team table (the caller puts its name column first) or the card below. */
export function battedColumns<T extends BattedBallLine>(): Column<T>[] {
  const frac = (key: keyof T & string, header: string, parts: (r: T) => [number, number]): Column<T> => ({
    key, header, align: 'right', sortable: true,
    format: (v, r) => withFraction(pct(v as number | null), ...parts(r)),
    text: (v) => pct(v as number | null),
  })
  const babip = (key: keyof T & string, header: string, parts: (r: T) => [number, number]): Column<T> => ({
    key, header, align: 'right', sortable: true,
    format: (v, r) => withFraction(f3(v as number | null), ...parts(r)),
    text: (v) => f3(v as number | null),
  })
  const traj = (r: T): number => r.bipTraj
  return [
    { key: 'bip' as keyof T & string, header: 'BIP', align: 'right', sortable: true },
    frac('gbPct', 'GB%', (r) => [r.gb, traj(r)]), frac('ldPct', 'LD%', (r) => [r.ld, traj(r)]), frac('fbPct', 'FB%', (r) => [r.fb - r.iffb, traj(r)]),
    frac('puPct', 'PU%', (r) => [r.iffb, traj(r)]), frac('airPct', 'AIR%', (r) => [r.ld + r.fb, traj(r)]),
    frac('pullPct', 'Pull%', (r) => [r.pull, r.bipSpray]), frac('centerPct', 'Center%', (r) => [r.center, r.bipSpray]), frac('oppoPct', 'Oppo%', (r) => [r.oppo, r.bipSpray]),
    frac('softPct', 'Soft%', (r) => [r.soft, r.bipQuality]), frac('medPct', 'Med%', (r) => [r.med, r.bipQuality]), frac('hardPct', 'Hard%', (r) => [r.hard, r.bipQuality]),
    frac('hrFbPct', 'HR/FB', (r) => [r.hrFb, r.fb]),
    babip('babipGb', 'BABIP 滾地', (r) => [r.gbH, r.gbN]), babip('babipLd', 'BABIP 平飛', (r) => [r.ldH, r.ldN]), babip('babipFb', 'BABIP 飛球', (r) => [r.fbH, r.fbN]),
  ]
}

const GROUPS: Array<{ title: string; span: number }> = [
  { title: '擊球種類', span: 6 }, { title: '方向', span: 3 }, { title: '強度', span: 3 }, { title: '結果', span: 4 },
]

interface Row { id: string; name: string; line: BattedBallLine }

export function BattedBallTable({ kind, rows, id, title = '擊球剖面' }: { kind: 'bat' | 'pit'; rows: Array<{ name: string; line: BattedBallLine }>; id?: string; title?: string }) {
  const s = useStats()
  const filters = useDataStore((st) => st.filters)
  const pit = kind === 'pit'
  const cols = battedColumns<Row & BattedBallLine>()
  const data = rows.map((r) => ({ ...r.line, id: r.name, name: r.name, line: r.line })) as Array<Row & BattedBallLine>
  const first = rows[0]?.line
  const csv = () => downloadCsv('擊球剖面.csv', [{ key: 'name', header: pit ? '投手' : '打者' } as Column<Row & BattedBallLine>, ...cols], data, [`對象：${rows.map((r) => r.name).join('、')}`, scopeText(filters, s.games), `來源：${window.location.href}`])
  return (
    <Card id={id} title={title} flush
      subtitle={pit ? '被擊球：面對的打者打出的球。每個比率只算有記那一項的擊球，小字是 分子/分母；最後一列是全隊投手合計。' : '打出的球。每個比率只算有記那一項的擊球，小字是 分子/分母；最後一列是全隊合計。'}
      action={<Button size="sm" variant="ghost" icon={<Download />} title="下載成 CSV，可用 Excel 開" onClick={csv} disabled={!first?.bip}>CSV</Button>}>
      {!first?.bip ? <EmptyState compact title="目前篩選條件下沒有擊球紀錄" /> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tnum border-collapse">
              <thead>
                <tr className="text-[11px] text-muted">
                  <th rowSpan={2} className="text-left font-medium px-4 py-2 align-bottom sticky left-0 bg-surface">{pit ? '投手' : '打者'}</th>
                  <th rowSpan={2} className="text-right font-medium px-3 py-2 align-bottom">BIP</th>
                  {GROUPS.map((g) => <th key={g.title} colSpan={g.span} className="text-center font-medium px-3 pt-2 pb-1 border-b border-border">{g.title}</th>)}
                </tr>
                <tr className="text-[11px] text-ink-2">
                  {cols.slice(1).map((c) => <th key={c.key} className="text-right font-medium px-3 py-1.5 whitespace-nowrap">{c.header}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => {
                  const small = r.bip < MIN_BIP
                  return (
                    <tr key={r.id} className={`border-t border-border ${i === data.length - 1 && data.length > 1 ? 'bg-surface-2 font-medium' : ''}`}>
                      <td className="text-left px-4 py-2 sticky left-0 bg-inherit whitespace-nowrap">{r.name}{small && <span className="ml-1.5 text-[10px] font-medium text-muted border border-border rounded px-1 leading-4 whitespace-nowrap">樣本少</span>}</td>
                      <td className="text-right px-3 py-2">{r.bip}</td>
                      {cols.slice(1).map((c) => (
                        <td key={c.key} className={`text-right px-3 py-2 whitespace-nowrap ${small ? 'text-muted' : ''}`}>{c.format ? c.format(r[c.key], r) : String(r[c.key] ?? '')}</td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[12px] text-muted leading-5 border-t border-border">
            GB＋LD＋FB＋PU 加起來是 100%（PU 是內野飛球）；AIR＝LD＋FB＋PU。HR/FB 的飛球含內野飛球；BABIP 不含全壘打與觸擊。
            強度是紀錄員判斷的強／中／弱，不是球速；{pit ? 'Pull／Center／Oppo 用對方打者的左右打加落點' : 'Pull／Center／Oppo 用球員名單的打擊慣用加落點（沒填慣用的打者不算）'}。共 {first.bip} 個擊球，
            其中記了軌跡 {first.bipTraj}、落點 {first.bipSpray}、強度 {first.bipQuality}；沒記的在「修改資料」補上。
          </p>
        </>
      )}
    </Card>
  )
}
