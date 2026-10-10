import { Card } from '../ui/Card'
import { notesFootnote, type NoteSection } from '../../data/gameNotes'

/** 比賽附註: the box score's small print (data/gameNotes), one 「標籤：內容」 line each. */
export function GameNotesCard({ sections }: { sections: NoteSection[] }) {
  if (!sections.length) return null
  const foot = notesFootnote(sections)
  return (
    <Card title="比賽附註" subtitle="依這場的紀錄整理">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        {sections.map((s) => (
          <section key={s.title} className="min-w-0">
            <h4 className="text-[11px] font-semibold tracking-[0.08em] text-muted mb-1.5">{s.title}</h4>
            <ul className="flex flex-col gap-1">
              {s.lines.map((l) => (
                <li key={l.label} className="text-[13px] text-ink leading-relaxed"><span className="text-ink-2">{l.label}：</span>{l.text}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {foot && <p className="mt-4 text-[11px] text-muted leading-4">{foot}</p>}
    </Card>
  )
}
