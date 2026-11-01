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
const VACIO = { usuarios: [], sesiones: [], publicaciones: [], medios: [], fotosVerif: {}, dispositivos: {}, reportes: [], pedidos: [], chats: [], chatMensajes: [], resenias: [], conjuntos: [], postComentarios: [], preguntas: [], notificaciones: [] };
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
async function guardarVerificacion(id, estado, fotos) {
    const u = datos.usuarios.find(function (x) { return x.id === id; });
    if (!u) return;
    u.verificacion = estado;
    if (fotos) datos.fotosVerif[id] = fotos;
    guardar();
}
async function verificacionesPendientes() {
    return datos.usuarios.filter(function (u) { return u.verificacion && u.verificacion.estado === 'pendiente'; })
        .sort(function (a, b) { return a.verificacion.enviada - b.verificacion.enviada; }).slice(0, 200)
        .map(function (u) { return { id: u.id, nombre: u.nombre, email: u.email, idPublico: u.idPublico, enviada: u.verificacion.enviada }; });
}
async function fotosVerificacion(id) { return datos.fotosVerif[id] || null; }
async function resolverVerificacion(id, estado) {
    const u = datos.usuarios.find(function (x) { return x.id === id; });
    if (u) u.verificacion = estado;
    delete datos.fotosVerif[id];
    guardar();
}
async function usuarioPorIdPublico(idPublico) {
    return datos.usuarios.find(function (u) { return u.idPublico === idPublico; }) || null;
}
async function fijarBaneo(id, baneo) {
    const u = datos.usuarios.find(function (x) { return x.id === id; });
    if (!u) return;
    if (baneo) u.baneo = baneo; else delete u.baneo;
    guardar();
}
async function fijarDesactivada(id, ts) {
    const u = datos.usuarios.find(function (x) { return x.id === id; });
    if (!u) return;
    if (ts) u.desactivada = ts; else delete u.desactivada;
    guardar();
}
async function idsBaneados() {
    const ahora = Date.now();
    return datos.usuarios.filter(function (u) {
        if (u.desactivada) return true;   // desactivada por su dueña/o: sus publicaciones no se muestran
        return u.baneo && u.baneo.alcance !== 'comprar' && (u.baneo.permanente || (u.baneo.hasta || 0) > ahora);   // suspensión solo para comprar: no oculta publicaciones
    }).map(function (u) { return u.id; });
}
// ---- Reseñas ----
// Reseña: { id, publicacionId, usuarioId, nombre, estrellas, texto, fecha, borrada }
async function reseniasPublicas(pais, limite) {
    return datos.resenias.filter(function (x) {
        if (x.borrada) return false;
        const p = datos.publicaciones.find(function (q) { return q.id === x.publicacionId; });
        return !!p && (!pais || p.pais === pais);
    }).sort(function (a, b) { return a.fecha - b.fecha; }).slice(0, limite);
}
async function reseniasDeUsuarioEn(publicacionId, usuarioId) {
    return datos.resenias.filter(function (x) { return x.publicacionId === publicacionId && x.usuarioId === usuarioId; });
}
async function reseniaPorId(id) { return datos.resenias.find(function (x) { return x.id === id; }) || null; }
async function crearResenia(x) { datos.resenias.push(Object.assign({ borrada: null }, x)); guardar(); }
async function borrarResenia(id, ts) {
    const x = datos.resenias.find(function (y) { return y.id === id; });
    if (x) { x.borrada = ts; guardar(); }
}
// ---- Reportes ----
async function crearReporte(r) {
    if (datos.reportes.some(function (x) { return x.reportanteId === r.reportanteId && x.tipo === r.tipo && x.objetivoId === r.objetivoId; })) {
        const e = new Error('reporte duplicado'); e.codigo = 'REPORTE_DUPLICADO'; throw e;
    }
    datos.reportes.push(Object.assign({ estado: 'pendiente', resolucion: '' }, r));
    guardar();
}
async function reportesDeObjetivo(tipo, objetivoId) {
    return datos.reportes.filter(function (x) { return x.tipo === tipo && x.objetivoId === objetivoId; }).sort(function (a, b) { return b.fecha - a.fecha; }).slice(0, 100);
}
async function contarReportesDeCuenta(cuentaId) {
    const mias = datos.reportes.filter(function (x) { return x.cuentaId === cuentaId; });
    return { total: mias.length, pendientes: mias.filter(function (x) { return x.estado === 'pendiente'; }).length };
}
async function cerrarReportes(tipo, objetivoId, estado, resolucion) {
    datos.reportes.forEach(function (x) { if (x.tipo === tipo && x.objetivoId === objetivoId && x.estado === 'pendiente') { x.estado = estado; x.resolucion = resolucion; } });
    guardar();
}
async function dispositivoConocido(id, h) { return !!(datos.dispositivos[id] && datos.dispositivos[id][h]); }
async function registrarDispositivo(id, h) {
    const d = datos.dispositivos[id] || (datos.dispositivos[id] = {});
    d[h] = Date.now();
    const claves = Object.keys(d).sort(function (x, y) { return d[y] - d[x]; });
    claves.slice(30).forEach(function (k) { delete d[k]; });
    guardar();
}
async function borrarDispositivos(id) { delete datos.dispositivos[id]; guardar(); }
// ---- Chats ----
async function chatPorId(id) { return datos.chats.find(function (c) { return c.id === id; }) || null; }
async function guardarChat(c) {
    const i = datos.chats.findIndex(function (x) { return x.id === c.id; });
    if (i >= 0) datos.chats[i] = c; else datos.chats.push(c);
    guardar();
}
async function mensajePorId(chatId, id) { return datos.chatMensajes.find(function (m) { return m.chatId === chatId && m.id === id; }) || null; }
async function agregarMensaje(chatId, m) {
    if (await mensajePorId(chatId, m.id)) return false;
    datos.chatMensajes.push({ chatId: chatId, id: m.id, fecha: m.fecha, modificado: m.modificado, datos: m.datos });
    guardar();
    return true;
}
async function actualizarMensaje(chatId, id, d, modificado) {
    const m = await mensajePorId(chatId, id);
    if (m) { m.datos = d; m.modificado = modificado; guardar(); }
}
async function chatsDeUsuarioDesde(usuarioId, desde, limite) {
    return datos.chats.filter(function (c) { return (c.aId === usuarioId || c.bId === usuarioId) && c.actualizado > desde; })
        .sort(function (a, b) { return a.actualizado - b.actualizado; }).slice(0, limite);
}
async function mensajesDeUsuarioDesde(usuarioId, desde, limite) {
    const mios = {};
    datos.chats.forEach(function (c) { if (c.aId === usuarioId || c.bId === usuarioId) mios[c.id] = true; });
    return datos.chatMensajes.filter(function (m) { return mios[m.chatId] && m.modificado > desde; })
        .sort(function (a, b) { return a.modificado - b.modificado || (a.id < b.id ? -1 : 1); }).slice(0, limite);
}
async function cambiarPassword(id, hash) {
    const u = datos.usuarios.find(function (x) { return x.id === id; });
    if (u) { u.passwordHash = hash; guardar(); }
}
// Borra la cuenta, sus sesiones, publicaciones y fotos.
async function eliminarUsuario(id) {
    delete datos.fotosVerif[id];
    delete datos.dispositivos[id];
    datos.usuarios = datos.usuarios.filter(function (u) { return u.id !== id; });
    datos.sesiones = datos.sesiones.filter(function (s) { return s.usuarioId !== id; });
    const idsPubs = datos.publicaciones.filter(function (p) { return p.vendedorId === id; }).map(function (p) { return p.id; });
    datos.resenias = datos.resenias.filter(function (x) { return x.usuarioId !== id && idsPubs.indexOf(x.publicacionId) < 0; });
    datos.preguntas = datos.preguntas.filter(function (q) { return q.usuarioId !== id && idsPubs.indexOf(q.publicacionId) < 0; });
    datos.postComentarios = datos.postComentarios.filter(function (c) { return c.usuarioId !== id && c.postId.indexOf(id + '_') !== 0; });
    datos.publicaciones = datos.publicaciones.filter(function (p) { return p.vendedorId !== id; });
    datos.medios = datos.medios.filter(function (m) { return m.usuarioId !== id; });
    const idsChats = datos.chats.filter(function (c) { return c.aId === id || c.bId === id; }).map(function (c) { return c.id; });
    datos.chats = datos.chats.filter(function (c) { return idsChats.indexOf(c.id) < 0; });
    datos.chatMensajes = datos.chatMensajes.filter(function (m) { return idsChats.indexOf(m.chatId) < 0; });
    const dueno = function (s) { return s.indexOf('T:') === 0 ? s.slice(2) : s; };
    datos.conjuntos = datos.conjuntos.filter(function (e) { return dueno(e.valor) !== id && dueno(e.clave) !== id && e.clave.indexOf(id + '_') !== 0; });
    datos.notificaciones = datos.notificaciones.filter(function (n) { return n.para !== id && n.de !== id; });
    guardar();
}

