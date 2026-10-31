// Prueba del panel de identidades. Arrancá el servidor con:
//   ADMIN_EMAILS=admin@gmail.com ADMIN_CLAVE=ClaveDelPanel123 NIVAN_DATOS=/tmp/otra node server.js
// y corré:  ADMIN_CLAVE=ClaveDelPanel123 node prueba-admin.js
'use strict';
const http = require('http');
const BASE = process.env.BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);
const CLAVE = process.env.ADMIN_CLAVE || 'ClaveDelPanel123';
function pedir(ruta, cuerpo, cookie) {
    return new Promise(function (ok, mal) {
        const u = new URL(ruta, BASE), d = JSON.stringify(cuerpo || {});
        const h = { 'Content-Type': 'application/json' }; if (cookie) h.Cookie = cookie;
        const r = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: h }, function (res) {
            let t = ''; res.on('data', function (c) { t += c; });
            res.on('end', function () { let j = {}; try { j = JSON.parse(t); } catch (e) {} const sc = res.headers['set-cookie']; ok({ e: res.statusCode, j: j, c: sc ? sc[0].split(';')[0] : null }); });
        });
        r.on('error', mal); r.write(d); r.end();
    });
}
let fallos = 0;
function chequear(n, c, x) { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  →  ' + x)); if (!c) fallos++; }
(async function () {
    const pw = 'Clave.Segura1';
    let r = await pedir('/api/registro', { aceptoTerminos: true, nombre: 'Admin Uno', email: 'admin@gmail.com', password: pw, pais: 'UY' });
    if (r.e === 409) r = await pedir('/api/login', { email: 'admin@gmail.com', password: pw });
    const admin = r.c;
    r = await pedir('/api/registro', { aceptoTerminos: true, nombre: 'Persona Comun', email: 'comun' + Date.now() + '@gmail.com', password: pw, pais: 'UY' });
    const comun = r.c;

    console.log('Quién puede entrar');
    r = await pedir('/api/admin/verificaciones');
    chequear('Sin sesión → 401', r.e === 401, r.e);
    r = await pedir('/api/admin/verificaciones', {}, comun);
    chequear('Cuenta común → 403', r.e === 403, r.e);
    r = await pedir('/api/admin/entrar', { clave: CLAVE }, comun);
    chequear('Cuenta común con la clave correcta igual → 403', r.e === 403, r.e);
    r = await pedir('/api/admin/verificaciones', {}, admin);
    chequear('Admin sin la clave → 423 (bloqueado)', r.e === 423 && r.j.bloqueado, r.e);
    r = await pedir('/api/admin/verificacion/ver', { usuarioId: 'x' }, admin);
    chequear('Admin sin la clave no puede ver fotos → 423', r.e === 423, r.e);
    r = await pedir('/api/admin/verificacion/resolver', { usuarioId: 'x', decision: 'aprobada' }, admin);
    chequear('Admin sin la clave no puede aprobar → 423', r.e === 423, r.e);

    console.log('\nClave');
    r = await pedir('/api/admin/entrar', { clave: 'incorrecta' }, admin);
    chequear('Clave incorrecta → 403', r.e === 403, r.e);
    r = await pedir('/api/admin/verificaciones', {}, admin);
    chequear('Sigue bloqueado', r.e === 423, r.e);
    r = await pedir('/api/admin/entrar', { clave: CLAVE }, admin);
    chequear('Clave correcta → 200', r.e === 200 && r.j.ok, r.e);
    r = await pedir('/api/admin/verificaciones', {}, admin);
    chequear('Ahora ve la lista', r.e === 200 && Array.isArray(r.j.pendientes), r.e);
    r = await pedir('/api/admin/verificaciones', {}, comun);
    chequear('La cuenta común sigue sin acceso', r.e === 403, r.e);
    r = await pedir('/api/admin/salir', {}, admin);
    r = await pedir('/api/admin/verificaciones', {}, admin);
    chequear('"Cerrar panel" vuelve a bloquear', r.e === 423, r.e);

    console.log('\nFuerza bruta');
    let bloqueo = null;
    for (let i = 0; i < 8; i++) { r = await pedir('/api/admin/entrar', { clave: 'mala' + i }, admin); if (r.e === 429) { bloqueo = i + 1; break; } }
    chequear('Frena las claves probadas una tras otra (intento ' + bloqueo + ')', bloqueo !== null && bloqueo <= 6, bloqueo);
    r = await pedir('/api/admin/entrar', { clave: CLAVE }, admin);
    chequear('Estando bloqueado, ni la clave correcta entra → 429', r.e === 429, r.e);
    console.log('\n' + (fallos ? fallos + ' pruebas fallaron.' : 'Todo bien.'));
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e.message); process.exit(1); });
