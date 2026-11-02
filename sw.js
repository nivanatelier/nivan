// NIVAN · Service worker: la app abre rápido y muestra algo aunque no haya internet.
// Al cambiar archivos de la app, subí el número de VERSION para que todos reciban lo nuevo.
const VERSION = 'nivan-v30';
const BASICOS = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

// Guarda la pantalla de inicio SOLO si es de verdad la de Nivan. Si el servidor está despertando (Render gratis),
// responde con su propia pantalla de carga: esa nunca se guarda, o la app quedaría pegada a ella.
async function guardarInicioSiEsNivan(r) {
    try {
        if (!r || !r.ok) return;
        const texto = await r.clone().text();
        if (texto.indexOf('manifest.webmanifest') === -1 || texto.indexOf('Nivan') === -1) return;
        const c = await caches.open(VERSION);
        await c.put('/index.html', r);
    } catch (e) {}
}

self.addEventListener('install', function (e) {
    e.waitUntil(caches.open(VERSION).then(function (c) {
        return Promise.all([fetch('/index.html').then(guardarInicioSiEsNivan).catch(function () {})]
            .concat(BASICOS.map(function (u) { return c.add(u).catch(function () {}); })));
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
    if (req.mode === 'navigate') {
        const esInicio = url.pathname === '/' || url.pathname === '/index.html';
        if (esInicio) {
            // El inicio sale al instante desde lo guardado (así quien ya entró antes no espera ni ve la pantalla de
            // "despertando" de Render) y se actualiza de fondo para la próxima vez. La primera vez, o si no hay copia, va a internet.
            e.respondWith(caches.match('/index.html').then(function (guardada) {
                const red = fetch(req).then(function (r) { guardarInicioSiEsNivan(r.clone()); return r; });
                if (guardada) { e.waitUntil(red.catch(function () {})); return guardada; }
                return red.catch(function () { return caches.match('/index.html'); });
            }));
            return;
        }
        // otras páginas (privacidad, etc.): primero internet, si falla lo guardado
        e.respondWith(fetch(req).catch(function () { return caches.match('/index.html'); }));
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

// ---- Avisos push: llegan aunque la app esté cerrada ----
self.addEventListener('push', function (e) {
    let d = {};
    try { d = e.data ? e.data.json() : {}; } catch (x) {}
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
        // Si la app está abierta y a la vista, ya muestra la novedad ella misma: no se duplica con un cartel.
        if (cs.some(function (c) { return c.visibilityState === 'visible'; })) return;
        return self.registration.showNotification(d.titulo || 'Nivan', {
            body: d.texto || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
            tag: d.etiqueta || 'nivan', renotify: true, data: { url: d.url || '/' }
        });
    }));
});
self.addEventListener('notificationclick', function (e) {
    e.notification.close();
    const url = (e.notification.data && e.notification.data.url) || '/';
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
        for (let i = 0; i < cs.length; i++) { if ('focus' in cs[i]) return cs[i].focus(); }
        return self.clients.openWindow(url);
    }));
});
