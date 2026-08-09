// ===========================================================================
// Icon — reusable inline SVG icon set for IHIMS
// Consistent 24x24 viewBox, currentColor fill/stroke, brand-friendly.
// All icons accept `size` (px) and keep a uniform visual language.
// ===========================================================================

const PATHS = {
  // Navigation / modules
  dashboard: (
    <>
      <path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z" />
    </>
  ),
  performance: (
    <>
      <path d="M3 17h3v4H3v-4Zm5-6h4v10H8V11Zm6-8h4v18h-4V3Z" />
    </>
  ),
  competency: (
    <>
      <path d="M12 3l2.2 1.3 2.6-.2.8 2.5 2.5.8-.2 2.6L21 11l-1.1 2-1.3 2.2-4.6-6.4L12 3Z" />
    </>
  ),
  ai: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <circle cx="9" cy="9" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.6" fill="currentColor" stroke="none" />
      <path d="M8.5 14.5c1.5 1.6 5.5 1.7 7 0" />
    </>
  ),
  learning: (
    <>
      <path d="M12 3 2 8l10 5 10-5-10-5Z" />
      <path d="M6 10.5V16c0 1 2.7 3 6 3s6-2 6-3v-5.5" />
      <path d="M22 8.6V14" />
    </>
  ),
  succession: (
    <>
      <circle cx="9" cy="7" r="3" />
      <circle cx="18" cy="9" r="2.4" />
      <path d="M3 20v-1.5A3.5 3.5 0 0 1 6.5 15H11a2.5 2.5 0 0 1 2.5 2.5V20" />
      <path d="M16 15h2.5A2.5 2.5 0 0 1 21 17.5V20" />
      <path d="M15 8.5h3l1.5 2.5 1.5-2.5M18 9.5V6" />
    </>
  ),
  recognition: (
    <>
      <path d="M12 3l2.1 4.6 5 .5-3.7 3.4 1 4.9L12 14.5 7.6 16.4l1-4.9L4.9 8.1l5-.5L12 3Z" />
    </>
  ),
  accounts: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3 19v-1.2A3.8 3.8 0 0 1 6.8 14H11a3.8 3.8 0 0 1 3.8 3.8V19" />
      <circle cx="16.5" cy="9.5" r="2.2" />
      <path d="M15 15.2h2.2A3.8 3.8 0 0 1 21 19v.6" />
    </>
  ),
  announcements: (
    <>
      <path d="M3 11l18-6v14L3 13v-2Z" />
      <path d="M3 13v3h4v-2" />
    </>
  ),
  audit: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),

  // UI / actions
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  bell: (
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  menu: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </>
  ),
  check: (
    <>
      <path d="m4 12 5 5L20 6" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12M18 6 6 18" />
    </>
  ),
  edit: (
    <>
      <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
    </>
  ),
  robotAssistant: (
    <>
      <rect x="4" y="4" width="16" height="12" rx="3" />
      <path d="M12 4V2M9 7h.01M15 7h.01M7 11h.01M17 11h.01M9 14h6" />
    </>
  ),
  medal: (
    <>
      <circle cx="12" cy="14" r="5" />
      <path d="M9 10 6.5 3h4l1.5 3.5L13.5 3h4L15 10" />
    </>
  ),
  brain: (
    <path d="M12 5a3 3 0 0 0-2.8-2A3 3 0 0 0 6.5 4.5 3 3 0 0 0 3.7 9 3 3 0 0 0 5 13.6V17a2 2 0 0 0 2 2h1.3A3 3 0 0 0 12 22.5M12 5a3 3 0 0 1 2.8-2 3 3 0 0 1 2.7 1.5 3 3 0 0 1 2.8 4.5A3 3 0 0 1 19 13.6V17a2 2 0 0 1-2 2h-1.3A3 3 0 0 1 12 22.5M12 5v17.5" />
  ),
  shield: (
    <>
      <path d="M12 3 4 6v5c0 5.5 3.5 8.7 8 10 4.5-1.3 8-4.5 8-10V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  document: (
    <>
      <path d="M8 3h8l4 4v14H8V3Z" />
      <path d="M8 3v4h-2l4-4ZM11 12h6M11 16h6M8 12h.01M8 16h.01" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </>
  ),
  pin: (
    <>
      <path d="M12 3v14M9 7V3M15 7V3M9 20h6M12 7v14" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3 2 21h20L12 3Z" />
      <path d="M12 10v5M12 18h.01" />
    </>
  ),
  trendUp: (
    <>
      <path d="m3 17 6-6 4 4 7-7" />
      <path d="M14 8h6v6" />
    </>
  ),
  chat: (
    <>
      <path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  home: (
    <>
      <path d="M3 11 12 3l9 8M5 9.5V21h14V9.5" />
    </>
  ),
}

export default function Icon({ name, size = 20, className = '', style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon icon-${name} ${className}`}
      style={style}
      aria-hidden="true"
    >
      {PATHS[name] || PATHS.spark}
    </svg>
  )
}

