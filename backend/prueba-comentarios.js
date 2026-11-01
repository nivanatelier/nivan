// Prueba de comentarios de posts y preguntas al vendedor. Levantá el servidor así:
//   ADMIN_EMAILS=admin@gmail.com ADMIN_CLAVE=ClaveDelPanel123 NIVAN_DATOS=/tmp/otra node server.js
// y corré:  node prueba-comentarios.js
'use strict';
const http = require('http');
const BASE = process.env.BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);
function pedir(metodo, ruta, cuerpo, cookie) {
    return new Promise(function (ok, mal) {
        const u = new URL(ruta, BASE), d = cuerpo === undefined ? null : JSON.stringify(cuerpo);
        const h = {}; if (d !== null) h['Content-Type'] = 'application/json'; if (cookie) h.Cookie = cookie;
        const r = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: metodo, headers: h }, function (res) {
            let t = ''; res.on('data', function (c) { t += c; });
            res.on('end', function () { let j = {}; try { j = JSON.parse(t); } catch (e) {} const sc = res.headers['set-cookie']; ok({ e: res.statusCode, j: j, t: t, c: sc ? sc[0].split(';')[0] : null }); });
        });
        r.on('error', mal); if (d !== null) r.write(d); r.end();
    });
}
const post = function (ruta, cuerpo, cookie) { return pedir('POST', ruta, cuerpo || {}, cookie); };
const get = function (ruta, cookie) { return pedir('GET', ruta, undefined, cookie); };
let fallos = 0;
function chequear(n, c, x) { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  →  ' + (typeof x === 'string' ? x : JSON.stringify(x)))); if (!c) fallos++; }
const idCom = function () { return 'COM-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 100); };

(async function () {
    const pw = 'Clave.Segura1', t = Date.now();
    async function reg(nombre, mail) { const r = await post('/api/registro', { aceptoTerminos: true, nombre: nombre, email: mail, password: pw, pais: 'UY' }); return { c: r.c, id: r.j.usuario && r.j.usuario.id, mail: mail }; }
    let r = await post('/api/registro', { aceptoTerminos: true, nombre: 'Admin Uno', email: 'admin@gmail.com', password: pw, pais: 'UY' });
    if (r.e === 409) r = await post('/api/login', { email: 'admin@gmail.com', password: pw });
    const admin = { c: r.c, id: r.j.usuario.id };
    const A = await reg('Ana Duena', 'ana' + t + '@gmail.com'), B = await reg('Beto Comenta', 'beto' + t + '@gmail.com'), C = await reg('Carla Otra', 'carla' + t + '@gmail.com');
    const F = Date.now() - 5000, postId = A.id + '_' + F;
    r = await post('/api/perfil/guardar', { perfil: { portafolio: [{ fecha: F, texto: 'Mi primer post' }], privacidad: { verPerfil: 'todos' } } }, A.c);
    chequear('(preparación) Ana tiene un post', r.e === 200, r.t);

    console.log('Comentarios');
    r = await get('/api/comentarios?post=' + encodeURIComponent(postId));
    chequear('Cualquiera ve los comentarios (sin sesión)', r.e === 200 && Array.isArray(r.j.comentarios) && r.j.comentarios.length === 0, r.t);
    r = await post('/api/comentarios/crear', { postId: postId, texto: 'Hola' });
    chequear('Sin sesión no se comenta → 401', r.e === 401, r.e);
    r = await post('/api/comentarios/crear', { postId: A.id + '_1234567890123', texto: 'Hola' }, B.c);
    chequear('Post que no existe → 404', r.e === 404, r.e);
    r = await post('/api/comentarios/crear', { postId: postId, texto: '   ' }, B.c);
    chequear('Comentario vacío → 400', r.e === 400, r.e);
    const c1 = idCom();
    r = await post('/api/comentarios/crear', { postId: postId, texto: 'Qué lindo <b>post</b>', id: c1 }, B.c);
    chequear('Beto comenta', r.e === 200 && r.j.comentarios.length === 1 && r.j.id === c1, r.t);
    const com1 = r.j.comentarios[0];
    chequear('Queda a nombre de Beto, sin < >, con 0 likes', com1.idUsuario === B.id && /Beto|Comenta/.test(com1.nombre) && com1.texto.indexOf('<') < 0 && com1.likes.length === 0, com1);
    r = await post('/api/comentarios/crear', { postId: postId, texto: 'Repetido', id: c1 }, B.c);
    chequear('Un id repetido no pisa el comentario de antes', r.e === 200 && r.j.comentarios.length === 2 && r.j.comentarios.some(function (c) { return c.id === c1 && /Qué lindo/.test(c.texto); }), r.t);
    r = await post('/api/comentarios/crear', { postId: postId, texto: 'x'.repeat(600) }, B.c);
    chequear('Se corta a 300 caracteres', r.e === 200 && Math.max.apply(null, r.j.comentarios.map(function (c) { return c.texto.length; })) === 300, r.t);

    console.log('\nRespuestas');
    r = await post('/api/comentarios/crear', { postId: postId, texto: 'Gracias!', idPadre: c1 }, A.c);
    const resp = r.j.comentarios.find(function (c) { return c.texto === 'Gracias!'; });
    chequear('Ana responde dentro del hilo de Beto', r.e === 200 && resp && resp.idPadre === c1, r.t);
    r = await post('/api/comentarios/crear', { postId: postId, texto: 'De nada', idPadre: resp.id }, B.c);
    const resp2 = r.j.comentarios.find(function (c) { return c.texto === 'De nada'; });
    chequear('Responder a una respuesta queda en el mismo hilo', resp2 && resp2.idPadre === c1, r.t);
    r = await post('/api/comentarios/crear', { postId: postId, texto: 'x', idPadre: 'COM-0000000000-1' }, B.c);
    chequear('Responder a un comentario que no existe → 404', r.e === 404, r.e);

    console.log('\nLikes');
    r = await post('/api/comentarios/like', { id: c1, like: true }, A.c);
    chequear('Ana le da like al comentario de Beto', r.e === 200 && r.j.comentarios.find(function (c) { return c.id === c1; }).likes.join() === A.id, r.t);
    r = await post('/api/comentarios/like', { id: c1, like: true }, A.c);
    chequear('Dar like dos veces no lo duplica', r.j.comentarios.find(function (c) { return c.id === c1; }).likes.length === 1, r.t);
    r = await post('/api/comentarios/like', { id: c1, like: true }, C.c);
    chequear('Cada persona suma el suyo', r.j.comentarios.find(function (c) { return c.id === c1; }).likes.length === 2, r.t);
    r = await post('/api/comentarios/like', { id: c1, like: false }, A.c);
    chequear('Quitar el like quita solo el suyo', r.j.comentarios.find(function (c) { return c.id === c1; }).likes.join() === C.id, r.t);
    r = await post('/api/comentarios/like', { id: c1, like: true });
    chequear('Sin sesión no hay like → 401', r.e === 401, r.e);

    console.log('\nBorrar');
    r = await post('/api/comentarios/eliminar', { id: resp.id }, C.c);
    chequear('Una tercera persona no puede borrar → 403', r.e === 403, r.e);
    r = await post('/api/comentarios/eliminar', { id: resp2.id }, A.c);
    chequear('La dueña del post borra un comentario ajeno de su post', r.e === 200 && !r.j.comentarios.some(function (c) { return c.id === resp2.id; }), r.t);
    r = await post('/api/comentarios/eliminar', { id: c1 }, B.c);
    chequear('Beto borra el suyo y se van sus respuestas', r.e === 200 && !r.j.comentarios.some(function (c) { return c.id === c1 || c.idPadre === c1; }), r.t);
    r = await post('/api/comentarios/eliminar', { id: c1 }, B.c);
    chequear('Borrar algo ya borrado no da error', r.e === 200, r.e);

    console.log('\nCuenta privada');
    await post('/api/perfil/guardar', { perfil: { portafolio: [{ fecha: F, texto: 'Mi primer post' }], privacidad: { verPerfil: 'seguidores' } } }, A.c);
    r = await get('/api/comentarios?post=' + encodeURIComponent(postId), C.c);
    chequear('Si Ana pasa a cuenta privada, los demás ya no ven sus comentarios → 404', r.e === 404, r.e);
    r = await post('/api/comentarios/crear', { postId: postId, texto: 'Hola' }, C.c);
    chequear('...ni pueden comentar → 404', r.e === 404, r.e);
    r = await get('/api/comentarios?post=' + encodeURIComponent(postId), A.c);
    chequear('Ana sí los ve', r.e === 200, r.e);

    console.log('\nPreguntas al vendedor');
    r = await post('/api/publicaciones/guardar', { publicacion: { id: 'preg' + t, nombre: 'Remera lisa', precio: 500, pais: 'UY', medios: [] } }, admin.c);
    chequear('(preparación) la administración publica', r.e === 200, r.t);
    const pub = 'preg' + t;
    r = await post('/api/preguntas/crear', { publicacionId: pub, texto: '¿Tenés talle M?' });
    chequear('Sin sesión no se pregunta → 401', r.e === 401, r.e);
    r = await post('/api/preguntas/crear', { publicacionId: pub, texto: '¿Tenés talle M?' }, admin.c);
    chequear('Quien vende no puede preguntarse a sí mismo → 403', r.e === 403, r.e);
    r = await post('/api/preguntas/crear', { publicacionId: 'nada' + t, texto: 'x' }, B.c);
    chequear('Publicación que no existe → 404', r.e === 404, r.e);
    r = await post('/api/preguntas/crear', { publicacionId: pub, texto: '  ' }, B.c);
    chequear('Pregunta vacía → 400', r.e === 400, r.e);
    r = await post('/api/preguntas/crear', { publicacionId: pub, texto: '¿Tenés talle <i>M</i>?' }, B.c);
    chequear('Beto pregunta', r.e === 200 && r.j.pregunta.usuarioId === B.id && r.j.pregunta.respuesta === null && r.j.pregunta.texto.indexOf('<') < 0, r.t);
    const q = r.j.pregunta;
    r = await get('/api/preguntas?pais=UY');
    chequear('Cualquiera ve la pregunta (sin sesión)', r.e === 200 && r.j.preguntas.some(function (x) { return x.id === q.id; }), r.t);
    r = await get('/api/preguntas?pais=AR');
    chequear('No aparece en el otro país', !r.j.preguntas.some(function (x) { return x.id === q.id; }), r.t);
    r = await post('/api/preguntas/responder', { id: q.id, respuesta: 'Sí, hay M' }, B.c);
    chequear('Quien preguntó no puede responder → 403', r.e === 403, r.e);
    r = await post('/api/preguntas/responder', { id: q.id, respuesta: '   ' }, admin.c);
    chequear('Respuesta vacía → 400', r.e === 400, r.e);
    r = await post('/api/preguntas/responder', { id: q.id, respuesta: 'Sí, hay talle M' }, admin.c);
    chequear('Quien vende responde', r.e === 200 && r.j.pregunta.respuesta === 'Sí, hay talle M', r.t);
    r = await post('/api/preguntas/responder', { id: q.id, respuesta: 'Otra' }, admin.c);
    chequear('No se puede responder dos veces → 409', r.e === 409, r.e);
    r = await get('/api/preguntas?pais=UY');
    chequear('La respuesta queda a la vista', r.j.preguntas.find(function (x) { return x.id === q.id; }).respuesta === 'Sí, hay talle M', r.t);

    console.log('\nCuenta eliminada');
    r = await post('/api/eliminar-cuenta', { email: B.mail, password: pw });
    chequear('Beto elimina su cuenta', r.e === 200, r.t);
    r = await get('/api/preguntas?pais=UY');
    chequear('Sus preguntas se borran con la cuenta', !r.j.preguntas.some(function (x) { return x.usuarioId === B.id; }), r.t);

    console.log('\n' + (fallos ? fallos + ' pruebas fallaron.' : 'Todo bien.'));
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e.message); process.exit(1); });
