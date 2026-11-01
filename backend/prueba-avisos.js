// Prueba del buzón de avisos entre personas. Levantá el servidor así:
//   ADMIN_EMAILS=admin@gmail.com ADMIN_CLAVE=ClaveDelPanel123 NIVAN_DATOS=/tmp/otra node server.js
// y corré:  node prueba-avisos.js
'use strict';
const http = require('http');
const BASE = process.env.BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);
const CLAVE_ADMIN = process.env.ADMIN_CLAVE || 'ClaveDelPanel123';
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
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DATOS = { nombre: 'Cliente Uno', email: 'cliente@gmail.com', telefono: '+59899123456', direccion: 'Calle 123', ciudad: 'Montevideo', codigoPostal: '11000', envio: 'Retiro', pago: 'Efectivo' };
let contador = 0;
const idAviso = function () { return 'NOT-' + Date.now() + '-' + (++contador); };
const aviso = function (para, datos, id) { return { para: para, id: id || idAviso(), datos: Object.assign({ tipo: 'likePost', icono: '❤️', titulo: 'Le gustó tu publicación', texto: 'Alguien le dio like.' }, datos || {}) }; };

(async function () {
    const pw = 'Clave.Segura1', t = Date.now();
    async function reg(nombre, mail) { const r = await post('/api/registro', { aceptoTerminos: true, nombre: nombre, email: mail, password: pw, pais: 'UY' }); return { c: r.c, id: r.j.usuario && r.j.usuario.id }; }
    let r = await post('/api/registro', { aceptoTerminos: true, nombre: 'Admin Uno', email: 'admin@gmail.com', password: pw, pais: 'UY' });
    if (r.e === 409) r = await post('/api/login', { email: 'admin@gmail.com', password: pw });
    const admin = { c: r.c };
    const A = await reg('Ana Recibe', 'ana' + t + '@gmail.com'), B = await reg('Beto Manda', 'beto' + t + '@gmail.com'), C = await reg('Carla Otra', 'carla' + t + '@gmail.com');
    await post('/api/admin/entrar', { clave: CLAVE_ADMIN }, admin.c);
    for (const u of [A, B, C]) {
        await post('/api/verificacion', { fotos: { dniFrente: PNG, dniDorso: PNG, rostro: PNG } }, u.c);
        await post('/api/admin/verificacion/resolver', { usuarioId: u.id, decision: 'aprobada' }, admin.c);
    }

    console.log('Mandar y recibir');
    r = await post('/api/notificaciones/enviar', { lista: [aviso(A.id)] });
    chequear('Sin sesión no se manda → 401', r.e === 401, r.e);
    r = await get('/api/notificaciones');
    chequear('Sin sesión no se baja → 401', r.e === 401, r.e);
    const postId = A.id + '_' + (t - 1000);
    r = await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { extra: { postId: postId, quien: B.id } })] }, B.c);
    chequear('Beto le manda un aviso a Ana → 200', r.e === 200 && r.j.aceptadas === 1, r.t);
    r = await get('/api/notificaciones', A.c);
    chequear('Ana lo recibe', r.e === 200 && r.j.notificaciones.length === 1 && r.j.notificaciones[0].tipo === 'likePost' && r.j.notificaciones[0].de === B.id, r.t);
    const primero = r.j.notificaciones[0];
    chequear('Trae los campos extra y la marca de recibido', primero.extra && primero.extra.postId === postId && primero.recibida > 0, primero);
    r = await get('/api/notificaciones?desde=' + primero.recibida, A.c);
    chequear('Con la marca de lo último, no vuelve a bajar lo mismo', r.e === 200 && r.j.notificaciones.length === 0, r.t);
    r = await get('/api/notificaciones', B.c);
    chequear('Beto no ve los avisos de Ana', r.e === 200 && r.j.notificaciones.length === 0, r.t);

    console.log('Lo que se rechaza');
    const rechazos = [
        ['tipo que no se manda entre personas (mensaje)', aviso(A.id, { tipo: 'mensaje' })],
        ['tipo inventado', aviso(A.id, { tipo: 'inventado' })],
        ['sin título', aviso(A.id, { titulo: '   ' })],
        ['a sí mismo', aviso(B.id)],
        ['a una cuenta que no existe', aviso('NVU-no-existe')]
    ];
    for (const x of rechazos) {
        r = await post('/api/notificaciones/enviar', { lista: [x[1]] }, B.c);
        chequear('Se rechaza: ' + x[0], r.e === 200 && r.j.aceptadas === 0 && r.j.rechazadas === 1, r.t);
    }
    r = await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { tipo: 'cupon', titulo: 'Cupón <b>ya</b>', texto: 'Mirá <script>alert(1)</script> esto' })] }, B.c);
    chequear('Aviso con etiquetas → se acepta', r.j.aceptadas === 1, r.t);
    r = await get('/api/notificaciones?desde=' + primero.recibida, A.c);
    const limpio = r.j.notificaciones[0];
    chequear('Se le sacan los < y >', limpio && !/[<>]/.test(limpio.titulo + limpio.texto), limpio);
    r = await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { tipo: 'cupon' }, 'x')] }, B.c);
    chequear('Id inválido → se rechaza', r.j.aceptadas === 0, r.t);
    const repetido = idAviso();
    await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { tipo: 'cupon', titulo: 'Repetido' }, repetido)] }, B.c);
    await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { tipo: 'cupon', titulo: 'Repetido' }, repetido)] }, B.c);
    r = await get('/api/notificaciones', A.c);
    chequear('El mismo id mandado dos veces no se duplica', r.j.notificaciones.filter(function (n) { return n.id === repetido; }).length === 1, r.t);

    console.log('Un solo aviso por persona y cosa');
    await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { extra: { postId: postId, quien: B.id } })] }, B.c);
    await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { extra: { postId: postId, quien: B.id } })] }, B.c);
    r = await get('/api/notificaciones', A.c);
    chequear('Dos "le gustó tu publicación" de Beto al mismo post → queda uno', r.j.notificaciones.filter(function (n) { return n.tipo === 'likePost' && n.extra.postId === postId && n.extra.quien === B.id; }).length === 1, r.t);
    await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { extra: { postId: postId, quien: C.id } })] }, C.c);
    r = await get('/api/notificaciones', A.c);
    chequear('Pero el de Carla es otro aviso', r.j.notificaciones.filter(function (n) { return n.tipo === 'likePost' && n.extra.postId === postId; }).length === 2, r.t);

    console.log('Avisos de pedidos y reseñas');
    const idPub = 'av' + t;
    r = await post('/api/publicaciones/guardar', { publicacion: { id: idPub, nombre: 'Campera', precio: 1000, pais: 'UY', medios: [] } }, A.c);
    chequear('(preparación) Ana publica', r.e === 200, r.t);
    r = await post('/api/pedidos/crear', { pais: 'UY', datos: DATOS, items: [{ id: idPub, cantidad: 1, vendedorId: A.id, nombre: 'x', precioUnitario: 1 }] }, B.c);
    chequear('(preparación) Beto le compra a Ana', r.e === 200, r.t);
    const idPedido = r.j.pedidos[0].id;
    r = await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { tipo: 'pedidoEstado', titulo: 'Compra', pedidoId: idPedido })] }, B.c);
    chequear('La persona que compró avisa a quien vende → 200', r.j.aceptadas === 1, r.t);
    r = await post('/api/notificaciones/enviar', { lista: [aviso(B.id, { tipo: 'ventaEstado', titulo: 'Enviado', pedidoId: idPedido })] }, A.c);
    chequear('Quien vende avisa a quien compró → 200', r.j.aceptadas === 1, r.t);
    r = await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { tipo: 'pedidoEstado', titulo: 'Falso', pedidoId: idPedido })] }, C.c);
    chequear('Una tercera persona no puede mandar avisos de ese pedido', r.j.aceptadas === 0, r.t);
    r = await post('/api/notificaciones/enviar', { lista: [aviso(C.id, { tipo: 'pedidoEstado', titulo: 'Falso', pedidoId: idPedido })] }, B.c);
    chequear('Ni mandarlos a una tercera persona', r.j.aceptadas === 0, r.t);
    r = await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { tipo: 'pedidoEstado', titulo: 'Falso', pedidoId: 'PED-no-existe' })] }, B.c);
    chequear('Ni de un pedido que no existe', r.j.aceptadas === 0, r.t);
    r = await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { tipo: 'resenia', titulo: 'Nueva reseña', productoId: idPub })] }, B.c);
    chequear('Aviso de reseña a quien vende esa publicación → 200', r.j.aceptadas === 1, r.t);
    r = await post('/api/notificaciones/enviar', { lista: [aviso(C.id, { tipo: 'resenia', titulo: 'Nueva reseña', productoId: idPub })] }, B.c);
    chequear('Aviso de reseña a quien NO vende esa publicación → se rechaza', r.j.aceptadas === 0, r.t);

    console.log('Varios a la vez y marca de lo último');
    r = await get('/api/notificaciones', A.c);
    const marca = Math.max.apply(null, r.j.notificaciones.map(function (n) { return n.recibida; }));
    r = await post('/api/notificaciones/enviar', { lista: [aviso(A.id, { tipo: 'cupon', titulo: 'Uno' }), aviso(C.id, { tipo: 'cupon', titulo: 'Dos' }), aviso(A.id, { tipo: 'cupon', titulo: 'Tres' })] }, B.c);
    chequear('Una tanda con varios destinatarios → 3 aceptados', r.j.aceptadas === 3, r.t);
    r = await get('/api/notificaciones?desde=' + marca, A.c);
    chequear('Desde la última marca, Ana recibe solo los 2 nuevos', r.j.notificaciones.length === 2, r.t);
    r = await get('/api/notificaciones', C.c);
    chequear('Y Carla el suyo (más el de antes)', r.j.notificaciones.some(function (n) { return n.titulo === 'Dos'; }), r.t);

    console.log('Cuenta eliminada');
    r = await post('/api/eliminar-cuenta', { email: 'beto' + t + '@gmail.com', password: pw });
    chequear('Beto elimina su cuenta', r.e === 200, r.t);
    r = await get('/api/notificaciones', A.c);
    chequear('Sus avisos desaparecen del buzón de Ana', r.e === 200 && !r.j.notificaciones.some(function (n) { return n.de === B.id; }), r.t);

    console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo bien.');
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
