// Prueba de bloqueos entre personas y solicitudes para ver un perfil privado. Levantá el servidor así:
//   ADMIN_EMAILS=admin@gmail.com ADMIN_CLAVE=ClaveDelPanel123 NIVAN_DATOS=/tmp/otra node server.js
// y corré:  node prueba-bloqueos.js
'use strict';
const http = require('http');
const BASE = process.env.BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);
function pedir(metodo, ruta, cuerpo, cookie) {
    return new Promise(function (ok, mal) {
        const u = new URL(ruta, BASE), d = cuerpo === undefined ? null : JSON.stringify(cuerpo);
        const h = {}; if (d !== null) h['Content-Type'] = 'application/json'; if (cookie) h.Cookie = cookie;
        const r = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: metodo, headers: h }, function (res) {
            let t = ''; res.on('data', function (c) { t += c; });
            res.on('end', function () { let j = {}; try { j = JSON.parse(t); } catch (e) {} const sc = res.headers['set-cookie']; ok({ e: res.statusCode, j: j, t: t, c: sc ? sc[0].split(';')[0] : null }); });
        });
        r.on('error', mal); if (d !== null) r.write(d); r.end();
    });
}
const post = function (ruta, cuerpo, cookie) { return pedir('POST', ruta, cuerpo || {}, cookie); };
const get = function (ruta, cookie) { return pedir('GET', ruta, undefined, cookie); };
let fallos = 0;
function chequear(n, c, x) { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  →  ' + (typeof x === 'string' ? x : JSON.stringify(x)))); if (!c) fallos++; }
const idMsg = function () { return 'M' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); };
function idChat(v, c, lv, lc) { return 'CH-' + [v + ':' + lv, c + ':' + lc].sort().join('|'); }
const bloq = function (accion, clave, valor, cookie) { return post('/api/conjuntos/cambiar', { coleccion: 'bloqueos', cambios: [{ accion: accion, clave: clave, valor: valor }] }, cookie); };
const filasBloqueos = function (cookie) { return get('/api/conjuntos?coleccion=bloqueos', cookie).then(function (r) { return r.j.datos || {}; }); };

