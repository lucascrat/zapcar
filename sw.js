
const CACHE_NAME = 'chegoja-v4-overlay';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/icon?family=Material+Icons',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  if (url.origin === location.origin || ASSETS_TO_CACHE.includes(event.request.url)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  } else {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
  }
});

// LÓGICA DE SOBREPOSIÇÃO (OVERLAY)
// Quando o usuário clica na notificação (ex: "Nova Chamada"),
// o navegador força o foco na janela do ChegoJá, saindo do Waze/Maps.
self.addEventListener('notificationclick', function(event) {
  event.notification.close(); // Fecha o alerta visual

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true 
    }).then(function(windowClients) {
      // 1. Procura se o app já está aberto (mesmo que em segundo plano)
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        // Verifica se é a nossa URL e se podemos focar
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          return client.focus(); // <--- O MÁGICO ACONTECE AQUI: TRAZ O APP PRA FRENTE
        }
      }
      // 2. Se não estiver aberto, abre uma nova janela
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
