import type { ComponentType } from 'react'
import { BookOpen, Camera, CircleHelp, History, PenLine, Radio, Trophy, Upload, UsersRound } from 'lucide-react'
import type { Level } from '../../hooks/useAccess'
import { IconBat, IconBaseball, IconField, IconGlove, IconHomePlate, IconJersey, IconScoreboard } from '../icons/baseball'

export type NavIcon = ComponentType<{ className?: string; strokeWidth?: number | string }>

export interface NavItem {
  to: string
  label: string
  /** Shown as the page context on small screens. */
  subtitle?: string
  icon: NavIcon
  /** 身分 needed to open it (0 一般人, 1 球員, 2 紀錄員, 3 管理者; absent = 0). 球員 pages show to everyone with a lock;
   *  紀錄員 and 管理者 pages only show to those who may open them. */
  level?: Level
}

export interface NavGroup {
  label?: string
  items: NavItem[]
}

/** Primary navigation: what you look at, then how data gets in. */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { to: '/', label: '總覽', subtitle: '球隊整體表現一覽', icon: IconField },
      { to: '/batting', label: '打擊', subtitle: '打者成績與排行', icon: IconBat, level: 1 },
      { to: '/pitching', label: '投球', subtitle: '投手成績與走勢', icon: IconBaseball, level: 1 },
      { to: '/fielding', label: '守備', subtitle: '守備位置與失誤', icon: IconGlove, level: 1 },
      { to: '/players', label: '球員', subtitle: '球員名單與個人檔案', icon: IconJersey, level: 1 },
      { to: '/recordbook', label: '紀錄簿', subtitle: '隊史單場、單季、生涯紀錄', icon: Trophy },
      { to: '/games', label: '比賽', subtitle: '賽程、結果與逐球紀錄', icon: IconScoreboard },
      { to: '/live', label: '即時比分', subtitle: '進行中的比賽', icon: Radio },
      { to: '/photos', label: '相簿', subtitle: '比賽與活動照片', icon: Camera, level: 1 },
    ],
  },
  {
    label: '資料',
    items: [
      { to: '/lineup', label: '先發陣容', subtitle: '排守位與打序', icon: IconHomePlate, level: 2 },
      { to: '/record', label: '紀錄比賽', subtitle: '比賽當天逐球紀錄', icon: PenLine, level: 2 },
      { to: '/import', label: '資料匯入', subtitle: '上傳比賽紀錄', icon: Upload, level: 2 },
      { to: '/dictionary', label: '數據字典', subtitle: '指標定義與計算方式', icon: BookOpen },
      { to: '/guide', label: '使用指南', subtitle: '比賽日紀錄與賽後流程', icon: CircleHelp },
      { to: '/accounts', label: '帳號管理', subtitle: '球員、紀錄員與管理者帳號', icon: UsersRound, level: 3 },
      { to: '/versions', label: '網站版本', subtitle: '打開以前的網站版本', icon: History, level: 3 },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname === '/') return NAV_ITEMS[0]
  return NAV_ITEMS.find((n) => n.to !== '/' && pathname.startsWith(n.to))
}