(async function () {
    const pw = 'Clave.Segura1', t = Date.now();
    async function reg(nombre, mail) { const r = await post('/api/registro', { aceptoTerminos: true, nombre: nombre, email: mail + t + '@gmail.com', password: pw, pais: 'UY' }); return { c: r.c, id: r.j.usuario.id, mail: mail + t + '@gmail.com' }; }
    let r = await post('/api/registro', { aceptoTerminos: true, nombre: 'Admin Uno', email: 'admin@gmail.com', password: pw, pais: 'UY' });
    if (r.e === 409) r = await post('/api/login', { email: 'admin@gmail.com', password: pw });
    const admin = { c: r.c, id: r.j.usuario.id };
    const A = await reg('Ana Duena', 'ana'), B = await reg('Beto Bloqueado', 'beto'), C = await reg('Carla Libre', 'carla');
    const F = Date.now() - 7000, postId = A.id + '_' + F;
    r = await post('/api/perfil/guardar', { perfil: { portafolio: [{ fecha: F, texto: 'Post de Ana' }], privacidad: { verPerfil: 'todos' } } }, A.c);
    chequear('(preparación) Ana tiene un post público', r.e === 200, r.t);

    console.log('Bloquear');
    r = await bloq('agregar', A.id, B.id);
    chequear('Sin sesión no se bloquea → 401', r.e === 401, r.e);
    r = await bloq('agregar', A.id, B.id, B.c);
    chequear('Nadie puede bloquear en nombre de otra persona', r.j.aplicados === 0 && r.j.rechazados === 1, r.t);
    r = await bloq('agregar', A.id, A.id, A.c);
    chequear('Nadie se bloquea a sí mismo', r.j.aplicados === 0, r.t);
    r = await bloq('agregar', A.id, 'NVU-noexiste', A.c);
    chequear('No se bloquea una cuenta que no existe', r.j.aplicados === 0, r.t);
    r = await bloq('agregar', A.id, B.id, A.c);
    chequear('Ana bloquea a Beto', r.e === 200 && r.j.aplicados === 1, r.t);
    let d = await filasBloqueos(A.c);
    chequear('Ana ve su bloqueo', (d[A.id] || []).indexOf(B.id) !== -1, d);
    d = await filasBloqueos(B.c);
    chequear('Beto ve que lo bloquearon (para que la app lo esconda)', (d[A.id] || []).indexOf(B.id) !== -1, d);
    d = await filasBloqueos(C.c);
    chequear('Carla no ve bloqueos ajenos', Object.keys(d).length === 0, d);
    d = await filasBloqueos();
    chequear('Sin sesión no se ve ninguno', Object.keys(d).length === 0, d);

    console.log('\nEl bloqueo se hace cumplir en el servidor');
    const lados = function (x, y) { const l = {}; l[x] = 'personal'; l[y] = 'personal'; return l; };
    const chatAB = { id: idChat(A.id, B.id, 'personal', 'personal'), vendedorId: A.id, compradorId: B.id, lados: lados(A.id, B.id) };
    r = await post('/api/chats/enviar', { chat: chatAB, mensajes: [{ id: idMsg(), texto: 'Hola' }] }, B.c);
    chequear('Beto no puede escribirle a Ana → 403', r.e === 403, r.e);
    r = await post('/api/chats/enviar', { chat: chatAB, mensajes: [{ id: idMsg(), texto: 'Hola' }] }, A.c);
    chequear('Ana tampoco puede escribirle a Beto (es de ida y vuelta) → 403', r.e === 403, r.e);
    const chatAC = { id: idChat(A.id, C.id, 'personal', 'personal'), vendedorId: A.id, compradorId: C.id, lados: lados(A.id, C.id) };
    r = await post('/api/chats/enviar', { chat: chatAC, mensajes: [{ id: idMsg(), texto: 'Hola Ana' }] }, C.c);
    chequear('Carla sí puede escribirle a Ana', r.e === 200 && r.j.aceptados.length === 1, r.t);
    r = await post('/api/comentarios/crear', { postId: postId, texto: 'Hola' }, B.c);
    chequear('Beto no puede comentar los posts de Ana → 404', r.e === 404, r.e);
    r = await post('/api/comentarios/crear', { postId: postId, texto: 'Hola Ana' }, C.c);
    chequear('Carla sí', r.e === 200, r.t);
    const comC = r.j.id;
    r = await post('/api/comentarios/like', { id: comC, like: true }, B.c);
    chequear('Beto no puede dar like en los posts de Ana → 404', r.e === 404, r.e);
    r = await post('/api/conjuntos/cambiar', { coleccion: 'seguidores', cambios: [{ accion: 'agregar', clave: A.id, valor: B.id }] }, B.c);
    chequear('Beto no puede seguir a Ana', r.j.aplicados === 0 && r.j.rechazados === 1, r.t);
    r = await post('/api/publicaciones/guardar', { publicacion: { id: 'blq' + t, nombre: 'Buzo', precio: 300, pais: 'UY', medios: [] } }, admin.c);
    await bloq('agregar', admin.id, B.id, admin.c);
    r = await post('/api/preguntas/crear', { publicacionId: 'blq' + t, texto: '¿Hay M?' }, B.c);
    chequear('Beto no puede hacerle preguntas a un vendedor que lo bloqueó → 403', r.e === 403, r.e);
    r = await post('/api/preguntas/crear', { publicacionId: 'blq' + t, texto: '¿Hay M?' }, C.c);
    chequear('Carla sí', r.e === 200, r.t);

    console.log('\nDesbloquear');
    r = await bloq('quitar', A.id, B.id, B.c);
    chequear('Beto no puede sacarse el bloqueo que le puso Ana', r.j.aplicados === 0, r.t);
    r = await bloq('quitar', A.id, B.id, A.c);
    chequear('Ana lo desbloquea', r.j.aplicados === 1, r.t);
    r = await post('/api/comentarios/crear', { postId: postId, texto: 'Ahora sí' }, B.c);
    chequear('Beto ya puede comentar', r.e === 200, r.t);

    console.log('\nSolicitudes para ver un perfil privado');
    await post('/api/perfil/guardar', { perfil: { portafolio: [{ fecha: F, texto: 'Post de Ana' }], privacidad: { verPerfil: 'seguidores' } } }, A.c);
    const postsDeAna = function (j) { const p = (j.perfiles || []).find(function (x) { return x.id === A.id; }); return p ? p.portafolio.length : -1; };
    r = await get('/api/perfiles');
    chequear('Sin sesión no se ven los posts de una cuenta privada', postsDeAna(r.j) === 0, r.t.slice(0, 200));
    r = await get('/api/perfiles', B.c);
    chequear('Beto (que no la sigue) tampoco', postsDeAna(r.j) === 0);
    r = await get('/api/perfiles', A.c);
    chequear('Ana sí ve sus propios posts', postsDeAna(r.j) === 1);
    r = await get('/api/comentarios?post=' + encodeURIComponent(postId), B.c);
    chequear('Beto no ve los comentarios del post privado → 404', r.e === 404, r.e);

    r = await post('/api/solicitudes/enviar', { duenioId: A.id, ambito: 'personal', cuenta: B.id });
    chequear('Sin sesión no se pide → 401', r.e === 401, r.e);
    r = await post('/api/solicitudes/enviar', { duenioId: A.id, ambito: 'personal', cuenta: C.id }, B.c);
    chequear('No se puede pedir en nombre de otra persona → 400', r.e === 400, r.e);
    r = await post('/api/solicitudes/enviar', { duenioId: B.id, ambito: 'personal', cuenta: B.id }, B.c);
    chequear('No se puede pedir a uno mismo → 400', r.e === 400, r.e);
    r = await post('/api/solicitudes/enviar', { duenioId: A.id, ambito: 'personal', cuenta: B.id }, B.c);
    chequear('Beto pide ver el perfil de Ana', r.e === 200 && !r.j.yaLaSigue, r.t);
    r = await post('/api/solicitudes/enviar', { duenioId: A.id, ambito: 'personal', cuenta: B.id }, B.c);
    r = await get('/api/solicitudes', A.c);
    chequear('Ana tiene una sola solicitud recibida (no se repite)', r.j.recibidas.length === 1 && r.j.recibidas[0].cuenta === B.id && r.j.recibidas[0].ambito === 'personal', r.t);
    r = await get('/api/solicitudes', B.c);
    chequear('Beto la ve como enviada', r.j.enviadas.length === 1 && r.j.enviadas[0].duenioId === A.id, r.t);
    r = await get('/api/solicitudes', C.c);
    chequear('Carla no ve solicitudes ajenas', r.j.recibidas.length === 0 && r.j.enviadas.length === 0, r.t);
    r = await post('/api/solicitudes/cancelar', { duenioId: A.id, ambito: 'personal', cuenta: B.id }, C.c);
    chequear('Carla no puede cancelar la solicitud de Beto → 403', r.e === 403, r.e);
    r = await post('/api/solicitudes/responder', { cuenta: B.id, ambito: 'personal', aceptar: true }, C.c);
    chequear('Carla no puede aceptar solicitudes que no son suyas → 404', r.e === 404, r.e);
    r = await post('/api/solicitudes/responder', { cuenta: B.id, ambito: 'personal', aceptar: true }, A.c);
    chequear('Ana acepta la solicitud', r.e === 200, r.t);
    r = await get('/api/solicitudes', A.c);
    chequear('La solicitud ya no está pendiente', r.j.recibidas.length === 0, r.t);
    r = await get('/api/conjuntos?coleccion=seguidores', B.c);
    chequear('Beto pasó a seguir a Ana', (r.j.datos[A.id] || []).indexOf(B.id) !== -1, r.t);
    r = await get('/api/perfiles', B.c);
    chequear('Ahora Beto ve los posts de Ana', postsDeAna(r.j) === 1, r.t.slice(0, 200));
    r = await get('/api/perfiles', C.c);
    chequear('Carla sigue sin verlos', postsDeAna(r.j) === 0);
    r = await get('/api/comentarios?post=' + encodeURIComponent(postId), B.c);
    chequear('Beto ya ve y puede comentar el post privado', r.e === 200, r.e);
    r = await post('/api/solicitudes/enviar', { duenioId: A.id, ambito: 'personal', cuenta: B.id }, B.c);
    chequear('Pedir de nuevo a alguien que ya te sigue no crea otra solicitud', r.e === 200 && r.j.yaLaSigue === true, r.t);

    console.log('\nRechazar y cancelar');
    r = await post('/api/solicitudes/enviar', { duenioId: A.id, ambito: 'personal', cuenta: C.id }, C.c);
    chequear('Carla pide ver el perfil de Ana', r.e === 200, r.t);
    r = await post('/api/solicitudes/responder', { cuenta: C.id, ambito: 'personal', aceptar: false }, A.c);
    chequear('Ana la rechaza', r.e === 200, r.t);
    r = await get('/api/conjuntos?coleccion=seguidores', C.c);
    chequear('Carla no sigue a Ana', (r.j.datos[A.id] || []).indexOf(C.id) === -1, r.t);
    r = await get('/api/perfiles', C.c);
    chequear('...y no ve sus posts', postsDeAna(r.j) === 0);
    await post('/api/solicitudes/enviar', { duenioId: A.id, ambito: 'tienda', cuenta: 'T:' + C.id }, C.c);
    r = await get('/api/solicitudes', C.c);
    chequear('Carla pide ver la tienda de Ana con su identidad de tienda', r.j.enviadas.length === 1 && r.j.enviadas[0].ambito === 'tienda' && r.j.enviadas[0].cuenta === 'T:' + C.id, r.t);
    r = await post('/api/solicitudes/cancelar', { duenioId: A.id, ambito: 'tienda', cuenta: 'T:' + C.id }, C.c);
    r = await get('/api/solicitudes', A.c);
    chequear('Carla cancela y Ana ya no la ve', r.j.recibidas.length === 0, r.t);

    console.log('\nBloqueo y solicitudes');
    await bloq('agregar', A.id, C.id, A.c);
    r = await post('/api/solicitudes/enviar', { duenioId: A.id, ambito: 'personal', cuenta: C.id }, C.c);
    chequear('Quien está bloqueado no puede pedir ver el perfil → 404', r.e === 404, r.e);

    console.log('\nCuenta eliminada');
    await post('/api/solicitudes/enviar', { duenioId: C.id, ambito: 'personal', cuenta: B.id }, B.c);
    r = await post('/api/eliminar-cuenta', { email: C.mail, password: pw });
    chequear('Carla elimina su cuenta', r.e === 200, r.t);
    r = await get('/api/solicitudes', B.c);
    chequear('Las solicitudes de y hacia Carla se borran', r.j.enviadas.every(function (x) { return x.duenioId !== C.id; }), r.t);
    d = await filasBloqueos(A.c);
    chequear('Y los bloqueos que la involucran', (d[A.id] || []).indexOf(C.id) === -1, d);

    console.log('\n' + (fallos ? fallos + ' pruebas fallaron.' : 'Todo bien.'));
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e.message); process.exit(1); });
