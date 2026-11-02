// Prueba de "ver otro país" y "Se busca". Arrancá el servidor con:
//   ADMIN_EMAILS=admin@gmail.com ADMIN_CLAVE=ClaveDelPanel123 NIVAN_DATOS=/tmp/otra node server.js
// y corré:  ADMIN_CLAVE=ClaveDelPanel123 node prueba-busquedas.js
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
            res.on('end', function () { let j = {}; try { j = JSON.parse(t); } catch (e) {} const sc = res.headers['set-cookie']; ok({ e: res.statusCode, j: j, t: t, c: sc ? [].concat(sc)[0].split(';')[0] : null }); });
        });
        r.on('error', mal); if (d !== null) r.write(d); r.end();
    });
}
const post = function (ruta, cuerpo, cookie) { return pedir('POST', ruta, cuerpo || {}, cookie); };
const get = function (ruta, cookie) { return pedir('GET', ruta, undefined, cookie); };
let fallos = 0;
function chequear(n, c, x) { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  →  ' + JSON.stringify(x))); if (!c) fallos++; }
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
(async function () {
    const pw = 'Clave.Segura1', t = Date.now();
    const reg = function (nombre, mail, pais) { return post('/api/registro', { nombre: nombre, email: mail, password: pw, pais: pais, aceptoTerminos: true }); };
    let r = await reg('Admin Uno', 'admin@gmail.com', 'UY');
    if (r.e === 409) r = await post('/api/login', { email: 'admin@gmail.com', password: pw });
    const admin = r.c;
    await post('/api/admin/entrar', { clave: CLAVE }, admin);
    r = await reg('Vende Argentina', 'v' + t + '@gmail.com', 'AR'); const vend = r.c, idVend = r.j.usuario.id;
    r = await reg('Ana Uruguay', 'a' + t + '@gmail.com', 'UY'); const ana = r.c, mailAna = 'a' + t + '@gmail.com';
    r = await reg('Beto Uruguay', 'b' + t + '@gmail.com', 'UY'); const beto = r.c;
    await post('/api/verificacion', { fotos: { dniFrente: PNG, dniDorso: PNG, rostro: PNG } }, vend);
    await post('/api/admin/verificacion/resolver', { usuarioId: idVend, decision: 'aprobada' }, admin);
    const pub = function (id, pais) { return { publicacion: { id: id, nombre: 'Campera ' + id, precio: 5000, pais: pais || 'AR', categoria: 'Camperas', stock: 5, medios: [] } }; };
    r = await post('/api/publicaciones/guardar', pub('b1'), vend);
    chequear('(preparación) la vendedora argentina publicó', r.e === 200, r.j);
    const tablero = async function (pais, ck) { const l = await get('/api/busquedas?pais=' + pais, ck); return l; };

    console.log('Mirar el otro país');
    r = await get('/api/publicaciones?pais=AR');
    chequear('Una persona de Uruguay puede ver las publicaciones de Argentina', (r.j.publicaciones || []).some(function (p) { return String(p.id) === 'b1' && p.pais === 'AR'; }), r.j);

    console.log('\nPedir que alguien venda algo así');
    r = await tablero('UY');
    chequear('Al principio no hay pedidos', r.e === 200 && r.j.grupos.length === 0, r.j);
    r = await get('/api/busquedas?pais=BR');
    chequear('País inventado → 400', r.e === 400, r.e);
    r = await post('/api/busquedas/crear', { publicacionId: 'b1', pais: 'UY' });
    chequear('Sin sesión → 401', r.e === 401, r.e);
    r = await post('/api/busquedas/crear', { publicacionId: 'b1', pais: 'BR' }, ana);
    chequear('País inventado → 400', r.e === 400, r.e);
    r = await post('/api/busquedas/crear', { publicacionId: 'noexiste', pais: 'UY' }, ana);
    chequear('Publicación que no existe → 404', r.e === 404, r.e);
    r = await post('/api/busquedas/crear', { publicacionId: 'b1', pais: 'AR' }, ana);
    chequear('No se puede pedir algo que ya se vende en tu país → 400', r.e === 400, r.e);
    r = await post('/api/busquedas/crear', { publicacionId: 'b1', pais: 'UY', nota: 'Talle S, <b>negra</b> si puede ser' }, ana);
    chequear('Ana pide algo así en Uruguay → 200', r.e === 200 && r.j.id, r.j);
    const idAna = r.j.id;
    r = await post('/api/busquedas/crear', { publicacionId: 'b1', pais: 'UY' }, ana);
    chequear('Pedir lo mismo dos veces → 409', r.e === 409, r.e);
    r = await post('/api/busquedas/crear', { publicacionId: 'b1', pais: 'UY' }, beto);
    chequear('Beto también lo pide → 200', r.e === 200, r.j);

    console.log('\nLo que ven quienes venden en Uruguay');
    r = await tablero('UY');
    const g = r.j.grupos && r.j.grupos[0];
    chequear('Los dos pedidos se juntan en uno: "2 personas lo buscan"', r.j.grupos.length === 1 && g.cantidad === 2 && g.nombre === 'Campera b1' && g.refPais === 'AR' && g.refId === 'b1', r.j);
    chequear('Se ve la nota de Ana con su nombre, sin código raro', g.notas.length === 1 && g.notas[0].nombre === 'Ana Uruguay' && /Talle S/.test(g.notas[0].nota) && !g.notas[0].nota.includes('<b>'), g.notas);
    chequear('No se filtran emails ni ids de las personas', !r.t.includes('@gmail') && !r.t.includes('NVU-'), r.t.slice(0, 300));
    chequear('Una visita no tiene pedidos propios', g.mia === false, g);
    r = await tablero('UY', ana);
    chequear('Ana ve que el pedido es suyo', r.j.grupos[0].mia === true && r.j.grupos[0].miaId === idAna, r.j.grupos[0]);
    r = await tablero('AR');
    chequear('Argentina no ve nada (los pedidos son para Uruguay)', r.j.grupos.length === 0, r.j);

    console.log('\nCerrar un pedido');
    r = await post('/api/busquedas/cerrar', { id: idAna }, beto);
    chequear('No se puede cerrar el pedido de otra persona → 403', r.e === 403, r.e);
    r = await post('/api/busquedas/cerrar', { id: idAna }, ana);
    chequear('Ana cierra el suyo → 200', r.e === 200, r.e);
    r = await tablero('UY');
    chequear('Ahora lo busca 1 persona', r.j.grupos[0].cantidad === 1, r.j);
    r = await post('/api/busquedas/cerrar', { id: idAna }, ana);
    chequear('Cerrar de nuevo → 404', r.e === 404, r.e);
    r = await post('/api/busquedas/crear', { publicacionId: 'b1', pais: 'UY' }, ana);
    chequear('Después de cerrar puede volver a pedirlo → 200', r.e === 200, r.j);

    console.log('\nLímite diario');
    let tope = null;
    for (let i = 2; i <= 14; i++) {
        await post('/api/publicaciones/guardar', pub('b' + i), vend);
        r = await post('/api/busquedas/crear', { publicacionId: 'b' + i, pais: 'UY' }, ana);
        if (r.e === 429) { tope = i; break; }
    }
    chequear('Después de muchos pedidos en un día se frena → 429 (cortó en el ' + tope + ')', tope !== null && tope <= 12, tope);

    console.log('\nCuando una cuenta desaparece');
    r = await tablero('UY');
    const antes = r.j.grupos.length;
    await post('/api/admin/cuenta/banear', { usuarioId: (await get('/api/yo', beto)).j.usuario.id, tipo: 'permanente', motivo: 'Prueba de baneo' }, admin);
    r = await tablero('UY');
    const grupoB1 = r.j.grupos.find(function (x) { return x.refId === 'b1'; });
    chequear('Los pedidos de una cuenta baneada dejan de verse', grupoB1 && grupoB1.cantidad === 1, grupoB1);
    r = await post('/api/eliminar-cuenta', { password: pw }, ana);
    chequear('Ana borra su cuenta → 200', r.e === 200, r.e);
    r = await tablero('UY');
    chequear('Sus pedidos se borran con su cuenta', r.j.grupos.length === 0, r.j);
    console.log('\n' + (fallos ? fallos + ' pruebas fallaron.' : 'Todo bien.'));
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e.message); process.exit(1); });
