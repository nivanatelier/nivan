// ==============================
// NIVAN · Almacén en archivo JSON (para probar en el celular o la compu, sin base de datos)
// ==============================
// Se usa cuando NO hay DATABASE_URL. Todo se guarda en datos/db.json con escritura atómica.
// ¡No usar en Render gratis! Ahí el disco se borra en cada reinicio: usá Postgres (DATABASE_URL).
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = process.env.NIVAN_DATOS || path.join(__dirname, 'datos');
const ARCHIVO = path.join(DIR, 'db.json');
const VACIO = { usuarios: [], sesiones: [], publicaciones: [], medios: [] };
const MAX_SESIONES_POR_USUARIO = 10;

fs.mkdirSync(DIR, { recursive: true });

let datos;
try {
    datos = Object.assign({}, VACIO, JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')));
    fs.copyFileSync(ARCHIVO, ARCHIVO + '.bak');   // copia de seguridad al arrancar
} catch (e) {
    if (e.code !== 'ENOENT') {
        console.error('No se pudo leer db.json (' + e.message + '). Si existe db.json.bak, copialo encima de db.json.');
        process.exit(1);
    }
    datos = JSON.parse(JSON.stringify(VACIO));
}

let pendiente = null;
function volcar() {
    pendiente = null;
    const tmp = ARCHIVO + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(datos));
    fs.renameSync(tmp, ARCHIVO);
}
function guardar() { if (!pendiente) pendiente = setTimeout(volcar, 40); }
function cerrar() { if (pendiente) { clearTimeout(pendiente); volcar(); } }
process.on('SIGINT', function () { cerrar(); process.exit(0); });
process.on('SIGTERM', function () { cerrar(); process.exit(0); });
process.on('exit', cerrar);

// ---- Interfaz (la misma que db-postgres.js) ----
async function usuarioPorEmail(email) {
    return datos.usuarios.find(function (u) { return u.email === email; }) || null;
}
async function usuarioPorId(id) {
    return datos.usuarios.find(function (u) { return u.id === id; }) || null;
}
// Guarda el usuario y le asigna un idPublico libre (raiz, raiz1, raiz2...). Si el email ya existe: error EMAIL_DUPLICADO.
async function crearUsuario(u, raizIdPublico) {
    if (datos.usuarios.some(function (x) { return x.email === u.email; })) { const e = new Error('email duplicado'); e.codigo = 'EMAIL_DUPLICADO'; throw e; }
    let cand = raizIdPublico, n = 0;
    while (datos.usuarios.some(function (x) { return x.idPublico === cand; })) { n++; cand = raizIdPublico + n; }
    u.idPublico = cand;
    datos.usuarios.push(u);
    guardar();
    return u;
}
async function crearSesion(s) {
    datos.sesiones.push(s);
    const suyas = datos.sesiones.filter(function (x) { return x.usuarioId === s.usuarioId; });
    if (suyas.length > MAX_SESIONES_POR_USUARIO) {
        const sobran = suyas.sort(function (a, b) { return a.creada - b.creada; }).slice(0, suyas.length - MAX_SESIONES_POR_USUARIO);
        datos.sesiones = datos.sesiones.filter(function (x) { return sobran.indexOf(x) < 0; });
    }
    guardar();
}
async function sesionPorHash(h) {
    const s = datos.sesiones.find(function (x) { return x.h === h; });
    if (!s) return null;
    if (s.vence < Date.now()) { await borrarSesion(h); return null; }
    return s;
}
async function borrarSesion(h) {
    datos.sesiones = datos.sesiones.filter(function (x) { return x.h !== h; });
    guardar();
}
async function limpiarVencidas() {
    const antes = datos.sesiones.length;
    datos.sesiones = datos.sesiones.filter(function (s) { return s.vence > Date.now(); });
    if (datos.sesiones.length !== antes) guardar();
}

async function borrarSesionesDeUsuario(id) {
    datos.sesiones = datos.sesiones.filter(function (s) { return s.usuarioId !== id; });
    guardar();
}
async function cambiarPassword(id, hash) {
    const u = datos.usuarios.find(function (x) { return x.id === id; });
    if (u) { u.passwordHash = hash; guardar(); }
}
// Borra la cuenta, sus sesiones, publicaciones y fotos.
async function eliminarUsuario(id) {
    datos.usuarios = datos.usuarios.filter(function (u) { return u.id !== id; });
    datos.sesiones = datos.sesiones.filter(function (s) { return s.usuarioId !== id; });
    datos.publicaciones = datos.publicaciones.filter(function (p) { return p.vendedorId !== id; });
    datos.medios = datos.medios.filter(function (m) { return m.usuarioId !== id; });
    guardar();
}

// ---- Publicaciones y medios ----
// Publicación: { id, vendedorId, pais, activo, datos, creada, actualizada }
async function publicacionPorId(id) {
    return datos.publicaciones.find(function (p) { return p.id === id; }) || null;
}
async function publicacionesDeUsuario(usuarioId) {
    return datos.publicaciones.filter(function (p) { return p.vendedorId === usuarioId; });
}
// Públicas del país (activas) y, si viene usuarioId, también todas las suyas.
async function publicacionesPorPais(pais, usuarioId, limite) {
    return datos.publicaciones.filter(function (p) {
        return p.pais === pais && (p.activo || p.vendedorId === usuarioId);
    }).sort(function (a, b) { return b.creada - a.creada; }).slice(0, limite);
}
async function guardarPublicacion(pub) {
    const i = datos.publicaciones.findIndex(function (p) { return p.id === pub.id; });
    if (i >= 0) datos.publicaciones[i] = pub; else datos.publicaciones.push(pub);
    guardar();
}
async function eliminarPublicacion(id) {
    datos.publicaciones = datos.publicaciones.filter(function (p) { return p.id !== id; });
    guardar();
}
async function guardarMedio(m) {   // m: { id, usuarioId, tipo, b64, creado }
    datos.medios.push(m);
    guardar();
}
async function medioPorId(id) {
    const m = datos.medios.find(function (x) { return x.id === id; });
    return m ? { tipo: m.tipo, bytes: Buffer.from(m.b64, 'base64') } : null;
}
async function borrarMediosSobrantes(usuarioId, usados) {
    const antes = datos.medios.length;
    datos.medios = datos.medios.filter(function (m) { return m.usuarioId !== usuarioId || usados.indexOf(m.id) >= 0; });
    if (datos.medios.length !== antes) guardar();
}
module.exports = {
    publicacionPorId: publicacionPorId, publicacionesDeUsuario: publicacionesDeUsuario, publicacionesPorPais: publicacionesPorPais,
    guardarPublicacion: guardarPublicacion, eliminarPublicacion: eliminarPublicacion,
    guardarMedio: guardarMedio, medioPorId: medioPorId, borrarMediosSobrantes: borrarMediosSobrantes,
    eliminarUsuario: eliminarUsuario,
    cambiarPassword: cambiarPassword, borrarSesionesDeUsuario: borrarSesionesDeUsuario,
    tipo: 'archivo', DIR: DIR, listo: Promise.resolve(), cerrar: cerrar,
    usuarioPorEmail: usuarioPorEmail, usuarioPorId: usuarioPorId, crearUsuario: crearUsuario,
    crearSesion: crearSesion, sesionPorHash: sesionPorHash, borrarSesion: borrarSesion, limpiarVencidas: limpiarVencidas
};
