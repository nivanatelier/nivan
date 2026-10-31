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
// Quiénes pueden revisar identidades: emails separados por coma en la variable ADMIN_EMAILS.
const ADMINS = String(process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(function (x) { return x.trim(); }).filter(Boolean);
function esAdmin(u) { return !!u && ADMINS.indexOf(String(u.email).toLowerCase()) >= 0; }
function verificacionPublica(u) {
    const v = u.verificacion;
    return v ? { estado: v.estado, enviada: v.enviada, revisada: v.revisada || null, motivo: v.motivo || '', bloqueoReclamos: !!v.bloqueoReclamos } : null;
}
function usuarioPublico(u) {
    return {
        id: u.id, nombre: u.nombre, apodo: u.apodo || '', idPublico: u.idPublico, nombreTienda: u.nombreTienda || '',
        email: u.email, foto: u.foto || '', bio: u.bio || '', bioTrabajo: u.bioTrabajo || '', pais: u.pais || 'AR',
        verificado: !!(u.verificacion && u.verificacion.estado === 'aprobada'),
        verificacion: verificacionPublica(u), admin: esAdmin(u)
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
// ------------------------------
// Recuperar contraseña (código de 6 dígitos por email)
// Los códigos viven en memoria: duran 10 min, 5 intentos. Si el servidor se reinicia, se pide otro.
// Emails: Brevo (gratis hasta 300 por día). Variables: BREVO_API_KEY y MAIL_DE (el email remitente verificado en Brevo).
// ------------------------------
const CODIGOS = new Map();
const MIN_CODIGO = 10;
function emailConfigurado() { return !!(process.env.BREVO_API_KEY && process.env.MAIL_DE); }
async function enviarEmail(para, asunto, texto) {
    if (!emailConfigurado()) return false;
    try {
        const r = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ sender: { name: 'Nivan', email: process.env.MAIL_DE }, to: [{ email: para }], subject: asunto, textContent: texto })
        });
        if (!r.ok) console.error('Brevo respondió', r.status, await r.text().catch(function () { return ''; }));
        return r.ok;
    } catch (e) { console.error('No se pudo enviar el email:', e.message); return false; }
}
function igualesSeguro(a, b) {
    const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
}
function emailDe(b) { return String(b.email || '').trim().toLowerCase().slice(0, 80); }

