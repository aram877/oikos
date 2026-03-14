import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Oikos',
    short_name: 'Oikos',
    description: 'Oikos — shared household finances, shopping & calendar.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fefce8',
    theme_color: '#a16207',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  }
}
