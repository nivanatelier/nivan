// Prueba de cupones de descuento. Levantá el servidor así:
//   ADMIN_EMAILS=admin@gmail.com ADMIN_CLAVE=ClaveDelPanel123 NIVAN_DATOS=/tmp/otra node server.js
// y corré:  node prueba-cupones.js
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

(async function () {
    const pw = 'Clave.Segura1', t = Date.now();
    async function reg(nombre, mail) { const r = await post('/api/registro', { aceptoTerminos: true, nombre: nombre, email: mail, password: pw, pais: 'UY' }); return { c: r.c, id: r.j.usuario && r.j.usuario.id }; }
    let r = await post('/api/registro', { aceptoTerminos: true, nombre: 'Admin Uno', email: 'admin@gmail.com', password: pw, pais: 'UY' });
    if (r.e === 409) r = await post('/api/login', { email: 'admin@gmail.com', password: pw });
    const admin = { c: r.c };
    const S = await reg('Tienda Uno', 's' + t + '@gmail.com'), S2 = await reg('Tienda Dos', 's2' + t + '@gmail.com');
    const B = await reg('Beto Compra', 'b' + t + '@gmail.com'), C = await reg('Carla Otra', 'c' + t + '@gmail.com');
    await post('/api/admin/entrar', { clave: CLAVE_ADMIN }, admin.c);
    const aprobar = async function (u) {
        await post('/api/verificacion', { fotos: { dniFrente: PNG, dniDorso: PNG, rostro: PNG } }, u.c);
        await post('/api/admin/verificacion/resolver', { usuarioId: u.id, decision: 'aprobada' }, admin.c);
    };
    for (const u of [S, S2, B]) await aprobar(u);
    const P1 = 'cp1' + t, P2 = 'cp2' + t, P3 = 'cp3' + t;
    await post('/api/publicaciones/guardar', { publicacion: { id: P1, nombre: 'Campera', precio: 1000, pais: 'UY', medios: [] } }, S.c);
    await post('/api/publicaciones/guardar', { publicacion: { id: P2, nombre: 'Remera', precio: 500, pais: 'UY', medios: [] } }, S.c);
    await post('/api/publicaciones/guardar', { publicacion: { id: P3, nombre: 'Gorro', precio: 300, pais: 'UY', medios: [] } }, S2.c);
    const item = function (id, vendedorId) { return { id: id, cantidad: 1, vendedorId: vendedorId, nombre: 'x', precioUnitario: 1 }; };
    const comprar = function (items, cupon, cookie) { return post('/api/pedidos/crear', { pais: 'UY', datos: DATOS, items: items, cupon: cupon || null }, cookie || B.c); };
    const crear = function (cupon, cookie) { return post('/api/cupones/crear', { cupon: cupon }, cookie || S.c); };
    const cupones = async function (cookie) { return (await get('/api/cupones', cookie)).j; };
    const codigos = function (j) { return (j.cupones || []).map(function (c) { return c.codigo; }).sort(); };

    console.log('Crear cupones');
    r = await post('/api/cupones/crear', { cupon: { codigo: 'HOLA10', tipo: 'porcentaje', valor: 10 } });
    chequear('Sin sesión → 401', r.e === 401, r.e);
    r = await crear({ codigo: 'HOLA10', tipo: 'porcentaje', valor: 10 }, C.c);
    chequear('Sin identidad aprobada → 403', r.e === 403, r.t);
    await aprobar(C);
    r = await crear({ codigo: 'AB', tipo: 'porcentaje', valor: 10 });
    chequear('Código muy corto → 400', r.e === 400, r.t);
    r = await crear({ codigo: 'CON ESPACIO!', tipo: 'porcentaje', valor: 10 });
    chequear('Código con símbolos → 400', r.e === 400, r.t);
    r = await crear({ codigo: 'DEMASIADO', tipo: 'porcentaje', valor: 95 });
    chequear('Más de 90% → 400', r.e === 400, r.t);
    r = await crear({ codigo: 'DEMASIADO', tipo: 'monto', valor: -5 });
    chequear('Monto negativo → 400', r.e === 400, r.t);
    r = await crear({ codigo: 'DEMASIADO', tipo: 'otro', valor: 5 });
    chequear('Tipo inventado → 400', r.e === 400, r.t);
    r = await crear({ codigo: 'AJENO', tipo: 'monto', valor: 5, productoId: P3 });
    chequear('Cupón sobre la publicación de otra tienda → 400', r.e === 400, r.t);
    r = await crear({ codigo: 'promo10', tipo: 'porcentaje', valor: 10, audiencia: [] });
    chequear('Crea PROMO10 (el código se pasa a mayúsculas) → 200', r.e === 200 && r.j.cupon.codigo === 'PROMO10' && r.j.cupon.activo === true && r.j.cupon.usos === 0, r.t);
    const promo10 = r.j.cupon;
    r = await crear({ codigo: 'PROMO10', tipo: 'monto', valor: 50 }, S2.c);
    chequear('Otro código igual, vigente, de cualquier tienda → 409', r.e === 409, r.t);
    await crear({ codigo: 'SOLOP1', tipo: 'monto', valor: 200, productoId: P1 });
    await crear({ codigo: 'UNICO', tipo: 'monto', valor: 100, usosMaximos: 1 });
    await crear({ codigo: 'PUBLICO5', tipo: 'porcentaje', valor: 5, audiencia: ['publico'] });
    await crear({ codigo: 'SEGUI15', tipo: 'porcentaje', valor: 15, audiencia: ['seguidores'] });
    await crear({ codigo: 'CLIENTES20', tipo: 'porcentaje', valor: 20, audiencia: ['clientes', 'inventada'] });
    await crear({ codigo: 'GRANDE', tipo: 'monto', valor: 5000, audiencia: ['publico'] });
    let j = await cupones(S.c);
    chequear('La tienda ve los 7 suyos', codigos(j).length === 7, codigos(j));
    chequear('Una audiencia inventada se descarta', j.cupones.find(function (c) { return c.codigo === 'CLIENTES20'; }).audiencia.join() === 'clientes', j.cupones.map(function (c) { return c.audiencia; }));

    console.log('Quién ve qué');
    j = await cupones();
    chequear('Sin sesión solo se ven los públicos', codigos(j).join() === 'GRANDE,PUBLICO5', codigos(j));
    j = await cupones(B.c);
    chequear('Beto ve los públicos (no los de "solo con el código" ni los de seguidores o clientes)', codigos(j).join() === 'GRANDE,PUBLICO5', codigos(j));
    r = await post('/api/cupones/habilitar', { id: promo10.id, usuarios: [C.id, 'NVU-no-existe'] }, B.c);
    chequear('Otra persona no puede habilitar cupones ajenos → 404', r.e === 404, r.t);
    r = await post('/api/cupones/habilitar', { id: promo10.id, usuarios: [C.id, 'NVU-no-existe', S.id] }, S.c);
    chequear('La tienda habilita a Carla (ignora cuentas que no existen y a sí misma)', r.e === 200 && r.j.habilitados === 1, r.t);
    j = await cupones(C.c);
    chequear('Carla ahora ve PROMO10', codigos(j).indexOf('PROMO10') !== -1, codigos(j));
    chequear('Y solo se ve a ella misma en la lista de habilitados', j.cupones.find(function (c) { return c.codigo === 'PROMO10'; }).habilitados.join() === C.id, j.cupones);
    j = await cupones(B.c);
    chequear('Beto sigue sin verlo', codigos(j).indexOf('PROMO10') === -1);

    console.log('Buscar y guardar');
    r = await post('/api/cupones/buscar', { codigo: 'promo10' });
    chequear('Buscar sin sesión → 401', r.e === 401, r.e);
    r = await post('/api/cupones/buscar', { codigo: ' promo 10 ' }, B.c);
    chequear('Beto encuentra PROMO10 por el código (aunque no se vea en el perfil)', r.e === 200 && r.j.cupon.codigo === 'PROMO10' && r.j.puedeUsar === true && r.j.usable === true, r.t);
    chequear('Sin ver quiénes están habilitados', r.j.cupon.habilitados.length === 0, r.j.cupon);
    r = await post('/api/cupones/buscar', { codigo: 'SEGUI15' }, B.c);
    chequear('SEGUI15: existe pero Beto no puede usarlo', r.e === 200 && r.j.puedeUsar === false, r.t);
    r = await post('/api/cupones/buscar', { codigo: 'NOEXISTE' }, B.c);
    chequear('Un código que no existe → 404', r.e === 404, r.t);
    r = await post('/api/cupones/reclamar', { codigo: 'SEGUI15' }, B.c);
    chequear('Reclamar uno para seguidores sin seguir → 403', r.e === 403, r.t);
    r = await post('/api/cupones/reclamar', { codigo: 'PROMO10' }, B.c);
    chequear('Reclamar PROMO10 → 200', r.e === 200 && r.j.yaLoTenia === false, r.t);
    r = await post('/api/cupones/reclamar', { codigo: 'PROMO10' }, B.c);
    chequear('Reclamarlo otra vez no lo duplica', r.e === 200 && r.j.yaLoTenia === true, r.t);
    j = await cupones(B.c);
    chequear('Queda en Tus cupones y se ve aunque sea de "solo con el código"', j.guardados.join() === 'PROMO10' && codigos(j).indexOf('PROMO10') !== -1, j);
    j = await cupones(C.c);
    chequear('Cada persona tiene sus propios guardados', j.guardados.length === 0, j.guardados);
    await post('/api/cupones/quitar', { codigo: 'PROMO10' }, B.c);
    j = await cupones(B.c);
    chequear('Quitarlo de Tus cupones', j.guardados.length === 0 && codigos(j).indexOf('PROMO10') === -1, j);

    console.log('Comprar con cupón: el descuento lo calcula el servidor');
    r = await comprar([item(P1, S.id)], { codigo: 'PROMO10', vendedorId: S.id, descuento: 999999 });
    chequear('10% de $1000 = $100, aunque la app mande otro monto', r.e === 200 && r.j.pedidos[0].cupon.descuento === 100 && r.j.pedidos[0].total === 900, r.t);
    r = await comprar([item(P1, S.id)], { codigo: 'GRANDE', vendedorId: S.id, descuento: 1 });
    chequear('Un descuento mayor al total nunca pasa del subtotal ($1000)', r.e === 200 && r.j.pedidos[0].cupon.descuento === 1000 && r.j.pedidos[0].total === 0, r.t);
    r = await comprar([item(P2, S.id)], { codigo: 'SOLOP1', vendedorId: S.id, descuento: 200 });
    chequear('Cupón de una sola publicación con otra publicación → 409', r.e === 409, r.t);
    r = await comprar([item(P1, S.id), item(P2, S.id)], { codigo: 'SOLOP1', vendedorId: S.id, descuento: 200 });
    chequear('Con esa publicación en el carrito: $200 de $1500', r.e === 200 && r.j.pedidos[0].cupon.descuento === 200 && r.j.pedidos[0].total === 1300, r.t);
    r = await comprar([item(P3, S2.id)], { codigo: 'PROMO10', vendedorId: S2.id, descuento: 30 });
    chequear('Cupón de una tienda en un carrito de otra tienda → 409', r.e === 409, r.t);
    r = await comprar([item(P1, S.id), item(P3, S2.id)], { codigo: 'PUBLICO5', vendedorId: S.id, descuento: 0 });
    const pedS = r.j.pedidos.find(function (p) { return p.vendedorId === S.id; }), pedS2 = r.j.pedidos.find(function (p) { return p.vendedorId === S2.id; });
    chequear('Con dos tiendas en el carrito, solo descuenta la de ese cupón (5% de $1000)', r.e === 200 && pedS.cupon.descuento === 50 && pedS2.cupon === null && pedS2.total === 300, r.t);
    r = await comprar([item(P1, S.id)], { codigo: 'NOEXISTE', vendedorId: S.id, descuento: 100 });
    chequear('Cupón que no existe → 409 (no se compra con un descuento inventado)', r.e === 409, r.t);
    r = await comprar([item(P1, S.id)], null);
    chequear('Sin cupón: precio normal', r.e === 200 && r.j.pedidos[0].total === 1000 && r.j.pedidos[0].cupon === null, r.t);

    console.log('Usos');
    r = await comprar([item(P1, S.id)], { codigo: 'UNICO', vendedorId: S.id });
    chequear('Cupón de 1 uso: la primera compra → 200', r.e === 200 && r.j.pedidos[0].cupon.descuento === 100, r.t);
    r = await comprar([item(P1, S.id)], { codigo: 'UNICO', vendedorId: S.id });
    chequear('La segunda → 409 (se agotó)', r.e === 409, r.t);
    j = await cupones(S.c);
    chequear('La tienda ve 1/1 usos', j.cupones.find(function (c) { return c.codigo === 'UNICO'; }).usos === 1);
    await crear({ codigo: 'CARRERA', tipo: 'monto', valor: 10, usosMaximos: 1, audiencia: ['publico'] });
    const dos = await Promise.all([comprar([item(P2, S.id)], { codigo: 'CARRERA', vendedorId: S.id }), comprar([item(P2, S.id)], { codigo: 'CARRERA', vendedorId: S.id }, C.c)]);
    chequear('Dos compras a la vez con el último uso: solo una se lo lleva', dos.filter(function (x) { return x.e === 200; }).length === 1 && dos.filter(function (x) { return x.e === 409; }).length === 1, dos.map(function (x) { return x.e; }));
    j = await cupones(S.c);
    chequear('Y no se pasa de 1 uso', j.cupones.find(function (c) { return c.codigo === 'CARRERA'; }).usos === 1);

    console.log('Audiencias');
    r = await comprar([item(P1, S.id)], { codigo: 'SEGUI15', vendedorId: S.id });
    chequear('Para seguidores, sin seguir → 403', r.e === 403, r.t);
    r = await post('/api/conjuntos/cambiar', { coleccion: 'seguidores', cambios: [{ accion: 'agregar', clave: 'T:' + S.id, valor: B.id }] }, B.c);
    chequear('(preparación) Beto sigue a la tienda', r.e === 200 && r.j.aplicados === 1, r.t);
    r = await comprar([item(P1, S.id)], { codigo: 'SEGUI15', vendedorId: S.id });
    chequear('Ahora sí: 15% de $1000 = $150', r.e === 200 && r.j.pedidos[0].cupon.descuento === 150, r.t);
    j = await cupones(B.c);
    chequear('Y le aparece en el perfil de la tienda', codigos(j).indexOf('SEGUI15') !== -1, codigos(j));
    r = await comprar([item(P1, S.id)], { codigo: 'CLIENTES20', vendedorId: S.id }, C.c);
    chequear('Para clientes, sin haber comprado → 403', r.e === 403, r.t);
    r = await comprar([item(P1, S.id)], { codigo: 'CLIENTES20', vendedorId: S.id });
    chequear('Beto ya compró en la tienda: 20% = $200', r.e === 200 && r.j.pedidos[0].cupon.descuento === 200, r.t);
    r = await comprar([item(P1, S.id)], { codigo: 'PROMO10', vendedorId: S.id }, C.c);
    chequear('Cupón "solo con el código": lo puede usar cualquiera con el código', r.e === 200 && r.j.pedidos[0].cupon.descuento === 100, r.t);

    console.log('Pausar, vencer, editar, eliminar');
    r = await post('/api/cupones/actualizar', { id: promo10.id, activo: false }, B.c);
    chequear('Otra persona no puede pausar → 404', r.e === 404, r.t);
    r = await post('/api/cupones/actualizar', { id: promo10.id, activo: false }, S.c);
    chequear('La tienda pausa PROMO10', r.e === 200 && r.j.cupon.activo === false, r.t);
    r = await comprar([item(P1, S.id)], { codigo: 'PROMO10', vendedorId: S.id });
    chequear('Pausado no se puede usar → 409', r.e === 409, r.t);
    r = await crear({ codigo: 'PROMO10', tipo: 'monto', valor: 70, audiencia: ['publico'] }, S.c);
    chequear('Con el viejo pausado, el código se puede volver a crear', r.e === 200, r.t);
    r = await post('/api/cupones/actualizar', { id: promo10.id, activo: true }, S.c);
    chequear('Y el viejo ya no se puede reactivar (código en uso) → 409', r.e === 409, r.t);
    r = await post('/api/cupones/actualizar', { id: promo10.id, audiencia: ['publico', 'seguidores', 'hack'] }, S.c);
    chequear('Cambiar la audiencia (descarta valores inválidos)', r.e === 200 && r.j.cupon.audiencia.join() === 'publico,seguidores', r.t);
    r = await crear({ codigo: 'VENCIDO', tipo: 'monto', valor: 5, vigenciaHasta: Date.now() - 1000, audiencia: ['publico'] });
    chequear('(preparación) Crea uno que ya venció hace un instante', r.e === 200, r.t);
    r = await comprar([item(P1, S.id)], { codigo: 'VENCIDO', vendedorId: S.id });
    chequear('Vencido → 409', r.e === 409, r.t);
    j = await cupones(B.c);
    chequear('Y no se muestra en el perfil', codigos(j).indexOf('VENCIDO') === -1);
    r = await post('/api/cupones/eliminar', { id: promo10.id }, B.c);
    r = await post('/api/cupones/buscar', { codigo: 'SEGUI15' }, B.c);
    chequear('Otra persona no puede eliminar cupones ajenos', r.e === 200);
    r = await post('/api/cupones/reclamar', { codigo: 'PUBLICO5' }, B.c);
    r = await post('/api/cupones/eliminar', { id: (await cupones(S.c)).cupones.find(function (c) { return c.codigo === 'PUBLICO5'; }).id }, S.c);
    chequear('La tienda elimina PUBLICO5', r.e === 200 && (await post('/api/cupones/buscar', { codigo: 'PUBLICO5' }, B.c)).e === 404);

    console.log('Cuenta eliminada');
    await post('/api/cupones/reclamar', { codigo: 'GRANDE' }, B.c);
    r = await post('/api/eliminar-cuenta', { email: 's' + t + '@gmail.com', password: pw });
    chequear('La tienda elimina su cuenta', r.e === 200, r.t);
    r = await post('/api/cupones/buscar', { codigo: 'GRANDE' }, B.c);
    chequear('Sus cupones desaparecen', r.e === 404, r.t);
    j = await cupones(B.c);
    chequear('Y de la lista de Beto', codigos(j).indexOf('GRANDE') === -1);

    console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo bien.');
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
