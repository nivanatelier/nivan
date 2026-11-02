// Prueba automática de la API. Con el servidor andando en otra sesión, corré:  node prueba.js
// Usa una base de datos aparte si arrancás el servidor con NIVAN_DATOS=/ruta/otra (así no ensucia la tuya).
'use strict';
const http = require('http');
const BASE = process.env.BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);

function pedir(metodo, ruta, cuerpo, opciones) {
    opciones = opciones || {};
    return new Promise(function (resolve, reject) {
        const u = new URL(ruta, BASE);
        const datos = cuerpo === undefined ? null : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
        const h = Object.assign({}, opciones.headers || {});
        if (datos !== null && !h['Content-Type']) h['Content-Type'] = 'application/json';
        if (opciones.cookie) h.Cookie = opciones.cookie;
        const r = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: metodo, headers: h }, function (res) {
            let t = ''; res.on('data', function (c) { t += c; });
            res.on('end', function () {
                let json = null; try { json = JSON.parse(t); } catch (e) {}
                const sc = res.headers['set-cookie'];
                resolve({ estado: res.statusCode, json: json, texto: t, cookie: sc ? sc[0].split(';')[0] : null, setCookie: sc ? sc[0] : null });
            });
        });
        r.on('error', reject);
        if (datos !== null) r.write(datos);
        r.end();
    });
}

let fallos = 0, total = 0;
function chequear(nombre, condicion, detalle) {
    total++;
    if (condicion) console.log('  ✔ ' + nombre);
    else { fallos++; console.log('  ✘ ' + nombre + (detalle ? '  →  ' + detalle : '')); }
}

(async function () {
    const email = 'prueba' + Date.now() + '@gmail.com';
    const pw = 'Clave.Segura1';
    console.log('Probando ' + BASE + '\n');

    let r = await pedir('GET', '/api/salud');
    chequear('El servidor responde', r.estado === 200 && r.json.ok);

    console.log('\nRegistro');
    r = await pedir('POST', '/api/registro', { nombre: 'Ana Pérez', email: email, password: pw, pais: 'UY' });
    chequear('Sin aceptar los términos no se crea la cuenta → 400', r.estado === 400 && /Términos/.test(r.json.error || ''), r.texto);
    r = await pedir('POST', '/api/registro', { aceptoTerminos: true, nombre: 'Ana Pérez', email: email, password: 'debil' });
    chequear('Rechaza contraseña débil', r.estado === 400 && /débil/.test(r.json.error), r.texto);
    r = await pedir('POST', '/api/registro', { aceptoTerminos: true, nombre: 'Ana Pérez', email: 'no-es-email', password: pw });
    chequear('Rechaza email inválido', r.estado === 400, r.texto);
    r = await pedir('POST', '/api/registro', { aceptoTerminos: true, nombre: 'Ana Pérez', email: email, password: pw, pais: 'UY' });
    chequear('Crea la cuenta', r.estado === 201 && r.json.ok && r.json.usuario.email === email, r.texto);
    chequear('Devuelve idPublico y país', r.json && r.json.usuario.idPublico === 'anaperez' && r.json.usuario.pais === 'UY');
    chequear('No devuelve el hash de la contraseña', r.texto.indexOf('passwordHash') < 0 && r.texto.indexOf('scrypt') < 0);
    chequear('Cookie HttpOnly', !!r.setCookie && /HttpOnly/.test(r.setCookie) && /SameSite=Lax/.test(r.setCookie), r.setCookie);
    const cookie = r.cookie;
    r = await pedir('POST', '/api/registro', { aceptoTerminos: true, nombre: 'Otra Ana', email: email.toUpperCase(), password: pw });
    chequear('No deja repetir el email', r.estado === 409, r.texto);

    console.log('\nSesión');
    r = await pedir('GET', '/api/yo', undefined, { cookie: cookie });
    chequear('/yo con sesión devuelve la cuenta', r.estado === 200 && r.json.usuario.email === email, r.texto);
    r = await pedir('GET', '/api/yo');
    chequear('/yo sin sesión da 401', r.estado === 401);
    r = await pedir('GET', '/api/yo', undefined, { cookie: 'nivan_sid=inventado' });
    chequear('Una cookie inventada no sirve', r.estado === 401);
    r = await pedir('POST', '/api/logout', {}, { cookie: cookie });
    chequear('Cierra sesión', r.estado === 200);
    r = await pedir('GET', '/api/yo', undefined, { cookie: cookie });
    chequear('Después de cerrar, la cookie vieja ya no sirve', r.estado === 401);

    console.log('\nLogin');
    r = await pedir('POST', '/api/login', { email: email, password: 'Incorrecta.1' });
    chequear('Contraseña incorrecta → 401', r.estado === 401 && String(r.json.error).indexOf('Email o contraseña incorrectos.') === 0);
    r = await pedir('POST', '/api/login', { email: 'nadie@gmail.com', password: pw });
    chequear('Email que no existe → mismo mensaje', r.estado === 401 && String(r.json.error).indexOf('Email o contraseña incorrectos.') === 0);
    r = await pedir('POST', '/api/login', { email: email.toUpperCase(), password: pw });
    chequear('Login correcto (sin importar mayúsculas del email)', r.estado === 200 && r.json.ok, r.texto);
    const cookie2 = r.cookie;
    r = await pedir('GET', '/api/yo', undefined, { cookie: cookie2 });
    chequear('La sesión nueva funciona', r.estado === 200);

    console.log('\nProtecciones');
    r = await pedir('POST', '/api/login', 'email=a&password=b', { headers: { 'Content-Type': 'text/plain' } });
    chequear('Rechaza pedidos que no son JSON (anti-CSRF)', r.estado === 415, String(r.estado));
    r = await pedir('POST', '/api/login', { email: email, password: pw }, { headers: { Origin: 'http://sitio-malo.com' } });
    chequear('Rechaza pedidos de otro origen', r.estado === 403, String(r.estado));
    r = await pedir('GET', '/backend/datos/db.json');
    chequear('No se puede bajar la base de datos', r.estado === 404 && r.texto.indexOf('passwordHash') < 0);
    r = await pedir('GET', '/backend/server.js');
    chequear('No se puede bajar el código del backend', r.estado === 404);
    r = await pedir('GET', '/%2e%2e/%2e%2e/etc/passwd');
    chequear('No se sale de la carpeta de la app', r.estado === 404 || r.estado === 400, String(r.estado));
    r = await pedir('GET', '/');
    chequear('Sirve la app (index.html)', r.estado === 200 && /<html/i.test(r.texto), String(r.estado));
    r = await pedir('GET', '/js/01-base.js');
    chequear('Sirve los archivos JS', r.estado === 200);

    console.log('\nLímite de intentos');
    let bloqueo = null;
    for (let i = 0; i < 12; i++) {
        r = await pedir('POST', '/api/login', { email: 'victima@gmail.com', password: 'Mala.Clave' + i });
        if (r.estado === 429) { bloqueo = i + 1; break; }
    }
    chequear('Frena las contraseñas probadas una tras otra (intento ' + bloqueo + ')', bloqueo !== null && bloqueo <= 9);

    console.log('\n' + (fallos ? fallos + ' de ' + total + ' pruebas fallaron.' : 'Todo bien: ' + total + ' pruebas pasaron.'));
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error('No se pudo conectar. ¿Está andando el servidor? (' + e.message + ')'); process.exit(1); });