RUTAS['POST /api/recuperar/pedir'] = async function (req, res) {
    const b = await leerJSON(req);
    const email = emailDe(b);
    if (!email || !emailValido(email)) return error(res, 400, 'Escribí un email válido.');
    const espera = seg.limitar('rec-ip:' + seg.ipDe(req), 10, 15 * 60 * 1000) || seg.limitar('rec:' + email, 3, 15 * 60 * 1000);
    if (espera) return error(res, 429, 'Pediste muchos códigos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    if (EN_RENDER && !emailConfigurado()) return error(res, 503, 'El envío de emails todavía no está configurado en el servidor.');

    const usuario = await db.usuarioPorEmail(email);
    if (usuario) {
        const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        CODIGOS.set(email, { codigo: codigo, vence: Date.now() + MIN_CODIGO * 60 * 1000, intentos: 0, token: null, usuarioId: usuario.id });
        const enviado = await enviarEmail(email, 'Tu código de Nivan',
            'Tu código para recuperar la contraseña de Nivan es: ' + codigo + '\n\nVale ' + MIN_CODIGO + ' minutos. Si no lo pediste vos, ignorá este mensaje: tu cuenta sigue segura.');
        if (!enviado && !EN_RENDER) console.log('[desarrollo] Código de recuperación para ' + email + ': ' + codigo);
    } else {
        await seg.gastarTiempo(email);   // mismo tiempo de respuesta exista o no la cuenta
    }
    // La respuesta es igual exista o no el email, para que nadie pueda averiguar quién tiene cuenta.
    responder(res, 200, { ok: true });
};

RUTAS['POST /api/recuperar/verificar'] = async function (req, res) {
    const b = await leerJSON(req);
    const email = emailDe(b), codigo = String(b.codigo || '').trim();
    const e = CODIGOS.get(email);
    if (!e || e.vence < Date.now()) { CODIGOS.delete(email); return error(res, 400, 'El código venció. Pedí uno nuevo.'); }
    if (!/^\d{6}$/.test(codigo)) return error(res, 400, 'Escribí los 6 dígitos.');
    if (!igualesSeguro(codigo, e.codigo)) {
        e.intentos++;
        if (e.intentos >= 5) { CODIGOS.delete(email); return error(res, 429, 'Demasiados intentos. Pedí un código nuevo.'); }
        return error(res, 400, 'Código incorrecto. Te quedan ' + (5 - e.intentos) + ' intentos.');
    }
    e.token = crypto.randomBytes(24).toString('hex');
    e.vence = Date.now() + MIN_CODIGO * 60 * 1000;
    responder(res, 200, { ok: true, token: e.token });
};

RUTAS['POST /api/recuperar/restablecer'] = async function (req, res) {
    const b = await leerJSON(req);
    const email = emailDe(b), nueva = String(b.nueva == null ? '' : b.nueva);
    const e = CODIGOS.get(email);
    if (!e || !e.token || e.vence < Date.now() || !igualesSeguro(String(b.token || ''), e.token)) {
        CODIGOS.delete(email);
        return error(res, 400, 'Se agotó el tiempo. Pedí un código nuevo.');
    }
    if (nueva.length > 200) return error(res, 400, 'La contraseña es demasiado larga.');
    const faltan = seg.evaluarPassword(nueva);
    if (faltan.length) return error(res, 400, 'La contraseña nueva es débil. Le falta: ' + faltan.join(', ') + '.');
    const usuario = await db.usuarioPorId(e.usuarioId);
    if (!usuario) { CODIGOS.delete(email); return error(res, 400, 'No se encontró tu cuenta.'); }
    if (await seg.verificarPassword(nueva, usuario.passwordHash)) return error(res, 400, 'La contraseña nueva tiene que ser distinta de la anterior.');
    await db.cambiarPassword(usuario.id, await seg.hashearPassword(nueva));
    await db.borrarSesionesDeUsuario(usuario.id);   // se cierran todas las sesiones abiertas
    CODIGOS.delete(email);
    seg.olvidar('login:' + email);
    responder(res, 200, { ok: true });
};

// ------------------------------
// Verificación de identidad: la app no analiza nada, solo recibe las fotos y una persona las aprueba o rechaza.
// Mientras está "pendiente" ya se puede vender. Las fotos se borran al resolver.
// ------------------------------
const REGEX_FOTO_VERIF = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
const FOTOS_VERIF = ['dniFrente', 'dniDorso', 'rostro'];

RUTAS['POST /api/verificacion'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('verif:' + u.id, 6, 24 * 3600 * 1000);
    if (espera) return error(res, 429, 'Enviaste muchas veces tus fotos. Probá de nuevo más tarde.');
    if (u.verificacion && u.verificacion.estado === 'aprobada') return error(res, 400, 'Tu identidad ya está verificada.');
    const b = await leerJSON(req, 14 * 1024 * 1024);
    const fotos = {};
    for (const k of FOTOS_VERIF) {
        const v = b.fotos && b.fotos[k];
        if (typeof v !== 'string' || v.length > 4500000 || !REGEX_FOTO_VERIF.test(v)) return error(res, 400, 'Falta una foto o el archivo no es una imagen válida.');
        fotos[k] = v;
    }
    const previa = u.verificacion || {};
    const nueva = { estado: 'pendiente', enviada: Date.now(), bloqueoReclamos: !!previa.bloqueoReclamos };
    await db.guardarVerificacion(u.id, nueva, fotos);
    responder(res, 200, { ok: true, verificacion: verificacionPublica({ verificacion: nueva }) });
};

async function soloAdmin(req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) { error(res, 401, 'No iniciaste sesión.'); return null; }
    if (!esAdmin(u)) { error(res, 403, 'No tenés permiso para esto.'); return null; }
    return u;
}
RUTAS['POST /api/admin/verificaciones'] = async function (req, res) {
    if (!(await soloAdmin(req, res))) return;
    responder(res, 200, { ok: true, pendientes: await db.verificacionesPendientes() });
};
RUTAS['POST /api/admin/verificacion/ver'] = async function (req, res) {
    if (!(await soloAdmin(req, res))) return;
    const b = await leerJSON(req);
    const fotos = await db.fotosVerificacion(String(b.usuarioId || ''));
    if (!fotos) return error(res, 404, 'Ya no hay fotos para esa persona.');
    responder(res, 200, { ok: true, fotos: fotos });
};
RUTAS['POST /api/admin/verificacion/resolver'] = async function (req, res) {
    if (!(await soloAdmin(req, res))) return;
    const b = await leerJSON(req);
    const id = String(b.usuarioId || '');
    if (b.decision !== 'aprobada' && b.decision !== 'rechazada') return error(res, 400, 'Decisión inválida.');
    const u = await db.usuarioPorId(id);
    if (!u || !u.verificacion || u.verificacion.estado !== 'pendiente') return error(res, 404, 'Esa verificación ya no está pendiente.');
    const nueva = {
        estado: b.decision, enviada: u.verificacion.enviada, revisada: Date.now(),
        motivo: b.decision === 'rechazada' ? String(b.motivo || 'No pudimos validar tus fotos.').slice(0, 200) : '',
        bloqueoReclamos: !!u.verificacion.bloqueoReclamos
    };
    await db.resolverVerificacion(id, nueva);
    responder(res, 200, { ok: true });
};

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
// Publicaciones (compartidas entre todos los usuarios del mismo país)
// ------------------------------
const MAX_MEDIO = 6 * 1024 * 1024;          // por foto o video
const MAX_MEDIOS_POR_PUBLICACION = 10;
const MAX_PUBLICACIONES_POR_USUARIO = 200;
const REGEX_DATA_URL = /^data:((?:image\/(?:png|jpeg|webp|gif))|(?:video\/(?:mp4|webm|quicktime)));base64,([A-Za-z0-9+\/=]+)$/;
const REGEX_URL_MEDIO = /^\/api\/medio\/([a-f0-9]{24})$/;

