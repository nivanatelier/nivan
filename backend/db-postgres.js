// ==============================
// NIVAN · Almacén en PostgreSQL
// ==============================
// Se usa cuando existe la variable DATABASE_URL (Render, Neon, Supabase...).
// Las tablas se crean solas al arrancar. Para sumar tablas nuevas más adelante: agregar otro
// bloque al arreglo MIGRACIONES (nunca editar uno viejo: se ejecutan una sola vez, en orden).
'use strict';
const { Pool } = require('pg');

const MAX_SESIONES_POR_USUARIO = 10;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // DATABASE_SSL=1 si te conectás desde afuera de Render (Neon, Supabase, URL "externa" de Render).
    ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : undefined,
    max: 10
});
pool.on('error', function (e) { console.error('Error en la conexión a la base:', e.message); });

const MIGRACIONES = [
    // 1 · cuentas y sesiones
    `CREATE TABLE usuarios (
        id            TEXT PRIMARY KEY,
        nombre        TEXT NOT NULL,
        apodo         TEXT NOT NULL DEFAULT '',
        id_publico    TEXT NOT NULL,
        nombre_tienda TEXT NOT NULL DEFAULT '',
        email         TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        pais          TEXT NOT NULL DEFAULT 'AR',
        foto          TEXT NOT NULL DEFAULT '',
        bio           TEXT NOT NULL DEFAULT '',
        bio_trabajo   TEXT NOT NULL DEFAULT '',
        verificacion  JSONB,
        creado        BIGINT NOT NULL,
        CONSTRAINT usuarios_email_key UNIQUE (email),
        CONSTRAINT usuarios_id_publico_key UNIQUE (id_publico)
    );
    CREATE TABLE sesiones (
        h          TEXT PRIMARY KEY,
        usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        creada     BIGINT NOT NULL,
        vence      BIGINT NOT NULL,
        ip         TEXT NOT NULL DEFAULT '',
        ua         TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX sesiones_usuario_idx ON sesiones (usuario_id);
    CREATE INDEX sesiones_vence_idx ON sesiones (vence);`,
    // 2 · publicaciones y sus fotos/videos
    `CREATE TABLE publicaciones (
        id          TEXT PRIMARY KEY,
        vendedor_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        pais        TEXT NOT NULL,
        activo      BOOLEAN NOT NULL DEFAULT TRUE,
        datos       JSONB NOT NULL,
        creada      BIGINT NOT NULL,
        actualizada BIGINT NOT NULL
    );
    CREATE INDEX publicaciones_pais_idx ON publicaciones (pais, activo, creada DESC);
    CREATE INDEX publicaciones_vendedor_idx ON publicaciones (vendedor_id);
    CREATE TABLE medios (
        id         TEXT PRIMARY KEY,
        usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        tipo       TEXT NOT NULL,
        datos      BYTEA NOT NULL,
        creado     BIGINT NOT NULL
    );
    CREATE INDEX medios_usuario_idx ON medios (usuario_id);`,
    // 3 · fotos de verificación de identidad (privadas: solo las ve quien revisa; se borran al resolver)
    `CREATE TABLE verificaciones_fotos (
        usuario_id TEXT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
        fotos      JSONB NOT NULL,
        enviada    BIGINT NOT NULL
    );`,
    // 4 · baneos de cuentas (permanente o con fecha de fin, siempre con motivo)
    `ALTER TABLE usuarios ADD COLUMN baneo JSONB;`,
    // 5 · perfil público (bio, foto, posts del portafolio y datos de tienda), visible para todos los países
    `ALTER TABLE usuarios ADD COLUMN perfil JSONB;`,
    // 6 · dispositivos conocidos de cada cuenta (para avisar por email cuando entra uno nuevo)
    `CREATE TABLE dispositivos (
        usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        h          TEXT NOT NULL,
        visto      BIGINT NOT NULL,
        PRIMARY KEY (usuario_id, h)
    );`,
    // 7 · reportes de publicaciones y cuentas (los ve solo la administración). Una persona reporta cada cosa una sola vez.
    `CREATE TABLE reportes (
        id                TEXT PRIMARY KEY,
        tipo              TEXT NOT NULL,
        objetivo_id       TEXT NOT NULL,
        objetivo_nombre   TEXT NOT NULL DEFAULT '',
        cuenta_id         TEXT,
        motivo            TEXT NOT NULL,
        detalle           TEXT NOT NULL DEFAULT '',
        reportante_id     TEXT NOT NULL,
        reportante_nombre TEXT NOT NULL DEFAULT '',
        fecha             BIGINT NOT NULL,
        estado            TEXT NOT NULL DEFAULT 'pendiente',
        resolucion        TEXT NOT NULL DEFAULT '',
        CONSTRAINT reportes_unico UNIQUE (reportante_id, tipo, objetivo_id)
    );
    CREATE INDEX reportes_objetivo_idx ON reportes (tipo, objetivo_id);
    CREATE INDEX reportes_cuenta_idx ON reportes (cuenta_id);`,
    // 8 · pedidos (compras y ventas). Sin clave foránea a usuarios: al borrar una cuenta el pedido queda en el historial de la otra persona.
    `CREATE TABLE pedidos (
        id           TEXT PRIMARY KEY,
        comprador_id TEXT NOT NULL,
        vendedor_id  TEXT,
        pais         TEXT NOT NULL,
        datos        JSONB NOT NULL,
        creado       BIGINT NOT NULL,
        actualizado  BIGINT NOT NULL
    );
    CREATE INDEX pedidos_comprador_idx ON pedidos (comprador_id, creado DESC);
    CREATE INDEX pedidos_vendedor_idx ON pedidos (vendedor_id, creado DESC);`,
    // 9 · chats entre dos personas y sus mensajes (solo texto). Sin clave foránea a usuarios: se borran a mano al eliminar la cuenta.
    `CREATE TABLE chats (
        id          TEXT PRIMARY KEY,
        a_id        TEXT NOT NULL,
        b_id        TEXT NOT NULL,
        datos       JSONB NOT NULL,
        actualizado BIGINT NOT NULL
    );
    CREATE INDEX chats_a_idx ON chats (a_id, actualizado);
    CREATE INDEX chats_b_idx ON chats (b_id, actualizado);
    CREATE TABLE chat_mensajes (
        chat_id    TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        id         TEXT NOT NULL,
        fecha      BIGINT NOT NULL,
        modificado BIGINT NOT NULL,
        datos      JSONB NOT NULL,
        PRIMARY KEY (chat_id, id)
    );
    CREATE INDEX chat_mensajes_mod_idx ON chat_mensajes (modificado);`
];

