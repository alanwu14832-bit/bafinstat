import type { ReactNode } from 'react'
import { TEAM, teamAsset } from '../../config/team'
import { SeamMark } from './HeroGlow'

/**
 * The planes behind 總覽's opening (開場形象區), back to front. Each one moves at its own rate as the page scrolls
 * (`--hp` runs 0 → 1 while the hero leaves the screen; SeasonHero sets it), which is where the depth comes from:
 * far things drift a little, near things travel more. With motion reduced `--hp` stays 0 and this is a still picture.
 *
 * `photo` is the team photo plane when the deployment has one (config/hero.ts); without it the drawn planes stand
 * in: the baseball's seams and the team's logo on its tile. This file is the team's own art (the shared layout is
 * SeasonHero).
 */
export function HeroPlanes({ photo }: { photo?: ReactNode }) {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-[color-mix(in_srgb,var(--accent-board)_9%,#0c0d10)]">
      {/* far: the team colour glowing in from the top-right corner */}
      <div className="absolute -inset-[12%]" style={{ background: 'radial-gradient(64% 78% at 84% 12%, color-mix(in srgb, var(--accent-board) 36%, transparent), transparent 64%)', translate: '0 calc(var(--hp, 0) * 16px)' }} />
      {photo ?? (
        <>
          {/* middle: the ball, large, turning a little as it rises */}
          <SeamMark className="absolute text-[var(--accent-board)] w-[300px] -right-20 -top-16 sm:w-[520px] sm:-right-24 sm:-top-28"
            style={{ opacity: 0.26, translate: '0 calc(var(--hp, 0) * -44px)', rotate: 'calc(var(--hp, 0) * 9deg)' }} />
          {/* near: the logo on its tile (the drawing is dark lines, so it needs the light ground) */}
          <div className="absolute right-5 top-5 size-[76px] sm:right-[7%] sm:top-1/2 sm:size-[188px] sm:-mt-[94px]" style={{ translate: '0 calc(var(--hp, 0) * -22px)', scale: 'calc(1 + var(--hp, 0) * 0.05)' }}>
            <div className="hero-settle size-full rounded-[22%] bg-[#f6f6f8] p-[9%] ring-[3px] ring-[color-mix(in_srgb,var(--accent-board)_62%,#3a3020)] shadow-[0_18px_40px_-14px_rgba(0,0,0,0.75)]">
              <img src={teamAsset(TEAM.logo)} alt="" className="size-full object-contain" draggable={false} />
            </div>
          </div>
        </>
      )}
      {/* nearest: warm haze along the bottom, travelling the most */}
      <div className="absolute inset-x-0 -bottom-[18%] h-[62%]" style={{ background: 'radial-gradient(70% 100% at 78% 100%, color-mix(in srgb, var(--accent-board) 20%, transparent), transparent 70%)', translate: '0 calc(var(--hp, 0) * -30px)' }} />
    </div>
  )
}

/** The card the opening sits in. */
export const HERO_SECTION = 'bg-surface shadow-[var(--shadow-card)]'
/** The stage's height without a photo: tall enough on a phone for the words to start under the logo tile (top-right, 76px). */
export const HERO_STAGE_DRAWN = 'min-h-[340px] lg:min-h-[380px]'
export const HERO_TITLE_DRAWN = ''
/** The scrim under the words when they sit on the photo (r,g,b). */
export const HERO_SCRIM = '9,10,13'
/** The colours of the opening's text: it always sits on a dark ground (the photo's scrim or the drawn backdrop), in either theme. */
export const HERO_INK = 'text-[#f7f5f0]'
export const HERO_INK_SOFT = 'text-[rgba(247,245,240,0.74)]'
/** the team name's small line and the record figure */
export const HERO_KICKER = 'text-[var(--accent-board)]'
export const HERO_RECORD = 'text-[#f7f5f0]'
