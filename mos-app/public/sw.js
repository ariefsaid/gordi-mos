self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Gordi MOS'
  const body = typeof payload.body === 'string' ? payload.body : undefined
  event.waitUntil(self.registration.showNotification(title, { body }))
})
