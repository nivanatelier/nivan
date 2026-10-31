// ==============================
// NIVAN · Contraseñas, sesiones y límites de intentos
// ==============================
'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);
const db = require('./db');

// ---- Contraseñas (scrypt, con sal propia en cada una) ----
const SCRYPT = { N: 16384, r: 8, p: 1, len: 64 };

async function hashearPassword(password) {
    const sal = crypto.randomBytes(16);
    const h = await scrypt(password, sal, SCRYPT.len, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
    return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString('base64'), h.toString('base64')].join('$');
}

async function verificarPassword(password, guardado) {
    try {
        const [alg, N, r, p, sal, h] = String(guardado).split('$');
        if (alg !== 'scrypt') return false;
        const esperado = Buffer.from(h, 'base64');
        const calc = await scrypt(password, Buffer.from(sal, 'base64'), esperado.length, { N: +N, r: +r, p: +p });
        return crypto.timingSafeEqual(calc, esperado);
    } catch (e) { return false; }
}

// Para que "no existe ese email" tarde lo mismo que "contraseña incorrecta" (no se puede adivinar qué emails existen).
let hashFalso = null;
async function gastarTiempo(password) {
    if (!hashFalso) hashFalso = await hashearPassword('x');
    await verificarPassword(password, hashFalso);
}

// Mismas reglas que la app: 8 caracteres, mayúscula, número y símbolo.
function evaluarPassword(pw) {
    const faltan = [];
    if (pw.length < 8) faltan.push('8 caracteres');
    if (!/\p{Lu}/u.test(pw)) faltan.push('una mayúscula');
    if (!/\d/.test(pw)) faltan.push('un número');
    if (!/[^\p{L}\p{N}\s]/u.test(pw)) faltan.push('un símbolo');
    return faltan;
}

// ---- Sesiones ----
// El navegador guarda un token al azar en una cookie HttpOnly (el JavaScript de la página no puede leerla).
// En el servidor solo se guarda el hash del token: si alguien robara la base de datos, no podría usar las sesiones.
const COOKIE = 'nivan_sid';
const DURACION_SESION = 30 * 24 * 3600 * 1000;
const MAX_SESIONES_POR_USUARIO = 10;

function sha(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

async function crearSesion(usuarioId, req) {
    const token = crypto.randomBytes(32).toString('base64url');
    const ahora = Date.now();
    await db.crearSesion({
        h: sha(token), usuarioId: usuarioId, creada: ahora, vence: ahora + DURACION_SESION,
        ip: ipDe(req), ua: String(req.headers['user-agent'] || '').slice(0, 160)
    });
    return token;
}

function leerCookie(req, nombre) {
    const c = String(req.headers.cookie || '');
    const partes = c.split(';');
    for (let i = 0; i < partes.length; i++) {
        const k = partes[i].trim();
        if (k.indexOf(nombre + '=') === 0) return decodeURIComponent(k.slice(nombre.length + 1));
    }
    return null;
}

async function sesionDe(req) {
    const token = leerCookie(req, COOKIE);
    if (!token) return null;
    return await db.sesionPorHash(sha(token));
}

async function cerrarSesion(req) {
    const token = leerCookie(req, COOKIE);
    if (token) await db.borrarSesion(sha(token));
}

function cookieSesion(token, seguro) {
    return COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + Math.floor(DURACION_SESION / 1000) + (seguro ? '; Secure' : '');
}
function cookieBorrar(seguro) {
    return COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' + (seguro ? '; Secure' : '');
}

// Limpieza de sesiones vencidas (cada hora).
setInterval(function () {
    db.limpiarVencidas().catch(function (e) { console.error('No se pudo limpiar sesiones:', e.message); });
}, 3600 * 1000).unref();

// ---- IP y límite de intentos ----
// Solo se confía en X-Forwarded-For si el servidor está detrás de un proxy: en Render es automático,
// en otro lado hay que poner CONFIAR_PROXY=1.
const CONFIAR_PROXY = process.env.CONFIAR_PROXY ? process.env.CONFIAR_PROXY === '1' : !!process.env.RENDER;
function ipDe(req) {
    if (CONFIAR_PROXY) {
        const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
        if (f) return f;
    }
    return req.socket.remoteAddress || 'desconocida';
}

const intentos = new Map();
// Devuelve null si puede seguir, o los segundos que tiene que esperar.
function limitar(clave, max, ventanaMs) {
    const ahora = Date.now();
    let e = intentos.get(clave);
    if (!e || e.reinicia < ahora) e = { n: 0, reinicia: ahora + ventanaMs };
    e.n++;
    intentos.set(clave, e);
    return e.n > max ? Math.ceil((e.reinicia - ahora) / 1000) : null;
}
function olvidar(clave) { intentos.delete(clave); }
setInterval(function () {
    const ahora = Date.now();
    intentos.forEach(function (e, k) { if (e.reinicia < ahora) intentos.delete(k); });
}, 600 * 1000).unref();

module.exports = {
    hashearPassword, verificarPassword, gastarTiempo, evaluarPassword,
    crearSesion, sesionDe, cerrarSesion, cookieSesion, cookieBorrar, ipDe, limitar, olvidar, leerCookie
};
