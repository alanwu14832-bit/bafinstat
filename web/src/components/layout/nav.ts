import {
  BookOpen, CalendarDays, CircleHelp, Flame, LayoutDashboard, Shield, Target, Upload, Users, type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  /** Shown as the page context on small screens. */
  subtitle?: string
  icon: LucideIcon
}

export interface NavGroup {
  label?: string
  items: NavItem[]
}

/** Primary navigation: what you look at, then how data gets in. */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { to: '/', label: '總覽', subtitle: '球隊整體表現一覽', icon: LayoutDashboard },
      { to: '/batting', label: '打擊', subtitle: '打者成績與排行', icon: Target },
      { to: '/pitching', label: '投球', subtitle: '投手成績與走勢', icon: Flame },
      { to: '/fielding', label: '守備', subtitle: '守備位置與失誤', icon: Shield },
      { to: '/players', label: '球員', subtitle: '球員名單與個人檔案', icon: Users },
      { to: '/games', label: '比賽', subtitle: '賽程與比賽結果', icon: CalendarDays },
    ],
  },
  {
    label: '資料',
    items: [
      { to: '/import', label: '資料匯入', subtitle: '上傳比賽紀錄', icon: Upload },
      { to: '/dictionary', label: '數據字典', subtitle: '指標定義與計算方式', icon: BookOpen },
      { to: '/guide', label: '使用指南', subtitle: '比賽日紀錄與賽後流程', icon: CircleHelp },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname === '/') return NAV_ITEMS[0]
  return NAV_ITEMS.find((n) => n.to !== '/' && pathname.startsWith(n.to))
}
