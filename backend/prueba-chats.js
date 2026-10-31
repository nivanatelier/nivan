// Prueba de los chats. Arrancá el servidor (con una carpeta de datos nueva) y corré:  node prueba-chats.js
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
let fallos = 0;
function chequear(n, c, x) { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  →  ' + x)); if (!c) fallos++; }
const idMsg = function () { return 'M' + Date.now() + '-' + Math.random().toString(36).slice(2, 8); };
function idChat(v, c, lv, lc) { return 'CH-' + [v + ':' + lv, c + ':' + lc].sort().join('|'); }

(async function () {
    const pw = 'Clave.Segura1', sello = Date.now();
    async function crear(nombre) { const r = await post('/api/registro', { aceptoTerminos: true, nombre: nombre, email: nombre.toLowerCase() + sello + '@gmail.com', password: pw, pais: 'UY' }); return { cookie: r.c, id: r.j.usuario.id, email: nombre.toLowerCase() + sello + '@gmail.com' }; }
    const A = await crear('Ana'), B = await crear('Beto'), C = await crear('Carla');
    const lados = {}; lados[A.id] = 'tienda'; lados[B.id] = 'personal';
    const chat = { id: idChat(A.id, B.id, 'tienda', 'personal'), vendedorId: A.id, compradorId: B.id, lados: lados, vendedorNombre: 'Tienda de Ana', compradorNombre: 'Beto', tiendaDe: A.id };
    const m1 = idMsg();

    console.log('Enviar');
    let r = await post('/api/chats/enviar', { chat: chat, mensajes: [{ id: m1, texto: 'Hola!', fecha: Date.now() }] });
    chequear('Sin sesión → 401', r.e === 401, r.e);
    r = await post('/api/chats/enviar', { chat: chat, mensajes: [{ id: m1, texto: 'Hola <b>Beto</b>!', fecha: Date.now(), de: B.id }] }, A.cookie);
    chequear('Ana le escribe a Beto', r.e === 200 && r.j.aceptados[0] === m1, r.t);
    r = await post('/api/chats/enviar', { chat: chat, mensajes: [{ id: m1, texto: 'Hola!', fecha: Date.now() }] }, A.cookie);
    chequear('Reintentar el mismo mensaje no da error', r.e === 200 && r.j.aceptados[0] === m1, r.t);
    const lados2 = {}; lados2[B.id] = 'personal'; lados2[C.id] = 'personal';
    r = await post('/api/chats/enviar', { chat: { id: idChat(B.id, C.id, 'personal', 'personal'), vendedorId: B.id, compradorId: C.id, lados: lados2 }, mensajes: [{ id: idMsg(), texto: 'x' }] }, A.cookie);
    chequear('No se puede escribir en un chat ajeno → 403', r.e === 403, r.e);
    r = await post('/api/chats/enviar', { chat: Object.assign({}, chat, { id: 'CH-inventado' }), mensajes: [{ id: idMsg(), texto: 'x' }] }, A.cookie);
    chequear('Un id de chat inventado se rechaza → 400', r.e === 400, r.e);
    r = await post('/api/chats/enviar', { chat: chat, mensajes: [{ id: idMsg(), tipo: 'compra', pedidoId: 'PED-falso', items: [], total: 5 }, { id: 'malo', texto: 'x' }, { id: idMsg(), tipo: 'rarito', texto: 'x' }, { id: idMsg(), texto: '   ' }] }, A.cookie);
    chequear('Rechaza compra falsa, id malo, tipo raro y mensaje vacío', r.e === 200 && r.j.aceptados.length === 0 && r.j.rechazados.length === 4, r.t);
    r = await post('/api/chats/enviar', { chat: Object.assign({}, chat, { compradorId: 'NVU-noexiste', id: idChat(A.id, 'NVU-noexiste', 'tienda', 'personal'), lados: { [A.id]: 'tienda', 'NVU-noexiste': 'personal' } }), mensajes: [{ id: idMsg(), texto: 'x' }] }, A.cookie);
    chequear('Escribirle a una cuenta que no existe → 404', r.e === 404, r.e);
    const m2 = idMsg();
    r = await post('/api/chats/enviar', { chat: chat, mensajes: [{ id: m2, tipo: 'propuesta', texto: 'Propuesta', items: [{ prenda: 'Remera', cantidad: 20 }, { prenda: '', cantidad: 3 }], presupuesto: 150000, moneda: '$', nota: 'ok' }] }, A.cookie);
    chequear('Propuesta válida', r.e === 200 && r.j.aceptados[0] === m2, r.t);

    console.log('\nBajar');
    r = await pedir('GET', '/api/chats?desde=0');
    chequear('Sin sesión → 401', r.e === 401, r.e);
    r = await pedir('GET', '/api/chats?desde=0', undefined, C.cookie);
    chequear('Carla (que no participa) no ve nada', r.j.chats.length === 0 && r.j.mensajes.length === 0, r.t);
    r = await pedir('GET', '/api/chats?desde=0', undefined, B.cookie);
    const msg1 = r.j.mensajes.find(function (m) { return m.id === m1; });
    chequear('Beto ve el chat y los 2 mensajes (sin duplicados)', r.j.chats.length === 1 && r.j.mensajes.length === 2, r.t);
    chequear('El mensaje figura "de" Ana aunque pidieron otra cosa', msg1 && msg1.de === A.id, JSON.stringify(msg1));
    chequear('Se sacaron los < >', msg1 && msg1.texto.indexOf('<') < 0, msg1 && msg1.texto);
    chequear('La propuesta quedó sin la prenda vacía', r.j.mensajes.find(function (m) { return m.id === m2; }).items.length === 1);
    chequear('El chat trae lados y nombres', r.j.chats[0].lados[A.id] === 'tienda' && r.j.chats[0].vendedorNombre === 'Tienda de Ana', r.t);
    const cursor = r.j.cursor;
    r = await pedir('GET', '/api/chats?desde=' + (cursor + 5000), undefined, B.cookie);
    chequear('Con el cursor nuevo ya no hay nada', r.j.chats.length === 0 && r.j.mensajes.length === 0, r.t);

    console.log('\nLeído y eliminar');
    const ahora = Date.now();
    r = await post('/api/chats/leido', { chatId: chat.id, hasta: ahora }, B.cookie);
    chequear('Beto marca leído', r.e === 200, r.t);
    r = await post('/api/chats/leido', { chatId: chat.id, hasta: ahora }, C.cookie);
    chequear('Carla no puede marcar leído un chat ajeno → 404', r.e === 404, r.e);
    r = await pedir('GET', '/api/chats?desde=' + (cursor - 5000), undefined, A.cookie);
    chequear('Ana ve que Beto leyó', r.j.chats.some(function (c) { return c.lecturas[B.id] === ahora; }), r.t);
    r = await post('/api/chats/eliminar', { chatId: chat.id, mensajeId: m1 }, B.cookie);
    chequear('Beto no puede borrar un mensaje de Ana → 403', r.e === 403, r.e);
    r = await post('/api/chats/eliminar', { chatId: chat.id, mensajeId: m1 }, A.cookie);
    chequear('Ana borra su mensaje para todos', r.e === 200, r.t);
    r = await pedir('GET', '/api/chats?desde=' + (cursor - 5000), undefined, B.cookie);
    const borrado = r.j.mensajes.find(function (m) { return m.id === m1; });
    chequear('Beto lo ve borrado y sin texto', borrado && borrado.eliminado === true && borrado.texto === '', JSON.stringify(borrado));

    console.log('\nCuenta eliminada');
    r = await post('/api/eliminar-cuenta', { email: A.email, password: pw });
    chequear('Ana elimina su cuenta', r.e === 200, r.t);
    r = await pedir('GET', '/api/chats?desde=0', undefined, B.cookie);
    chequear('Sus chats se borran con la cuenta', r.j.chats.length === 0 && r.j.mensajes.length === 0, r.t);

    console.log('\n' + (fallos ? fallos + ' pruebas fallaron.' : 'Todo bien.'));
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e.message); process.exit(1); });
