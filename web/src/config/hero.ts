import { TEAM, teamAsset } from './team'

declare const __TEAM_HERO__: { photo: string; mobile: string } | undefined

/**
 * 總覽's 開場形象區: the team photo, when the deployment has one (vite.config.ts checks at build time that the file in
 * web/public is there, so a site without a photo never asks for a missing picture). `mobile` is the upright crop for phones.
 */
const found = typeof __TEAM_HERO__ === 'undefined' ? { photo: '', mobile: '' } : __TEAM_HERO__
export const HERO = {
  photo: found.photo ? teamAsset(found.photo) : '',
  mobile: found.mobile ? teamAsset(found.mobile) : '',
  focus: TEAM.heroFocus,
}
