import { assetUrl, resolveTeam } from './teamDefaults'

/** This deployment's team: VITE_TEAM_* over BaFiN's defaults (see teamDefaults.ts). */
export const TEAM = resolveTeam(import.meta.env as Record<string, string | boolean | undefined>)

export const teamAsset = (path: string) => assetUrl(path, import.meta.env.BASE_URL)