async function migrar() {
    const c = await pool.connect();
    try {
        await c.query('CREATE TABLE IF NOT EXISTS migraciones (n INTEGER PRIMARY KEY, aplicada BIGINT NOT NULL)');
        // Candado: si dos instancias arrancan a la vez, la segunda espera a que la primera termine.
        await c.query('SELECT pg_advisory_lock(7770001)');
        try {
            const r = await c.query('SELECT COALESCE(MAX(n), 0) AS n FROM migraciones');
            const hechas = +r.rows[0].n;
            for (let i = hechas; i < MIGRACIONES.length; i++) {
                await c.query('BEGIN');
                try {
                    await c.query(MIGRACIONES[i]);
                    await c.query('INSERT INTO migraciones (n, aplicada) VALUES ($1, $2)', [i + 1, Date.now()]);
                    await c.query('COMMIT');
                    console.log('Base de datos: migración ' + (i + 1) + ' aplicada.');
                } catch (e) { await c.query('ROLLBACK'); throw e; }
            }
        } finally {
            await c.query('SELECT pg_advisory_unlock(7770001)');
        }
    } finally { c.release(); }
}
const listo = migrar();

function aUsuario(f) {
    if (!f) return null;
    return {
        id: f.id, nombre: f.nombre, apodo: f.apodo, idPublico: f.id_publico, nombreTienda: f.nombre_tienda,
        email: f.email, passwordHash: f.password_hash, pais: f.pais, foto: f.foto, bio: f.bio, bioTrabajo: f.bio_trabajo,
        verificacion: f.verificacion || null, baneo: f.baneo || null, perfil: f.perfil || null, creado: +f.creado
    };
}

