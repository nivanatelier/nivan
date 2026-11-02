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
const push = require('./push');

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

// Segunda llave del panel: además de ser admin, hay que saber ADMIN_CLAVE (una clave compartida solo entre ustedes).
// Sin ADMIN_CLAVE (mínimo 10 caracteres) el panel queda apagado. El desbloqueo dura 20 minutos desde el último uso.
const ADMIN_CLAVE = String(process.env.ADMIN_CLAVE || '');
const DESBLOQUEO_ADMIN = 20 * 60 * 1000;
const desbloqueos = new Map();   // hash de la sesión → hasta cuándo está desbloqueado (se pierde si el servidor se reinicia: se vuelve a pedir la clave)
function hashClave(t) { return crypto.createHash('sha256').update(String(t)).digest(); }
function claveAdminCorrecta(t) { return ADMIN_CLAVE.length >= 10 && crypto.timingSafeEqual(hashClave(t), hashClave(ADMIN_CLAVE)); }
setInterval(function () {
    const ahora = Date.now();
    desbloqueos.forEach(function (v, k) { if (v < ahora) desbloqueos.delete(k); });
}, 600 * 1000).unref();
function verificacionPublica(u) {
    // Las cuentas de administración de Nivan (ADMIN_EMAILS) siempre cuentan como verificadas: no tienen que mandar documentos.
    if (esAdmin(u)) return { estado: 'aprobada', enviada: u.creado || 0, revisada: u.creado || 0, motivo: '', bloqueoReclamos: false };
    const v = u.verificacion;
    return v ? { estado: v.estado, enviada: v.enviada, revisada: v.revisada || null, motivo: v.motivo || '', bloqueoReclamos: !!v.bloqueoReclamos } : null;
}
function usuarioPublico(u) {
    return {
        id: u.id, nombre: u.nombre, apodo: u.apodo || '', idPublico: u.idPublico, nombreTienda: u.nombreTienda || '',
        email: u.email, foto: u.foto || '', bio: u.bio || '', bioTrabajo: u.bioTrabajo || '', pais: u.pais || 'AR',
        verificado: esAdmin(u) || !!(u.verificacion && u.verificacion.estado === 'aprobada'),
        verificacion: verificacionPublica(u), admin: esAdmin(u), restriccion: restriccionPublica(u),
        desactivada: u.desactivada || null
    };
}
// ---- Baneos ----
// Cuenta baneada: no puede entrar, no puede publicar, y sus publicaciones dejan de verse.
// Un baneo temporal se termina solo cuando pasa la fecha (no hace falta hacer nada).
// Un baneo tiene un "alcance": 'todo' (no puede entrar; es lo de siempre), o una suspensión parcial:
// 'comprar', 'vender' o 'comprar_vender' (sigue pudiendo entrar, pero no hacer eso). Sin alcance = 'todo'.
function alcanceDe(b) { return (b && (b.alcance === 'comprar' || b.alcance === 'vender' || b.alcance === 'comprar_vender')) ? b.alcance : 'todo'; }
function vigente(b) {
    if (!b) return null;
    if (b.permanente) return b;
    return (b.hasta && b.hasta > Date.now()) ? b : null;
}
function baneoActivo(u) {          // solo el baneo total (el que no deja entrar)
    const b = vigente(u && u.baneo);
    return b && alcanceDe(b) === 'todo' ? b : null;
}
function restriccionActiva(u) {    // solo las suspensiones parciales
    const b = vigente(u && u.baneo);
    return b && alcanceDe(b) !== 'todo' ? b : null;
}
function restriccionPublica(u) {
    const b = restriccionActiva(u);
    if (!b) return null;
    const a = alcanceDe(b);
    return { comprar: a === 'comprar' || a === 'comprar_vender', vender: a === 'vender' || a === 'comprar_vender', hasta: b.hasta || null, motivo: b.motivo || '' };
}
function textoRestriccion(b, accion) {
    const a = alcanceDe(b);
    const que = a === 'comprar_vender' ? 'comprar ni vender' : (a === 'comprar' ? 'comprar' : 'vender');
    return 'No podés ' + (accion ? (accion === 'vender' ? 'vender' : 'comprar') : que) + ' hasta el ' + fechaCorta(b.hasta) + '.' + (b.motivo ? ' Motivo: ' + b.motivo : '');
}
// Cualquier medida activa (total o parcial), para mostrársela a la administración.
function moderacionPublica(u) {
    const b = vigente(u && u.baneo);
    return b ? { permanente: !!b.permanente, hasta: b.hasta || null, motivo: b.motivo || '', fecha: b.fecha || null, por: b.por || '', alcance: alcanceDe(b) } : null;
}
function fechaCorta(ms) {   // en hora de Uruguay/Argentina (UTC-3)
    const d = new Date(ms - 3 * 3600000);
    return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
}
function textoBaneo(b) {
    const razon = b.motivo ? ' Motivo: ' + b.motivo : '';
    if (b.permanente) return 'Tu cuenta fue suspendida de forma permanente.' + razon;
    return 'Tu cuenta está suspendida hasta el ' + fechaCorta(b.hasta) + '.' + razon;
}
function baneoPublico(u) {
    const b = baneoActivo(u);
    return b ? { permanente: !!b.permanente, hasta: b.hasta || null, motivo: b.motivo || '', fecha: b.fecha || null, por: b.por || '' } : null;
}
async function usuarioDeSesion(req) {
    const s = await seg.sesionDe(req);
    if (!s) return null;
    const u = await db.usuarioPorId(s.usuarioId);
    return (baneoActivo(u) || (u && u.desactivada)) ? null : u;   // con baneo o cuenta desactivada, la sesión deja de servir
}
async function iniciarSesionEn(res, req, usuario, estado, cookieExtra) {
    const token = await seg.crearSesion(usuario.id, req);
    const cs = seg.cookieSesion(token, HTTPS);
    responder(res, estado || 200, { ok: true, usuario: usuarioPublico(usuario) }, { 'Set-Cookie': cookieExtra ? [cs, cookieExtra] : cs });
}

// ------------------------------
// Rutas de la API
// ------------------------------
const RUTAS = {};

RUTAS['GET /api/salud'] = async function (req, res) {
    responder(res, 200, { ok: true, hora: new Date().toISOString(), almacen: db.tipo });
};

// ------------------------------
// Dispositivos conocidos y aviso por email de inicio de sesión nuevo
// Cada navegador/app recibe una cookie larga y anónima. Si entra con una cookie que esa cuenta no conoce
// (o sin cookie), se manda un email con el dispositivo, la ubicación aproximada y la IP.
// ------------------------------
const COOKIE_DISP = 'nivan_disp';
function hashDisp(t) { return crypto.createHash('sha256').update(t).digest('hex'); }
function cookieDisp(t) { return COOKIE_DISP + '=' + t + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (2 * 365 * 86400) + (HTTPS ? '; Secure' : ''); }
function tokenDispDe(req) { const t = seg.leerCookie(req, COOKIE_DISP); return /^[a-f0-9]{48}$/.test(t || '') ? t : null; }

function baseUrl() {
    return String(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || ('http://localhost:' + PORT)).replace(/\/+$/, '');
}
function descripcionDispositivo(ua) {
    ua = String(ua || '');
    const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
        : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'un navegador';
    const so = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
        : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'un dispositivo desconocido';
    return nav + ' en ' + so;
}
async function ubicacionDeIp(ip) {
    ip = String(ip || '').replace(/^::ffff:/, '');
    if (!ip || ip === 'desconocida' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80|fc|fd)/i.test(ip)) return 'No se pudo determinar';
    try {
        const r = await fetch('https://ipwho.is/' + encodeURIComponent(ip) + '?fields=success,city,region,country', { signal: AbortSignal.timeout(2500) });
        const d = await r.json();
        if (!d.success) return 'No se pudo determinar';
        const partes = [d.city, d.region, d.country].filter(Boolean);
        return partes.length ? partes.join(', ') : 'No se pudo determinar';
    } catch (e) { return 'No se pudo determinar'; }
}

// Enlace "no fui yo": firmado, vale 7 días y deja de servir apenas cambia la contraseña.
function claveSeguridad() { return crypto.createHash('sha256').update('nivan-seguridad|' + (process.env.SECRETO || process.env.DATABASE_URL || 'desarrollo')).digest(); }
function firmar(txt) { return crypto.createHmac('sha256', claveSeguridad()).update(txt).digest('base64url'); }
function huellaPassword(u) { return crypto.createHash('sha256').update(String(u.passwordHash)).digest('hex').slice(0, 16); }
function crearTokenSeguridad(u) {
    const b = Buffer.from(u.id + '|' + (Date.now() + 7 * 86400 * 1000) + '|' + huellaPassword(u)).toString('base64url');
    return b + '.' + firmar(b);
}
function leerTokenSeguridad(t) {
    const partes = String(t || '').split('.');
    if (partes.length !== 2) return null;
    const esperada = firmar(partes[0]);
    if (partes[1].length !== esperada.length || !crypto.timingSafeEqual(Buffer.from(partes[1]), Buffer.from(esperada))) return null;
    const p = Buffer.from(partes[0], 'base64url').toString('utf8').split('|');
    if (p.length !== 3 || +p[1] < Date.now()) return null;
    return { usuarioId: p[0], ph: p[2] };
}

async function avisarNuevoDispositivo(u, req) {
    if (EN_RENDER && !emailConfigurado()) return;
    if (seg.limitar('aviso:' + u.id, 5, 24 * 3600 * 1000)) return;   // tope: 5 avisos por día y cuenta
    const ip = seg.ipDe(req);
    const lugar = await ubicacionDeIp(ip);
    let cuando;
    try { cuando = new Date().toLocaleString('es-UY', { timeZone: 'America/Montevideo', dateStyle: 'long', timeStyle: 'short' }) + ' (hora de Uruguay)'; }
    catch (e) { cuando = new Date().toISOString(); }
    const texto = 'Alguien inició sesión en tu cuenta de Nivan.\n\n' +
        'Cuándo: ' + cuando + '\n' +
        'Dispositivo: ' + descripcionDispositivo(req.headers['user-agent']) + '\n' +
        'Ubicación aproximada: ' + lugar + '\n' +
        'IP: ' + ip + '\n\n' +
        '¿Fuiste vos? Entonces no tenés que hacer nada.\n\n' +
        'Si no fuiste vos, tocá acá para cambiar tu contraseña y cerrar sesión en todos los dispositivos:\n' +
        baseUrl() + '/seguridad.html#t=' + crearTokenSeguridad(u) + '\n\n' +
        '(El enlace vale 7 días. La ubicación es aproximada: sale de la IP y puede no ser exacta.)';
    const enviado = await enviarEmail(u.email, 'Nuevo inicio de sesión en tu cuenta de Nivan', texto);
    if (!enviado && !EN_RENDER) console.log('[desarrollo] Aviso de inicio de sesión para ' + u.email + ':\n' + texto);
}

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
    if (b.aceptoTerminos !== true) return error(res, 400, 'Para crear la cuenta tenés que aceptar los Términos y condiciones.');
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
    // El dispositivo donde se registra ya queda como conocido (no hace falta avisarle).
    const tokenDisp = crypto.randomBytes(24).toString('hex');
    await db.registrarDispositivo(usuario.id, hashDisp(tokenDisp));
    await iniciarSesionEn(res, req, usuario, 201, cookieDisp(tokenDisp));
};

const INTENTOS_LOGIN = [3, 2, 1];                                   // intentos por etapa
const ESPERAS_LOGIN = [5 * 60 * 1000, 30 * 60 * 1000, 24 * 3600 * 1000];   // espera al agotarlos
function textoEsperaLogin(ms) {
    const min = Math.ceil(ms / 60000);
    const t = min >= 120 ? Math.ceil(min / 60) + ' horas' : min >= 60 ? '1 hora' + (min > 60 ? ' y ' + (min - 60) + ' min' : '') : min + ' min';
    return 'Ingreso bloqueado por demasiados intentos. Probá de nuevo en ' + t + '.';
}
RUTAS['POST /api/login'] = async function (req, res) {
    const ip = seg.ipDe(req);
    const b = await leerJSON(req);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 80);
    const password = String(b.password == null ? '' : b.password).slice(0, 200);
    if (!email || !password) return error(res, 400, 'Completá email y contraseña.');

    // Límites: por dispositivo y por cuenta (frena a quien prueba contraseñas una tras otra).
    const claveEmail = 'login:' + email;
    const espera = seg.limitar('login-ip:' + ip, 20, 15 * 60 * 1000) || seg.limitar(claveEmail, 30, 15 * 60 * 1000);
    if (espera) return error(res, 429, 'Demasiados intentos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');

    // Bloqueo escalonado por cuenta: 3 fallos → 5 min · 2 más → 30 min · 1 más → 24 h (y así cada 24 h).
    // Mientras dura la espera no se prueba ninguna contraseña (ni siquiera la correcta).
    const bloqueo = await db.loginBloqueoGet(email);
    const ahoraLogin = Date.now();
    if (bloqueo && bloqueo.hasta > ahoraLogin) {
        return responder(res, 429, { ok: false, bloqueada: true, esperaSeg: Math.ceil((bloqueo.hasta - ahoraLogin) / 1000), error: textoEsperaLogin(bloqueo.hasta - ahoraLogin) });
    }

    const usuario = await db.usuarioPorEmail(email);
    let ok = false;
    if (usuario) ok = await seg.verificarPassword(password, usuario.passwordHash);
    else await seg.gastarTiempo(password);

    if (!ok) {
        let e = bloqueo && (ahoraLogin - bloqueo.ultimo < 7 * 24 * 3600 * 1000) ? { fallos: bloqueo.fallos, fase: bloqueo.fase, hasta: 0, ultimo: ahoraLogin } : { fallos: 0, fase: 0, hasta: 0, ultimo: ahoraLogin };
        e.fallos++; e.ultimo = ahoraLogin;
        const tope = INTENTOS_LOGIN[Math.min(e.fase, INTENTOS_LOGIN.length - 1)];
        if (e.fallos >= tope) {
            const ms = ESPERAS_LOGIN[Math.min(e.fase, ESPERAS_LOGIN.length - 1)];
            e.hasta = ahoraLogin + ms; e.fase++; e.fallos = 0;
            await db.loginBloqueoPut(email, e);
            return responder(res, 429, { ok: false, bloqueada: true, esperaSeg: Math.ceil(ms / 1000), error: 'Contraseña incorrecta. ' + textoEsperaLogin(ms) });
        }
        await db.loginBloqueoPut(email, e);
        const quedan = tope - e.fallos;
        return responder(res, 401, { ok: false, quedan: quedan, error: 'Email o contraseña incorrectos. Te ' + (quedan === 1 ? 'queda 1 intento' : 'quedan ' + quedan + ' intentos') + ' antes de que se bloquee el ingreso por un rato.' });
    }
    const baneo = baneoActivo(usuario);
    if (baneo) return responder(res, 403, { ok: false, baneada: true, error: textoBaneo(baneo) });
    seg.olvidar(claveEmail);
    if (bloqueo) await db.loginBloqueoBorrar(email);

    let tokenDisp = tokenDispDe(req);
    const nuevo = !tokenDisp || !(await db.dispositivoConocido(usuario.id, hashDisp(tokenDisp)));
    if (!tokenDisp) tokenDisp = crypto.randomBytes(24).toString('hex');
    if (nuevo) {
        await db.registrarDispositivo(usuario.id, hashDisp(tokenDisp));
        avisarNuevoDispositivo(usuario, req).catch(function (e) { console.error('Aviso de inicio de sesión:', e && e.message); });
    }
    await iniciarSesionEn(res, req, usuario, 200, cookieDisp(tokenDisp));
};

// Solicitud de prenda a medida: llega por mail a Nivan (MAIL_ATELIER, por defecto nivanatelier@gmail.com).
const MAIL_ATELIER = String(process.env.MAIL_ATELIER || 'nivanatelier@gmail.com').trim();
RUTAS['POST /api/medida'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'Iniciá sesión o creá tu cuenta para enviar la solicitud.');
    const espera = seg.limitar('medida:' + u.id, 5, 24 * 3600 * 1000);
    if (espera) return error(res, 429, 'Ya enviaste varias solicitudes hoy. Probá de nuevo más tarde.');
    const b = await leerJSON(req);
    const emailCliente = String(b.email || '').trim().toLowerCase().slice(0, 120);
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(emailCliente)) return error(res, 400, 'El correo electrónico no es válido.');
    const campos = (Array.isArray(b.campos) ? b.campos : []).slice(0, 40).map(function (c) {
        return { k: String(c && c.etiqueta || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80), v: String(c && c.valor || '').replace(/\r/g, '').trim().slice(0, 1500) };
    }).filter(function (c) { return c.k && c.v; });
    if (!campos.length) return error(res, 400, 'La solicitud está vacía.');
    const numero = String(b.numero || '').replace(/\D/g, '').slice(0, 8) || String(Date.now()).slice(-6);
    const tipo = String((campos.find(function (c) { return /qué querés crear|tipo de prenda/i.test(c.k); }) || {}).v || 'prenda').replace(/[\r\n]+/g, ' ').slice(0, 60);
    if (!emailConfigurado()) return error(res, 503, 'Por ahora no podemos recibir solicitudes por correo. Probá de nuevo más tarde o escribinos a ' + MAIL_ATELIER + '.');
    const texto = 'Nueva solicitud a medida #' + numero + '\n\n'
        + 'Cuenta: ' + u.nombre + ' (' + u.email + ')' + (u.idPublico ? ' · ID ' + u.idPublico : '') + '\n'
        + 'Correo de contacto: ' + emailCliente + '\n'
        + 'País: ' + String(b.pais || '').slice(0, 2).toUpperCase() + '\n\n'
        + campos.map(function (c) { return c.k + ': ' + c.v; }).join('\n')
        + '\n\nPodés responder este mail: la respuesta va al correo de contacto.';
    const d = await enviarEmailDetalle(MAIL_ATELIER, 'Solicitud a medida #' + numero + ' · ' + tipo, texto, emailCliente);
    if (!d.ok) return error(res, 502, 'No pudimos enviar tu solicitud. Probá de nuevo en unos minutos.');
    responder(res, 200, { ok: true, numero: numero });
};

