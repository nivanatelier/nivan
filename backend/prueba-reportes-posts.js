// Prueba: reportar posts de perfil y comentarios llega a la administración (mismo panel que publicaciones y perfiles).
'use strict';
const BASE = process.env.BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);
const CLAVE = process.env.ADMIN_CLAVE || 'ClaveDelPanel123';
async function post(ruta, b, cookie) { const r = await fetch(BASE + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookie || '' }, body: JSON.stringify(b || {}) }); const sc = r.headers.get('set-cookie'); return { e: r.status, j: await r.json().catch(() => ({})), c: sc ? sc.split(';')[0] : null }; }
let fallos = 0; function chk(n, c, x) { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  →  ' + x)); if (!c) fallos++; }
(async () => {
    const pw = 'Clave.Segura1';
    const adm = await post('/api/registro', { aceptoTerminos: true, nombre: 'Admin Uno', email: 'admin@gmail.com', password: pw, pais: 'UY' });
    await post('/api/admin/entrar', { clave: CLAVE }, adm.c);
    const A = await post('/api/registro', { aceptoTerminos: true, nombre: 'Duena Post', email: 'duena@gmail.com', password: pw, pais: 'UY' });
    const B = await post('/api/registro', { aceptoTerminos: true, nombre: 'Reporta Uno', email: 'reporta@gmail.com', password: pw, pais: 'UY' });
    const idA = A.j.usuario.id, F = Date.now() - 5000, postId = idA + '_' + F;
    await post('/api/perfil/guardar', { perfil: { portafolio: [{ fecha: F, texto: 'Mi primer post' }], privacidad: { verPerfil: 'todos' } } }, A.c);

    console.log('Reportar un post de perfil');
    let r = await post('/api/reportes', { tipo: 'post', objetivoId: postId, motivo: 'ofensivo', detalle: 'no va' });
    chk('sin sesión → 401', r.e === 401);
    r = await post('/api/reportes', { tipo: 'post', objetivoId: postId, motivo: 'ofensivo', detalle: 'no va' }, B.c);
    chk('B reporta el post → 200', r.e === 200, JSON.stringify(r.j));
    r = await post('/api/reportes', { tipo: 'post', objetivoId: postId, motivo: 'ofensivo' }, B.c);
    chk('reportar dos veces → 409', r.e === 409);
    r = await post('/api/reportes', { tipo: 'post', objetivoId: postId, motivo: 'ofensivo' }, A.c);
    chk('la dueña no puede reportarse → 400', r.e === 400);
    r = await post('/api/reportes', { tipo: 'post', objetivoId: 'noexiste_123', motivo: 'ofensivo' }, B.c);
    chk('post de una cuenta que no existe → 404', r.e === 404);
    r = await post('/api/reportes', { tipo: 'cosa', objetivoId: postId, motivo: 'ofensivo' }, B.c);
    chk('tipo inválido → 400', r.e === 400);

    console.log('\nLo ve la administración');
    r = await post('/api/admin/reportes/objetivo', { tipo: 'post', objetivoId: postId }, B.c);
    chk('cuenta común no entra → 403', r.e === 403);
    r = await post('/api/admin/reportes/objetivo', { tipo: 'post', objetivoId: postId }, adm.c);
    chk('el panel de moderación muestra la cuenta responsable y el reporte', r.e === 200 && r.j.cuenta.id === idA && r.j.reportes.length === 1 && r.j.reportes[0].por === 'Reporta Uno', JSON.stringify(r.j));
    r = await post('/api/admin/cuenta/banear', { usuarioId: idA, tipo: 'temporal', dias: 3, alcance: 'vender', motivo: 'Post ofensivo', reporte: { tipo: 'post', objetivoId: postId } }, adm.c);
    chk('suspender desde el reporte → 200', r.e === 200);
    r = await post('/api/admin/reportes/objetivo', { tipo: 'post', objetivoId: postId }, adm.c);
    chk('el reporte queda resuelto', r.j.reportes[0].estado === 'resuelto', JSON.stringify(r.j.reportes));

    console.log('\nReportar un comentario');
    const C = await post('/api/comentarios/crear', { postId: postId, texto: 'Comentario feo' }, B.c);
    const idC = C.j.id;
    chk('B comenta', C.e === 200 && idC, JSON.stringify(C.j));
    r = await post('/api/reportes', { tipo: 'comentario', objetivoId: idC, motivo: 'spam' }, A.c);
    chk('A reporta el comentario de B → 200', r.e === 200, JSON.stringify(r.j));
    r = await post('/api/admin/reportes/objetivo', { tipo: 'comentario', objetivoId: idC }, adm.c);
    chk('el admin ve la cuenta de B como responsable', r.e === 200 && r.j.cuenta.id === B.j.usuario.id, JSON.stringify(r.j));
    r = await post('/api/admin/reportes/descartar', { tipo: 'comentario', objetivoId: idC }, adm.c);
    chk('descartar → 200', r.e === 200);
    console.log(fallos ? '\nFALLARON ' + fallos : '\nTodo bien.'); process.exit(fallos ? 1 : 0);
})();
