// The app logo: an ID badge with a tick, on a slate tile. Same artwork as public/icons/logo.svg.
export function Logo({ size = 32, title = 'Attendance Planner' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3e5e6c" />
          <stop offset="1" stopColor="#7fa3b6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#logo-g)" />
      <path d="M26 3 L32 19 L38 3" fill="#fff" opacity=".9" />
      <rect x="19" y="17" width="26" height="38" rx="7" fill="none" stroke="#fff" strokeWidth="3.4" />
      <rect x="27" y="21.5" width="10" height="3.6" rx="1.8" fill="#fff" />
      <path d="M25.5 36.5l4.8 4.8 8.4-9.6" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="25" y="47" width="14" height="2.8" rx="1.4" fill="#fff" opacity=".75" />
      <circle cx="49" cy="22" r="5.2" fill="#ccf500" stroke="#3e5e6c" strokeWidth="2" />
    </svg>
  )
}