RUTAS['POST /api/logout'] = async function (req, res) {
    await seg.cerrarSesion(req);
    responder(res, 200, { ok: true }, { 'Set-Cookie': seg.cookieBorrar(HTTPS) });
};

RUTAS['GET /api/yo'] = async function (req, res) {
    const sesion = await seg.sesionDe(req);
    const cuenta = sesion ? await db.usuarioPorId(sesion.usuarioId) : null;
    const baneo = baneoActivo(cuenta);
    if (baneo) return responder(res, 403, { ok: false, baneada: true, error: textoBaneo(baneo) }, { 'Set-Cookie': seg.cookieBorrar(HTTPS) });
    const u = cuenta;
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
const BREVO_URL = process.env.BREVO_URL || 'https://api.brevo.com/v3/smtp/email';
// Devuelve { ok, estado, detalle }. estado = código HTTP de Brevo (0 si ni siquiera se pudo conectar).
async function enviarEmailDetalle(para, asunto, texto, responderA) {
    if (!emailConfigurado()) return { ok: false, estado: -1, detalle: 'faltan variables' };
    try {
        const r = await fetch(BREVO_URL, {
            method: 'POST',
            headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(Object.assign({ sender: { name: 'Nivan', email: process.env.MAIL_DE }, to: [{ email: para }], subject: asunto, textContent: texto }, responderA ? { replyTo: { email: responderA } } : {})),
            signal: AbortSignal.timeout(15000)
        });
        if (r.ok) return { ok: true, estado: r.status, detalle: '' };
        const t = await r.text().catch(function () { return ''; });
        console.error('Brevo respondió', r.status, t);
        return { ok: false, estado: r.status, detalle: t.slice(0, 300) };
    } catch (e) {
        console.error('No se pudo enviar el email:', e.message);
        return { ok: false, estado: 0, detalle: e.message };
    }
}
async function enviarEmail(para, asunto, texto) { return (await enviarEmailDetalle(para, asunto, texto)).ok; }

// Traduce el error de Brevo a algo que se pueda arreglar.
function explicarFalloEmail(d) {
    if (d.ok) return 'El mail se envió bien. Si no te llega, revisá spam/promociones.';
    if (d.estado === -1) {
        const faltan = ['BREVO_API_KEY', 'MAIL_DE'].filter(function (k) { return !process.env[k]; });
        return 'Faltan variables en Render → Environment: ' + faltan.join(' y ') + '. Después de agregarlas hay que esperar a que Render vuelva a desplegar.';
    }
    if (d.estado === 0) return 'El servidor no pudo conectarse con Brevo (' + d.detalle + ').';
    if (d.estado === 401 && /ip/i.test(d.detalle)) return 'Brevo está bloqueando la IP de Render. En Brevo: Security → Authorized IPs → "Deactivate blocking". (Render usa IPs que cambian, por eso conviene desactivarlo.)';
    if (d.estado === 401) {
        const k = String(process.env.BREVO_API_KEY || '');
        return 'Brevo no acepta la API key.' + (k.indexOf('xkeysib-') === 0 ? ' Revisá que no haya espacios ni comillas al pegarla en Render, o creá otra.' : ' Tiene que ser una API key (empieza con "xkeysib-"), no una clave SMTP (empieza con "xsmtpsib-"). Se crea en Brevo → SMTP & API → pestaña "API Keys".');
    }
    if (d.estado === 400 && /sender/i.test(d.detalle)) return 'Brevo no acepta el remitente: MAIL_DE (' + process.env.MAIL_DE + ') tiene que estar agregado y verificado en Brevo → Senders, domains & dedicated IPs → Senders.';
    if (d.estado === 402 || d.estado === 403) return 'Brevo no deja enviar: la cuenta todavía no está activada o tiene el envío bloqueado. Revisá el mail de Brevo y el aviso dentro de su panel.';
    if (d.estado === 429) return 'Brevo dice que se pasaron del límite de envíos por ahora.';
    return 'Brevo respondió ' + d.estado + ': ' + d.detalle;
}
function igualesSeguro(a, b) {
    const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
    return crypto.timingSafeEqual(x, y);
}
function emailDe(b) { return String(b.email || '').trim().toLowerCase().slice(0, 80); }

RUTAS['POST /api/seguridad/no-fui-yo'] = async function (req, res) {
    const espera = seg.limitar('nofui:' + seg.ipDe(req), 10, 15 * 60 * 1000);
    if (espera) return error(res, 429, 'Demasiados intentos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    const b = await leerJSON(req);
    const t = leerTokenSeguridad(b.token);
    const u = t ? await db.usuarioPorId(t.usuarioId) : null;
    if (!u || huellaPassword(u) !== t.ph) return error(res, 400, 'Este enlace ya se usó o venció. Si necesitás cambiar tu contraseña, usá "Olvidé mi contraseña" en la app.');
    const nueva = String(b.nueva == null ? '' : b.nueva);
    if (nueva.length > 200) return error(res, 400, 'La contraseña es demasiado larga.');
    const faltan = seg.evaluarPassword(nueva);
    if (faltan.length) return error(res, 400, 'La contraseña nueva es débil. Le falta: ' + faltan.join(', ') + '.');
    if (await seg.verificarPassword(nueva, u.passwordHash)) return error(res, 400, 'La contraseña nueva tiene que ser distinta de la anterior.');
    await db.cambiarPassword(u.id, await seg.hashearPassword(nueva));
    await db.borrarSesionesDeUsuario(u.id);   // se cierran todas las sesiones
    await db.borrarDispositivos(u.id);        // y todos los dispositivos tienen que volver a confirmarse
    responder(res, 200, { ok: true }, { 'Set-Cookie': seg.cookieBorrar(HTTPS) });
};

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
        if (!enviado && EN_RENDER) console.error('[email] No se pudo enviar el código de recuperación. Probá el envío desde el panel de administración para ver el motivo.');
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
    await db.loginBloqueoBorrar(email);
    responder(res, 200, { ok: true });
};

// ------------------------------
// Verificación de identidad: la app no analiza nada, solo recibe las fotos y una persona las aprueba o rechaza.
// Mientras está "pendiente" NO se puede vender: solo cuando un admin la aprueba. Las fotos se borran al resolver.
// ------------------------------
const REGEX_FOTO_VERIF = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/;
const FOTOS_VERIF = ['dniFrente', 'dniDorso', 'rostro'];

RUTAS['POST /api/verificacion'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('verif:' + u.id, 6, 24 * 3600 * 1000);
    if (espera) return error(res, 429, 'Enviaste muchas veces tus fotos. Probá de nuevo más tarde.');
    if (esAdmin(u) || (u.verificacion && u.verificacion.estado === 'aprobada')) return error(res, 400, 'Tu identidad ya está verificada.');
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

// sinClave=true solo lo usa la ruta que pide la clave. Todo lo demás exige: sesión + ser admin + panel desbloqueado.
async function soloAdmin(req, res, sinClave) {
    const sesion = await seg.sesionDe(req);
    const u = sesion ? await db.usuarioPorId(sesion.usuarioId) : null;
    if (!u) { error(res, 401, 'No iniciaste sesión.'); return null; }
    if (!esAdmin(u)) { error(res, 403, 'No tenés permiso para esto.'); return null; }
    if (!sinClave) {
        const vence = desbloqueos.get(sesion.h);
        if (!vence || vence < Date.now()) {
            desbloqueos.delete(sesion.h);
            responder(res, 423, { ok: false, bloqueado: true, error: 'Ingresá la clave del panel.' });
            return null;
        }
        desbloqueos.set(sesion.h, Date.now() + DESBLOQUEO_ADMIN);
    }
    return u;
}
RUTAS['POST /api/admin/entrar'] = async function (req, res) {
    const u = await soloAdmin(req, res, true);
    if (!u) return;
    if (ADMIN_CLAVE.length < 10) return error(res, 503, 'El panel está apagado: falta configurar ADMIN_CLAVE (mínimo 10 caracteres) en Render.');
    const espera = seg.limitar('adminclave:' + u.id, 5, 15 * 60 * 1000) || seg.limitar('adminclave-ip:' + seg.ipDe(req), 10, 15 * 60 * 1000);
    if (espera) return error(res, 429, 'Demasiados intentos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' minuto(s).');
    const b = await leerJSON(req);
    if (!claveAdminCorrecta(String(b.clave == null ? '' : b.clave).slice(0, 200))) {
        console.warn('[admin] clave incorrecta de ' + u.email + ' desde ' + seg.ipDe(req));
        return error(res, 403, 'Clave incorrecta.');
    }
    seg.olvidar('adminclave:' + u.id);
    const sesion = await seg.sesionDe(req);
    desbloqueos.set(sesion.h, Date.now() + DESBLOQUEO_ADMIN);
    console.log('[admin] ' + u.email + ' entró al panel');
    responder(res, 200, { ok: true });
};
RUTAS['POST /api/admin/salir'] = async function (req, res) {
    const sesion = await seg.sesionDe(req);
    if (sesion) desbloqueos.delete(sesion.h);
    responder(res, 200, { ok: true });
};
RUTAS['POST /api/admin/verificaciones'] = async function (req, res) {
    if (!(await soloAdmin(req, res))) return;
    const usado = await tamanoAlmacen();
    responder(res, 200, { ok: true, pendientes: await db.verificacionesPendientes(), almacen: { usadoMB: Math.round(usado / 1048576), limiteMB: LIMITE_ALMACEN_MB, esPostgres: db.tipo === 'postgres' } });
};
RUTAS['POST /api/admin/verificacion/ver'] = async function (req, res) {
    if (!(await soloAdmin(req, res))) return;
    const b = await leerJSON(req);
    const fotos = await db.fotosVerificacion(String(b.usuarioId || ''));
    if (!fotos) return error(res, 404, 'Ya no hay fotos para esa persona.');
    responder(res, 200, { ok: true, fotos: fotos });
};
// Gente ya aprobada (la más antigua primero), con la opción de ver/borrar sus fotos y de cancelar su identidad.
RUTAS['POST /api/admin/aprobadas'] = async function (req, res) {
    if (!(await soloAdmin(req, res))) return;
    responder(res, 200, { ok: true, aprobadas: await db.verificacionesAprobadas() });
};
RUTAS['POST /api/admin/verificacion/borrar-todas'] = async function (req, res) {
    const admin = await soloAdmin(req, res);
    if (!admin) return;
    const n = await db.borrarTodasLasFotosRevisadas();
    console.log('[admin] ' + admin.email + ' borró todas las fotos de identidad ya revisadas (' + n + ')');
    responder(res, 200, { ok: true, borradas: n });
};
RUTAS['POST /api/admin/verificacion/borrar-fotos'] = async function (req, res) {
    const admin = await soloAdmin(req, res);
    if (!admin) return;
    const b = await leerJSON(req);
    const id = String(b.usuarioId || '');
    const u = await db.usuarioPorId(id);
    if (!u) return error(res, 404, 'Esa cuenta ya no existe.');
    await db.borrarFotosVerificacion(id);
    console.log('[admin] ' + admin.email + ' borró las fotos de identidad de ' + u.email);
    responder(res, 200, { ok: true });
};
// Cancelar una identidad aprobada: vuelve a "rechazada" (hay que verificarse de nuevo). Sus publicaciones dejan de verse
// hasta que la identidad vuelva a ser aceptada (no se borran). Se borran también las fotos guardadas.
RUTAS['POST /api/admin/verificacion/cancelar'] = async function (req, res) {
    const admin = await soloAdmin(req, res);
    if (!admin) return;
    const b = await leerJSON(req);
    const id = String(b.usuarioId || '');
    const u = await db.usuarioPorId(id);
    if (!u || !u.verificacion || u.verificacion.estado !== 'aprobada') return error(res, 404, 'Esa identidad ya no está aprobada.');
    if (esAdmin(u)) return error(res, 400, 'Una cuenta de administración no necesita verificación.');
    const motivo = limpiarTextoCorto(b.motivo, 200) || 'Tu identidad fue cancelada. Volvé a verificarla.';
    await db.resolverVerificacion(id, { estado: 'rechazada', enviada: u.verificacion.enviada, revisada: Date.now(), motivo: motivo, bloqueoReclamos: !!u.verificacion.bloqueoReclamos, cancelada: true }, false);
    console.log('[admin] ' + admin.email + ' canceló la identidad de ' + u.email + ' · ' + motivo);
    responder(res, 200, { ok: true });
};
RUTAS['POST /api/admin/verificacion/resolver'] = async function (req, res) {
    const admin = await soloAdmin(req, res);
    if (!admin) return;
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
    await db.resolverVerificacion(id, nueva, b.decision === 'aprobada');
    console.log('[admin] ' + admin.email + ' ' + b.decision + ' a ' + u.email);
    responder(res, 200, { ok: true });
};


// Solo vende quien tiene la identidad APROBADA (o es de administración). Devuelve los ids, entre los dados, que NO pueden vender.
// Sirve para ocultar y rechazar compras de publicaciones viejas de cuentas que todavía no fueron aprobadas.
async function vendedoresNoHabilitados(ids) {
    const unicos = Array.from(new Set(ids.filter(Boolean)));
    const no = new Set();
    if (!unicos.length) return no;
    (await db.estadosVendedores(unicos)).forEach(function (f) {
        if (f.estado !== 'aprobada' && ADMINS.indexOf(String(f.email).toLowerCase()) < 0) no.add(f.id);
    });
    return no;
}

// ---- Cuentas: buscar y banear (solo admins, con la clave del panel) ----
async function buscarCuenta(texto) {
    const t = String(texto || '').trim().toLowerCase().slice(0, 80);
    if (!t) return null;
    return (await db.usuarioPorEmail(t)) || (await db.usuarioPorIdPublico(t)) || (await db.usuarioPorId(String(texto).trim().slice(0, 80)));
}
function resumenCuenta(u) {
    return { id: u.id, nombre: u.nombre, email: u.email, idPublico: u.idPublico, admin: esAdmin(u), baneo: moderacionPublica(u) };
}
function textoMedida(b) {
    const a = alcanceDe(b);
    if (b.permanente) return 'baneo permanente';
    const que = a === 'todo' ? 'baneo temporal' : 'suspensión para ' + (a === 'comprar' ? 'comprar' : a === 'vender' ? 'vender' : 'comprar y vender');
    return que + ' hasta el ' + fechaCorta(b.hasta);
}
// Todas las cuentas con baneo o suspensión vigente, por categoría y, dentro de cada una, de la más antigua a la más reciente.
const CATEGORIAS_BANEO = ['permanente', 'temporal', 'vender', 'comprar', 'comprar_vender'];
function categoriaBaneo(b) { return b.permanente ? 'permanente' : (alcanceDe(b) === 'todo' ? 'temporal' : alcanceDe(b)); }
RUTAS['POST /api/admin/baneados'] = async function (req, res) {
    if (!(await soloAdmin(req, res))) return;
    const ahora = Date.now();
    const lista = (await db.cuentasConBaneo()).filter(function (u) { return u.baneo.permanente || (u.baneo.hasta || 0) > ahora; }).map(function (u) {
        const b = u.baneo;
        return { id: u.id, nombre: u.nombre, email: u.email, idPublico: u.idPublico, categoria: categoriaBaneo(b), fecha: b.fecha || 0, hasta: b.permanente ? null : b.hasta, motivo: b.motivo || '', por: b.por || '' };
    }).sort(function (a, b) { return a.fecha - b.fecha; });
    responder(res, 200, { ok: true, categorias: CATEGORIAS_BANEO, baneados: lista });
};
RUTAS['POST /api/admin/cuenta/buscar'] = async function (req, res) {
    if (!(await soloAdmin(req, res))) return;
    const b = await leerJSON(req);
    const u = await buscarCuenta(b.texto);
    if (!u) return error(res, 404, 'No encontramos esa cuenta. Probá con el email o con el ID (ej: maria12).');
    responder(res, 200, { ok: true, cuenta: resumenCuenta(u) });
};
RUTAS['POST /api/admin/cuenta/banear'] = async function (req, res) {
    const admin = await soloAdmin(req, res);
    if (!admin) return;
    const b = await leerJSON(req);
    const u = await db.usuarioPorId(String(b.usuarioId || ''));
    if (!u) return error(res, 404, 'Esa cuenta ya no existe.');
    if (esAdmin(u)) return error(res, 400, 'Una cuenta de administración no se puede banear.');
    const motivo = String(b.motivo || '').replace(/[<>\u0000-\u001f]/g, ' ').trim().slice(0, 300);
    if (motivo.length < 3) return error(res, 400, 'Escribí el motivo (la persona lo va a ver).');
    const alcance = b.alcance === undefined ? 'todo' : b.alcance;
    if (['todo', 'comprar', 'vender', 'comprar_vender'].indexOf(alcance) < 0) return error(res, 400, 'Elegí qué se suspende: comprar, vender o ambos.');
    let baneo;
    if (b.tipo === 'permanente') {
        if (alcance !== 'todo') return error(res, 400, 'El baneo permanente es de toda la cuenta. Para suspender solo comprar o vender, elegí "temporal".');
        baneo = { permanente: true, hasta: null, motivo: motivo, fecha: Date.now(), por: admin.email, alcance: 'todo' };
    } else if (b.tipo === 'temporal') {
        const dias = Number(b.dias);
        if (!Number.isInteger(dias) || dias < 1 || dias > 3650) return error(res, 400, 'Los días tienen que ser un número entero entre 1 y 3650.');
        baneo = { permanente: false, hasta: Date.now() + dias * 86400000, motivo: motivo, fecha: Date.now(), por: admin.email, alcance: alcance };
    } else return error(res, 400, 'Elegí si el baneo es permanente o temporal.');
    await db.fijarBaneo(u.id, baneo);
    // Baneo permanente: se borran para siempre sus publicaciones, sus fotos/videos y las fotos de su identidad.
    if (baneo.permanente) {
        const pubs = await db.publicacionesDeUsuario(u.id);
        for (const p of pubs) await db.eliminarPublicacion(p.id);
        borrarQuitadosDeNube(await db.borrarMediosSobrantes(u.id, []));
        await db.borrarFotosVerificacion(u.id);
        console.log('[admin] baneo permanente: se borraron ' + pubs.length + ' publicación(es) y las fotos de ' + u.email);
    }
    // Si la medida salió de un reporte, esos reportes quedan como resueltos.
    const repTipo = (b.reporte && tipoDeReporte(b.reporte.tipo)) || 'publicacion';
    if (b.reporte && b.reporte.objetivoId != null) {
        await db.cerrarReportes(repTipo, String(b.reporte.objetivoId).slice(0, 60), 'resuelto', textoMedida(baneo));
    }
    // Sus sesiones abiertas no se borran: dejan de servir solas y así la app le muestra el motivo en vez de "tu sesión venció".
    console.log('[admin] ' + admin.email + ' aplicó ' + textoMedida(baneo) + ' a ' + u.email + ' · ' + motivo);
    responder(res, 200, { ok: true, cuenta: resumenCuenta(Object.assign({}, u, { baneo: baneo })) });
};
RUTAS['POST /api/admin/cuenta/desbanear'] = async function (req, res) {
    const admin = await soloAdmin(req, res);
    if (!admin) return;
    const b = await leerJSON(req);
    const u = await db.usuarioPorId(String(b.usuarioId || ''));
    if (!u) return error(res, 404, 'Esa cuenta ya no existe.');
    await db.fijarBaneo(u.id, null);
    console.log('[admin] ' + admin.email + ' quitó el baneo a ' + u.email);
    responder(res, 200, { ok: true, cuenta: resumenCuenta(Object.assign({}, u, { baneo: null })) });
};

// ---- Reportes ----
const MOTIVOS_REPORTE = { estafa: 'Estafa o intento de fraude', prohibido: 'Producto prohibido o ilegal', 'engañoso': 'Publicación falsa o engañosa',
    ofensivo: 'Contenido ofensivo, discriminatorio o acoso', spam: 'Spam o publicidad no autorizada', suplantacion: 'Suplantación de identidad', otro: 'Otro motivo' };
function limpiarTextoCorto(t, max) { return String(t == null ? '' : t).replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
// A qué cuenta corresponde lo reportado (el dueño de la publicación, o la cuenta misma).
const TIPOS_REPORTE = ['usuario', 'publicacion', 'post', 'comentario'];
function tipoDeReporte(t) { return TIPOS_REPORTE.indexOf(t) >= 0 ? t : ''; }
async function objetivoDeReporte(tipo, objetivoId) {
    if (tipo === 'post') {       // post del perfil: el id es "idDelDueño_fecha"
        const i = objetivoId.lastIndexOf('_');
        const dueno = i > 0 ? await db.usuarioPorId(objetivoId.slice(0, i)) : null;
        return dueno ? { cuentaId: dueno.id, nombre: 'Post de ' + limpiarTextoCorto(dueno.nombre, 60) } : null;
    }
    if (tipo === 'comentario') {
        const c = await db.comentarioPorId(objetivoId);
        return c ? { cuentaId: c.usuarioId, nombre: limpiarTextoCorto(c.texto, 60) } : null;
    }
    if (tipo === 'publicacion') {
        const pub = await db.publicacionPorId(objetivoId);
        return pub ? { cuentaId: pub.vendedorId, nombre: limpiarTextoCorto(pub.datos && pub.datos.nombre, 80) } : null;
    }
    const c = await db.usuarioPorId(objetivoId);
    return c ? { cuentaId: c.id, nombre: limpiarTextoCorto(c.nombre, 80) } : null;
}
RUTAS['POST /api/reportes'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'Iniciá sesión para reportar.');
    const espera = seg.limitar('reporte:' + u.id, 30, 3600 * 1000);
    if (espera) return error(res, 429, 'Hiciste muchos reportes seguidos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    const b = await leerJSON(req);
    const tipo = tipoDeReporte(b.tipo);
    const objetivoId = limpiarTextoCorto(b.objetivoId, 60);
    if (!tipo || !objetivoId) return error(res, 400, 'Reporte inválido.');
    if (!Object.prototype.hasOwnProperty.call(MOTIVOS_REPORTE, b.motivo)) return error(res, 400, 'Elegí un motivo.');
    const obj = await objetivoDeReporte(tipo, objetivoId);
    if (!obj) return error(res, 404, 'Eso ya no existe.');
    if (obj.cuentaId === u.id) return error(res, 400, 'No podés reportarte a vos mismo.');
    try {
        await db.crearReporte({ id: 'REP-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'), tipo: tipo, objetivoId: objetivoId, objetivoNombre: obj.nombre,
            cuentaId: obj.cuentaId, motivo: b.motivo, detalle: limpiarTextoCorto(b.detalle, 300), reportanteId: u.id, reportanteNombre: limpiarTextoCorto(u.nombre, 60), fecha: Date.now() });
    } catch (e) {
        if (e && e.codigo === 'REPORTE_DUPLICADO') return error(res, 409, 'Ya reportaste esto. Nuestro equipo lo va a revisar.');
        throw e;
    }
    console.log('[reporte] ' + u.email + ' reportó ' + tipo + ' ' + objetivoId + ' (' + b.motivo + ')');
    responder(res, 200, { ok: true });
};
// Lo que ve la administración al tocar "Moderar" en una publicación o un perfil.
RUTAS['POST /api/admin/reportes/objetivo'] = async function (req, res) {
    if (!(await soloAdmin(req, res))) return;
    const b = await leerJSON(req);
    const tipo = tipoDeReporte(b.tipo) || 'publicacion';
    const objetivoId = limpiarTextoCorto(b.objetivoId, 60);
    if (!objetivoId) return error(res, 400, 'Falta qué moderar.');
    const reportes = await db.reportesDeObjetivo(tipo, objetivoId);
    let obj = await objetivoDeReporte(tipo, objetivoId);
    if (!obj && reportes.length && reportes[0].cuentaId) obj = { cuentaId: reportes[0].cuentaId, nombre: reportes[0].objetivoNombre };
    if (!obj) return error(res, 404, 'No encontramos la cuenta responsable (puede que ya no exista).');
    const cuenta = await db.usuarioPorId(obj.cuentaId);
    if (!cuenta) return error(res, 404, 'La cuenta responsable ya no existe.');
    responder(res, 200, {
        ok: true,
        objetivo: { tipo: tipo, id: objetivoId, nombre: obj.nombre },
        cuenta: resumenCuenta(cuenta),
        totalesCuenta: await db.contarReportesDeCuenta(cuenta.id),
        reportes: reportes.map(function (r) {
            return { motivo: MOTIVOS_REPORTE[r.motivo] || r.motivo, detalle: r.detalle, por: r.reportanteNombre, fecha: r.fecha, estado: r.estado, resolucion: r.resolucion };
        })
    });
};
RUTAS['POST /api/admin/reportes/descartar'] = async function (req, res) {
    const admin = await soloAdmin(req, res);
    if (!admin) return;
    const b = await leerJSON(req);
    const tipo = tipoDeReporte(b.tipo) || 'publicacion';
    await db.cerrarReportes(tipo, limpiarTextoCorto(b.objetivoId, 60), 'descartado', 'Sin medidas');
    console.log('[admin] ' + admin.email + ' descartó los reportes de ' + tipo + ' ' + b.objetivoId);
    responder(res, 200, { ok: true });
};

// ids de las cuentas de administración (el chat no les aplica el filtro de números). Solo ids, nunca emails.
let adminsCache = { t: 0, ids: [] };
RUTAS['GET /api/admins'] = async function (req, res) {
    if (Date.now() - adminsCache.t > 5 * 60 * 1000) {
        const ids = [];
        for (let i = 0; i < ADMINS.length; i++) { const u = await db.usuarioPorEmail(ADMINS[i]); if (u) ids.push(u.id); }
        adminsCache = { t: Date.now(), ids: ids };
    }
    responder(res, 200, { ok: true, ids: adminsCache.ids });
};

RUTAS['POST /api/eliminar-cuenta'] = async function (req, res) {
    const ip = seg.ipDe(req);
    const b = await leerJSON(req);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 80);
    const password = String(b.password == null ? '' : b.password).slice(0, 200);
    let usuario = null;
    let claveEmail;

    if (email) {
        // Desde la página pública: sin sesión, con email y contraseña.
        if (!password) return error(res, 400, 'Completá email y contraseña.');
        claveEmail = 'elim:' + email;
        const espera = seg.limitar('elim-ip:' + ip, 10, 15 * 60 * 1000) || seg.limitar(claveEmail, 5, 15 * 60 * 1000);
        if (espera) return error(res, 429, 'Demasiados intentos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');

        usuario = await db.usuarioPorEmail(email);
        let ok = false;
        if (usuario) ok = await seg.verificarPassword(password, usuario.passwordHash);
        else await seg.gastarTiempo(password);
        if (!ok) return error(res, 401, 'Email o contraseña incorrectos.');
    } else {
        // Desde la app: la cuenta es la de la sesión abierta (no depende de un email escrito en el celular).
        const sesion = await seg.sesionDe(req);
        usuario = sesion ? await db.usuarioPorId(sesion.usuarioId) : null;
        if (!usuario) return error(res, 401, 'Tu sesión venció. Volvé a iniciar sesión.');
        if (!password) return error(res, 400, 'Escribí tu contraseña.');
        claveEmail = 'elim:' + usuario.email;
        const espera = seg.limitar('elim-ip:' + ip, 10, 15 * 60 * 1000) || seg.limitar(claveEmail, 5, 15 * 60 * 1000);
        if (espera) return error(res, 429, 'Demasiados intentos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
        if (!(await seg.verificarPassword(password, usuario.passwordHash))) return error(res, 403, 'La contraseña es incorrecta.');
    }

    // Si pudiera borrarse estando baneada, se iría el baneo y podría volver a registrarse.
    if (baneoActivo(usuario)) return error(res, 403, 'Tu cuenta está suspendida y no se puede eliminar mientras dure la suspensión. Escribinos por el contacto que figura en la app.');
    borrarQuitadosDeNube(await db.borrarMediosSobrantes(usuario.id, []));   // sus fotos/videos en Cloudinary también se borran
    await db.eliminarUsuario(usuario.id);
    seg.olvidar(claveEmail);
    responder(res, 200, { ok: true }, { 'Set-Cookie': seg.cookieBorrar(HTTPS) });
};

// ------------------------------
// Desactivar / reactivar la cuenta (la decide su dueña/o).
// Desactivada: el perfil y las publicaciones dejan de verse para todos, nadie puede escribirle ni comprarle,
// y se cierran todas sus sesiones. Para reactivarla: iniciar sesión y confirmarlo en la app (POST /api/reactivar).
// ------------------------------
RUTAS['POST /api/desactivar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('desact:' + u.id, 10, 15 * 60 * 1000);
    if (espera) return error(res, 429, 'Demasiados intentos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    const b = await leerJSON(req);
    const ok = await seg.verificarPassword(String(b.password == null ? '' : b.password).slice(0, 200), u.passwordHash);
    if (!ok) return error(res, 401, 'La contraseña es incorrecta.');
    await db.fijarDesactivada(u.id, Date.now());
    await db.borrarSesionesDeUsuario(u.id);
    console.log('[cuenta] ' + u.email + ' desactivó su cuenta');
    responder(res, 200, { ok: true }, { 'Set-Cookie': seg.cookieBorrar(HTTPS) });
};

RUTAS['POST /api/reactivar'] = async function (req, res) {
    const s = await seg.sesionDe(req);   // acá no sirve usuarioDeSesion: una cuenta desactivada tiene que poder reactivarse
    const u = s ? await db.usuarioPorId(s.usuarioId) : null;
    if (!u || baneoActivo(u)) return error(res, 401, 'No iniciaste sesión.');
    if (u.desactivada) {
        await db.fijarDesactivada(u.id, null);
        console.log('[cuenta] ' + u.email + ' reactivó su cuenta');
    }
    responder(res, 200, { ok: true });
};

// ------------------------------
// Perfiles públicos: foto, bio, posts del portafolio y datos de tienda. Los ve cualquiera, de cualquier país.
// ------------------------------
const MAX_MEDIOS_PERFIL = 40;
const MAX_POSTS_PERFIL = 60;
// Recorre lo que manda la app: recorta textos y manda las fotos/videos en base64 a guardarse aparte.
async function limpiarPerfil(valor, usuarioId, cuenta, prof) {
    if (prof > 8) return null;
    if (typeof valor === 'string') {
        if (valor.indexOf('data:') === 0 || REGEX_URL_MEDIO.test(valor) || (REGEX_URL_NUBE && REGEX_URL_NUBE.test(valor))) {
            return await guardarMedioDesde(valor, usuarioId, cuenta);
        }
        return valor.slice(0, 5000);
    }
    if (typeof valor === 'number') return isFinite(valor) ? valor : null;
    if (typeof valor === 'boolean' || valor === null) return valor;
    if (Array.isArray(valor)) {
        const salida = [];
        for (const x of valor.slice(0, 200)) salida.push(await limpiarPerfil(x, usuarioId, cuenta, prof + 1));
        return salida;
    }
    if (valor && typeof valor === 'object') {
        const salida = {};
        for (const k of Object.keys(valor).slice(0, 60)) {
            if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
            salida[k.slice(0, 60)] = await limpiarPerfil(valor[k], usuarioId, cuenta, prof + 1);
        }
        return salida;
    }
    return null;
}

RUTAS['POST /api/perfil/guardar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('perfil:' + u.id, 60, 3600 * 1000);
    if (espera) return error(res, 429, 'Demasiados cambios seguidos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    const b = await leerJSON(req, 40 * 1024 * 1024);
    const e = b.perfil;
    if (!e || typeof e !== 'object' || Array.isArray(e)) return error(res, 400, 'Perfil inválido.');

    const priv = e.privacidad && typeof e.privacidad === 'object' ? e.privacidad : {};
    const base = {
        apodo: e.apodo, bio: e.bio, bioTrabajo: e.bioTrabajo, foto: e.foto,
        portafolio: Array.isArray(e.portafolio) ? e.portafolio.slice(0, MAX_POSTS_PERFIL) : [],
        tiendas: e.tiendas && typeof e.tiendas === 'object' && !Array.isArray(e.tiendas) ? e.tiendas : {},
        privacidad: { verPerfil: String(priv.verPerfil || 'todos').slice(0, 20), verTienda: String(priv.verTienda || '').slice(0, 20) }
    };
    let perfil;
    try {
        perfil = await limpiarPerfil(base, u.id, { n: 0, max: MAX_MEDIOS_PERFIL }, 0);
    } catch (x) {
        if (x && x.estado) return error(res, x.estado, x.mensaje);
        throw x;
    }
    if (JSON.stringify(perfil).length > 300 * 1024) return error(res, 413, 'Tu perfil es demasiado grande.');
    await db.guardarPerfil(u.id, perfil);
    await limpiarMedios(u.id);
    responder(res, 200, { ok: true, perfil: perfil });
};

RUTAS['GET /api/perfiles'] = async function (req, res) {
    const yo = await usuarioDeSesion(req);
    const sigo = {};     // cuentas que sigo: de esas veo los posts aunque sean privadas (como en Instagram)
    if (yo) (await db.conjuntoClavesDeValores('seguidores', [yo.id, 'T:' + yo.id])).forEach(function (c) { if (String(c).indexOf('T:') !== 0) sigo[c] = true; });
    const lista = await db.usuariosPublicos(1000);
    const perfiles = [], ocultos = [];
    lista.forEach(function (u) {
        if (baneoActivo(u) || u.desactivada) { ocultos.push(u.id); return; }
        const p = u.perfil || {};
        const priv = p.privacidad || {};
        const publico = (priv.verPerfil || 'todos') === 'todos' || !!sigo[u.id] || !!(yo && yo.id === u.id);   // si la cuenta es privada, sus posts solo los reciben quienes la siguen (y ella misma)
        const elegir = function (propio, columna) { return propio !== undefined && propio !== null ? propio : (columna || ''); };
        perfiles.push({
            id: u.id, nombre: u.nombre, idPublico: u.idPublico, pais: u.pais || 'AR',
            apodo: elegir(p.apodo, u.apodo), foto: elegir(p.foto, u.foto), bio: elegir(p.bio, u.bio), bioTrabajo: elegir(p.bioTrabajo, u.bioTrabajo),
            verificado: esAdmin(u) || !!(u.verificacion && u.verificacion.estado === 'aprobada'),
            privacidad: { verPerfil: priv.verPerfil || 'todos', verTienda: priv.verTienda || '' },
            tiendas: p.tiendas || {},
            portafolio: publico && Array.isArray(p.portafolio) ? p.portafolio : []
        });
    });
    responder(res, 200, { ok: true, perfiles: perfiles, ocultos: ocultos });
};

// ------------------------------
// Publicaciones (compartidas entre todos los usuarios del mismo país)
// ------------------------------
const MAX_MEDIO = 6 * 1024 * 1024;          // por foto o video
const MAX_MEDIOS_POR_PUBLICACION = 10;
const MAX_PUBLICACIONES_POR_USUARIO = 200;
const REGEX_DATA_URL = /^data:((?:image\/(?:png|jpeg|webp|gif))|(?:video\/(?:mp4|webm|quicktime)));base64,([A-Za-z0-9+\/=]+)$/;
const REGEX_URL_MEDIO = /^\/api\/medio\/([a-f0-9]{24})$/;

// Freno de seguridad del espacio: la base gratis (Neon) tiene 0,5 GB y al llenarse se pausa TODA la app (también el login).
// Por eso, al pasar LIMITE_ALMACEN_MB (por defecto 350) ya no se aceptan fotos/videos nuevos; todo lo demás sigue andando.
const LIMITE_ALMACEN_MB = Number(process.env.LIMITE_ALMACEN_MB || 350);
let tamanoCache = { t: 0, bytes: 0 };
async function tamanoAlmacen() {
    if (Date.now() - tamanoCache.t > 60 * 1000) {
        try { tamanoCache = { t: Date.now(), bytes: await db.tamanoBytes() }; }
        catch (e) { console.error('No se pudo medir el espacio de la base:', e.message); tamanoCache.t = Date.now(); }
    }
    return tamanoCache.bytes;
}
async function almacenLleno() { return (await tamanoAlmacen()) > LIMITE_ALMACEN_MB * 1024 * 1024; }

// ---- Cloudinary (fotos y videos fuera de la base) ----
// Variables en Render: CLOUDINARY_URL (la que muestra el panel de Cloudinary, con forma cloudinary://clave:secreto@nombre)
// o por separado CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET.
// Sin eso, las fotos/videos se guardan en la base como antes (con el freno de espacio de arriba).
// Las fotos del documento de identidad NUNCA van a Cloudinary: son privadas y quedan en la base hasta que se revisan.
function leerConfigNube() {
    let nombre = process.env.CLOUDINARY_CLOUD_NAME, clave = process.env.CLOUDINARY_API_KEY, secreto = process.env.CLOUDINARY_API_SECRET;
    if (process.env.CLOUDINARY_URL) {
        try {
            const u = new URL(process.env.CLOUDINARY_URL.trim());
            nombre = nombre || u.hostname; clave = clave || decodeURIComponent(u.username); secreto = secreto || decodeURIComponent(u.password);
        } catch (e) { console.error('CLOUDINARY_URL no tiene el formato cloudinary://clave:secreto@nombre'); }
    }
    return nombre && clave && secreto ? { nombre: String(nombre).trim(), clave: String(clave).trim(), secreto: String(secreto).trim() } : null;
}
const NUBE = leerConfigNube();
const NUBE_API = process.env.CLOUDINARY_API_BASE || 'https://api.cloudinary.com/v1_1';
const REGEX_URL_NUBE = NUBE ? new RegExp('^https://res\\.cloudinary\\.com/' + NUBE.nombre.replace(/[^a-zA-Z0-9_-]/g, '') + '/(?:image|video)/upload/(?:v\\d+/)?nivan/([a-f0-9]{24})(?:\\.[a-z0-9]+)?$') : null;
function firmarNube(params) {
    const texto = Object.keys(params).sort().map(function (k) { return k + '=' + params[k]; }).join('&');
    return crypto.createHash('sha1').update(texto + NUBE.secreto).digest('hex');
}
function tipoRecursoNube(mime) { return String(mime).indexOf('video/') === 0 ? 'video' : 'image'; }
async function pedirANube(recurso, accion, params, extraForm) {
    params.timestamp = Math.floor(Date.now() / 1000);
    const fd = new FormData();
    Object.keys(extraForm || {}).forEach(function (k) { fd.append(k, extraForm[k]); });
    Object.keys(params).forEach(function (k) { fd.append(k, String(params[k])); });
    fd.append('api_key', NUBE.clave);
    fd.append('signature', firmarNube(params));
    const r = await fetch(NUBE_API + '/' + NUBE.nombre + '/' + recurso + '/' + accion, { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) });
    const j = await r.json().catch(function () { return {}; });
    return { ok: r.ok, estado: r.status, json: j };
}
async function subirANube(id, mime, b64) {
    try {
        const r = await pedirANube(tipoRecursoNube(mime), 'upload', { public_id: 'nivan/' + id }, { file: 'data:' + mime + ';base64,' + b64 });
        if (!r.ok || !r.json.secure_url) { console.error('[nube] Cloudinary respondió', r.estado, JSON.stringify(r.json).slice(0, 300)); return null; }
        return String(r.json.secure_url);
    } catch (e) { console.error('[nube] No se pudo subir a Cloudinary:', e.message); return null; }
}
async function borrarDeNube(id, mime) {
    if (!NUBE) return;
    try {
        const r = await pedirANube(tipoRecursoNube(mime), 'destroy', { public_id: 'nivan/' + id });
        if (!r.ok) console.error('[nube] No se pudo borrar', id, r.estado, JSON.stringify(r.json).slice(0, 200));
    } catch (e) { console.error('[nube] No se pudo borrar', id + ':', e.message); }
}
// Borra de Cloudinary lo que ya no usa ninguna publicación (sin hacer esperar a la persona).
function borrarQuitadosDeNube(quitados) {
    (quitados || []).forEach(function (m) { if (m.enNube) borrarDeNube(m.id, m.tipo); });
}

// Si es una foto/video en base64, la guarda aparte y devuelve su dirección.
async function guardarMedioDesde(src, usuarioId, cuenta) {
    if (typeof src !== 'string' || !src) return '';
    if (REGEX_URL_MEDIO.test(src)) return src;
    if (REGEX_URL_NUBE && REGEX_URL_NUBE.test(src)) return src;
    const m = REGEX_DATA_URL.exec(src);
    if (!m) return '';                                        // otra cosa (URL externa, texto): se descarta
    if (++cuenta.n > (cuenta.max || MAX_MEDIOS_POR_PUBLICACION)) return '';
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > MAX_MEDIO || bytes.length === 0) return '';
    const id = crypto.randomBytes(12).toString('hex');
    if (NUBE) {
        const url = await subirANube(id, m[1], m[2]);
        if (url && REGEX_URL_NUBE.test(url)) {
            await db.guardarMedio({ id: id, usuarioId: usuarioId, tipo: m[1], b64: '', creado: Date.now() });   // registro vacío: sirve para saber de quién es y borrarlo después
            return url;
        }
        console.error('[nube] Se guarda en la base como respaldo.');
    }
    if (await almacenLleno()) {
        console.error('[almacenamiento] Base casi llena (límite ' + LIMITE_ALMACEN_MB + ' MB): se rechazó una foto/video.');
        throw { estado: 507, mensaje: 'Por ahora no se pueden subir más fotos o videos. Probá de nuevo más tarde.' };
    }
    await db.guardarMedio({ id: id, usuarioId: usuarioId, tipo: m[1], b64: m[2], creado: Date.now() });
    return '/api/medio/' + id;
}
function idsDeMedios(pub) {
    const ids = [];
    const ver = function (s) {
        if (typeof s !== 'string') return;
        const a = REGEX_URL_MEDIO.exec(s), b = REGEX_URL_NUBE && REGEX_URL_NUBE.exec(s);
        if (a) ids.push(a[1]); else if (b) ids.push(b[1]);
    };
    ver(pub.datos && pub.datos.imagen);
    ((pub.datos && pub.datos.medios) || []).forEach(function (x) { ver(x && x.src); });
    return ids;
}
function idsDeMediosEn(valor, usados, prof) {
    if (prof > 8 || valor == null) return;
    if (typeof valor === 'string') {
        const a = REGEX_URL_MEDIO.exec(valor), b = REGEX_URL_NUBE && REGEX_URL_NUBE.exec(valor);
        if (a) usados.push(a[1]); else if (b) usados.push(b[1]);
    } else if (Array.isArray(valor)) valor.forEach(function (x) { idsDeMediosEn(x, usados, prof + 1); });
    else if (typeof valor === 'object') Object.keys(valor).forEach(function (k) { idsDeMediosEn(valor[k], usados, prof + 1); });
}
async function limpiarMedios(usuarioId) {
    const todas = await db.publicacionesDeUsuario(usuarioId);
    const usados = [];
    todas.forEach(function (p) { idsDeMedios(p).forEach(function (i) { usados.push(i); }); });
    const dueno = await db.usuarioPorId(usuarioId);
    if (dueno && dueno.perfil) idsDeMediosEn(dueno.perfil, usados, 0);     // las fotos del perfil y de sus posts no se borran
    borrarQuitadosDeNube(await db.borrarMediosSobrantes(usuarioId, usados));
}

RUTAS['GET /api/publicaciones'] = async function (req, res) {
    const url = new URL(req.url, 'http://localhost');
    // Sin ?pais= se devuelven las publicaciones de todos los países (así las ve cualquier persona).
    const pedido = url.searchParams.get('pais');
    const pais = pedido === 'UY' || pedido === 'AR' ? pedido : null;
    const u = await usuarioDeSesion(req);
    const baneados = new Set(await db.idsBaneados());
    const todas = (await db.publicacionesPorPais(pais, u ? u.id : '', 600)).filter(function (f) { return !baneados.has(f.vendedorId); });
    // Las publicaciones de cuentas sin identidad aprobada no se muestran a los demás (cada persona sí ve las suyas).
    const noHab = await vendedoresNoHabilitados(todas.map(function (f) { return f.vendedorId; }));
    const filas = todas.filter(function (f) { return (u && f.vendedorId === u.id) || !noHab.has(f.vendedorId); });
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

    const sinVender = restriccionActiva(u);
    if (sinVender && restriccionPublica(u).vender) return error(res, 403, textoRestriccion(sinVender, 'vender'));
    const estadoVerif = esAdmin(u) ? 'aprobada' : (u.verificacion && u.verificacion.estado);
    if (estadoVerif === 'pendiente') return error(res, 403, 'Tu documentación está pendiente de revisión. Vas a poder vender cuando la aprobemos.');
    if (estadoVerif !== 'aprobada') return error(res, 403, 'Primero enviá tu documentación para poder vender.');

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

// ------------------------------
// Pedidos (compras y ventas)
// ------------------------------
// El servidor es quien crea los pedidos: revisa la sesión, que la identidad esté APROBADA, que no haya
// suspensión para comprar y toma nombre y precio de cada publicación (lo que manda el celular no se cree).
// Después solo deja cambiar lo que le corresponde a cada parte (comprador o vendedor).
const CAMPOS_EDITABLES_PEDIDO = ['estado', 'historial', 'aceptado', 'seguimiento', 'cancelacion', 'reclamo', 'calificacionVendedor'];
const DIAS_RECLAMO = 10;
const MAX_ITEMS_PEDIDO = 50;

function estable(v) {   // JSON con las claves ordenadas (PostgreSQL no conserva el orden de las claves)
    if (Array.isArray(v)) return '[' + v.map(estable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + estable(v[k]); }).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
}
function iguales(a, b) { return estable(a) === estable(b); }
function txt(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
function identidadAprobada(u) { return esAdmin(u) || !!(u.verificacion && u.verificacion.estado === 'aprobada'); }
function puedeReclamar(u) { return identidadAprobada(u) && !(u.verificacion && u.verificacion.bloqueoReclamos && !esAdmin(u)); }

function precioDePublicacion(d, cantidad) {
    let precio = Number(d.precio);
    if (Array.isArray(d.tramosPrecioMayor)) {
        d.tramosPrecioMayor.forEach(function (t) { if (cantidad >= Number(t.cantidadMinima)) precio = Number(t.precio); });
    }
    return precio;
}

RUTAS['POST /api/pedidos/crear'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'Iniciá sesión para comprar.');
    const espera = seg.limitar('ped:' + u.id, 30, 3600 * 1000);
    if (espera) return error(res, 429, 'Hiciste muchas compras seguidas. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');

    const sinComprar = restriccionActiva(u);
    if (sinComprar && restriccionPublica(u).comprar) return error(res, 403, textoRestriccion(sinComprar, 'comprar'));
    const estadoVerif = esAdmin(u) ? 'aprobada' : (u.verificacion && u.verificacion.estado);
    if (estadoVerif === 'pendiente') return error(res, 403, 'Tu documentación está pendiente de revisión. Vas a poder comprar cuando la aprobemos.');
    if (estadoVerif !== 'aprobada') return error(res, 403, 'Primero enviá tu documentación para poder comprar.');

    const b = await leerJSON(req, 200 * 1024);
    const d = b.datos && typeof b.datos === 'object' ? b.datos : {};
    const comp = {
        nombre: txt(d.nombre, 80), email: txt(d.email, 60).toLowerCase(), telefono: txt(d.telefono, 30), direccion: txt(d.direccion, 120),
        ciudad: txt(d.ciudad, 60), codigoPostal: txt(d.codigoPostal, 12), envio: txt(d.envio, 60), pago: txt(d.pago, 60)
    };
    if (Object.keys(comp).some(function (k) { return !comp[k]; })) return error(res, 400, 'Completá todos los datos de la compra.');
    if (!emailValido(comp.email)) return error(res, 400, 'Ingresá un email válido.');
    const pais = b.pais === 'UY' ? 'UY' : 'AR';

    const entrada = Array.isArray(b.items) ? b.items : [];
    if (!entrada.length || entrada.length > MAX_ITEMS_PEDIDO) return error(res, 400, 'El carrito está vacío o tiene demasiados productos.');

    const baneados = new Set(await db.idsBaneados());
    const noHab = await vendedoresNoHabilitados(entrada.map(function (it) { return it && it.vendedorId ? String(it.vendedorId).slice(0, 60) : ''; }));
    const grupos = [];
    for (const it of entrada) {
        if (!it || typeof it !== 'object') return error(res, 400, 'Producto inválido.');
        const cantidad = Math.floor(Number(it.cantidad)) || 1;
        if (cantidad < 1 || cantidad > 1000) return error(res, 400, 'Cantidad inválida.');
        const vendedorId = it.vendedorId ? String(it.vendedorId).slice(0, 60) : '';
        let nombre, precioUnitario;
        if (vendedorId) {
            const pub = await db.publicacionPorId(String(it.id == null ? '' : it.id).slice(0, 40));
            if (!pub || pub.vendedorId !== vendedorId || !pub.activo || baneados.has(vendedorId) || noHab.has(vendedorId)) return error(res, 409, 'Una de las publicaciones ya no está disponible.');
            if (pub.pais !== pais) return error(res, 409, 'Una de las publicaciones es de otro país.');
            nombre = txt(pub.datos.nombre, 120);
            precioUnitario = precioDePublicacion(pub.datos, cantidad);
        } else {   // producto del catálogo base: no hay vendedor ni publicación en el servidor
            nombre = txt(it.nombre, 120);
            precioUnitario = Number(it.precioUnitario != null ? it.precioUnitario : it.precio);
        }
        if (!nombre || !isFinite(precioUnitario) || precioUnitario < 0 || precioUnitario > 1e9) return error(res, 400, 'Producto inválido.');
        let g = grupos.find(function (x) { return x.vendedorId === vendedorId; });
        if (!g) { g = { vendedorId: vendedorId, vendedorNombre: txt(it.vendedorNombre, 80), items: [] }; grupos.push(g); }
        g.items.push({ id: it.id, nombre: nombre, cantidad: cantidad, precioUnitario: precioUnitario, talle: txt(it.talle, 40), color: txt(it.color, 40) });
    }
    for (const g of grupos) {
        if (g.vendedorId && !g.vendedorNombre) { const v = await db.usuarioPorId(g.vendedorId); g.vendedorNombre = v ? (v.nombreTienda || v.nombre) : 'Vendedor'; }
    }

    // Cupón: el descuento lo calcula el servidor con las reglas reales del cupón. Lo que mande la app (monto, tienda) no cuenta.
    let cuponAplicado = null, cuponGastado = null;
    if (b.cupon && typeof b.cupon === 'object' && b.cupon.codigo) {
        const c = (await db.cuponesPorCodigo(normalizarCodigoCupon(b.cupon.codigo))).find(cuponUsableServidor);
        if (!c) return error(res, 409, 'Ese cupón ya no está disponible.');
        if (!(await puedeUsarCuponServidor(c, u))) return error(res, 403, 'No estás habilitado para usar este cupón.');
        const g = grupos.find(function (x) { return x.vendedorId === c.vendedorId; });
        const enAlcance = g ? g.items.filter(function (it) { return !c.datos.productoId || String(it.id) === String(c.datos.productoId); }) : [];
        const base = enAlcance.reduce(function (a, it) { return a + it.precioUnitario * it.cantidad; }, 0);
        if (!g || base <= 0) return error(res, 409, 'El cupón no aplica a los productos de tu carrito.');
        const bruto = c.datos.tipo === 'porcentaje' ? base * (Number(c.datos.valor) / 100) : Math.min(Number(c.datos.valor), base);
        cuponAplicado = { id: c.id, codigo: c.codigo, vendedorId: c.vendedorId, descuento: Math.max(0, Math.min(Math.round(bruto), base)) };
    }

    let numero;
    for (let n = 0; n < 5; n++) {
        const c = 'NV-' + new Date().getFullYear() + '-' + (100000 + crypto.randomInt(900000));
        if (!(await db.pedidoPorId(c)) && !(await db.pedidoPorId(c + '-1'))) { numero = c; break; }
    }
    if (!numero) return error(res, 500, 'No se pudo generar el número de pedido. Probá de nuevo.');

    const ahora = Date.now();
    const filas = grupos.map(function (g, i) {
        const subtotal = g.items.reduce(function (a, it) { return a + it.precioUnitario * it.cantidad; }, 0);
        const aplica = !!(cuponAplicado && cuponAplicado.vendedorId === g.vendedorId);
        const descuento = aplica ? Math.min(cuponAplicado.descuento, subtotal) : 0;
        const id = grupos.length > 1 ? numero + '-' + (i + 1) : numero;
        const pedido = {
            id: id, numeroPedido: numero, compradorId: u.id, compradorNombre: comp.nombre, compradorEmail: comp.email, compradorTelefono: comp.telefono,
            vendedorId: g.vendedorId || null, vendedorNombre: g.vendedorNombre, envio: comp.envio, pago: comp.pago,
            direccion: comp.direccion, ciudad: comp.ciudad, codigoPostal: comp.codigoPostal, items: g.items, subtotal: subtotal,
            cupon: aplica ? { codigo: cuponAplicado.codigo, descuento: descuento } : null, total: Math.max(0, subtotal - descuento),
            pais: pais, fecha: ahora, estado: 'pendiente', historial: [{ estado: 'pendiente', fecha: ahora }]
        };
        return { id: id, compradorId: u.id, vendedorId: g.vendedorId || null, pais: pais, datos: pedido, creado: ahora, actualizado: ahora };
    });
    // Se gasta un uso del cupón justo antes de crear el pedido (si dos personas lo piden a la vez, solo una se lleva el último uso).
    if (cuponAplicado) {
        if (!(await db.cuponUsar(cuponAplicado.id))) return error(res, 409, 'Ese cupón se agotó recién. Quitalo del carrito y volvé a intentar.');
        cuponGastado = cuponAplicado.id;
    }
    try {
        await db.crearPedidos(filas);
    } catch (e) {
        if (cuponGastado) await db.cuponDevolverUso(cuponGastado);
        throw e;
    }
    responder(res, 200, { ok: true, numeroPedido: numero, pedidos: filas.map(function (f) { return f.datos; }) });
};

RUTAS['GET /api/pedidos'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const filas = await db.pedidosDeUsuario(u.id, 500);
    responder(res, 200, { ok: true, pedidos: filas.map(function (f) { return f.datos; }) });
};

// Devuelve un texto con el motivo si el cambio no está permitido, o '' si está bien.
function validarCambioPedido(prev, nuevo, u) {
    if (!nuevo || typeof nuevo !== 'object' || Array.isArray(nuevo)) return 'Pedido inválido.';
    const soyComprador = prev.compradorId === u.id;
    const soyVendedor = !!prev.vendedorId && prev.vendedorId === u.id;
    if (!soyComprador && !soyVendedor) return 'Ese pedido no es tuyo.';

    // Todo lo que no sea estado, seguimiento o reclamo queda fijo (precios, productos, personas, fechas).
    const claves = new Set(Object.keys(prev).concat(Object.keys(nuevo)));
    for (const k of claves) {
        if (CAMPOS_EDITABLES_PEDIDO.indexOf(k) >= 0) continue;
        if (!iguales(prev[k], nuevo[k])) return 'No se puede cambiar "' + k + '" de un pedido.';
    }

    const h0 = Array.isArray(prev.historial) ? prev.historial : [], h1 = nuevo.historial;
    if (!Array.isArray(h1) || h1.length < h0.length || h1.length - h0.length > 3 || !iguales(h1.slice(0, h0.length), h0)) return 'El historial de un pedido solo se puede ampliar.';

    // Estado
    const e0 = prev.estado, e1 = nuevo.estado;
    if (e0 !== e1) {
        const DE_VENDEDOR = { pendiente: ['preparando', 'enviado', 'cancelado'], preparando: ['listo', 'pendiente', 'enviado', 'cancelado'], listo: ['preparando', 'enviado', 'cancelado'] };
        let ok = false;
        if (soyVendedor && (DE_VENDEDOR[e0] || []).indexOf(e1) >= 0) {
            ok = !(e0 === 'pendiente' && e1 === 'preparando' && !prev.aceptado);
            if (e1 === 'cancelado' && !(nuevo.cancelacion && typeof nuevo.cancelacion === 'object')) ok = false;
        }
        if (!ok && soyComprador && e1 === 'entregado' && e0 !== 'entregado' && e0 !== 'cancelado' && (!prev.vendedorId || e0 === 'enviado')) ok = true;
        if (!ok) return 'Ese cambio de estado no está permitido.';
    }

    if (!iguales(prev.aceptado, nuevo.aceptado)) {
        if (!soyVendedor || prev.aceptado || prev.estado !== 'pendiente' || !(+nuevo.aceptado > 0)) return 'Solo el vendedor puede aceptar el pedido.';
    }
    if (!iguales(prev.seguimiento, nuevo.seguimiento)) {
        const s = nuevo.seguimiento;
        if (!soyVendedor || !s || typeof s !== 'object' || typeof (s.empresa || '') !== 'string' || typeof (s.codigo || '') !== 'string' || (s.empresa || '').length > 30 || (s.codigo || '').length > 40) return 'Solo el vendedor puede cargar el seguimiento.';
    }
    if (!iguales(prev.cancelacion, nuevo.cancelacion)) {
        if (!soyVendedor || prev.cancelacion || e1 !== 'cancelado') return 'Solo el vendedor puede cancelar el pedido.';
    }

    if (!iguales(prev.reclamo, nuevo.reclamo)) {
        const r0 = prev.reclamo, r1 = nuevo.reclamo;
        if (!r0) {   // el comprador pide devolución o reembolso
            if (!soyComprador || !puedeReclamar(u)) return 'Para hacer un reclamo tu identidad tiene que estar aprobada.';
            if (!r1 || typeof r1 !== 'object' || r1.estado !== 'solicitado' || (r1.tipo !== 'devolucion' && r1.tipo !== 'reembolso')) return 'Reclamo inválido.';
            if (prev.estado !== 'entregado' || !prev.vendedorId) return 'Solo se puede reclamar un pedido entregado.';
            const entregado = h0.filter(function (x) { return x.estado === 'entregado'; });
            const desde = entregado.length ? entregado[entregado.length - 1].fecha : prev.fecha;
            if (Date.now() - desde > DIAS_RECLAMO * 86400000) return 'Pasó el plazo para reclamar.';
            if (txt(r1.comentario, 400).length !== String(r1.comentario || '').length) return 'El comentario es demasiado largo.';
        } else {     // el vendedor responde
            const SIG = { solicitado: ['aprobado', 'rechazado'], aprobado: ['completado'] };
            if (!soyVendedor || !r1 || typeof r1 !== 'object' || (SIG[r0.estado] || []).indexOf(r1.estado) < 0) return 'Solo el vendedor puede responder el reclamo.';
            const ks = new Set(Object.keys(r0).concat(Object.keys(r1)));
            for (const k of ks) { if (k !== 'estado' && k !== 'respuesta' && k !== 'historial' && !iguales(r0[k], r1[k])) return 'No se puede cambiar el reclamo.'; }
            if (String(r1.respuesta || '').length > 200) return 'La respuesta es demasiado larga.';
        }
    }

    if (!iguales(prev.calificacionVendedor, nuevo.calificacionVendedor)) {
        const c = nuevo.calificacionVendedor;
        if (!soyComprador || !puedeReclamar(u)) return 'Para calificar tu identidad tiene que estar aprobada.';
        if (prev.calificacionVendedor || prev.estado !== 'entregado' || !prev.vendedorId) return 'No se puede calificar este pedido.';
        if (!c || typeof c !== 'object' || !Number.isInteger(c.estrellas) || c.estrellas < 1 || c.estrellas > 5 || String(c.comentario || '').length > 500) return 'Calificación inválida.';
    }
    return '';
}

RUTAS['POST /api/pedidos/actualizar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('pedmod:' + u.id, 300, 3600 * 1000);
    if (espera) return error(res, 429, 'Demasiados cambios seguidos. Probá de nuevo en unos minutos.');
    const b = await leerJSON(req, 100 * 1024);
    const nuevo = b.pedido;
    const id = String(nuevo && nuevo.id != null ? nuevo.id : '').slice(0, 60);
    const previa = id ? await db.pedidoPorId(id) : null;
    if (!previa) return error(res, 404, 'Ese pedido no existe. Los pedidos solo se crean al comprar.');
    const motivo = validarCambioPedido(previa.datos, nuevo, u);
    if (motivo) return error(res, 403, motivo);
    previa.datos = JSON.parse(JSON.stringify(nuevo));
    previa.actualizado = Date.now();
    await db.guardarPedido(previa);
    responder(res, 200, { ok: true, pedido: previa.datos });
};

async function servirMedio(req, res, id) {
    const m = await db.medioPorId(id);
    if (!m || !m.bytes || !m.bytes.length) return error(res, 404, 'No encontrado.');
    res.writeHead(200, Object.assign({ 'Content-Type': m.tipo, 'Content-Length': m.bytes.length }, CABECERAS_SEGURIDAD,
        { 'Cache-Control': 'public, max-age=31536000, immutable' }));
    res.end(req.method === 'HEAD' ? undefined : m.bytes);
}


// ------------------------------
// Chats entre dos personas (solo texto)
// ------------------------------
// El servidor guarda los mensajes y decide quién puede qué: cada persona solo manda mensajes "de" ella misma,
// solo borra los suyos (y dentro del primer día) y solo marca como leído su propio lado.
// Lo personal (silenciar, borrar un chat solo para uno, ocultar un mensaje solo para uno) queda en cada celular.
const MAX_TEXTO_CHAT = 2000;
const MAX_MENSAJES_POR_ENVIO_CHAT = 20;
const LIMITE_ELIMINAR_PARA_TODOS = 24 * 60 * 60 * 1000;
const LADOS_CHAT = ['tienda', 'personal'];
const REGEX_ID_MENSAJE = /^M\d{10,15}-[a-z0-9]{1,12}$/;

function textoChat(v, max) { return typeof v === 'string' ? v.replace(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max) : ''; }
function numeroChat(v, min, max) { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : null; }
function idChatCanonico(vendedorId, compradorId, lados) {
    return 'CH-' + [vendedorId + ':' + lados[vendedorId], compradorId + ':' + lados[compradorId]].sort().join('|');
}

// Comprueba que el chat sea de verdad entre la persona de la sesión y otra cuenta que existe.
async function validarChatDe(u, c) {
    if (!c || typeof c !== 'object') throw { estado: 400, mensaje: 'Chat inválido.' };
    const v = String(c.vendedorId || '').slice(0, 60), co = String(c.compradorId || '').slice(0, 60);
    if (!v || !co || v === co || (u.id !== v && u.id !== co)) throw { estado: 403, mensaje: 'Ese chat no es tuyo.' };
    const l = c.lados;
    if (!l || typeof l !== 'object' || LADOS_CHAT.indexOf(l[v]) < 0 || LADOS_CHAT.indexOf(l[co]) < 0) throw { estado: 400, mensaje: 'Chat inválido.' };
    const lados = {}; lados[v] = l[v]; lados[co] = l[co];
    if (c.id !== idChatCanonico(v, co, lados)) throw { estado: 400, mensaje: 'Chat inválido.' };
    const otroId = u.id === v ? co : v;
    const otro = await db.usuarioPorId(otroId);
    if (!otro) throw { estado: 404, mensaje: 'Esa cuenta ya no existe.' };
    if (otro.desactivada) throw { estado: 404, mensaje: 'Esa cuenta no está disponible por ahora.' };
    return { id: c.id, vendedorId: v, compradorId: co, lados: lados, otroId: otroId };
}

// Arma el mensaje limpio (o dice por qué no).
async function construirMensajeChat(m, u, info, ahora) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !REGEX_ID_MENSAJE.test(m.id)) throw 'Mensaje inválido.';
    const f = Number(m.fecha);
    const fecha = Number.isFinite(f) && f > 1e12 ? Math.min(f, ahora + 5 * 60 * 1000) : ahora;
    const base = { id: m.id, fecha: fecha };
    const tipo = m.tipo == null ? 'texto' : m.tipo;
    if (tipo === 'texto') {
        const texto = textoChat(m.texto, MAX_TEXTO_CHAT).trim();
        if (!texto) throw 'Mensaje vacío.';
        return Object.assign(base, { de: u.id, texto: texto, ambito: info.lados[u.id] });
    }
    if (tipo === 'propuesta') {
        const items = (Array.isArray(m.items) ? m.items : []).slice(0, 20).map(function (it) {
            const cantidad = numeroChat(it && it.cantidad, 1, 100000);
            const prenda = textoChat(it && it.prenda, 80).trim();
            return cantidad && prenda ? { prenda: prenda, cantidad: cantidad } : null;
        }).filter(Boolean);
        if (!items.length) throw 'La propuesta no tiene prendas.';
        return Object.assign(base, {
            tipo: 'propuesta', de: u.id, ambito: info.lados[u.id], texto: textoChat(m.texto, MAX_TEXTO_CHAT), items: items,
            presupuesto: numeroChat(m.presupuesto, 0, 1e10) || 0, moneda: textoChat(m.moneda, 6), nota: textoChat(m.nota, 500)
        });
    }
    if (tipo === 'contexto') {
        const texto = textoChat(m.texto, 300).trim();
        if (!texto) throw 'Mensaje vacío.';
        return Object.assign(base, { tipo: 'contexto', texto: texto });
    }
    if (tipo === 'compra') {
        const pedido = await db.pedidoPorId(String(m.pedidoId || '').slice(0, 60));
        if (!pedido || pedido.compradorId !== u.id || pedido.vendedorId !== info.otroId) throw 'Esa compra no es tuya.';
        const items = (Array.isArray(m.items) ? m.items : []).slice(0, 30).map(function (it) {
            return { nombre: textoChat(it && it.nombre, 80), cantidad: numeroChat(it && it.cantidad, 1, 100000) || 1, talle: textoChat(it && it.talle, 20), color: textoChat(it && it.color, 30) };
        });
        return Object.assign(base, { tipo: 'compra', pedidoId: pedido.id, compradorId: u.id, items: items, total: numeroChat(m.total, 0, 1e10) || 0, moneda: textoChat(m.moneda, 6) });
    }
    throw 'Tipo de mensaje no permitido.';
}

RUTAS['POST /api/chats/enviar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('chat:' + u.id, 200, 60 * 1000);
    if (espera) return error(res, 429, 'Estás mandando mensajes demasiado rápido. Probá de nuevo en un momento.');
    const b = await leerJSON(req, 256 * 1024);
    const info = await validarChatDe(u, b.chat);
    if (await hayBloqueoEntre(u.id, info.otroId)) return error(res, 403, 'No se pudo enviar el mensaje a esta cuenta.');
    const ahora = Date.now();

    const previa = await db.chatPorId(info.id);
    const datos = previa ? previa.datos : { vendedorId: info.vendedorId, compradorId: info.compradorId, lados: info.lados, lecturas: {}, tiendaDe: null, ambitoUltimo: null, vendedorNombre: '', compradorNombre: '' };
    datos.lecturas = datos.lecturas || {};

    const aceptados = [], rechazados = [];
    let nuevos = 0, ultimaFecha = 0;
    const lista = Array.isArray(b.mensajes) ? b.mensajes.slice(0, MAX_MENSAJES_POR_ENVIO_CHAT) : [];
    for (let i = 0; i < lista.length; i++) {
        const idOriginal = lista[i] && typeof lista[i].id === 'string' ? lista[i].id.slice(0, 40) : '';
        let limpio;
        try { limpio = await construirMensajeChat(lista[i], u, info, ahora); }
        catch (e) { if (typeof e === 'string') { rechazados.push({ id: idOriginal, error: e }); continue; } throw e; }
        if (!previa && nuevos === 0 && !(await db.chatPorId(info.id))) {
            await db.guardarChat({ id: info.id, aId: info.vendedorId, bId: info.compradorId, datos: datos, actualizado: ahora });   // el chat tiene que existir antes que sus mensajes
        }
        if (await db.agregarMensaje(info.id, { id: limpio.id, fecha: limpio.fecha, modificado: ahora, datos: limpio })) nuevos++;
        aceptados.push(limpio.id);
        if (limpio.fecha > ultimaFecha) ultimaFecha = limpio.fecha;
    }

    if (aceptados.length) {
        const c = b.chat;
        if (c.tiendaDe === null || c.tiendaDe === info.vendedorId || c.tiendaDe === info.compradorId) datos.tiendaDe = c.tiendaDe;
        datos.ambitoUltimo = info.lados[u.id];
        if (!datos.vendedorNombre) datos.vendedorNombre = textoChat(c.vendedorNombre, 80);
        if (!datos.compradorNombre) datos.compradorNombre = textoChat(c.compradorNombre, 80);
        datos.lecturas[u.id] = Math.max(datos.lecturas[u.id] || 0, ultimaFecha);
        await db.guardarChat({ id: info.id, aId: info.vendedorId, bId: info.compradorId, datos: datos, actualizado: ahora });
    }
    if (nuevos > 0) avisarPush(info.otroId, '💬 Mensaje nuevo', nombreVisible(u) + ' te escribió.', 'chat:' + info.id);
    responder(res, 200, { ok: true, aceptados: aceptados, rechazados: rechazados });
};

// ------------------------------
// Reseñas de publicaciones (las ven todos, de cualquier celular)
// ------------------------------
// Solo reseña quien compró esa publicación y ya la recibió (pedido "entregado"), dentro de los 30 días desde la entrega.
// Una sola puntuación con estrellas por persona y publicación, y hasta 2 comentarios en total.
// Borrar un comentario NO devuelve el cupo (queda marcado como borrado en la base).
const PLAZO_RESENIA_MS = 30 * 86400000;
const MAX_COMENTARIOS_RESENIA = 2;
const MAX_CARACTERES_RESENIA = 250;

function reseniaPublica(x) {
    return { id: x.id, publicacionId: x.publicacionId, usuarioId: x.usuarioId, usuario: x.nombre, estrellas: x.estrellas, texto: x.texto, fecha: x.fecha };
}
function fechaEntregaPedido(d) {
    const h = (Array.isArray(d.historial) ? d.historial : []).filter(function (e) { return e && e.estado === 'entregado'; });
    return h.length ? Number(h[h.length - 1].fecha) || 0 : Number(d.fecha) || 0;
}

// ---- "Se busca": pedidos para que alguien venda en un país algo que se vio en el otro ----
// Mirar las publicaciones del otro país es solo mirar (no se compra). Quien quiere algo así en su país lo pide acá,
// y quienes venden en ese país ven cuánta gente lo busca. Varias personas que piden lo mismo se cuentan juntas.
const PAISES_BUSQUEDA = ['AR', 'UY'];
function imagenSegura(s) {
    s = String(s == null ? '' : s);
    return s.length <= 300 && (/^\/api\/medio\/[a-f0-9]{24}$/.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s)) ? s : '';
}
RUTAS['GET /api/busquedas'] = async function (req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pais = url.searchParams.get('pais');
    if (PAISES_BUSQUEDA.indexOf(pais) < 0) return error(res, 400, 'Elegí un país.');
    const u = await usuarioDeSesion(req);
    const baneados = new Set(await db.idsBaneados());
    const abiertas = (await db.busquedasAbiertas(pais, 500)).filter(function (b) { return !baneados.has(b.usuarioId); });
    const porClave = {};
    abiertas.forEach(function (b) {   // de la más nueva a la más vieja
        const k = b.refPais + ':' + b.refId;
        const g = porClave[k] || (porClave[k] = { refId: b.refId, refPais: b.refPais, nombre: b.refNombre, categoria: b.refCategoria, imagen: b.refImagen,
            cantidad: 0, notas: [], mia: false, miaId: null, ultima: b.creada });
        g.cantidad++;
        if (b.nota && g.notas.length < 3) g.notas.push({ nombre: b.nombre, nota: b.nota });
        if (u && b.usuarioId === u.id) { g.mia = true; g.miaId = b.id; }
    });
    const grupos = Object.keys(porClave).map(function (k) { return porClave[k]; })
        .sort(function (a, b) { return b.cantidad - a.cantidad || b.ultima - a.ultima; }).slice(0, 100);
    responder(res, 200, { ok: true, grupos: grupos });
};
RUTAS['POST /api/busquedas/crear'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'Iniciá sesión para pedir que alguien venda algo así.');
    const espera = seg.limitar('busq:' + u.id, 10, 24 * 3600 * 1000);
    if (espera) return error(res, 429, 'Hiciste muchos pedidos hoy. Probá de nuevo más tarde.');
    const b = await leerJSON(req);
    const pais = String(b.pais || '');
    if (PAISES_BUSQUEDA.indexOf(pais) < 0) return error(res, 400, 'Elegí un país.');
    const pubId = String(b.publicacionId == null ? '' : b.publicacionId).slice(0, 40);
    const pub = pubId ? await db.publicacionPorId(pubId) : null;
    if (!pub || !pub.activo) return error(res, 404, 'Esa publicación ya no está disponible.');
    if (pub.pais === pais) return error(res, 400, 'Eso ya se vende en tu país: lo ves en el catálogo.');
    const baneados = new Set(await db.idsBaneados());
    const noHab = await vendedoresNoHabilitados([pub.vendedorId]);
    if (baneados.has(pub.vendedorId) || noHab.has(pub.vendedorId)) return error(res, 404, 'Esa publicación ya no está disponible.');
    if (await db.busquedaAbiertaDe(u.id, pub.id, pais)) return error(res, 409, 'Ya pediste algo así: quienes venden en tu país ya lo ven.');
    const d = pub.datos || {};
    const x = { id: 'BUS-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'), usuarioId: u.id, nombre: limpiarTextoCorto(u.nombre, 60) || 'Alguien',
        pais: pais, refId: pub.id, refPais: pub.pais, refNombre: limpiarTextoCorto(d.nombre, 80), refCategoria: limpiarTextoCorto(d.categoria, 40),
        refImagen: imagenSegura(d.imagen), nota: limpiarTextoCorto(b.nota, 200), creada: Date.now() };
    await db.crearBusqueda(x);
    responder(res, 200, { ok: true, id: x.id });
};
RUTAS['POST /api/busquedas/cerrar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'Iniciá sesión.');
    const b = await leerJSON(req);
    const x = await db.busquedaPorId(String(b.id == null ? '' : b.id).slice(0, 60));
    if (!x || x.cerrada) return error(res, 404, 'Ese pedido ya no existe.');
    if (x.usuarioId !== u.id) return error(res, 403, 'Ese pedido no es tuyo.');
    await db.cerrarBusqueda(x.id, Date.now());
    responder(res, 200, { ok: true });
};

