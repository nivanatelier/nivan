// Prueba de "Eliminar cuenta" (desde la app con sesión y desde la página pública).
// Arrancá el servidor (con una carpeta de datos nueva) y corré:  node prueba-eliminar.js
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

(async function () {
    const pw = 'Clave.Segura1', sello = Date.now();
    async function crear(nombre) {
        const email = nombre.toLowerCase() + sello + '@gmail.com';
        const r = await post('/api/registro', { aceptoTerminos: true, nombre: nombre, email: email, password: pw, pais: 'UY' });
        return { id: r.j.usuario && r.j.usuario.id, email: email, cookie: r.c, e: r.e };
    }
    const A = await crear('Ana'), B = await crear('Beto');
    chequear('Se crearon las cuentas de prueba', A.id && B.id, JSON.stringify([A.e, B.e]));

    console.log('Desde la app (con sesión, sin email)');
    let r = await post('/api/eliminar-cuenta', { password: pw });
    chequear('Sin sesión → 401', r.e === 401, r.e);
    r = await post('/api/eliminar-cuenta', {}, A.cookie);
    chequear('Sin contraseña → 400', r.e === 400, r.e);
    r = await post('/api/eliminar-cuenta', { password: 'incorrecta' }, A.cookie);
    chequear('Contraseña incorrecta → 403 y la cuenta sigue', r.e === 403, r.t);
    r = await pedir('GET', '/api/yo', undefined, A.cookie);
    chequear('Ana sigue con su sesión', r.e === 200, r.e);
    r = await post('/api/eliminar-cuenta', { email: 'otra' + sello + '@gmail.com', password: pw }, A.cookie);
    chequear('Con un email ajeno no borra la cuenta de la sesión → 401', r.e === 401, r.t);
    r = await post('/api/eliminar-cuenta', { password: pw }, A.cookie);
    chequear('Ana elimina su cuenta', r.e === 200, r.t);
    r = await pedir('GET', '/api/yo', undefined, A.cookie);
    chequear('Su sesión ya no sirve → 401', r.e === 401, r.e);
    r = await post('/api/login', { email: A.email, password: pw });
    chequear('No puede volver a entrar → 401', r.e === 401, r.e);

    console.log('Desde la página pública (email + contraseña)');
    r = await post('/api/eliminar-cuenta', { email: B.email, password: 'incorrecta' });
    chequear('Contraseña incorrecta → 401', r.e === 401, r.e);
    r = await post('/api/eliminar-cuenta', { email: B.email, password: pw });
    chequear('Beto elimina su cuenta sin sesión', r.e === 200, r.t);
    r = await post('/api/login', { email: B.email, password: pw });
    chequear('Tampoco vuelve a entrar → 401', r.e === 401, r.e);

    console.log('\n' + (fallos ? fallos + ' pruebas fallaron.' : 'Todo bien.'));
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e.message); process.exit(1); });
