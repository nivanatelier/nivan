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
    CREATE INDEX sesiones_vence_idx ON sesiones (vence);`
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
async function cambiarPassword(id, hash) { await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, id]); }
// Borra la cuenta; las sesiones se van solas por ON DELETE CASCADE.
async function eliminarUsuario(id) { await pool.query('DELETE FROM usuarios WHERE id = $1', [id]); }
async function cerrar() { await pool.end(); }

process.on('SIGTERM', function () { cerrar().finally(function () { process.exit(0); }); });
process.on('SIGINT', function () { cerrar().finally(function () { process.exit(0); }); });

module.exports = {
    eliminarUsuario: eliminarUsuario,
    cambiarPassword: cambiarPassword,
    tipo: 'postgres', listo: listo, cerrar: cerrar,
    usuarioPorEmail: usuarioPorEmail, usuarioPorId: usuarioPorId, crearUsuario: crearUsuario,
    crearSesion: crearSesion, sesionPorHash: sesionPorHash, borrarSesion: borrarSesion, limpiarVencidas: limpiarVencidas
};