RUTAS['GET /api/resenias'] = async function (req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pedido = url.searchParams.get('pais');
    const pais = pedido === 'UY' || pedido === 'AR' ? pedido : null;
    const lista = await db.reseniasPublicas(pais, 5000);
    responder(res, 200, { ok: true, resenias: lista.map(reseniaPublica) });
};

RUTAS['POST /api/resenias/crear'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'Iniciá sesión para dejar una reseña.');
    const espera = seg.limitar('resenia:' + u.id, 20, 3600 * 1000);
    if (espera) return error(res, 429, 'Dejaste muchas reseñas seguidas. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    if (!puedeReclamar(u)) return error(res, 403, 'Tu identidad tiene que estar aprobada para dejar reseñas.');
    const b = await leerJSON(req);

    const pubId = String(b.publicacionId == null ? '' : b.publicacionId).slice(0, 40);
    const pub = pubId ? await db.publicacionPorId(pubId) : null;
    if (!pub) return error(res, 404, 'Esa publicación ya no existe.');
    if (pub.vendedorId === u.id) return error(res, 403, 'No podés puntuar tus propias publicaciones.');

    const texto = textoChat(b.texto, MAX_CARACTERES_RESENIA).trim();
    if (!texto) return error(res, 400, 'Escribí tu opinión antes de enviarla.');
    let estrellas = Math.floor(Number(b.estrellas) || 0);
    if (estrellas < 0 || estrellas > 5) return error(res, 400, 'Cantidad de estrellas inválida.');

    const pedidos = (await db.pedidosDeUsuario(u.id, 500)).filter(function (f) {
        return f.compradorId === u.id && f.datos && Array.isArray(f.datos.items) && f.datos.items.some(function (it) { return String(it.id) === pubId; });
    });
    if (!pedidos.length) return error(res, 403, 'Solo pueden puntuar quienes compraron esta prenda y ya la recibieron. Podés hacer preguntas al vendedor.');
    const entregados = pedidos.filter(function (f) { return f.datos.estado === 'entregado'; });
    if (!entregados.length) return error(res, 403, 'Tu pedido todavía no llegó. Cuando confirmes que lo recibiste vas a poder puntuar.');
    const entrega = Math.min(Date.now(), Math.max.apply(null, entregados.map(function (f) { return fechaEntregaPedido(f.datos); })));   // una fecha futura no alarga el plazo
    if (Date.now() - entrega > PLAZO_RESENIA_MS) return error(res, 403, 'Pasaron 30 días desde que recibiste la prenda y ya no se puede puntuar. Solo podés hacer preguntas al vendedor.');

    const previas = await db.reseniasDeUsuarioEn(pubId, u.id);   // incluye las borradas: borrar no devuelve el cupo
    if (previas.length >= MAX_COMENTARIOS_RESENIA) return error(res, 403, 'Ya usaste tus ' + MAX_COMENTARIOS_RESENIA + ' comentarios en esta publicación. Ahora solo podés hacer preguntas al vendedor.');
    const yaPuntuo = previas.some(function (x) { return x.estrellas > 0; });
    if (yaPuntuo) estrellas = 0;
    else if (estrellas === 0) return error(res, 400, 'Elegí una cantidad de estrellas antes de enviar.');

    const nombre = String((u.perfil && u.perfil.apodo) || u.apodo || u.nombre || 'Cliente').replace(/[<>]/g, '').slice(0, 60);
    const x = { id: 'RS-' + crypto.randomBytes(8).toString('hex'), publicacionId: pubId, usuarioId: u.id, nombre: nombre, estrellas: estrellas, texto: texto, fecha: Date.now() };
    await db.crearResenia(x);
    responder(res, 200, { ok: true, resenia: reseniaPublica(x) });
};

