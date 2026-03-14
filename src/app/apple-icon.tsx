import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: 'linear-gradient(135deg, #0c0700 0%, #1a0e02 100%)',
          borderRadius: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 133,
            height: 133,
            borderRadius: '50%',
            background: 'linear-gradient(45deg, #fbbf24 0%, #fb923c 30%, #f43f5e 60%, #c026d3 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #0c0700 0%, #1a0e02 100%)',
            }}
          />
        </div>
      </div>
    ),
    size,
  )
}
