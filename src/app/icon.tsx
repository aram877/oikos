import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: 'linear-gradient(135deg, #0c0700 0%, #1a0e02 100%)',
          borderRadius: 112,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 378,
            height: 378,
            borderRadius: '50%',
            background: 'linear-gradient(45deg, #fbbf24 0%, #fb923c 30%, #f43f5e 60%, #c026d3 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 204,
              height: 204,
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