RUTAS['POST /api/resenias/eliminar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req);
    const x = await db.reseniaPorId(String(b.id || '').slice(0, 40));
    if (!x || x.usuarioId !== u.id) return error(res, 404, 'No se encontró ese comentario.');
    if (!x.borrada) await db.borrarResenia(x.id, Date.now());
    responder(res, 200, { ok: true });
};

RUTAS['POST /api/chats/eliminar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req);
    const chat = await db.chatPorId(String(b.chatId || '').slice(0, 200));
    if (!chat || (chat.aId !== u.id && chat.bId !== u.id)) return error(res, 404, 'No encontrado.');
    const m = await db.mensajePorId(chat.id, String(b.mensajeId || '').slice(0, 40));
    if (!m) return error(res, 404, 'No encontrado.');
    if (m.datos.de !== u.id) return error(res, 403, 'Solo podés eliminar tus propios mensajes.');
    if (Date.now() - m.fecha > LIMITE_ELIMINAR_PARA_TODOS) return error(res, 400, 'Ya pasó más de un día: solo podés eliminarlo para vos.');
    await db.actualizarMensaje(chat.id, m.id, Object.assign({}, m.datos, { eliminado: true, texto: '' }), Date.now());
    responder(res, 200, { ok: true });
};

RUTAS['POST /api/chats/leido'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req);
    const chat = await db.chatPorId(String(b.chatId || '').slice(0, 200));
    if (!chat || (chat.aId !== u.id && chat.bId !== u.id)) return error(res, 404, 'No encontrado.');
    const hasta = numeroChat(b.hasta, 1e12, Date.now() + 5 * 60 * 1000);
    if (hasta === null) return error(res, 400, 'Fecha inválida.');
    const datos = chat.datos; datos.lecturas = datos.lecturas || {};
    if (hasta > (datos.lecturas[u.id] || 0)) {
        datos.lecturas[u.id] = hasta;
        await db.guardarChat({ id: chat.id, aId: chat.aId, bId: chat.bId, datos: datos, actualizado: Date.now() });
    }
    responder(res, 200, { ok: true });
};

