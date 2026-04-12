'use client'

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const str = base64String.trim().replace(/^["']|["']$/g, '')
  const padding = '='.repeat((4 - (str.length % 4)) % 4)
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < arr.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr.buffer as ArrayBuffer
}

export default function PwaInit() {
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    navigator.serviceWorker.register('/sw.js').catch(console.error)

    const permission = Notification.permission
    const dismissed  = localStorage.getItem('push_dismissed')
    const granted    = localStorage.getItem('push_granted')

    if (permission === 'default' && !dismissed && !granted) {
      setShowBanner(true)
    }
  }, [])

  async function handleEnable() {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setShowBanner(false)
      return
    }

    try {
      const reg = await navigator.serviceWorker.ready
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) throw new Error('VAPID key not configured')

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })

      const sub = subscription.toJSON()
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
      })

      localStorage.setItem('push_granted', '1')
    } catch (err) {
      console.error('Push subscription failed:', err)
    }

    setShowBanner(false)
  }

  function handleDismiss() {
    localStorage.setItem('push_dismissed', '1')
    setShowBanner(false)
  }

  if (!showBanner) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 shadow-lg">
      <p className="text-sm text-muted-foreground">
        Get notified about household activity
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={handleEnable}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Enable
        </button>
        <button
          onClick={handleDismiss}
          className="rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
