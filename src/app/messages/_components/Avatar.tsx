'use client'

const PALETTE = [
  ['#FDA4AF', '#E11D48'],  // rose
  ['#FCD34D', '#D97706'],  // amber
  ['#86EFAC', '#16A34A'],  // green
  ['#7DD3FC', '#0284C7'],  // sky
  ['#C4B5FD', '#7C3AED'],  // violet
  ['#F0ABFC', '#A21CAF'],  // fuchsia
  ['#5EEAD4', '#0F766E'],  // teal
  ['#FCA5A5', '#B91C1C'],  // red
]

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0
  }
  return h
}

function colorsFor(id: string): [string, string] {
  return PALETTE[hashId(id) % PALETTE.length] as [string, string]
}

interface Props {
  userId:    string
  name:      string
  avatarUrl: string | null
  size?:     number   // px
  className?: string
  ring?:     boolean
}

export function Avatar({ userId, name, avatarUrl, size = 36, className = '', ring }: Props) {
  const [from, to] = colorsFor(userId)
  const initial    = (name?.trim()?.charAt(0) || '?').toUpperCase()

  const ringClass = ring ? 'ring-2 ring-background' : ''
  const dim       = { width: size, height: size, fontSize: Math.round(size * 0.42) }

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        style={dim}
        className={`shrink-0 rounded-full object-cover ${ringClass} ${className}`}
      />
    )
  }

  return (
    <div
      style={{ ...dim, backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
      className={`shrink-0 rounded-full flex items-center justify-center font-semibold text-white shadow-sm ${ringClass} ${className}`}
      aria-label={name}
    >
      {initial}
    </div>
  )
}

interface GroupAvatarProps {
  size?:     number
  className?: string
}

export function GroupAvatar({ size = 36, className = '' }: GroupAvatarProps) {
  const dim = { width: size, height: size }
  return (
    <div
      style={{ ...dim, backgroundImage: 'linear-gradient(135deg, #818CF8, #4338CA)' }}
      className={`shrink-0 rounded-full flex items-center justify-center text-white shadow-sm ${className}`}
      aria-label="Group chat"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={Math.round(size * 0.55)} height={Math.round(size * 0.55)}>
        <path d="M4.5 9a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM3.75 15a3 3 0 0 0-3 3v.5A1.5 1.5 0 0 0 2.25 20h11.5a1.5 1.5 0 0 0 1.5-1.5V18a3 3 0 0 0-3-3h-8.5ZM17.25 7.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM17.25 15h-1.05c.5.55.85 1.24.99 2H22a1.5 1.5 0 0 0 1.5-1.5V15a3 3 0 0 0-3-3h-3.25v3Z" />
      </svg>
    </div>
  )
}