// Todo lo que cambió en mis chats desde "desde" (la hora del servidor que devolvió la vez anterior).
RUTAS['GET /api/chats'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const url = new URL(req.url, 'http://localhost');
    const desde = Math.max(0, Number(url.searchParams.get('desde')) || 0);
    const ahora = Date.now();
    const chats = await db.chatsDeUsuarioDesde(u.id, desde, 500);
    const mensajes = await db.mensajesDeUsuarioDesde(u.id, desde, 1000);
    let cursor = ahora - 3000;      // 3 segundos de margen: si algo llegó justo al mismo tiempo, se vuelve a pedir (no se duplica)
    if (mensajes.length >= 1000) cursor = Math.min(cursor, mensajes[mensajes.length - 1].modificado);
    if (chats.length >= 500) cursor = Math.min(cursor, chats[chats.length - 1].actualizado);
    const hayMas = cursor < ahora - 3000 && cursor > desde;
    if (cursor <= desde && !hayMas) cursor = Math.max(desde, ahora - 3000);
    responder(res, 200, {
        ok: true, cursor: cursor, hayMas: hayMas,
        chats: chats.map(function (c) {
            const d = c.datos;
            return { id: c.id, vendedorId: d.vendedorId, compradorId: d.compradorId, lados: d.lados, tiendaDe: d.tiendaDe || null, ambitoUltimo: d.ambitoUltimo || null,
                lecturas: d.lecturas || {}, vendedorNombre: d.vendedorNombre || '', compradorNombre: d.compradorNombre || '' };
        }),
        mensajes: mensajes.map(function (m) { return Object.assign({ chatId: m.chatId }, m.datos); })
    });
};

