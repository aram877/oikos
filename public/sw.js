self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Oikos', body: event.data.text(), data: {} }
  }

  const { title = 'Oikos', body = '', data = {} } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      data,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data ?? {}
  const url = data.type === 'message' ? '/messages' : '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})