// ---- Notificaciones (avisos para otras personas) ----
async function guardarNotificacion(x) {
    if (x.dedupe) datos.notificaciones = datos.notificaciones.filter(function (n) { return !(n.para === x.para && n.dedupe === x.dedupe); });
    if (!datos.notificaciones.some(function (n) { return n.para === x.para && n.id === x.id; })) {
        datos.notificaciones.push({ para: x.para, id: x.id, de: x.de, dedupe: x.dedupe || null, datos: x.datos, recibida: x.recibida });
        guardar();
    }
}
async function notificacionesDe(usuarioId, desde, limite) {
    return datos.notificaciones.filter(function (n) { return n.para === usuarioId && n.recibida > desde; })
        .sort(function (a, b) { return a.recibida - b.recibida; }).slice(0, limite)
        .map(function (n) { return { id: n.id, de: n.de, datos: n.datos, recibida: n.recibida }; });
}
async function podarNotificaciones(usuarioId, antesDe) {
    const mias = datos.notificaciones.filter(function (n) { return n.para === usuarioId && n.recibida >= antesDe; })
        .sort(function (a, b) { return b.recibida - a.recibida; }).slice(0, 150);
    datos.notificaciones = datos.notificaciones.filter(function (n) { return n.para !== usuarioId; }).concat(mias);
    guardar();
}
// ---- Conjuntos (seguidores y likes) ----
async function conjuntoAgregar(coleccion, clave, valor) {
    if (!datos.conjuntos.some(function (e) { return e.coleccion === coleccion && e.clave === clave && e.valor === valor; })) {
        datos.conjuntos.push({ coleccion: coleccion, clave: clave, valor: valor, creado: Date.now() });
        guardar();
    }
}
async function conjuntoQuitar(coleccion, clave, valor) {
    const antes = datos.conjuntos.length;
    datos.conjuntos = datos.conjuntos.filter(function (e) { return !(e.coleccion === coleccion && e.clave === clave && e.valor === valor); });
    if (datos.conjuntos.length !== antes) guardar();
}
async function conjuntoLeer(coleccion) {
    return datos.conjuntos.filter(function (e) { return e.coleccion === coleccion; }).map(function (e) { return { clave: e.clave, valor: e.valor }; });
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
// Sin país (null) trae las de todos los países.
async function publicacionesPorPais(pais, usuarioId, limite) {
    return datos.publicaciones.filter(function (p) {
        return (!pais || p.pais === pais) && (p.activo || p.vendedorId === usuarioId);
    }).sort(function (a, b) { return b.creada - a.creada; }).slice(0, limite);
}
async function guardarPerfil(id, perfil) {
    const u = datos.usuarios.find(function (x) { return x.id === id; });
    if (u) { u.perfil = perfil; guardar(); }
}
async function usuariosPublicos(limite) {
    return datos.usuarios.slice().sort(function (a, b) { return (b.creado || 0) - (a.creado || 0); }).slice(0, limite);
}
async function guardarPublicacion(pub) {
    const i = datos.publicaciones.findIndex(function (p) { return p.id === pub.id; });
    if (i >= 0) datos.publicaciones[i] = pub; else datos.publicaciones.push(pub);
    guardar();
}
async function eliminarPublicacion(id) {
    datos.publicaciones = datos.publicaciones.filter(function (p) { return p.id !== id; });
    datos.resenias = datos.resenias.filter(function (x) { return x.publicacionId !== id; });
    datos.preguntas = datos.preguntas.filter(function (q) { return q.publicacionId !== id; });
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
    const quitados = datos.medios.filter(function (m) { return m.usuarioId === usuarioId && usados.indexOf(m.id) < 0; });
    if (quitados.length) {
        datos.medios = datos.medios.filter(function (m) { return quitados.indexOf(m) < 0; });
        guardar();
    }
    return quitados.map(function (m) { return { id: m.id, tipo: m.tipo, enNube: !m.b64 }; });
}

// ---- Pedidos ----
// Pedido: { id, compradorId, vendedorId (o null), pais, datos (el pedido completo), creado, actualizado }
// No se borran al eliminar una cuenta: quedan en el historial de la otra persona.
async function pedidoPorId(id) {
    return datos.pedidos.find(function (p) { return p.id === id; }) || null;
}
async function pedidosDeUsuario(usuarioId, limite) {
    return datos.pedidos.filter(function (p) { return p.compradorId === usuarioId || p.vendedorId === usuarioId; })
        .sort(function (a, b) { return b.creado - a.creado; }).slice(0, limite);
}
async function crearPedidos(lista) {
    lista.forEach(function (p) { datos.pedidos.push(p); });
    guardar();
}
async function guardarPedido(ped) {
    const i = datos.pedidos.findIndex(function (p) { return p.id === ped.id; });
    if (i >= 0) datos.pedidos[i] = ped; else datos.pedidos.push(ped);
    guardar();
}
// Tamaño aproximado de los datos (en esta modalidad solo sirve para probar).
// ---- Comentarios de posts ----
async function comentariosDePost(postId) {
    return datos.postComentarios.filter(function (c) { return c.postId === postId; }).sort(function (a, b) { return a.fecha - b.fecha || (a.id < b.id ? -1 : 1); }).slice(0, 1000);
}
async function comentarioPorId(id) { return datos.postComentarios.find(function (c) { return c.id === id; }) || null; }
async function crearComentario(c) { datos.postComentarios.push(Object.assign({ likes: [], idPadre: null }, c)); guardar(); }
async function borrarComentarioYRespuestas(id) {
    datos.postComentarios = datos.postComentarios.filter(function (c) { return c.id !== id && c.idPadre !== id; });
    guardar();
}
async function guardarLikesComentario(id, likes) {
    const c = datos.postComentarios.find(function (x) { return x.id === id; });
    if (c) { c.likes = likes; guardar(); }
}

// ---- Preguntas al vendedor ----
async function preguntasPublicas(pais, limite) {
    return datos.preguntas.filter(function (q) {
        const p = datos.publicaciones.find(function (x) { return x.id === q.publicacionId; });
        return !!p && (!pais || p.pais === pais);
    }).sort(function (a, b) { return a.fecha - b.fecha; }).slice(0, limite);
}
async function preguntaPorId(id) { return datos.preguntas.find(function (q) { return q.id === id; }) || null; }
async function contarPreguntasDe(publicacionId) { return datos.preguntas.filter(function (q) { return q.publicacionId === publicacionId; }).length; }
async function crearPregunta(x) { datos.preguntas.push(Object.assign({ respuesta: null, respondida: null }, x)); guardar(); }
async function responderPregunta(id, texto, ts) {
    const q = datos.preguntas.find(function (y) { return y.id === id; });
    if (q) { q.respuesta = texto; q.respondida = ts; guardar(); }
}

async function tamanoBytes() { return Buffer.byteLength(JSON.stringify(datos)); }

module.exports = {
    comentariosDePost: comentariosDePost, comentarioPorId: comentarioPorId, crearComentario: crearComentario, borrarComentarioYRespuestas: borrarComentarioYRespuestas, guardarLikesComentario: guardarLikesComentario,
    preguntasPublicas: preguntasPublicas, preguntaPorId: preguntaPorId, contarPreguntasDe: contarPreguntasDe, crearPregunta: crearPregunta, responderPregunta: responderPregunta,
    guardarNotificacion: guardarNotificacion, notificacionesDe: notificacionesDe, podarNotificaciones: podarNotificaciones,
    conjuntoAgregar: conjuntoAgregar, conjuntoQuitar: conjuntoQuitar, conjuntoLeer: conjuntoLeer,
    chatPorId: chatPorId, guardarChat: guardarChat, mensajePorId: mensajePorId, agregarMensaje: agregarMensaje, actualizarMensaje: actualizarMensaje,
    chatsDeUsuarioDesde: chatsDeUsuarioDesde, mensajesDeUsuarioDesde: mensajesDeUsuarioDesde,
    reseniasPublicas: reseniasPublicas, reseniasDeUsuarioEn: reseniasDeUsuarioEn, reseniaPorId: reseniaPorId, crearResenia: crearResenia, borrarResenia: borrarResenia,
    pedidoPorId: pedidoPorId, pedidosDeUsuario: pedidosDeUsuario, crearPedidos: crearPedidos, guardarPedido: guardarPedido,
    crearReporte: crearReporte, reportesDeObjetivo: reportesDeObjetivo, contarReportesDeCuenta: contarReportesDeCuenta, cerrarReportes: cerrarReportes,
    usuarioPorIdPublico: usuarioPorIdPublico, fijarBaneo: fijarBaneo, fijarDesactivada: fijarDesactivada, idsBaneados: idsBaneados,
    tamanoBytes: tamanoBytes,
    publicacionPorId: publicacionPorId, publicacionesDeUsuario: publicacionesDeUsuario, publicacionesPorPais: publicacionesPorPais,
    guardarPublicacion: guardarPublicacion, eliminarPublicacion: eliminarPublicacion,
    guardarMedio: guardarMedio, medioPorId: medioPorId, borrarMediosSobrantes: borrarMediosSobrantes,
    eliminarUsuario: eliminarUsuario, guardarPerfil: guardarPerfil, usuariosPublicos: usuariosPublicos,
    guardarVerificacion: guardarVerificacion, verificacionesPendientes: verificacionesPendientes,
    fotosVerificacion: fotosVerificacion, resolverVerificacion: resolverVerificacion,
    dispositivoConocido: dispositivoConocido, registrarDispositivo: registrarDispositivo, borrarDispositivos: borrarDispositivos,
    cambiarPassword: cambiarPassword, borrarSesionesDeUsuario: borrarSesionesDeUsuario,
    tipo: 'archivo', DIR: DIR, listo: Promise.resolve(), cerrar: cerrar,
    usuarioPorEmail: usuarioPorEmail, usuarioPorId: usuarioPorId, crearUsuario: crearUsuario,
    crearSesion: crearSesion, sesionPorHash: sesionPorHash, borrarSesion: borrarSesion, limpiarVencidas: limpiarVencidas
};
