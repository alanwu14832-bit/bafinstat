/**
 * A recording progress with the questions the pitch pad waits for already answered (batch 18): the opponent pitcher's
 * hand (不知道 unless one was set) and every slot of their order 不知道左右打 (unless one was picked). For page tests
 * about something else.
 */
import type { RecordState } from '../record/model'

export const answered = (s: RecordState): RecordState => ({
  ...s,
  oppPitcher: s.oppPitcher ?? { handUnknown: true },
  oppBatsBySlot: { ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, '?' as const])), ...s.oppBatsBySlot },
})
