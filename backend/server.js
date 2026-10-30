// ==============================
// NIVAN · Servidor (Node.js puro, sin dependencias)
// ==============================
// Qué hace:
//   - Sirve la app (la carpeta de arriba: index.html, js, css) para que todo corra desde el mismo lugar.
//   - Expone la API en /api/...  (cuentas y sesiones; el resto se va sumando por partes).
// Cómo se arranca:  node server.js   →   abrí http://localhost:3000
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const seg = require('./seguridad');

const PORT = +process.env.PORT || 3000;
const EN_RENDER = !!process.env.RENDER;             // Render define esta variable solo: ahí todo se configura automáticamente.
const HOST = process.env.HOST || (EN_RENDER ? '0.0.0.0' : '127.0.0.1');      // 127.0.0.1 = solo este equipo. 0.0.0.0 = también otros dispositivos de la red.
const RAIZ_APP = path.resolve(__dirname, '..');
const CARPETA_BACKEND = path.resolve(__dirname);
const HTTPS = process.env.HTTPS ? process.env.HTTPS === '1' : EN_RENDER;   // HTTPS=1 cuando lo publiques con certificado (activa cookies "Secure")

// ------------------------------
// Utilidades de respuesta
// ------------------------------
const CABECERAS_SEGURIDAD = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Cache-Control': 'no-store'
};

function responder(res, estado, cuerpo, extra) {
    const txt = JSON.stringify(cuerpo);
    res.writeHead(estado, Object.assign({
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(txt)
    }, CABECERAS_SEGURIDAD, extra || {}));
    res.end(txt);
}
function error(res, estado, mensaje, extra) { responder(res, estado, { ok: false, error: mensaje }, extra); }

function leerJSON(req, limite) {
    limite = limite || 100 * 1024;
    return new Promise(function (resolve, reject) {
        const tipo = String(req.headers['content-type'] || '');
        if (tipo.indexOf('application/json') !== 0) return reject({ estado: 415, mensaje: 'Se esperaba JSON.' });
        let tam = 0; const trozos = [];
        req.on('data', function (c) {
            tam += c.length;
            if (tam > limite) { reject({ estado: 413, mensaje: 'El pedido es demasiado grande.' }); req.destroy(); return; }
            trozos.push(c);
        });
        req.on('end', function () {
            try { resolve(JSON.parse(Buffer.concat(trozos).toString('utf8') || '{}')); }
            catch (e) { reject({ estado: 400, mensaje: 'JSON inválido.' }); }
        });
        req.on('error', function () { reject({ estado: 400, mensaje: 'Pedido cortado.' }); });
    });
}

// Un formulario de otro sitio no puede mandar JSON ni tiene el mismo Origin: se rechaza.
function origenValido(req) {
    const o = req.headers.origin;
    if (!o) return true;
    try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}