// ------------------------------
// Conjuntos: quién sigue a qué cuenta y a quién le gusta cada post. Cada persona solo cambia lo suyo.
// ------------------------------
const COLECCIONES_CONJUNTO = { seguidores: true, likes: true, bloqueos: true };

// Bloqueo de ida y vuelta: si cualquiera de las dos personas bloqueó a la otra, no pueden escribirse, comentar, preguntar ni seguirse.
async function hayBloqueoEntre(a, b) {
    if (!a || !b) return false;
    return (await db.conjuntoTiene('bloqueos', a, b)) || (await db.conjuntoTiene('bloqueos', b, a));
}
function duenoDeClaveCuenta(clave) { return String(clave).indexOf('T:') === 0 ? String(clave).slice(2) : String(clave); }

RUTAS['POST /api/conjuntos/cambiar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('conj:' + u.id, 600, 3600 * 1000);
    if (espera) return error(res, 429, 'Demasiados cambios seguidos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    const b = await leerJSON(req);
    const coleccion = String(b.coleccion || '');
    if (!COLECCIONES_CONJUNTO[coleccion]) return error(res, 400, 'Colección inválida.');
    const cambios = Array.isArray(b.cambios) ? b.cambios.slice(0, 100) : [];
    let aplicados = 0, rechazados = 0;
    for (const c of cambios) {
        const accion = c && c.accion, clave = c && typeof c.clave === 'string' ? c.clave : '', valor = c && typeof c.valor === 'string' ? c.valor : '';
        if ((accion !== 'agregar' && accion !== 'quitar') || !clave || !valor || clave.length > 120 || valor.length > 120) { rechazados++; continue; }
        let permitido = false;
        if (coleccion === 'likes') {
            permitido = valor === u.id;
        } else if (coleccion === 'bloqueos') {
            // clave = quien bloquea (siempre yo), valor = a quién bloqueo. Quitar el bloqueo también es solo mío.
            permitido = clave === u.id && valor !== u.id && (accion === 'quitar' || !!(await db.usuarioPorId(valor)));
        } else {
            const duenoValor = duenoDeClaveCuenta(valor), duenoClave = duenoDeClaveCuenta(clave);
            if (accion === 'agregar') permitido = duenoValor === u.id && duenoClave !== u.id && !!(await db.usuarioPorId(duenoClave)) && !(await hayBloqueoEntre(u.id, duenoClave));
            else permitido = duenoValor === u.id || duenoClave === u.id;      // seguirse a uno mismo no; quitar: el que sigue o el seguido
        }
        if (!permitido) { rechazados++; continue; }
        if (accion === 'agregar') await db.conjuntoAgregar(coleccion, clave, valor);
        else await db.conjuntoQuitar(coleccion, clave, valor);
        aplicados++;
    }
    responder(res, 200, { ok: true, aplicados: aplicados, rechazados: rechazados });
};

RUTAS['GET /api/conjuntos'] = async function (req, res) {
    const url = new URL(req.url, 'http://localhost');
    const coleccion = String(url.searchParams.get('coleccion') || '');
    if (!COLECCIONES_CONJUNTO[coleccion]) return error(res, 400, 'Colección inválida.');
    const u = await usuarioDeSesion(req);
    const yo = u ? u.id : null;
    let filas = await db.conjuntoLeer(coleccion);
    // Los bloqueos son privados: cada persona recibe solo los suyos y los de quienes la bloquearon a ella (para que la app los esconda).
    if (coleccion === 'bloqueos') filas = yo ? filas.filter(function (f) { return f.clave === yo || f.valor === yo; }) : [];
    if (coleccion === 'seguidores') {
        // Quién sigue a quién se muestra solo si las dos cuentas son públicas, o si una de las dos sos vos.
        const privados = {};
        (await db.usuariosPublicos(1000)).forEach(function (x) {
            const priv = x.perfil && x.perfil.privacidad;
            if (priv && priv.verPerfil && priv.verPerfil !== 'todos') privados[x.id] = true;
        });
        filas = filas.filter(function (f) {
            const dc = duenoDeClaveCuenta(f.clave), dv = duenoDeClaveCuenta(f.valor);
            return dc === yo || dv === yo || (!privados[dc] && !privados[dv]);
        });
    }
    const datos = {};
    filas.forEach(function (f) { (datos[f.clave] = datos[f.clave] || []).push(f.valor); });
    responder(res, 200, { ok: true, datos: datos });
};


// ------------------------------
// Comentarios de los posts de perfil (con respuestas y likes)
// ------------------------------
// El id de un post es  idDeLaCuenta_fecha  (la fecha es la del post dentro del portafolio de esa cuenta).
const MAX_COMENTARIO_POST = 300;
const MAX_COMENTARIOS_POR_POST = 500;
const REGEX_ID_COMENTARIO = /^COM-\d{10,15}-\d{1,6}$/;

function nombreVisible(u) { return String((u.perfil && u.perfil.apodo) || u.apodo || u.nombre || 'Cliente').replace(/[<>]/g, '').slice(0, 60); }

// Comprueba que el post exista y que quien mira pueda verlo (si la cuenta es privada, solo su dueña/o).
async function postAccesible(u, idPost) {
    const id = String(idPost || '').slice(0, 120);
    const i = id.lastIndexOf('_');
    const fecha = Number(id.slice(i + 1));
    if (i < 1 || !Number.isFinite(fecha)) throw { estado: 400, mensaje: 'Post inválido.' };
    const dueno = await db.usuarioPorId(id.slice(0, i));
    const portafolio = dueno && dueno.perfil && Array.isArray(dueno.perfil.portafolio) ? dueno.perfil.portafolio : [];
    if (!dueno || baneoActivo(dueno) || dueno.desactivada || !portafolio.some(function (p) { return p && Number(p.fecha) === fecha; })) throw { estado: 404, mensaje: 'Ese post ya no existe.' };
    const priv = dueno.perfil && dueno.perfil.privacidad;
    const privado = !!(priv && priv.verPerfil && priv.verPerfil !== 'todos');
    if (privado && (!u || u.id !== dueno.id)) {
        const losSigue = !!u && ((await db.conjuntoTiene('seguidores', dueno.id, u.id)) || (await db.conjuntoTiene('seguidores', dueno.id, 'T:' + u.id)));
        if (!losSigue) throw { estado: 404, mensaje: 'Ese post ya no existe.' };
    }
    return { id: id, dueno: dueno };
}
function comentarioPublico(c) {
    const o = { id: c.id, idUsuario: c.usuarioId, nombre: c.nombre, texto: c.texto, fecha: c.fecha, likes: Array.isArray(c.likes) ? c.likes : [] };
    if (c.idPadre) o.idPadre = c.idPadre;
    return o;
}
async function listaComentariosPublica(idPost) { return (await db.comentariosDePost(idPost)).map(comentarioPublico); }

RUTAS['GET /api/comentarios'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    const url = new URL(req.url, 'http://localhost');
    const post = await postAccesible(u, url.searchParams.get('post'));
    responder(res, 200, { ok: true, comentarios: await listaComentariosPublica(post.id) });
};

RUTAS['POST /api/comentarios/crear'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'Iniciá sesión para comentar.');
    const espera = seg.limitar('coment:' + u.id, 30, 10 * 60 * 1000);
    if (espera) return error(res, 429, 'Comentaste muchas veces seguidas. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    const b = await leerJSON(req);
    const post = await postAccesible(u, b.postId);
    if (await hayBloqueoEntre(u.id, post.dueno.id)) return error(res, 404, 'Ese post ya no existe.');
    const texto = textoChat(b.texto, MAX_COMENTARIO_POST).trim();
    if (!texto) return error(res, 400, 'Escribí un comentario.');
    const existentes = await db.comentariosDePost(post.id);
    if (existentes.length >= MAX_COMENTARIOS_POR_POST) return error(res, 400, 'Este post ya tiene el máximo de comentarios.');
    let idPadre = null;
    if (b.idPadre) {
        const padre = existentes.find(function (c) { return c.id === String(b.idPadre); });
        if (!padre) return error(res, 404, 'El comentario al que respondés ya no existe.');
        idPadre = padre.idPadre || padre.id;      // las respuestas quedan siempre dentro del mismo hilo
    }
    let id = typeof b.id === 'string' && REGEX_ID_COMENTARIO.test(b.id) ? b.id : null;
    if (id && (await db.comentarioPorId(id))) id = null;
    if (!id) id = 'COM-' + Date.now() + '-' + Math.floor(Math.random() * 900000 + 100);
    await db.crearComentario({ id: id, postId: post.id, usuarioId: u.id, nombre: nombreVisible(u), texto: texto, idPadre: idPadre, likes: [], fecha: Date.now() });
    const padreCom = idPadre ? existentes.find(function (c) { return c.id === idPadre; }) : null;
    if (post.dueno.id !== u.id) avisarPush(post.dueno.id, '💬 Nuevo comentario', nombreVisible(u) + ' comentó tu post.', 'com:' + post.id);
    if (padreCom && padreCom.usuarioId !== u.id && padreCom.usuarioId !== post.dueno.id) avisarPush(padreCom.usuarioId, '💬 Te respondieron', nombreVisible(u) + ' respondió tu comentario.', 'com:' + post.id);
    responder(res, 200, { ok: true, id: id, comentarios: await listaComentariosPublica(post.id) });
};

RUTAS['POST /api/comentarios/eliminar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('comentdel:' + u.id, 60, 10 * 60 * 1000);
    if (espera) return error(res, 429, 'Demasiados cambios seguidos. Probá de nuevo en un momento.');
    const b = await leerJSON(req);
    const c = await db.comentarioPorId(String(b.id || '').slice(0, 60));
    if (!c) return responder(res, 200, { ok: true, comentarios: [] });          // ya estaba borrado
    const duenoPost = c.postId.slice(0, c.postId.lastIndexOf('_'));
    if (c.usuarioId !== u.id && duenoPost !== u.id) return error(res, 403, 'Solo podés borrar tus comentarios o los de tus posts.');
    await db.borrarComentarioYRespuestas(c.id);                                  // se van también sus respuestas
    responder(res, 200, { ok: true, comentarios: await listaComentariosPublica(c.postId) });
};

RUTAS['POST /api/comentarios/like'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('comentlike:' + u.id, 300, 10 * 60 * 1000);
    if (espera) return error(res, 429, 'Demasiados cambios seguidos. Probá de nuevo en un momento.');
    const b = await leerJSON(req);
    const c = await db.comentarioPorId(String(b.id || '').slice(0, 60));
    if (!c) return error(res, 404, 'Ese comentario ya no existe.');
    const postDelLike = await postAccesible(u, c.postId);
    if (await hayBloqueoEntre(u.id, postDelLike.dueno.id)) return error(res, 404, 'Ese post ya no existe.');
    const likes = (Array.isArray(c.likes) ? c.likes : []).filter(function (x) { return x !== u.id; });
    if (b.like === true) likes.push(u.id);
    await db.guardarLikesComentario(c.id, likes);
    responder(res, 200, { ok: true, comentarios: await listaComentariosPublica(c.postId) });
};

// ------------------------------
// Preguntas al vendedor en una publicación (las ve cualquiera; solo responde quien la vende)
// ------------------------------
const MAX_PREGUNTA = 300;
const MAX_RESPUESTA = 500;
const MAX_PREGUNTAS_POR_PUBLICACION = 100;
function preguntaPublica(q) {
    return { id: q.id, publicacionId: q.publicacionId, usuarioId: q.usuarioId, usuarioNombre: q.nombre, texto: q.texto, respuesta: q.respuesta || null, fecha: q.fecha };
}

// ------------------------------
// Buzón de avisos entre personas (notificaciones para otra persona: pedidos, likes, seguidores, respuestas...)
// ------------------------------
// La app de quien hace algo manda el aviso (POST /api/notificaciones/enviar) y la app de quien lo recibe lo baja
// (GET /api/notificaciones?desde=...), desde cualquier celular. Los avisos "para uno mismo" no pasan por acá.
// Los de mensajes de chat y de preguntas al vendedor no se mandan: esos ya se generan solos al bajar chats y preguntas.
const TIPOS_AVISO_ENTRE_PERSONAS = ['reclamo', 'pedidoEstado', 'ventaEstado', 'calificacion', 'venta', 'devolucion', 'compra',
    'seguidor', 'cupon', 'cuponTienda', 'nuevaPublicacion', 'solicitudPerfil', 'solicitudAceptada', 'resenia', 'postulacion',
    'likePost', 'likeComentario', 'comentarioPost', 'respuestaComentario', 'etiquetaPost'];
const TIPOS_AVISO_UNICO = ['seguidor', 'solicitudPerfil', 'likePost', 'likeComentario'];   // uno solo por persona y cosa
const MAX_AVISOS_POR_ENVIO = 100;
const DIAS_AVISOS_MS = 45 * 86400000;
let ultimaMarcaAviso = 0;
function marcaAviso() { ultimaMarcaAviso = Math.max(Date.now(), ultimaMarcaAviso + 1); return ultimaMarcaAviso; }

function textoOpcionalAviso(v, max) {
    if (typeof v === 'number' && isFinite(v)) v = String(v);
    const t = textoChat(v, max).trim();
    return t || null;
}
function limpiarAviso(d) {
    if (!d || typeof d !== 'object') return null;
    const tipo = String(d.tipo || '');
    if (TIPOS_AVISO_ENTRE_PERSONAS.indexOf(tipo) < 0) return null;
    const titulo = textoOpcionalAviso(d.titulo, 120);
    if (!titulo) return null;
    const ahora = Date.now();
    let fecha = Number(d.fecha);
    if (!isFinite(fecha) || fecha > ahora || fecha < ahora - DIAS_AVISOS_MS) fecha = ahora;
    const ambito = function (v) { return v === 'personal' || v === 'tienda' ? v : null; };
    const limpio = {
        tipo: tipo, icono: textoOpcionalAviso(d.icono, 12) || '🔔', titulo: titulo, texto: textoOpcionalAviso(d.texto, 300) || '',
        productoId: textoOpcionalAviso(d.productoId, 60), pedidoId: textoOpcionalAviso(d.pedidoId, 60), chatId: textoOpcionalAviso(d.chatId, 60),
        usuarioId: textoOpcionalAviso(d.usuarioId, 70), cuponCodigo: textoOpcionalAviso(d.cuponCodigo, 40),
        ambito: ambito(d.ambito), cuenta: ambito(d.cuenta), pais: d.pais === 'AR' || d.pais === 'UY' ? d.pais : null, fecha: fecha
    };
    if (d.extra && typeof d.extra === 'object' && !Array.isArray(d.extra)) {
        const extra = {};
        Object.keys(d.extra).slice(0, 8).forEach(function (k) {
            const v = d.extra[k];
            if (!/^[A-Za-z0-9_]{1,30}$/.test(k)) return;
            if (typeof v === 'string') extra[k] = textoChat(v, 120);
            else if (typeof v === 'number' && isFinite(v)) extra[k] = v;
            else if (typeof v === 'boolean') extra[k] = v;
        });
        limpio.extra = extra;
    }
    return limpio;
}
function claveAvisoUnico(a) {
    if (TIPOS_AVISO_UNICO.indexOf(a.tipo) < 0) return null;
    const e = a.extra || {};
    return [a.tipo, a.usuarioId || '', a.cuenta || a.ambito || '', e.postId || '', e.comentarioId || '', e.quien || ''].join('|');
}

// ------------------------------
// Avisos push al celular (aunque la app esté cerrada)
// ------------------------------
const MAX_CELULARES_PUSH = 5;
function textoPlanoPush(t, max) {
    return String(t == null ? '' : t).replace(/&(amp|lt|gt|quot|#39);/g, function (m, e) { return { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[e]; })
        .replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
// Manda un aviso a todos los celulares de esa persona. Nunca frena ni rompe lo que la causó.
function avisarPush(usuarioId, titulo, texto, etiqueta) {
    if (!push.activo() || !usuarioId) return;
    (async function () {
        if (seg.limitar('pushpara:' + usuarioId, 40, 10 * 60 * 1000)) return;          // tope por persona, para no inundar un celular
        const subs = await db.pushDeUsuario(usuarioId);
        const aviso = { titulo: textoPlanoPush(titulo, 80) || 'Nivan', texto: textoPlanoPush(texto, 140), etiqueta: String(etiqueta || 'nivan').slice(0, 40), url: '/' };
        for (const s of subs) {
            const r = await push.enviar(s, aviso);
            if (r.estado === 404 || r.estado === 410) await db.pushBorrar(s.endpoint);    // el celular ya no los recibe (desinstaló o revocó el permiso)
        }
    })().catch(function (e) { console.error('Aviso push:', e && e.message); });
}
RUTAS['GET /api/push/clave'] = async function (req, res) {
    responder(res, 200, { ok: true, activo: push.activo(), clave: push.clavePublica() });
};
RUTAS['POST /api/push/suscribir'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    if (!push.activo()) return error(res, 503, 'Los avisos al celular todavía no están activados en el servidor.');
    const espera = seg.limitar('pushsub:' + u.id, 30, 3600 * 1000);
    if (espera) return error(res, 429, 'Demasiados intentos. Probá de nuevo más tarde.');
    const b = await leerJSON(req);
    const s = b.suscripcion || {};
    const endpoint = typeof s.endpoint === 'string' ? s.endpoint : '';
    const p256dh = s.keys && typeof s.keys.p256dh === 'string' ? s.keys.p256dh : '';
    const auth = s.keys && typeof s.keys.auth === 'string' ? s.keys.auth : '';
    if (!push.endpointValido(endpoint) || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return error(res, 400, 'Suscripción inválida.');
    await db.pushGuardar({ endpoint: endpoint, usuarioId: u.id, p256dh: p256dh, auth: auth }, MAX_CELULARES_PUSH);
    responder(res, 200, { ok: true });
};
RUTAS['POST /api/push/baja'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req);
    if (typeof b.endpoint === 'string' && b.endpoint.length <= 600) await db.pushBorrar(b.endpoint, u.id);
    responder(res, 200, { ok: true });
};

RUTAS['POST /api/notificaciones/enviar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req, 400000);
    const lista = Array.isArray(b.lista) ? b.lista.slice(0, MAX_AVISOS_POR_ENVIO) : [];
    const destinatarios = {};
    const podar = {};
    let aceptadas = 0, rechazadas = 0;

    for (const item of lista) {
        const para = item && typeof item.para === 'string' ? item.para.slice(0, 60) : '';
        const id = item && typeof item.id === 'string' && /^[A-Za-z0-9_-]{4,60}$/.test(item.id) ? item.id : '';
        const aviso = item ? limpiarAviso(item.datos) : null;
        if (!para || !id || !aviso || para === u.id) { rechazadas++; continue; }
        // límites: en total y hacia una misma persona (así nadie puede llenar de avisos a otra)
        if (seg.limitar('aviso:' + u.id, 1500, 3600 * 1000) || seg.limitar('aviso:' + u.id + ':' + para, 120, 3600 * 1000)) { rechazadas++; continue; }

        if (!(para in destinatarios)) destinatarios[para] = await db.usuarioPorId(para);
        const dest = destinatarios[para];
        if (!dest || baneoActivo(dest)) { rechazadas++; continue; }

        // Los avisos de un pedido solo los pueden mandar las dos personas del pedido, entre sí.
        if (aviso.pedidoId) {
            const ped = await db.pedidoPorId(aviso.pedidoId);
            const entreEllas = ped && ((ped.compradorId === u.id && ped.vendedorId === para) || (ped.vendedorId === u.id && ped.compradorId === para));
            if (!entreEllas) { rechazadas++; continue; }
        }
        // Una reseña solo se le avisa a quien vende esa publicación.
        if (aviso.tipo === 'resenia') {
            const pub = aviso.productoId ? await db.publicacionPorId(aviso.productoId) : null;
            if (!pub || pub.vendedorId !== para) { rechazadas++; continue; }
        }

        await db.guardarNotificacion({ para: para, id: id, de: u.id, dedupe: claveAvisoUnico(aviso), datos: aviso, recibida: marcaAviso() });
        podar[para] = true;
        avisarPush(para, aviso.titulo, aviso.texto, aviso.tipo + ':' + (aviso.chatId || aviso.pedidoId || aviso.productoId || aviso.usuarioId || ''));
        aceptadas++;
    }
    for (const para of Object.keys(podar)) await db.podarNotificaciones(para, Date.now() - DIAS_AVISOS_MS);
    responder(res, 200, { ok: true, aceptadas: aceptadas, rechazadas: rechazadas });
};

RUTAS['GET /api/notificaciones'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const url = new URL(req.url, 'http://localhost');
    const desde = Number(url.searchParams.get('desde')) || 0;
    const filas = await db.notificacionesDe(u.id, desde, 200);
    responder(res, 200, { ok: true, notificaciones: filas.map(function (f) { return Object.assign({}, f.datos, { id: f.id, de: f.de, recibida: f.recibida }); }) });
};

RUTAS['GET /api/preguntas'] = async function (req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pedido = url.searchParams.get('pais');
    const pais = pedido === 'UY' || pedido === 'AR' ? pedido : null;
    const lista = await db.preguntasPublicas(pais, 5000);
    responder(res, 200, { ok: true, preguntas: lista.map(preguntaPublica) });
};

RUTAS['POST /api/preguntas/crear'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'Iniciá sesión para hacerle una pregunta al vendedor.');
    const espera = seg.limitar('pregunta:' + u.id, 10, 10 * 60 * 1000);
    if (espera) return error(res, 429, 'Hiciste muchas preguntas seguidas. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    const b = await leerJSON(req);
    const pubId = String(b.publicacionId == null ? '' : b.publicacionId).slice(0, 40);
    const pub = pubId ? await db.publicacionPorId(pubId) : null;
    if (!pub) return error(res, 404, 'Esa publicación ya no existe.');
    if (pub.vendedorId === u.id) return error(res, 403, 'No podés hacerte preguntas a vos mismo.');
    if (await hayBloqueoEntre(u.id, pub.vendedorId)) return error(res, 403, 'No podés hacerle preguntas a este vendedor.');
    const texto = textoChat(b.texto, MAX_PREGUNTA).trim();
    if (!texto) return error(res, 400, 'Escribí tu pregunta antes de enviarla.');
    if ((await db.contarPreguntasDe(pubId)) >= MAX_PREGUNTAS_POR_PUBLICACION) return error(res, 400, 'Esta publicación ya tiene el máximo de preguntas.');
    const q = { id: 'PG-' + crypto.randomBytes(8).toString('hex'), publicacionId: pubId, usuarioId: u.id, nombre: nombreVisible(u), texto: texto, fecha: Date.now() };
    await db.crearPregunta(q);
    avisarPush(pub.vendedorId, '❓ Nueva pregunta', nombreVisible(u) + ' hizo una pregunta en tu publicación.', 'preg:' + pubId);
    responder(res, 200, { ok: true, pregunta: preguntaPublica(Object.assign({ respuesta: null }, q)) });
};

RUTAS['POST /api/preguntas/responder'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req);
    const q = await db.preguntaPorId(String(b.id || '').slice(0, 40));
    if (!q) return error(res, 404, 'Esa pregunta ya no existe.');
    const pub = await db.publicacionPorId(q.publicacionId);
    if (!pub || pub.vendedorId !== u.id) return error(res, 403, 'Solo quien vende puede responder.');
    if (q.respuesta) return error(res, 409, 'Esa pregunta ya tiene respuesta.');
    const texto = textoChat(b.respuesta, MAX_RESPUESTA).trim();
    if (!texto) return error(res, 400, 'Escribí una respuesta antes de enviarla.');
    await db.responderPregunta(q.id, texto, Date.now());
    avisarPush(q.usuarioId, '💬 Respondieron tu pregunta', nombreVisible(u) + ' respondió tu pregunta.', 'preg:' + q.publicacionId);
    responder(res, 200, { ok: true, pregunta: preguntaPublica(Object.assign({}, q, { respuesta: texto })) });
};


// ------------------------------
// Solicitudes para ver un perfil privado
// ------------------------------
// Una solicitud es: "esta cuenta (personal o tienda) pide ver tu perfil (personal o tienda)".
// Aceptarla = esa cuenta pasa a seguirte, y ahí ya recibe tus posts. Rechazarla no avisa a nadie.
// Se guardan en la tabla de conjuntos: clave = "idDeQuienRecibe|ambito", valor = cuenta de quien pide ("id" o "T:id").
const AMBITOS_SOLICITUD = ['tienda', 'personal'];
function ambitoSolicitud(a) { return a === 'personal' ? 'personal' : 'tienda'; }
function claveCuentaDe(idUsuario, ambito) { return ambito === 'personal' ? idUsuario : 'T:' + idUsuario; }

// ------------------------------
// Cupones de descuento (los crea cada tienda; los ve y los usa cualquier persona que cumpla las reglas)
// ------------------------------
// Cada cupón es de UNA tienda y descuenta solo en sus productos (en toda la tienda o en una publicación).
// Lo puede usar quien tenga el código si el cupón no limita la audiencia; si la limita ("seguidores" / "clientes"),
// solo quienes cumplan, o a quienes la tienda se lo envió directamente (habilitados).
// El descuento lo calcula el servidor al comprar; los usos también se cuentan acá.
const MAX_CUPONES_POR_TIENDA = 100;
const AUDIENCIAS_CUPON = ['publico', 'seguidores', 'clientes'];
const REGEX_CODIGO_CUPON = /^[A-Z0-9]{3,20}$/;
const REGEX_ID_CUPON = /^CUP-\d{10,15}-\d{1,4}$/;
function normalizarCodigoCupon(c) { return String(c == null ? '' : c).trim().toUpperCase().replace(/\s+/g, '').slice(0, 40); }
function cuponUsableServidor(c) {
    const d = c.datos || {};
    if (!c.activo) return false;
    if (d.vigenciaHasta && Date.now() > d.vigenciaHasta) return false;
    if (d.usosMaximos && c.usos >= d.usosMaximos) return false;
    return true;
}
function audienciaDeCupon(c) { return Array.isArray(c.datos.audiencia) ? c.datos.audiencia : []; }

// ¿Esta persona puede usar este cupón? (misma regla que la app)
async function puedeUsarCuponServidor(c, u, cache) {
    const aud = audienciaDeCupon(c);
    if (!aud.length || aud.indexOf('publico') !== -1) return true;
    if (!u) return false;
    if (u.id === c.vendedorId) return true;
    if ((c.datos.habilitados || []).indexOf(u.id) !== -1) return true;
    cache = cache || {};
    if (aud.indexOf('seguidores') !== -1) {
        if (!cache.seguidores) cache.seguidores = (await db.conjuntoLeer('seguidores'));
        const clave = 'T:' + c.vendedorId;
        if (cache.seguidores.some(function (f) { return f.clave === clave && (f.valor === u.id || f.valor === 'T:' + u.id); })) return true;
    }
    if (aud.indexOf('clientes') !== -1) {
        if (!cache.pedidos) cache.pedidos = await db.pedidosDeUsuario(u.id, 500);
        if (cache.pedidos.some(function (f) { return f.vendedorId === c.vendedorId && f.compradorId === u.id; })) return true;
    }
    return false;
}

// Lo que se le muestra a cada persona (los demás habilitados nunca se envían).
function cuponPublico(c, yoId) {
    const d = c.datos, propio = c.vendedorId === yoId;
    return {
        id: c.id, codigo: c.codigo, vendedorId: c.vendedorId, tipo: d.tipo, valor: d.valor, vigenciaHasta: d.vigenciaHasta || null,
        usosMaximos: d.usosMaximos || null, usos: c.usos, activo: c.activo, audiencia: audienciaDeCupon(c),
        habilitados: propio ? (d.habilitados || []) : ((d.habilitados || []).indexOf(yoId) !== -1 ? [yoId] : []),
        productoId: d.productoId || null, productoNombre: d.productoNombre || '', creado: c.creado
    };
}
async function codigoDeCuponEnUso(codigo, idExcluido) {
    return (await db.cuponesPorCodigo(codigo)).some(function (c) { return c.id !== idExcluido && cuponUsableServidor(c); });
}
async function exigirPoderVender(u, res) {
    const sinVender = restriccionActiva(u);
    if (sinVender && restriccionPublica(u).vender) { error(res, 403, textoRestriccion(sinVender, 'vender')); return false; }
    const estadoVerif = esAdmin(u) ? 'aprobada' : (u.verificacion && u.verificacion.estado);
    if (estadoVerif !== 'aprobada') { error(res, 403, 'Tenés que tener tu identidad aprobada para crear cupones.'); return false; }
    return true;
}

// Los cupones que ve esta persona + los códigos que tiene guardados.
RUTAS['GET /api/cupones'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    const yo = u ? u.id : null;
    const todos = await db.cuponesTodos(5000);
    const guardados = u ? await db.cuponesGuardadosDe(u.id) : [];
    const cache = {};
    const lista = [];
    for (const c of todos) {
        const propio = c.vendedorId === yo;
        const guardado = guardados.indexOf(c.codigo) !== -1;
        const habilitado = !!yo && (c.datos.habilitados || []).indexOf(yo) !== -1;
        if (propio || guardado) { lista.push(cuponPublico(c, yo)); continue; }
        if (!cuponUsableServidor(c)) continue;
        const aud = audienciaDeCupon(c);
        if (!aud.length && !habilitado) continue;                                  // "solo con el código": no se muestra a nadie
        if (aud.indexOf('publico') !== -1 || habilitado || (u && await puedeUsarCuponServidor(c, u, cache))) lista.push(cuponPublico(c, yo));
    }
    responder(res, 200, { ok: true, cupones: lista, guardados: guardados });
};

// Busca un cupón por su código (para guardarlo o usarlo en el carrito).
RUTAS['POST /api/cupones/buscar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'Iniciá sesión para usar un cupón.');
    const espera = seg.limitar('cupbus:' + u.id, 60, 3600 * 1000);
    if (espera) return error(res, 429, 'Probaste muchos códigos seguidos. Esperá ' + Math.ceil(espera / 60) + ' min.');
    const b = await leerJSON(req);
    const codigo = normalizarCodigoCupon(b.codigo);
    if (!REGEX_CODIGO_CUPON.test(codigo)) return error(res, 404, 'No encontramos ningún cupón con ese código.');
    const coinciden = await db.cuponesPorCodigo(codigo);
    const c = coinciden.find(cuponUsableServidor) || coinciden[0];
    if (!c) return error(res, 404, 'No encontramos ningún cupón con ese código.');
    responder(res, 200, { ok: true, cupon: cuponPublico(c, u.id), usable: cuponUsableServidor(c), puedeUsar: await puedeUsarCuponServidor(c, u) });
};

// Guardar un cupón en "Tus cupones".
RUTAS['POST /api/cupones/reclamar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'Iniciá sesión o creá tu cuenta para agregar el cupón.');
    const espera = seg.limitar('cupbus:' + u.id, 60, 3600 * 1000);
    if (espera) return error(res, 429, 'Probaste muchos códigos seguidos. Esperá ' + Math.ceil(espera / 60) + ' min.');
    const b = await leerJSON(req);
    const coinciden = await db.cuponesPorCodigo(normalizarCodigoCupon(b.codigo));
    const c = coinciden.find(cuponUsableServidor);
    if (!c) return error(res, 409, 'El cupón no está disponible.');
    if (!(await puedeUsarCuponServidor(c, u))) return error(res, 403, 'No estás habilitado para este cupón.');
    const nuevo = await db.cuponGuardar(u.id, c.codigo);
    responder(res, 200, { ok: true, yaLoTenia: !nuevo, cupon: cuponPublico(c, u.id) });
};

RUTAS['POST /api/cupones/quitar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req);
    await db.cuponQuitarGuardado(u.id, normalizarCodigoCupon(b.codigo));
    responder(res, 200, { ok: true });
};

RUTAS['POST /api/cupones/crear'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const espera = seg.limitar('cupon:' + u.id, 60, 3600 * 1000);
    if (espera) return error(res, 429, 'Demasiados cambios seguidos. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    if (!(await exigirPoderVender(u, res))) return;
    const b = await leerJSON(req);
    const x = b.cupon && typeof b.cupon === 'object' ? b.cupon : {};
    const codigo = normalizarCodigoCupon(x.codigo);
    if (!REGEX_CODIGO_CUPON.test(codigo)) return error(res, 400, 'El código tiene que tener entre 3 y 20 letras o números, sin espacios ni símbolos.');
    const tipo = x.tipo === 'porcentaje' || x.tipo === 'monto' ? x.tipo : null;
    const valor = Number(x.valor);
    if (!tipo || !isFinite(valor) || valor <= 0 || valor > 1e9 || (tipo === 'porcentaje' && valor > 90)) return error(res, 400, tipo === 'porcentaje' ? 'El porcentaje tiene que ser mayor a 0 y hasta 90%.' : 'El monto tiene que ser mayor a 0.');
    const vigenciaHasta = x.vigenciaHasta ? Number(x.vigenciaHasta) : null;
    if (vigenciaHasta !== null && (!isFinite(vigenciaHasta) || vigenciaHasta < Date.now() - 86400000 || vigenciaHasta > Date.now() + 5 * 365 * 86400000)) return error(res, 400, 'La fecha de vencimiento no es válida.');
    const usosMaximos = x.usosMaximos ? Math.max(1, Math.min(1000000, Math.round(Number(x.usosMaximos)))) : null;
    if (x.usosMaximos && !isFinite(usosMaximos)) return error(res, 400, 'La cantidad de usos no es válida.');
    const audiencia = (Array.isArray(x.audiencia) ? x.audiencia : []).filter(function (a, i, arr) { return AUDIENCIAS_CUPON.indexOf(a) !== -1 && arr.indexOf(a) === i; });
    let productoId = null, productoNombre = '';
    if (x.productoId != null && x.productoId !== '') {
        const pub = await db.publicacionPorId(String(x.productoId).slice(0, 40));
        if (!pub || pub.vendedorId !== u.id) return error(res, 400, 'Elegí una de tus publicaciones para el cupón.');
        productoId = pub.id; productoNombre = txt(pub.datos.nombre, 120);
    }
    if ((await db.cuponesDeVendedor(u.id)).length >= MAX_CUPONES_POR_TIENDA) return error(res, 400, 'Llegaste al máximo de ' + MAX_CUPONES_POR_TIENDA + ' cupones. Eliminá alguno para crear otro.');
    if (await codigoDeCuponEnUso(codigo, null)) return error(res, 409, 'Ese código ya está en uso en un cupón vigente. Elegí otro distinto.');
    let id = typeof x.id === 'string' && REGEX_ID_CUPON.test(x.id) ? x.id : null;
    if (id && (await db.cuponPorId(id))) id = null;
    if (!id) id = 'CUP-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 100);
    const c = { id: id, vendedorId: u.id, codigo: codigo, activo: true, usos: 0, creado: Date.now(),
        datos: { tipo: tipo, valor: valor, vigenciaHasta: vigenciaHasta, usosMaximos: usosMaximos, audiencia: audiencia, habilitados: [], productoId: productoId, productoNombre: productoNombre } };
    await db.cuponCrear(c);
    responder(res, 200, { ok: true, cupon: cuponPublico(c, u.id) });
};

// Pausar / reactivar un cupón o cambiar quién lo puede reclamar.
RUTAS['POST /api/cupones/actualizar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req);
    const c = await db.cuponPorId(String(b.id || '').slice(0, 40));
    if (!c || c.vendedorId !== u.id) return error(res, 404, 'No se encontró ese cupón.');
    const datosNuevos = Object.assign({}, c.datos);
    let activo = c.activo;
    if (typeof b.activo === 'boolean') {
        if (b.activo && !c.activo && await codigoDeCuponEnUso(c.codigo, c.id)) return error(res, 409, 'No se puede activar: ya hay otro cupón vigente con el código ' + c.codigo + '.');
        activo = b.activo;
    }
    if (Array.isArray(b.audiencia)) datosNuevos.audiencia = b.audiencia.filter(function (a, i, arr) { return AUDIENCIAS_CUPON.indexOf(a) !== -1 && arr.indexOf(a) === i; });
    await db.cuponActualizar(c.id, activo, datosNuevos);
    responder(res, 200, { ok: true, cupon: cuponPublico(Object.assign({}, c, { activo: activo, datos: datosNuevos }), u.id) });
};

RUTAS['POST /api/cupones/eliminar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req);
    const c = await db.cuponPorId(String(b.id || '').slice(0, 40));
    if (c && c.vendedorId === u.id) await db.cuponEliminar(c.id);
    responder(res, 200, { ok: true });
};

// La tienda le habilita el cupón a personas puntuales (aunque el cupón tenga audiencia limitada).
RUTAS['POST /api/cupones/habilitar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req);
    const c = await db.cuponPorId(String(b.id || '').slice(0, 40));
    if (!c || c.vendedorId !== u.id) return error(res, 404, 'No se encontró ese cupón.');
    if (!cuponUsableServidor(c)) return error(res, 409, 'El cupón no está disponible.');
    const habilitados = Array.isArray(c.datos.habilitados) ? c.datos.habilitados.slice() : [];
    for (const id of (Array.isArray(b.usuarios) ? b.usuarios : []).slice(0, 300)) {
        const idx = String(id).slice(0, 60);
        if (idx !== u.id && habilitados.indexOf(idx) === -1 && habilitados.length < 2000 && (await db.usuarioPorId(idx))) habilitados.push(idx);
    }
    await db.cuponActualizar(c.id, c.activo, Object.assign({}, c.datos, { habilitados: habilitados }));
    responder(res, 200, { ok: true, habilitados: habilitados.length });
};

RUTAS['GET /api/solicitudes'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const filas = await db.conjuntoLeer('solicitudes');
    const recibidas = [], enviadas = [];
    filas.forEach(function (f) {
        const i = f.clave.lastIndexOf('|');
        if (i < 1) return;
        const duenioId = f.clave.slice(0, i), ambito = ambitoSolicitud(f.clave.slice(i + 1));
        if (duenioId === u.id) recibidas.push({ ambito: ambito, cuenta: f.valor });
        if (duenoDeClaveCuenta(f.valor) === u.id) enviadas.push({ duenioId: duenioId, ambito: ambito, cuenta: f.valor });
    });
    responder(res, 200, { ok: true, recibidas: recibidas, enviadas: enviadas });
};

RUTAS['POST /api/solicitudes/enviar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'Iniciá sesión para enviar la solicitud.');
    const espera = seg.limitar('solic:' + u.id, 60, 3600 * 1000);
    if (espera) return error(res, 429, 'Hiciste muchas solicitudes seguidas. Probá de nuevo en ' + Math.ceil(espera / 60) + ' min.');
    const b = await leerJSON(req);
    const duenioId = String(b.duenioId || '').slice(0, 60), ambito = ambitoSolicitud(b.ambito), cuenta = String(b.cuenta || '').slice(0, 70);
    if (!duenioId || duenioId === u.id || duenoDeClaveCuenta(cuenta) !== u.id) return error(res, 400, 'Solicitud inválida.');
    const duenio = await db.usuarioPorId(duenioId);
    if (!duenio || baneoActivo(duenio) || duenio.desactivada || (await hayBloqueoEntre(u.id, duenioId))) return error(res, 404, 'No podés enviar la solicitud a este usuario.');
    if (await db.conjuntoTiene('seguidores', claveCuentaDe(duenioId, ambito), cuenta)) return responder(res, 200, { ok: true, yaLaSigue: true });
    await db.conjuntoAgregar('solicitudes', duenioId + '|' + ambito, cuenta);
    responder(res, 200, { ok: true });
};

RUTAS['POST /api/solicitudes/cancelar'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req);
    const cuenta = String(b.cuenta || '').slice(0, 70);
    if (duenoDeClaveCuenta(cuenta) !== u.id) return error(res, 403, 'Esa solicitud no es tuya.');
    await db.conjuntoQuitar('solicitudes', String(b.duenioId || '').slice(0, 60) + '|' + ambitoSolicitud(b.ambito), cuenta);
    responder(res, 200, { ok: true });
};

RUTAS['POST /api/solicitudes/responder'] = async function (req, res) {
    const u = await usuarioDeSesion(req);
    if (!u) return error(res, 401, 'No iniciaste sesión.');
    const b = await leerJSON(req);
    const ambito = ambitoSolicitud(b.ambito), cuenta = String(b.cuenta || '').slice(0, 70), clave = u.id + '|' + ambito;
    if (!(await db.conjuntoTiene('solicitudes', clave, cuenta))) return error(res, 404, 'Esa solicitud ya no está disponible.');
    await db.conjuntoQuitar('solicitudes', clave, cuenta);
    if (b.aceptar === true) {
        const solicitante = await db.usuarioPorId(duenoDeClaveCuenta(cuenta));
        if (solicitante && !(await hayBloqueoEntre(u.id, solicitante.id))) await db.conjuntoAgregar('seguidores', claveCuentaDe(u.id, ambito), cuenta);
    }
    responder(res, 200, { ok: true });
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
