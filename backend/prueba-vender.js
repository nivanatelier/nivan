// Prueba de "solo vende quien tiene la identidad aprobada". Arrancá el servidor con:
//   ADMIN_EMAILS=admin@gmail.com ADMIN_CLAVE=ClaveDelPanel123 NIVAN_DATOS=/tmp/otra node server.js
// y corré:  ADMIN_CLAVE=ClaveDelPanel123 node prueba-vender.js
'use strict';
const http = require('http');
const BASE = process.env.BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);
const CLAVE = process.env.ADMIN_CLAVE || 'ClaveDelPanel123';
function pedir(metodo, ruta, cuerpo, cookie) {
    return new Promise(function (ok, mal) {
        const u = new URL(ruta, BASE), d = cuerpo === undefined ? null : JSON.stringify(cuerpo);
        const h = {}; if (d !== null) h['Content-Type'] = 'application/json'; if (cookie) h.Cookie = cookie;
        const r = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: metodo, headers: h }, function (res) {
            let t = ''; res.on('data', function (c) { t += c; });
            res.on('end', function () { let j = {}; try { j = JSON.parse(t); } catch (e) {} const sc = res.headers['set-cookie']; ok({ e: res.statusCode, j: j, c: sc ? [].concat(sc)[0].split(';')[0] : null }); });
        });
        r.on('error', mal); if (d !== null) r.write(d); r.end();
    });
}
const post = function (ruta, cuerpo, cookie) { return pedir('POST', ruta, cuerpo || {}, cookie); };
const get = function (ruta, cookie) { return pedir('GET', ruta, undefined, cookie); };
let fallos = 0;
function chequear(n, c, x) { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  →  ' + JSON.stringify(x))); if (!c) fallos++; }
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const FOTOS = { dniFrente: PNG, dniDorso: PNG, rostro: PNG };
const DATOS = { nombre: 'Compra Dora', email: 'compra@gmail.com', telefono: '099123456', direccion: 'Calle 1', ciudad: 'Montevideo', codigoPostal: '11000', envio: 'Retiro', pago: 'Efectivo' };
(async function () {
    const pw = 'Clave.Segura1', t = Date.now();
    let r = await post('/api/registro', { nombre: 'Admin Uno', email: 'admin@gmail.com', password: pw, pais: 'UY', aceptoTerminos: true });
    if (r.e === 409) r = await post('/api/login', { email: 'admin@gmail.com', password: pw });
    const admin = r.c;
    await post('/api/admin/entrar', { clave: CLAVE }, admin);
    r = await post('/api/registro', { nombre: 'Vende Dora', email: 'v' + t + '@gmail.com', password: pw, pais: 'UY', aceptoTerminos: true });
    const vend = r.c, idVend = r.j.usuario.id;
    const pub = function (id) { return { publicacion: { id: id, nombre: 'Remera ' + id, precio: 100, pais: 'UY', stock: 5, medios: [] } }; };

    console.log('Sin enviar documentación');
    r = await post('/api/publicaciones/guardar', pub('v1'), vend);
    chequear('No puede publicar → 403', r.e === 403 && /documentación/.test(r.j.error), r.j);

    console.log('\nCon la revisión enviada (pendiente)');
    r = await post('/api/verificacion', { fotos: FOTOS }, vend);
    chequear('Envía las fotos → 200', r.e === 200, r);
    r = await post('/api/publicaciones/guardar', pub('v1'), vend);
    chequear('Todavía NO puede publicar → 403 "pendiente de revisión"', r.e === 403 && /pendiente de revisi/.test(r.j.error), r.j);

    console.log('\nCuando ustedes la aprueban');
    r = await post('/api/admin/verificacion/resolver', { usuarioId: idVend, decision: 'aprobada' }, admin);
    chequear('La aprueban → 200', r.e === 200, r);
    r = await post('/api/publicaciones/guardar', pub('v1'), vend);
    chequear('Ahora sí puede publicar → 200', r.e === 200, r);
    r = await get('/api/publicaciones?pais=UY');
    chequear('Su publicación se ve para todos', (r.j.publicaciones || []).some(function (p) { return String(p.id) === 'v1'; }), r.j);

    console.log('\nRechazada: no vende');
    r = await post('/api/registro', { nombre: 'Otro Vendedor', email: 'o' + t + '@gmail.com', password: pw, pais: 'UY', aceptoTerminos: true });
    const otro = r.c, idOtro = r.j.usuario.id;
    await post('/api/verificacion', { fotos: FOTOS }, otro);
    await post('/api/admin/verificacion/resolver', { usuarioId: idOtro, decision: 'rechazada', motivo: 'Foto borrosa' }, admin);
    r = await post('/api/publicaciones/guardar', pub('o1'), otro);
    chequear('Con la revisión rechazada tampoco puede publicar → 403', r.e === 403, r.j);

    console.log('\nLas cuentas de administración no necesitan verificarse');
    r = await post('/api/publicaciones/guardar', pub('a1'), admin);
    chequear('El admin publica → 200', r.e === 200, r.j);
    r = await get('/api/publicaciones?pais=UY');
    chequear('Y su publicación se ve', (r.j.publicaciones || []).some(function (p) { return String(p.id) === 'a1'; }), r.j);

    console.log('\nCompras');
    r = await post('/api/registro', { nombre: 'Compra Dora', email: 'c' + t + '@gmail.com', password: pw, pais: 'UY', aceptoTerminos: true });
    const comp = r.c, idComp = r.j.usuario.id;
    await post('/api/verificacion', { fotos: FOTOS }, comp);
    await post('/api/admin/verificacion/resolver', { usuarioId: idComp, decision: 'aprobada' }, admin);
    r = await post('/api/pedidos/crear', { datos: DATOS, pais: 'UY', items: [{ id: 'v1', vendedorId: idVend, cantidad: 1 }] }, comp);
    chequear('Se puede comprar a un vendedor aprobado → 200', r.e === 200, r.j);
    console.log('\n' + (fallos ? fallos + ' pruebas fallaron.' : 'Todo bien.'));
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e.message); process.exit(1); });
