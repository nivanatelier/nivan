// Prueba de baneos y de la lista de administración. Arrancá el servidor con:
//   ADMIN_EMAILS=admin@gmail.com ADMIN_CLAVE=ClaveDelPanel123 NIVAN_DATOS=/tmp/otra node server.js
// y corré:  ADMIN_CLAVE=ClaveDelPanel123 node prueba-baneos.js
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
            res.on('end', function () { let j = {}; try { j = JSON.parse(t); } catch (e) {} const sc = res.headers['set-cookie']; ok({ e: res.statusCode, j: j, t: t, c: sc ? sc[0].split(';')[0] : null }); });
        });
        r.on('error', mal); if (d !== null) r.write(d); r.end();
    });
}
const post = function (ruta, cuerpo, cookie) { return pedir('POST', ruta, cuerpo || {}, cookie); };
let fallos = 0;
function chequear(n, c, x) { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  →  ' + x)); if (!c) fallos++; }
(async function () {
    const pw = 'Clave.Segura1', mailA = 'ana' + Date.now() + '@gmail.com';
    let r = await post('/api/registro', { nombre: 'Admin Uno', email: 'admin@gmail.com', password: pw, pais: 'UY' });
    if (r.e === 409) r = await post('/api/login', { email: 'admin@gmail.com', password: pw });
    const admin = r.c, idAdmin = r.j.usuario.id;
    await post('/api/admin/entrar', { clave: CLAVE }, admin);
    r = await post('/api/registro', { nombre: 'Ana Prueba', email: mailA, password: pw, pais: 'UY' });
    const ana = r.c, idAna = r.j.usuario.id, idPublicoAna = r.j.usuario.idPublico;
    r = await post('/api/registro', { nombre: 'Comun Prueba', email: 'comun' + Date.now() + '@gmail.com', password: pw, pais: 'UY' });
    const comun = r.c;

    console.log('Lista de administración');
    r = await pedir('GET', '/api/admins');
    chequear('Devuelve el id de la cuenta admin', r.e === 200 && r.j.ids.indexOf(idAdmin) >= 0, r.t);
    chequear('Nunca muestra emails', r.t.indexOf('@') < 0, r.t);

    console.log('\nVerificación de identidad');
    r = await pedir('GET', '/api/yo', undefined, admin);
    chequear('La cuenta admin ya figura como verificada', r.j.usuario.verificado === true && r.j.usuario.verificacion && r.j.usuario.verificacion.estado === 'aprobada', r.t);
    r = await pedir('GET', '/api/yo', undefined, comun);
    chequear('Una cuenta común sigue sin verificar', r.j.usuario.verificado === false && !r.j.usuario.verificacion, r.t);
    r = await post('/api/verificacion', { fotos: {} }, admin);
    chequear('La admin no necesita mandar documentos → 400', r.e === 400 && /ya está verificada/.test(r.j.error || ''), r.t);
    r = await post('/api/publicaciones/guardar', { publicacion: { id: 'x' + Date.now(), nombre: 'Prueba', precio: 100 } }, comun);
    chequear('Una cuenta común sin documentos no puede publicar → 403', r.e === 403, r.e + ' ' + r.t.slice(0, 100));
    r = await post('/api/publicaciones/guardar', { publicacion: { id: 'x' + Date.now(), nombre: 'Prueba', precio: 100 } }, admin);
    chequear('La admin pasa el control de verificación (no da 403)', r.e !== 403, r.e + ' ' + r.t.slice(0, 100));

    console.log('\nBuscar');
    r = await post('/api/admin/cuenta/buscar', { texto: mailA }, comun);
    chequear('Una cuenta común no puede buscar → 403', r.e === 403, r.e);
    r = await post('/api/admin/cuenta/buscar', { texto: mailA.toUpperCase() }, admin);
    chequear('Busca por email', r.e === 200 && r.j.cuenta.id === idAna, r.t);
    r = await post('/api/admin/cuenta/buscar', { texto: idPublicoAna }, admin);
    chequear('Busca por ID público', r.e === 200 && r.j.cuenta.id === idAna, r.t);
    r = await post('/api/admin/cuenta/buscar', { texto: 'nadie-existe-xyz' }, admin);
    chequear('Cuenta inexistente → 404', r.e === 404, r.e);
    chequear('No devuelve el hash de la contraseña', JSON.stringify((await post('/api/admin/cuenta/buscar', { texto: mailA }, admin)).j).indexOf('passwordHash') < 0);

    console.log('\nBanear');
    r = await post('/api/admin/cuenta/banear', { usuarioId: idAna, tipo: 'permanente', motivo: 'x' }, comun);
    chequear('Una cuenta común no puede banear → 403', r.e === 403, r.e);
    r = await post('/api/admin/cuenta/banear', { usuarioId: idAna, tipo: 'permanente', motivo: '' }, admin);
    chequear('Sin motivo no se puede banear → 400', r.e === 400, r.e);
    r = await post('/api/admin/cuenta/banear', { usuarioId: idAna, tipo: 'temporal', dias: 0, motivo: 'Spam' }, admin);
    chequear('Días en 0 → 400', r.e === 400, r.e);
    r = await post('/api/admin/cuenta/banear', { usuarioId: idAna, tipo: 'temporal', dias: 2.5, motivo: 'Spam' }, admin);
    chequear('Días con decimales → 400', r.e === 400, r.e);
    r = await post('/api/admin/cuenta/banear', { usuarioId: idAdmin, tipo: 'permanente', motivo: 'Prueba' }, admin);
    chequear('Una cuenta admin no se puede banear → 400', r.e === 400, r.e);

    r = await pedir('GET', '/api/yo', undefined, ana);
    chequear('Antes del baneo /yo anda', r.e === 200);
    r = await post('/api/admin/cuenta/banear', { usuarioId: idAna, tipo: 'temporal', dias: 7, motivo: 'Vender cosas falsas' }, admin);
    chequear('Baneo por 7 días OK', r.e === 200 && r.j.cuenta.baneo && !r.j.cuenta.baneo.permanente, r.t);
    const faltan = r.j.cuenta.baneo ? Math.round((r.j.cuenta.baneo.hasta - Date.now()) / 86400000) : -1;
    chequear('Dura 7 días', faltan === 7, faltan);
    r = await pedir('GET', '/api/yo', undefined, ana);
    chequear('Su sesión abierta deja de servir (403 baneada)', r.e === 403 && r.j.baneada === true, r.e);
    chequear('El mensaje incluye el motivo', /Vender cosas falsas/.test(r.j.error || ''), r.t);
    chequear('El mensaje incluye hasta cuándo', /hasta el \d\d\/\d\d\/\d{4}/.test(r.j.error || ''), r.t);
    r = await post('/api/login', { email: mailA, password: pw });
    chequear('No puede iniciar sesión (403)', r.e === 403 && r.j.baneada === true && /Vender cosas falsas/.test(r.j.error), r.t);
    r = await post('/api/login', { email: mailA, password: 'Mala.Clave9' });
    chequear('Con contraseña mala sigue el mensaje de siempre (no revela el baneo)', r.e === 401, r.e);
    r = await post('/api/publicaciones/guardar', { publicacion: { id: Date.now(), nombre: 'x', precio: 1 } }, ana);
    chequear('Baneada no puede publicar', r.e === 401, r.e);
    r = await post('/api/eliminar-cuenta', { email: mailA, password: pw });
    chequear('Baneada no puede eliminar su cuenta para escapar del baneo → 403', r.e === 403, r.e);
    r = await post('/api/registro', { nombre: 'Ana Prueba', email: mailA, password: pw, pais: 'UY' });
    chequear('Tampoco puede volver a registrarse con el mismo email → 409', r.e === 409, r.e);

    console.log('\nPermanente y quitar baneo');
    r = await post('/api/admin/cuenta/banear', { usuarioId: idAna, tipo: 'permanente', motivo: 'Estafa' }, admin);
    chequear('Pasar a permanente OK', r.e === 200 && r.j.cuenta.baneo.permanente === true, r.t);
    r = await post('/api/login', { email: mailA, password: pw });
    chequear('Mensaje permanente', r.e === 403 && /permanente/.test(r.j.error) && /Estafa/.test(r.j.error), r.t);
    r = await post('/api/admin/cuenta/desbanear', { usuarioId: idAna }, comun);
    chequear('Una cuenta común no puede quitar baneos → 403', r.e === 403, r.e);
    r = await post('/api/admin/cuenta/desbanear', { usuarioId: idAna }, admin);
    chequear('Quitar baneo OK', r.e === 200 && !r.j.cuenta.baneo, r.t);
    r = await post('/api/login', { email: mailA, password: pw });
    chequear('Después de quitarlo, vuelve a entrar', r.e === 200 && r.j.ok, r.t);

    console.log('\n' + (fallos ? fallos + ' pruebas fallaron.' : 'Todo bien.'));
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e.message); process.exit(1); });