async function usuarioPorEmail(email) {
    const r = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    return aUsuario(r.rows[0]);
}
async function usuarioPorId(id) {
    const r = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    return aUsuario(r.rows[0]);
}
async function crearUsuario(u, raizIdPublico) {
    let n = 0;
    for (;;) {
        const cand = n === 0 ? raizIdPublico : raizIdPublico + n;
        try {
            await pool.query(
                `INSERT INTO usuarios (id, nombre, apodo, id_publico, nombre_tienda, email, password_hash, pais, foto, bio, bio_trabajo, verificacion, creado)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [u.id, u.nombre, u.apodo, cand, u.nombreTienda, u.email, u.passwordHash, u.pais, u.foto, u.bio, u.bioTrabajo,
                 u.verificacion ? JSON.stringify(u.verificacion) : null, u.creado]
            );
            u.idPublico = cand;
            return u;
        } catch (e) {
            if (e.code === '23505') {   // violación de UNIQUE
                if (e.constraint === 'usuarios_email_key') { const x = new Error('email duplicado'); x.codigo = 'EMAIL_DUPLICADO'; throw x; }
                if (e.constraint === 'usuarios_id_publico_key') { n++; continue; }
            }
            throw e;
        }
    }
}
async function crearSesion(s) {
    await pool.query(
        'INSERT INTO sesiones (h, usuario_id, creada, vence, ip, ua) VALUES ($1,$2,$3,$4,$5,$6)',
        [s.h, s.usuarioId, s.creada, s.vence, s.ip || '', s.ua || '']
    );
    // Se quedan solo las 10 más nuevas de esa cuenta.
    await pool.query(
        `DELETE FROM sesiones WHERE usuario_id = $1 AND h NOT IN
         (SELECT h FROM sesiones WHERE usuario_id = $1 ORDER BY creada DESC LIMIT ${MAX_SESIONES_POR_USUARIO})`,
        [s.usuarioId]
    );
}
async function sesionPorHash(h) {
    const r = await pool.query('SELECT h, usuario_id, creada, vence FROM sesiones WHERE h = $1', [h]);
    const f = r.rows[0];
    if (!f) return null;
    if (+f.vence < Date.now()) { await borrarSesion(h); return null; }
    return { h: f.h, usuarioId: f.usuario_id, creada: +f.creada, vence: +f.vence };
}
async function borrarSesion(h) { await pool.query('DELETE FROM sesiones WHERE h = $1', [h]); }
async function limpiarVencidas() { await pool.query('DELETE FROM sesiones WHERE vence < $1', [Date.now()]); }
async function borrarSesionesDeUsuario(id) { await pool.query('DELETE FROM sesiones WHERE usuario_id = $1', [id]); }
async function guardarVerificacion(id, estado, fotos) {
    await pool.query('UPDATE usuarios SET verificacion = $2 WHERE id = $1', [id, JSON.stringify(estado)]);
    if (fotos) await pool.query(
        'INSERT INTO verificaciones_fotos (usuario_id, fotos, enviada) VALUES ($1,$2,$3) ON CONFLICT (usuario_id) DO UPDATE SET fotos = $2, enviada = $3',
        [id, JSON.stringify(fotos), Date.now()]);
}
async function verificacionesPendientes() {
    const r = await pool.query("SELECT id, nombre, email, id_publico, verificacion FROM usuarios WHERE verificacion->>'estado' = 'pendiente' ORDER BY (verificacion->>'enviada')::bigint ASC LIMIT 200");
    return r.rows.map(function (f) { return { id: f.id, nombre: f.nombre, email: f.email, idPublico: f.id_publico, enviada: f.verificacion.enviada }; });
}
async function fotosVerificacion(id) {
    const r = await pool.query('SELECT fotos FROM verificaciones_fotos WHERE usuario_id = $1', [id]);
    return r.rows[0] ? r.rows[0].fotos : null;
}
async function resolverVerificacion(id, estado) {
    await pool.query('UPDATE usuarios SET verificacion = $2 WHERE id = $1', [id, JSON.stringify(estado)]);
    await pool.query('DELETE FROM verificaciones_fotos WHERE usuario_id = $1', [id]);
}
async function usuarioPorIdPublico(idPublico) {
    const r = await pool.query('SELECT * FROM usuarios WHERE id_publico = $1', [idPublico]);
    return aUsuario(r.rows[0]);
}
// baneo = { permanente, hasta, motivo, fecha, por }  ·  null = quitar el baneo
async function fijarBaneo(id, baneo) {
    await pool.query('UPDATE usuarios SET baneo = $2 WHERE id = $1', [id, baneo ? JSON.stringify(baneo) : null]);
}
// Ids de las cuentas que hoy están baneadas (permanente, o temporal que todavía no venció).
// Cuentas cuyas publicaciones no se muestran: baneo total, o suspensión para vender. Una suspensión solo para comprar no las oculta.
async function idsBaneados() {
    const r = await pool.query("SELECT id FROM usuarios WHERE baneo IS NOT NULL AND COALESCE(baneo->>'alcance', 'todo') <> 'comprar' AND ((baneo->>'permanente') = 'true' OR COALESCE((baneo->>'hasta')::bigint, 0) > $1)", [Date.now()]);
    return r.rows.map(function (f) { return f.id; });
}
async function dispositivoConocido(id, h) {
    const r = await pool.query('SELECT 1 FROM dispositivos WHERE usuario_id = $1 AND h = $2', [id, h]);
    return r.rows.length > 0;
}
async function registrarDispositivo(id, h) {
    await pool.query('INSERT INTO dispositivos (usuario_id, h, visto) VALUES ($1,$2,$3) ON CONFLICT (usuario_id, h) DO UPDATE SET visto = $3', [id, h, Date.now()]);
    await pool.query('DELETE FROM dispositivos WHERE usuario_id = $1 AND h NOT IN (SELECT h FROM dispositivos WHERE usuario_id = $1 ORDER BY visto DESC LIMIT 30)', [id]);
}
async function borrarDispositivos(id) { await pool.query('DELETE FROM dispositivos WHERE usuario_id = $1', [id]); }
async function cambiarPassword(id, hash) { await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, id]); }
// Borra la cuenta; las sesiones se van solas por ON DELETE CASCADE.
async function eliminarUsuario(id) {
    await pool.query('DELETE FROM chats WHERE a_id = $1 OR b_id = $1', [id]);     // sus chats (y mensajes) se van con la cuenta
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
}

// ---- Publicaciones y medios ----
function aPublicacion(f) {
    return f ? { id: f.id, vendedorId: f.vendedor_id, pais: f.pais, activo: f.activo, datos: f.datos, creada: +f.creada, actualizada: +f.actualizada } : null;
}
async function publicacionPorId(id) {
    const r = await pool.query('SELECT * FROM publicaciones WHERE id = $1', [id]);
    return aPublicacion(r.rows[0]);
}
async function publicacionesDeUsuario(usuarioId) {
    const r = await pool.query('SELECT * FROM publicaciones WHERE vendedor_id = $1', [usuarioId]);
    return r.rows.map(aPublicacion);
}
// Sin país (null) trae las de todos los países.
async function publicacionesPorPais(pais, usuarioId, limite) {
    const r = pais
        ? await pool.query('SELECT * FROM publicaciones WHERE pais = $1 AND (activo OR vendedor_id = $2) ORDER BY creada DESC LIMIT $3', [pais, usuarioId || '', limite])
        : await pool.query('SELECT * FROM publicaciones WHERE (activo OR vendedor_id = $1) ORDER BY creada DESC LIMIT $2', [usuarioId || '', limite]);
    return r.rows.map(aPublicacion);
}
async function guardarPerfil(id, perfil) { await pool.query('UPDATE usuarios SET perfil = $2 WHERE id = $1', [id, JSON.stringify(perfil)]); }
async function usuariosPublicos(limite) {
    const r = await pool.query('SELECT * FROM usuarios ORDER BY creado DESC LIMIT $1', [limite]);
    return r.rows.map(aUsuario);
}
async function guardarPublicacion(p) {
    await pool.query(
        `INSERT INTO publicaciones (id, vendedor_id, pais, activo, datos, creada, actualizada) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET pais = $3, activo = $4, datos = $5, actualizada = $7`,
        [p.id, p.vendedorId, p.pais, p.activo, JSON.stringify(p.datos), p.creada, p.actualizada]);
}
async function eliminarPublicacion(id) { await pool.query('DELETE FROM publicaciones WHERE id = $1', [id]); }
async function guardarMedio(m) {
    await pool.query('INSERT INTO medios (id, usuario_id, tipo, datos, creado) VALUES ($1,$2,$3,$4,$5)',
        [m.id, m.usuarioId, m.tipo, Buffer.from(m.b64, 'base64'), m.creado]);
}
async function medioPorId(id) {
    const r = await pool.query('SELECT tipo, datos FROM medios WHERE id = $1', [id]);
    return r.rows[0] ? { tipo: r.rows[0].tipo, bytes: r.rows[0].datos } : null;
}
// Devuelve lo que borró. enNube = el archivo vive en Cloudinary (en la base solo queda un registro vacío).
async function borrarMediosSobrantes(usuarioId, usados) {
    const r = await pool.query('DELETE FROM medios WHERE usuario_id = $1 AND NOT (id = ANY($2::text[])) RETURNING id, tipo, octet_length(datos) AS n', [usuarioId, usados]);
    return r.rows.map(function (f) { return { id: f.id, tipo: f.tipo, enNube: +f.n === 0 }; });
}
async function tamanoBytes() {
    const r = await pool.query('SELECT pg_database_size(current_database()) AS n');
    return +r.rows[0].n;
}
async function cerrar() { await pool.end(); }

// ---- Pedidos ----
function aPedido(f) {
    return f ? { id: f.id, compradorId: f.comprador_id, vendedorId: f.vendedor_id || null, pais: f.pais, datos: f.datos, creado: +f.creado, actualizado: +f.actualizado } : null;
}
async function pedidoPorId(id) {
    const r = await pool.query('SELECT * FROM pedidos WHERE id = $1', [id]);
    return aPedido(r.rows[0]);
}
async function pedidosDeUsuario(usuarioId, limite) {
    const r = await pool.query('SELECT * FROM pedidos WHERE comprador_id = $1 OR vendedor_id = $1 ORDER BY creado DESC LIMIT $2', [usuarioId, limite]);
    return r.rows.map(aPedido);
}
async function crearPedidos(lista) {
    const c = await pool.connect();
    try {
        await c.query('BEGIN');
        for (const p of lista) {
            await c.query('INSERT INTO pedidos (id, comprador_id, vendedor_id, pais, datos, creado, actualizado) VALUES ($1,$2,$3,$4,$5,$6,$7)',
                [p.id, p.compradorId, p.vendedorId || null, p.pais, JSON.stringify(p.datos), p.creado, p.actualizado]);
        }
        await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
async function guardarPedido(p) {
    await pool.query('UPDATE pedidos SET datos = $2, actualizado = $3 WHERE id = $1', [p.id, JSON.stringify(p.datos), p.actualizado]);
}

// ---- Chats ----
function aChat(f) { return f ? { id: f.id, aId: f.a_id, bId: f.b_id, datos: f.datos, actualizado: +f.actualizado } : null; }
function aMensaje(f) { return { chatId: f.chat_id, id: f.id, fecha: +f.fecha, modificado: +f.modificado, datos: f.datos }; }
async function chatPorId(id) {
    const r = await pool.query('SELECT * FROM chats WHERE id = $1', [id]);
    return aChat(r.rows[0]);
}
async function guardarChat(c) {
    await pool.query(
        `INSERT INTO chats (id, a_id, b_id, datos, actualizado) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET datos = $4, actualizado = $5`,
        [c.id, c.aId, c.bId, JSON.stringify(c.datos), c.actualizado]);
}
async function mensajePorId(chatId, id) {
    const r = await pool.query('SELECT * FROM chat_mensajes WHERE chat_id = $1 AND id = $2', [chatId, id]);
    return r.rows[0] ? aMensaje(r.rows[0]) : null;
}
// true si se guardó, false si ya estaba (un reintento del mismo mensaje no se duplica).
async function agregarMensaje(chatId, m) {
    const r = await pool.query(
        'INSERT INTO chat_mensajes (chat_id, id, fecha, modificado, datos) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (chat_id, id) DO NOTHING',
        [chatId, m.id, m.fecha, m.modificado, JSON.stringify(m.datos)]);
    return r.rowCount > 0;
}
async function actualizarMensaje(chatId, id, datos, modificado) {
    await pool.query('UPDATE chat_mensajes SET datos = $3, modificado = $4 WHERE chat_id = $1 AND id = $2', [chatId, id, JSON.stringify(datos), modificado]);
}
async function chatsDeUsuarioDesde(usuarioId, desde, limite) {
    const r = await pool.query('SELECT * FROM chats WHERE (a_id = $1 OR b_id = $1) AND actualizado > $2 ORDER BY actualizado LIMIT $3', [usuarioId, desde, limite]);
    return r.rows.map(aChat);
}
async function mensajesDeUsuarioDesde(usuarioId, desde, limite) {
    const r = await pool.query(
        `SELECT m.* FROM chat_mensajes m JOIN chats c ON c.id = m.chat_id
         WHERE (c.a_id = $1 OR c.b_id = $1) AND m.modificado > $2 ORDER BY m.modificado, m.id LIMIT $3`, [usuarioId, desde, limite]);
    return r.rows.map(aMensaje);
}

// ---- Reportes ----
function aReporte(f) {
    return { id: f.id, tipo: f.tipo, objetivoId: f.objetivo_id, objetivoNombre: f.objetivo_nombre, cuentaId: f.cuenta_id, motivo: f.motivo,
        detalle: f.detalle, reportanteId: f.reportante_id, reportanteNombre: f.reportante_nombre, fecha: +f.fecha, estado: f.estado, resolucion: f.resolucion };
}
// Lanza { codigo: 'REPORTE_DUPLICADO' } si esa persona ya reportó eso.
async function crearReporte(r) {
    try {
        await pool.query(
            `INSERT INTO reportes (id, tipo, objetivo_id, objetivo_nombre, cuenta_id, motivo, detalle, reportante_id, reportante_nombre, fecha)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [r.id, r.tipo, r.objetivoId, r.objetivoNombre, r.cuentaId || null, r.motivo, r.detalle, r.reportanteId, r.reportanteNombre, r.fecha]);
    } catch (e) {
        if (e.code === '23505') { const x = new Error('reporte duplicado'); x.codigo = 'REPORTE_DUPLICADO'; throw x; }
        throw e;
    }
}
async function reportesDeObjetivo(tipo, objetivoId) {
    const r = await pool.query('SELECT * FROM reportes WHERE tipo = $1 AND objetivo_id = $2 ORDER BY fecha DESC LIMIT 100', [tipo, objetivoId]);
    return r.rows.map(aReporte);
}
async function contarReportesDeCuenta(cuentaId) {
    const r = await pool.query("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE estado = 'pendiente') AS pendientes FROM reportes WHERE cuenta_id = $1", [cuentaId]);
    return { total: +r.rows[0].total, pendientes: +r.rows[0].pendientes };
}
async function cerrarReportes(tipo, objetivoId, estado, resolucion) {
    await pool.query("UPDATE reportes SET estado = $3, resolucion = $4 WHERE tipo = $1 AND objetivo_id = $2 AND estado = 'pendiente'", [tipo, objetivoId, estado, resolucion]);
}

process.on('SIGTERM', function () { cerrar().finally(function () { process.exit(0); }); });
process.on('SIGINT', function () { cerrar().finally(function () { process.exit(0); }); });

module.exports = {
    chatPorId: chatPorId, guardarChat: guardarChat, mensajePorId: mensajePorId, agregarMensaje: agregarMensaje, actualizarMensaje: actualizarMensaje,
    chatsDeUsuarioDesde: chatsDeUsuarioDesde, mensajesDeUsuarioDesde: mensajesDeUsuarioDesde,
    pedidoPorId: pedidoPorId, pedidosDeUsuario: pedidosDeUsuario, crearPedidos: crearPedidos, guardarPedido: guardarPedido,
    usuarioPorIdPublico: usuarioPorIdPublico, fijarBaneo: fijarBaneo, idsBaneados: idsBaneados,
    crearReporte: crearReporte, reportesDeObjetivo: reportesDeObjetivo, contarReportesDeCuenta: contarReportesDeCuenta, cerrarReportes: cerrarReportes,
    publicacionPorId: publicacionPorId, publicacionesDeUsuario: publicacionesDeUsuario, publicacionesPorPais: publicacionesPorPais,
    guardarPublicacion: guardarPublicacion, eliminarPublicacion: eliminarPublicacion,
    guardarMedio: guardarMedio, medioPorId: medioPorId, borrarMediosSobrantes: borrarMediosSobrantes,
    eliminarUsuario: eliminarUsuario, guardarPerfil: guardarPerfil, usuariosPublicos: usuariosPublicos,
    guardarVerificacion: guardarVerificacion, verificacionesPendientes: verificacionesPendientes,
    fotosVerificacion: fotosVerificacion, resolverVerificacion: resolverVerificacion,
    dispositivoConocido: dispositivoConocido, registrarDispositivo: registrarDispositivo, borrarDispositivos: borrarDispositivos,
    cambiarPassword: cambiarPassword, borrarSesionesDeUsuario: borrarSesionesDeUsuario,
    tipo: 'postgres', listo: listo, cerrar: cerrar, tamanoBytes: tamanoBytes,
    usuarioPorEmail: usuarioPorEmail, usuarioPorId: usuarioPorId, crearUsuario: crearUsuario,
    crearSesion: crearSesion, sesionPorHash: sesionPorHash, borrarSesion: borrarSesion, limpiarVencidas: limpiarVencidas
};