// ------------------------------
// Usuarios
// ------------------------------
function normalizarBaseIdPublico(texto) {
    return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'usuario';
}
const REGEX_EMAIL = /^[a-z0-9](?:[a-z0-9._%+\-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,}$/;
function emailValido(e) { return e.length <= 60 && e.indexOf('..') < 0 && REGEX_EMAIL.test(e); }

// Lo único que sale del servidor: nunca el hash de la contraseña.
function usuarioPublico(u) {
    return {
        id: u.id, nombre: u.nombre, apodo: u.apodo || '', idPublico: u.idPublico, nombreTienda: u.nombreTienda || '',
        email: u.email, foto: u.foto || '', bio: u.bio || '', bioTrabajo: u.bioTrabajo || '', pais: u.pais || 'AR',
        verificado: !!(u.verificacion && u.verificacion.estado === 'aprobada')
    };
}
async function usuarioDeSesion(req) {
    const s = await seg.sesionDe(req);
    if (!s) return null;
    return await db.usuarioPorId(s.usuarioId);
}
async function iniciarSesionEn(res, req, usuario, estado) {
    const token = await seg.crearSesion(usuario.id, req);
    responder(res, estado || 200, { ok: true, usuario: usuarioPublico(usuario) }, { 'Set-Cookie': seg.cookieSesion(token, HTTPS) });
}

// ------------------------------
// Rutas de la API
// ------------------------------
const RUTAS = {};

RUTAS['GET /api/salud'] = async function (req, res) {
    responder(res, 200, { ok: true, hora: new Date().toISOString(), almacen: db.tipo });
};

RUTAS['POST /api/registro'] = async function (req, res) {
    const ip = seg.ipDe(req);
    const espera = seg.limitar('reg:' + ip, 5, 3600 * 1000);
    if (espera) return error(res, 429, 'Demasiados registros desde este dispositivo. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');

    const b = await leerJSON(req);
    const nombre = String(b.nombre || '').trim().replace(/\s+/g, ' ');
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password == null ? '' : b.password);
    const pais = b.pais === 'UY' ? 'UY' : 'AR';

    if (!nombre || !email || !password) return error(res, 400, 'Completá nombre, email y contraseña.');
    if (nombre.length < 2 || nombre.length > 60) return error(res, 400, 'El nombre tiene que tener entre 2 y 60 caracteres.');
    if (!emailValido(email)) return error(res, 400, 'Ingresá un email válido.');
    if (password.length > 200) return error(res, 400, 'La contraseña es demasiado larga.');
    const faltan = seg.evaluarPassword(password);
    if (faltan.length) return error(res, 400, 'La contraseña es débil. Le falta: ' + faltan.join(', ') + '.');
    if (await db.usuarioPorEmail(email)) return error(res, 409, 'Ya existe una cuenta con ese email.');

    const passwordHash = await seg.hashearPassword(password);

    const usuario = {
        id: 'NVU-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
        nombre: nombre, apodo: '', idPublico: '', nombreTienda: '',
        email: email, passwordHash: passwordHash, pais: pais,
        foto: '', bio: '', bioTrabajo: '', verificacion: null,
        creado: Date.now()
    };
    // La base garantiza que el email y el idPublico no se repitan, aunque dos registros lleguen a la vez.
    try { await db.crearUsuario(usuario, normalizarBaseIdPublico(nombre)); }
    catch (e) {
        if (e && e.codigo === 'EMAIL_DUPLICADO') return error(res, 409, 'Ya existe una cuenta con ese email.');
        throw e;
    }
    await iniciarSesionEn(res, req, usuario, 201);
};

RUTAS['POST /api/login'] = async function (req, res) {
    const ip = seg.ipDe(req);
    const b = await leerJSON(req);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 80);
    const password = String(b.password == null ? '' : b.password).slice(0, 200);
    if (!email || !password) return error(res, 400, 'Completá email y contraseña.');

    // Límites: por dispositivo y por cuenta (frena a quien prueba contraseñas una tras otra).
    const claveEmail = 'login:' + email;
    const espera = seg.limitar('login-ip:' + ip, 20, 15 * 60 * 1000) || seg.limitar(claveEmail, 8, 15 * 60 * 1000);
    if (espera) return error(res, 429, 'Demasiados intentos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');

    const usuario = await db.usuarioPorEmail(email);
    let ok = false;
    if (usuario) ok = await seg.verificarPassword(password, usuario.passwordHash);
    else await seg.gastarTiempo(password);

    if (!ok) return error(res, 401, 'Email o contraseña incorrectos.');
    seg.olvidar(claveEmail);
    await iniciarSesionEn(res, req, usuario);
};

RUTAS['POST /api/logout'] = async function (req, res) {
    await seg.cerrarSesion(req);
    responder(res, 200, { ok: true }, { 'Set-Cookie': seg.cookieBorrar(HTTPS) });
};

RUTAS['GET /api/yo'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    responder(res, 200, { ok: true, usuario: usuarioPublico(u) });
};


