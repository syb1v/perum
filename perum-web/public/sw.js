// Minimal service worker — достаточно для PWA-installability
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
    // Пропускаем API-запросы и WS — только passthrough
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;
    // Сеть прежде всего, без кэша (офлайн не нужен)
    event.respondWith(fetch(event.request).catch(() => new Response('Офлайн', { status: 503 })));
});
