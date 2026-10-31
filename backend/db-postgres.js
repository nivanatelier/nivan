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
    );`
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
        verificacion: f.verificacion || null, creado: +f.creado
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
async function cambiarPassword(id, hash) { await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, id]); }
// Borra la cuenta; las sesiones se van solas por ON DELETE CASCADE.
async function eliminarUsuario(id) { await pool.query('DELETE FROM usuarios WHERE id = $1', [id]); }

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
async function publicacionesPorPais(pais, usuarioId, limite) {
    const r = await pool.query(
        'SELECT * FROM publicaciones WHERE pais = $1 AND (activo OR vendedor_id = $2) ORDER BY creada DESC LIMIT $3',
        [pais, usuarioId || '', limite]);
    return r.rows.map(aPublicacion);
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
async function borrarMediosSobrantes(usuarioId, usados) {
    await pool.query('DELETE FROM medios WHERE usuario_id = $1 AND NOT (id = ANY($2::text[]))', [usuarioId, usados]);
}
async function cerrar() { await pool.end(); }

process.on('SIGTERM', function () { cerrar().finally(function () { process.exit(0); }); });
process.on('SIGINT', function () { cerrar().finally(function () { process.exit(0); }); });

module.exports = {
    publicacionPorId: publicacionPorId, publicacionesDeUsuario: publicacionesDeUsuario, publicacionesPorPais: publicacionesPorPais,
    guardarPublicacion: guardarPublicacion, eliminarPublicacion: eliminarPublicacion,
    guardarMedio: guardarMedio, medioPorId: medioPorId, borrarMediosSobrantes: borrarMediosSobrantes,
    eliminarUsuario: eliminarUsuario,
    guardarVerificacion: guardarVerificacion, verificacionesPendientes: verificacionesPendientes,
    fotosVerificacion: fotosVerificacion, resolverVerificacion: resolverVerificacion,
    cambiarPassword: cambiarPassword, borrarSesionesDeUsuario: borrarSesionesDeUsuario,
    tipo: 'postgres', listo: listo, cerrar: cerrar,
    usuarioPorEmail: usuarioPorEmail, usuarioPorId: usuarioPorId, crearUsuario: crearUsuario,
    crearSesion: crearSesion, sesionPorHash: sesionPorHash, borrarSesion: borrarSesion, limpiarVencidas: limpiarVencidas
};
