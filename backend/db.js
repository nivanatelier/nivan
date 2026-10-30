// ==============================
// NIVAN · Elige dónde se guardan los datos
// ==============================
//   Con DATABASE_URL  → PostgreSQL (producción: Render, Neon, Supabase)
//   Sin DATABASE_URL  → archivo datos/db.json (pruebas en el celular o la compu)
// El resto del backend usa siempre la misma interfaz, sin importar cuál esté activa.
'use strict';
module.exports = process.env.DATABASE_URL ? require('./db-postgres') : require('./db-archivo');
