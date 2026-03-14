import Link from 'next/link'

interface Props {
  size?: number
  /** If true, wraps in a Link to / */
  linked?: boolean
}

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ll-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#0c0700"/>
          <stop offset="100%" stopColor="#1a0e02"/>
        </linearGradient>
        <linearGradient id="ll-og" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#fbbf24"/>
          <stop offset="30%"  stopColor="#fb923c"/>
          <stop offset="60%"  stopColor="#f43f5e"/>
          <stop offset="100%" stopColor="#c026d3"/>
        </linearGradient>
        <filter id="ll-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <rect width="100" height="100" rx="22" fill="url(#ll-bg)"/>
      <path
        fillRule="evenodd"
        fill="url(#ll-og)"
        filter="url(#ll-glow)"
        d="M50,13 A37,37 0 0 1 50,87 A37,37 0 0 1 50,13 Z M50,30 A20,20 0 0 0 50,70 A20,20 0 0 0 50,30 Z"
      />
    </svg>
  )
}

export default function OikosLogo({ size = 28, linked = false }: Props) {
  const inner = (
    <span className="flex items-center gap-2 font-semibold text-foreground">
      <LogoMark size={size} />
      <span className="text-base tracking-tight">Oikos</span>
    </span>
  )

  if (linked) {
    return (
      <Link href="/" className="flex items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
        {inner}
      </Link>
    )
  }

  return inner
}