// Confirma la contraseña de quien ya tiene sesión (para acciones delicadas).
RUTAS['POST /api/confirmar-password'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('conf:' + u.id, 10, 15 * 60 * 1000);
    if (espera) return error(res, 429, 'Demasiados intentos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    const b = await leerJSON(req);
    const ok = await seg.verificarPassword(String(b.password == null ? '' : b.password).slice(0, 200), u.passwordHash);
    responder(res, 200, { ok: ok });
};

RUTAS['POST /api/password'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('pass:' + u.id, 8, 15 * 60 * 1000);
    if (espera) return error(res, 429, 'Demasiados intentos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    const b = await leerJSON(req);
    const actual = String(b.actual == null ? '' : b.actual).slice(0, 200);
    const nueva = String(b.nueva == null ? '' : b.nueva);
    if (nueva.length > 200) return error(res, 400, 'La contraseña es demasiado larga.');
    if (!(await seg.verificarPassword(actual, u.passwordHash))) return error(res, 403, 'La contraseña actual es incorrecta.');
    const faltan = seg.evaluarPassword(nueva);
    if (faltan.length) return error(res, 400, 'La contraseña nueva es débil. Le falta: ' + faltan.join(', ') + '.');
    if (nueva === actual) return error(res, 400, 'La contraseña nueva tiene que ser distinta de la anterior.');
    await db.cambiarPassword(u.id, await seg.hashearPassword(nueva));
    responder(res, 200, { ok: true });
};

// Eliminar la cuenta del servidor. Sirve desde la app y desde la página pública /eliminar-cuenta.html
// (Google Play exige las dos). Pide email y contraseña, así no hace falta tener la sesión abierta.
RUTAS['POST /api/eliminar-cuenta'] = async function (req, res) {
    const ip = seg.ipDe(req);
    const b = await leerJSON(req);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 80);
    const password = String(b.password == null ? '' : b.password).slice(0, 200);
    if (!email || !password) return error(res, 400, 'Completá email y contraseña.');

    const claveEmail = 'elim:' + email;
    const espera = seg.limitar('elim-ip:' + ip, 10, 15 * 60 * 1000) || seg.limitar(claveEmail, 5, 15 * 60 * 1000);
    if (espera) return error(res, 429, 'Demasiados intentos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');

    const usuario = await db.usuarioPorEmail(email);
    let ok = false;
    if (usuario) ok = await seg.verificarPassword(password, usuario.passwordHash);
    else await seg.gastarTiempo(password);
    if (!ok) return error(res, 401, 'Email o contraseña incorrectos.');

    await db.eliminarUsuario(usuario.id);
    seg.olvidar(claveEmail);
    responder(res, 200, { ok: true }, { 'Set-Cookie': seg.cookieBorrar(HTTPS) });
};

// ------------------------------
// Archivos de la app
// ------------------------------
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg',
    '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
};

function servirArchivo(req, res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname); } catch (e) { return error(res, 400, 'Ruta inválida.'); }
    if (rel.indexOf('\0') >= 0) return error(res, 400, 'Ruta inválida.');
    if (rel.endsWith('/')) rel += 'index.html';
    const ruta = path.resolve(RAIZ_APP, '.' + path.sep + rel);

    // Nada fuera de la carpeta de la app, nada de la carpeta del backend (código y datos), nada oculto.
    const dentro = ruta === RAIZ_APP || ruta.indexOf(RAIZ_APP + path.sep) === 0;
    const enBackend = ruta === CARPETA_BACKEND || ruta.indexOf(CARPETA_BACKEND + path.sep) === 0;
    const oculto = path.relative(RAIZ_APP, ruta).split(path.sep).some(function (p, i) { return p.charAt(0) === '.' && !(i === 0 && p === '.well-known'); });
    if (!dentro || enBackend || oculto) return error(res, 404, 'No encontrado.');

    fs.stat(ruta, function (err, st) {
        if (err || !st.isFile()) return error(res, 404, 'No encontrado.');
        const tipo = MIME[path.extname(ruta).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, Object.assign({ 'Content-Type': tipo, 'Content-Length': st.size }, CABECERAS_SEGURIDAD, { 'Cache-Control': 'no-cache' }, path.basename(ruta) === 'sw.js' ? { 'Service-Worker-Allowed': '/' } : {}));
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(ruta).pipe(res);
    });
}

// ------------------------------
// Servidor
// ------------------------------
const servidor = http.createServer(async function (req, res) {
    try {
        const url = new URL(req.url, 'http://localhost');
        const clave = req.method + ' ' + url.pathname;

        if (url.pathname.indexOf('/api/') === 0) {
            const h = RUTAS[clave];
            if (!h) return error(res, 404, 'No existe esa ruta.');
            if (req.method === 'POST' && !origenValido(req)) return error(res, 403, 'Origen no permitido.');
            return await h(req, res);
        }
        if (req.method !== 'GET' && req.method !== 'HEAD') return error(res, 405, 'Método no permitido.');
        servirArchivo(req, res, url.pathname);
    } catch (e) {
        if (e && e.estado) return error(res, e.estado, e.mensaje);
        console.error('Error:', e);
        if (!res.headersSent) error(res, 500, 'Error del servidor.');
    }
});

servidor.headersTimeout = 15000;
servidor.requestTimeout = 30000;

// Se espera a que la base esté lista (en Postgres crea las tablas la primera vez) antes de abrir el puerto.
db.listo.then(function () {
    servidor.listen(PORT, HOST, function () {
        console.log('NIVAN corriendo en http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT);
        console.log('Datos en: ' + (db.tipo === 'postgres' ? 'PostgreSQL' : db.DIR));
    });
}).catch(function (e) {
    console.error('No se pudo preparar la base de datos:', e.message);
    process.exit(1);
});
