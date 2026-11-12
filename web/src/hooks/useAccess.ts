import { ARCHIVE } from '../config/archive'
import { useDataStore } from '../store/data'
import type { Role } from '../data/supabase'

/**
 * 身分分層: 0 一般人 (not signed in) → 1 球員 (reads everything) → 2 紀錄員 (records and edits) → 3 管理者 (accounts).
 * Pages and menu items name the lowest level that may open them. This is what the site shows; what the database lets
 * each account read and write is decided by its own row level security (supabase/migrations/2026-11-05_roles.sql).
 */
export type Level = 0 | 1 | 2 | 3
export const LEVEL_LABEL: Record<Level, string> = { 0: '一般人', 1: '球員', 2: '紀錄員', 3: '管理者' }
export const ROLE_LABEL: Record<Role, string> = { player: '球員', coach: '教練', recorder: '紀錄員', admin: '管理者' }
export const ROLE_LEVEL: Record<Role, Level> = { player: 1, coach: 1, recorder: 2, admin: 3 }

export interface Access {
  level: Level
  role: Role | null
  /** still finding out who is signed in: show nothing yet rather than a lock that is about to open */
  pending: boolean
}

type CloudLike = { configured: boolean; user: unknown; role?: Role | null; authReady?: boolean }

export function accessOf(cloud: CloudLike, archive: boolean = !!ARCHIVE): Access {
  // local mode (no cloud): the whole site belongs to this device
  if (!cloud.configured) return { level: 3, role: 'admin', pending: false }
  // a saved older version of the site never signs in: it shows what anyone may see
  if (archive) return { level: 0, role: null, pending: false }
  if (!cloud.authReady) return { level: 0, role: null, pending: true }
  if (!cloud.user) return { level: 0, role: null, pending: false }
  if (cloud.role === undefined) return { level: 0, role: null, pending: true }
  const role = cloud.role ?? null
  return { level: role ? ROLE_LEVEL[role] : 0, role, pending: false }
}

export function useAccess(): Access {
  const cloud = useDataStore((s) => s.cloud)
  return accessOf(cloud)
}