// Si es una foto/video en base64, la guarda aparte y devuelve su dirección corta.
async function guardarMedioDesde(src, usuarioId, cuenta) {
    if (typeof src !== 'string' || !src) return '';
    if (REGEX_URL_MEDIO.test(src)) return src;
    const m = REGEX_DATA_URL.exec(src);
    if (!m) return '';                                        // otra cosa (URL externa, texto): se descarta
    if (++cuenta.n > MAX_MEDIOS_POR_PUBLICACION) return '';
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > MAX_MEDIO || bytes.length === 0) return '';
    const id = crypto.randomBytes(12).toString('hex');
    await db.guardarMedio({ id: id, usuarioId: usuarioId, tipo: m[1], b64: m[2], creado: Date.now() });
    return '/api/medio/' + id;
}
function idsDeMedios(pub) {
    const ids = [];
    const ver = function (s) { const m = typeof s === 'string' && REGEX_URL_MEDIO.exec(s); if (m) ids.push(m[1]); };
    ver(pub.datos && pub.datos.imagen);
    ((pub.datos && pub.datos.medios) || []).forEach(function (x) { ver(x && x.src); });
    return ids;
}
async function limpiarMedios(usuarioId) {
    const todas = await db.publicacionesDeUsuario(usuarioId);
    const usados = [];
    todas.forEach(function (p) { idsDeMedios(p).forEach(function (i) { usados.push(i); }); });
    await db.borrarMediosSobrantes(usuarioId, usados);
}

