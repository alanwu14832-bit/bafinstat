/**
 * 擊球剖面 of a pitcher (FanGraphs 的 Batted Ball): what kind of contact he allowed (滾地／平飛／飛球), where (拉／中／反方向,
 * from the batter's side), and how hard (弱／中／強), each as one bar over the batted balls that have that detail, plus
 * GB/FB, HR/FB and BABIP by kind. The numbers come from stats.ts (PitchingLine); small samples are marked.
 */
import { Card } from './Card'
import { f2, f3, pct } from '../../lib/fmt'
import type { PitchingLine } from '../../data/stats'

interface Seg { label: string; n: number }
const SHADES = ['color-mix(in srgb, var(--ink) 88%, transparent)', 'color-mix(in srgb, var(--ink) 55%, transparent)', 'color-mix(in srgb, var(--ink) 22%, transparent)']
const MIN_N = 10

function Bar({ title, segs, den, aside }: { title: string; segs: Seg[]; den: number; aside?: string }) {
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={title}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-[13px] font-medium text-ink">{title}</span>
        <span className="text-[11px] text-muted tnum">{den ? `${den} 個擊球${den < MIN_N ? '・樣本少僅供參考' : ''}${aside ? `・${aside}` : ''}` : '還沒有資料'}</span>
      </div>
      <div className="flex h-8 rounded-[6px] overflow-hidden bg-surface-2" aria-hidden={!den}>
        {den > 0 && segs.map((s, i) => s.n > 0 && (
          <div key={s.label} style={{ width: `${(s.n / den) * 100}%`, background: SHADES[i] }} title={`${s.label} ${s.n}/${den}`}
            className={`flex items-center justify-center text-[11px] font-medium tnum whitespace-nowrap overflow-hidden ${i === 2 ? 'text-ink' : 'text-bg'}`}>
            {s.n / den >= 0.14 ? `${s.label} ${pct(s.n / den)}` : ''}
          </div>
        ))}
      </div>
      <div className="flex gap-3 flex-wrap text-[11px] text-muted tnum">
        {segs.map((s, i) => <span key={s.label} className="inline-flex items-center gap-1"><i className="inline-block size-2 rounded-full" style={{ background: SHADES[i] }} />{s.label} {den ? pct(s.n / den) : '—'}<span className="opacity-70">（{s.n}）</span></span>)}
      </div>
    </div>
  )
}

export function BattedBallProfile({ pit }: { pit: PitchingLine }) {
  const kind = pit.bipTraj
  const missing = Math.max(0, pit.bip - kind)
  return (
    <Card title="擊球剖面（被擊球）" subtitle="面對的打者；每一條只算有記那一項的擊球，沒記的不拉低比率">
      <div className="flex flex-col gap-5">
        <Bar title="擊球種類" den={kind} segs={[{ label: '滾地', n: pit.gb }, { label: '平飛', n: pit.ld }, { label: '飛球', n: pit.fb }]} aside={pit.fb ? `飛球裡內野飛球 ${pit.iffb}（IFFB% ${pct(pit.iffbPct)}）` : undefined} />
        <Bar title="擊球方向（以打者的左右打算）" den={pit.bipSpray} segs={[{ label: '拉打', n: pit.pull }, { label: '中間', n: pit.center }, { label: '反方向', n: pit.oppo }]} aside={pit.bip > pit.bipSpray ? `${pit.bip - pit.bipSpray} 個沒落點或沒記打者左右打` : undefined} />
        <Bar title="擊球強度" den={pit.bipQuality} segs={[{ label: '弱', n: pit.soft }, { label: '中', n: pit.med }, { label: '強', n: pit.hard }]} />
        <dl className="grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-3 text-[13px]">
          {[
            { k: 'GB/FB', v: f2(pit.gbFb), note: `${pit.gb} 滾地／${pit.fb} 飛球` },
            { k: 'HR/FB', v: pct(pit.hrFbPct), note: `${pit.hrFb} 轟／${pit.fb} 飛球` },
            { k: 'BABIP 滾地', v: f3(pit.babipGb), note: `${pit.gbH}/${pit.gbN}` },
            { k: 'BABIP 平飛', v: f3(pit.babipLd), note: `${pit.ldH}/${pit.ldN}` },
            { k: 'BABIP 飛球', v: f3(pit.babipFb), note: `${pit.fbH}/${pit.fbN}（不含全壘打）` },
          ].map((x) => (
            <div key={x.k} className="flex flex-col">
              <dt className="text-[11px] text-muted">{x.k}</dt>
              <dd className="text-[18px] text-ink tnum leading-6">{x.v}</dd>
              <span className="text-[11px] text-muted tnum">{x.note}</span>
            </div>
          ))}
        </dl>
        <p className="text-[11px] text-muted">
          共 {pit.bip} 個擊球（含全壘打）：記了軌跡 {kind} 個、落點加打者左右打 {pit.bipSpray} 個、強度 {pit.bipQuality} 個{missing ? `；${missing} 個沒記軌跡的在「修改資料」的投球清單標「缺軌跡」，補上後比率會更準` : ''}。
          飛球含內野飛球；全壘打若軌跡是飛球就算在 HR/FB；強度是紀錄員判斷的強／中／弱，不是球速。
        </p>
      </div>
    </Card>
  )
}
