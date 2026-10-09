/**
 * 延長賽突破僵局 on the 紀錄比賽 screen: the card that shows at the start of an extra half-inning under the rule (who
 * goes on which base, then one tap 「放上跑者」), and the two selects that set the rule (開賽設定 and 「改規則」).
 */
import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { TEAM } from '../config/team'
import { offense, type RecordState, type TiebreakRule } from './model'
import { basesLabel, parseTiebreakBases, tiebreakPreview, tiebreakRuleOf } from './tiebreak'

const BASE_OPTIONS = [{ value: '12', label: '一、二壘' }, { value: '2', label: '二壘' }, { value: '123', label: '滿壘' }]
const BASE_ZH = ['打者', '一壘', '二壘', '三壘']

/** 突破僵局 (from which inning, or 不採用) and 放哪幾壘, side by side in a two-column grid. */
export function TiebreakSelects({ innings, from, bases, onChange, offLabel = '不採用', idPrefix }: { innings: number; from: number | null; bases: string; onChange: (from: number | null, bases: string) => void; offLabel?: string; idPrefix: string }) {
  const starts = [innings + 1, innings + 2, innings + 3]
  if (from !== null && !starts.includes(from)) starts.push(from)
  return (
    <>
      <Field label="突破僵局">
        <Select id={`${idPrefix}-tb-from`} value={from === null ? 'off' : String(from)} onChange={(e) => onChange(e.target.value === 'off' ? null : Number(e.target.value), bases)} className="w-full"
          options={[...starts.sort((a, z) => a - z).map((n) => ({ value: String(n), label: `第 ${n} 局起` })), { value: 'off', label: offLabel }]} />
      </Field>
      <Field label="放哪幾壘">
        <Select id={`${idPrefix}-tb-bases`} value={bases} disabled={from === null} onChange={(e) => onChange(from, e.target.value)} className="w-full" options={BASE_OPTIONS} />
      </Field>
    </>
  )
}

/** The runners to put on now, the batter after them, and the buttons. */
export function TiebreakCard({ state, onPlace, onSkip, onRule }: { state: RecordState; onPlace: () => void; onSkip: () => void; onRule: (rule: TiebreakRule | null) => void }) {
  const [editing, setEditing] = useState(false)
  const rule = tiebreakRuleOf(state)
  const us = offense(state) === 'us'
  const preview = tiebreakPreview(state)
  const innings = state.game.innings ?? TEAM.innings
  if (!rule) return null
  const label = (p: (typeof preview)[number]) => (us ? `第 ${p.order} 棒 ${p.name}` : `對方第 ${p.order} 棒${p.named ? ` ${p.name}` : ''}`)
  return (
    <section aria-label="延長賽突破僵局" className="rounded-[var(--radius-sm)] border-2 border-[color-mix(in_srgb,var(--accent)_65%,transparent)] bg-accent-soft p-3 md:p-4 flex flex-col gap-3">
      <div>
        <div className="text-[15px] font-semibold text-ink">延長賽突破僵局</div>
        <div className="text-[12px] text-ink-2">第 {state.inning} 局{state.half === 'top' ? '上' : '下'}・無人出局，照規則把跑者放上{basesLabel(rule.bases)}</div>
      </div>
      <ul className="flex flex-col gap-1 text-[14px]">
        {preview.map((p) => (
          <li key={`${p.base}-${p.order}`} className="flex items-baseline gap-3">
            <span className="w-10 shrink-0 text-muted text-[12px]">{BASE_ZH[p.base]}</span>
            <span className={p.base ? 'font-semibold text-ink' : 'text-ink-2'}>{label(p)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-muted">{us ? '打者照棒次接下去；規則讓球隊自選打者時，在「打線」裡點棒次換打者，跑者會跟著換成他前面的棒次。要代跑，放上去後點壘包換人。' : '要換對方打者，用打線下方的「跳過對方這棒」。'}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="primary" size="lg" onClick={onPlace} className="w-full sm:w-auto">放上跑者</Button>
        <Button variant="ghost" onClick={onSkip}>這局不用</Button>
        <button type="button" aria-expanded={editing} onClick={() => setEditing(!editing)} className="ml-auto h-9 px-1 text-[12px] text-ink-2 hover:text-ink underline underline-offset-2 cursor-pointer">改規則</button>
      </div>
      {editing && (
        <div className="grid grid-cols-2 gap-3">
          <TiebreakSelects idPrefix="live" innings={innings} from={rule.from} bases={rule.bases.join('')} offLabel="這場不採用"
            onChange={(from, bases) => onRule(from === null ? null : { from, bases: parseTiebreakBases(bases) })} />
        </div>
      )}
    </section>
  )
}