RUTAS['GET /api/publicaciones'] = async function (req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pais = url.searchParams.get('pais') === 'UY' ? 'UY' : 'AR';
    const u = await usuarioDeSesion(req);
    const filas = await db.publicacionesPorPais(pais, u ? u.id : '', 300);
    const lista = filas.map(function (f) {
        return Object.assign({}, f.datos, { id: f.datos.id, vendedorId: f.vendedorId, pais: f.pais, activo: f.activo });
    });
    responder(res, 200, { ok: true, publicaciones: lista });
};

RUTAS['POST /api/publicaciones/guardar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('pub:' + u.id, 120, 3600 * 1000);
    if (espera) return error(res, 429, 'Demasiados cambios seguidos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');

    const estadoVerif = u.verificacion && u.verificacion.estado;
    if (estadoVerif !== 'aprobada' && estadoVerif !== 'pendiente') return error(res, 403, 'Primero enviá tu documentación para poder vender.');

    const b = await leerJSON(req, 40 * 1024 * 1024);
    const entrada = b.publicacion;
    if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada) || entrada.id == null) return error(res, 400, 'Publicación inválida.');
    const id = String(entrada.id).slice(0, 40);

    const previa = await db.publicacionPorId(id);
    if (previa && previa.vendedorId !== u.id) return error(res, 403, 'Esa publicación no es tuya.');
    if (!previa && (await db.publicacionesDeUsuario(u.id)).length >= MAX_PUBLICACIONES_POR_USUARIO) {
        return error(res, 400, 'Llegaste al máximo de publicaciones.');
    }

    const datos = JSON.parse(JSON.stringify(entrada));          // copia limpia
    const cuenta = { n: 0 };
    datos.imagen = await guardarMedioDesde(datos.imagen, u.id, cuenta);
    datos.medios = [];
    const entradaMedios = Array.isArray(entrada.medios) ? entrada.medios.slice(0, MAX_MEDIOS_POR_PUBLICACION) : [];
    for (const x of entradaMedios) {
        const src = await guardarMedioDesde(x && x.src, u.id, cuenta);
        if (src) datos.medios.push({ tipo: x.tipo === 'video' ? 'video' : 'imagen', src: src });
    }
    datos.vendedorId = u.id;
    datos.pais = entrada.pais === 'UY' ? 'UY' : 'AR';
    if (JSON.stringify(datos).length > 200 * 1024) return error(res, 413, 'La publicación es demasiado grande.');

    const ahora = Date.now();
    await db.guardarPublicacion({
        id: id, vendedorId: u.id, pais: datos.pais, activo: datos.activo !== false, datos: datos,
        creada: previa ? previa.creada : (+datos.fechaCreacion || ahora), actualizada: ahora
    });
    await limpiarMedios(u.id);
    responder(res, 200, { ok: true, publicacion: datos });
};

RUTAS['POST /api/publicaciones/eliminar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req);
    const id = String(b.id == null ? '' : b.id).slice(0, 40);
    const previa = await db.publicacionPorId(id);
    if (previa && previa.vendedorId !== u.id) return error(res, 403, 'Esa publicación no es tuya.');
    if (previa) { await db.eliminarPublicacion(id); await limpiarMedios(u.id); }
    responder(res, 200, { ok: true });
};

async function servirMedio(req, res, id) {
    const m = await db.medioPorId(id);
    if (!m) return error(res, 404, 'No encontrado.');
    res.writeHead(200, Object.assign({ 'Content-Type': m.tipo, 'Content-Length': m.bytes.length }, CABECERAS_SEGURIDAD,
        { 'Cache-Control': 'public, max-age=31536000, immutable' }));
    res.end(req.method === 'HEAD' ? undefined : m.bytes);
}

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

        if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.indexOf('/api/medio/') === 0) {
            const m = REGEX_URL_MEDIO.exec(url.pathname);
            if (!m) return error(res, 404, 'No encontrado.');
            return await servirMedio(req, res, m[1]);
        }
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
