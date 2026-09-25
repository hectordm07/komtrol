const CACHE_NAME = 'komtrol-shell-v4'
const APP_SHELL = [
  '/manifest.webmanifest',
  '/icons/komtrol-192.png?v=brand2',
  '/icons/komtrol-mark.svg?v=brand3',
  '/icons/komtrol-app.svg?v=brand3',
  '/icons/komtrol-512.png?v=brand2',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('komtrol-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() =>
        new Response(
          '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#f5f7ff;color:#243b84;padding:32px"><h2>KOMTROL</h2><p>No se pudo conectar. Verifica tu conexión y vuelve a abrir la aplicación.</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      )
    )
    return
  }

  if (url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
        return cached || network
      })
    )
  }
})
