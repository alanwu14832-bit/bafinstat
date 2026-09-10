import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & { strokeWidth?: number | string }

/** Baseball glyphs drawn on lucide's 24px grid so they sit beside the stock icons. */
function base({ strokeWidth = 1.8, ...rest }: IconProps) {
  return { xmlns: 'http://www.w3.org/2000/svg', viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...rest }
}

export const IconBaseball = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M6.6 5.6c2.2 3.6 2.2 9.2 0 12.8M17.4 5.6c-2.2 3.6-2.2 9.2 0 12.8" />
    <path d="M5.2 8.4l1.7.5M4.7 12h1.8M5.2 15.6l1.7-.5M18.8 8.4l-1.7.5M19.3 12h-1.8M18.8 15.6l-1.7-.5" />
  </svg>
)
export const IconBat = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13.2 10.8 18.1 5.9a2.75 2.75 0 1 1 3.9 3.9l-4.9 4.9z" />
    <path d="M13.2 10.8 5.6 18.4M5.6 18.4l-2 2" />
    <circle cx="3.9" cy="20.1" r="0.6" />
  </svg>
)
export const IconGlove = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 21h5.5a5 5 0 0 0 5-5V9a1.9 1.9 0 0 0-3.8 0v3.2" />
    <path d="M15.7 9V6.4a1.9 1.9 0 0 0-3.8 0v5.4M11.9 7.2V5.9a1.9 1.9 0 0 0-3.8 0v6.3M8.1 11.4V9.6a1.9 1.9 0 0 0-3.8 0V16a5 5 0 0 0 4.7 5" />
    <path d="M8.3 15.5c1.8.4 3.4 1.4 4.4 2.9" />
  </svg>
)
export const IconField = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 20.5 3.3 11.8A12.3 12.3 0 0 1 20.7 11.8Z" />
    <path d="m12 20.5-4.2-4.2L12 12.1l4.2 4.2z" />
    <circle cx="12" cy="16.3" r="0.6" />
  </svg>
)
export const IconHomePlate = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 4.5h14v7.2L12 20l-7-8.3z" />
  </svg>
)
export const IconScoreboard = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18M9 10v9M15 10v9M12 5V3" />
  </svg>
)
export const IconJersey = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8.2 3.5h7.6L20.5 6l-2.1 3.3-1.9-.9V20.5H7.5V8.4l-1.9.9L3.5 6z" />
    <path d="M9.5 3.5a2.5 2.5 0 0 0 5 0" />
  </svg>
)
export const IconCap = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.5 14.5a7.5 7.5 0 0 1 15 0" />
    <path d="M4.5 14.5c0 1.4 3.4 2.4 7.5 2.4s7.5-1 7.5-2.4M19.5 14.5l2.5 1.6M12 7v-2.2" />
  </svg>
)
