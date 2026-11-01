// NIVAN · Service worker: la app abre rápido y muestra algo aunque no haya internet.
// Al cambiar archivos de la app, subí el número de VERSION para que todos reciban lo nuevo.
const VERSION = 'nivan-v18';
const BASICOS = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', function (e) {
    e.waitUntil(caches.open(VERSION).then(function (c) {
        return Promise.all(BASICOS.map(function (u) { return c.add(u).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
    e.waitUntil(caches.keys().then(function (ks) {
        return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
    const req = e.request, url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.indexOf('/api/') === 0) return;
    if (url.pathname.indexOf('/admin-verificaciones') === 0) return;   // el panel de administración nunca se guarda ni se sirve sin internet
    if (req.mode === 'navigate') {   // páginas: primero internet, si falla lo guardado
        const esInicio = url.pathname === '/' || url.pathname === '/index.html';
        e.respondWith(fetch(req).then(function (r) {
            if (esInicio) { const copia = r.clone(); caches.open(VERSION).then(function (c) { c.put('/index.html', copia); }); }
            return r;
        }).catch(function () { return caches.match('/index.html'); }));
        return;
    }
    e.respondWith(caches.match(req).then(function (hit) {   // archivos: lo guardado al instante y se actualiza de fondo
        const red = fetch(req).then(function (r) {
            if (r && r.ok) { const copia = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copia); }); }
            return r;
        }).catch(function () { return hit; });
        return hit || red;
    }));
});
