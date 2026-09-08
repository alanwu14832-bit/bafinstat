# BAFIN Stats — web

UI shell for the 喝FIN就好BA analytics dashboard. Vite 7 + React 19 + TypeScript 5.9 + Tailwind 4 + framer-motion 12 + recharts 3 + react-router 7 + zustand 5.

```
npm run dev        # local dev server
npm run build      # tsc -b && vite build   (set VITE_BASE=/repo/ for GitHub Pages)
npm run preview    # serve dist/
npm run test       # vitest run (smoke test)
npm run typecheck  # tsc -b --noEmit
```

## Component inventory (`src/components`, barrel `index.ts`)

| Area | Component | Purpose |
|---|---|---|
| layout | `AppShell` | Sidebar + sticky TopBar grid; Ctrl/⌘+B toggles the sidebar |
| layout | `Sidebar` / `MobileDrawer` | 248↔72px animated rail with `layoutId` active pill; off-canvas drawer < 1024px |
| layout | `TopBar` | Page title, filter slot, `ThemeToggle`, 匯入資料 button |
| layout | `FilterBar` | Placeholder global filters (杯賽 / 日期區間 / 守位 / 對手 / 主客 / 重設) |
| layout | `ThemeToggle` | system / light / dark segmented control → `data-theme` + `bafin.theme` |
| layout | `PageHeader` | Eyebrow + display title + description + actions |
| ui | `Card`, `SectionHeader`, `Badge`/`Pill`, `Button`, `Select`, `Tabs` | Hairline-bordered primitives |
| ui | `StatTile` | Count-up hero number (int / decimal3 / pct / ratio / era), delta, sparkline |
| ui | `DataTable` | Typed sortable columns, sticky header, zebra, footer, empty state, own scroll |
| ui | `EmptyState`, `Skeleton`, `Tooltip` | States and helpers |
| charts | `BarChartCard`, `LineChartCard`, `AreaChartCard`, `StackedBarCard`, `DonutCard`, `RadarCard`, `Sparkline` | recharts 3 wrappers, theme-aware, animated |
| charts | `ChartFrame`, `ChartTooltip`, `ChartLegend`, `chartTheme()` / `useChartTheme()` | Shared chart chrome and color resolution |
| theme | `src/theme/tokens.ts` → `useThemeTokens()` | Live CSS-variable values for SVG gradients/tooltips |
| store | `src/store/ui.ts` | zustand: `sidebarCollapsed` (`bafin.sidebar`), `mobileNavOpen`, `theme` |

Design tokens live in `src/styles/tokens.css`; `src/data/` is reserved for the data layer.
