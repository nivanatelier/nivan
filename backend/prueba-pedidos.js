// Prueba de los pedidos en el servidor. Levantá el servidor así:
//   ADMIN_EMAILS=admin@gmail.com ADMIN_CLAVE=ClaveDelPanel123 NIVAN_DATOS=/tmp/otra node server.js
// y corré:  ADMIN_CLAVE=ClaveDelPanel123 node prueba-pedidos.js
const http = require('http');
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const CLAVE = process.env.ADMIN_CLAVE || 'ClaveDelPanel123';
function pedir(metodo, ruta, cuerpo, cookie) {
    return new Promise(function (ok, mal) {
        const u = new URL(ruta, BASE), d = cuerpo === undefined ? null : JSON.stringify(cuerpo);
        const h = {}; if (d !== null) h['Content-Type'] = 'application/json'; if (cookie) h.Cookie = cookie;
        const r = http.request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: metodo, headers: h }, function (res) {
            let t = ''; res.on('data', function (c) { t += c; });
            res.on('end', function () { let j = {}; try { j = JSON.parse(t); } catch (e) {} const sc = res.headers['set-cookie']; ok({ e: res.statusCode, j: j, t: t, c: sc ? [].concat(sc)[0].split(';')[0] : null }); });
        });
        r.on('error', mal); if (d !== null) r.write(d); r.end();
    });
}
const post = function (ruta, cuerpo, cookie) { return pedir('POST', ruta, cuerpo || {}, cookie); };
const get = function (ruta, cookie) { return pedir('GET', ruta, undefined, cookie); };
let fallos = 0;
function chequear(n, c, x) { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  →  ' + JSON.stringify(x))); if (!c) fallos++; }
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DATOS = { nombre: 'Cliente Uno', email: 'cliente@gmail.com', telefono: '+59899123456', direccion: 'Calle 123', ciudad: 'Montevideo', codigoPostal: '11000', envio: 'Retiro', pago: 'Efectivo' };

(async function () {
    const pw = 'Clave.Segura1', t = Date.now();
    const reg = async function (nombre, mail) { const r = await post('/api/registro', { aceptoTerminos: true, nombre: nombre, email: mail, password: pw, pais: 'UY' }); return { c: r.c, id: r.j.usuario && r.j.usuario.id }; };
    let r = await post('/api/registro', { aceptoTerminos: true, nombre: 'Admin Uno', email: 'admin@gmail.com', password: pw, pais: 'UY' });
    if (r.e === 409) r = await post('/api/login', { email: 'admin@gmail.com', password: pw });
    const admin = r.c;
    const vend = await reg('Vende Dora', 'vende' + t + '@gmail.com');
    const comp = await reg('Compra Dor', 'compra' + t + '@gmail.com');
    const otro = await reg('Tercero Pers', 'otro' + t + '@gmail.com');

    await post('/api/admin/entrar', { clave: CLAVE }, admin);
    const aprobar = async function (u) { await post('/api/verificacion', { fotos: { dniFrente: PNG, dniDorso: PNG, rostro: PNG } }, u.c); await post('/api/admin/verificacion/resolver', { usuarioId: u.id, decision: 'aprobada' }, admin); };
    await aprobar(vend);
    r = await post('/api/publicaciones/guardar', { publicacion: { id: 'ped' + t, nombre: 'Campera real', precio: 1000, pais: 'UY', medios: [], tramosPrecioMayor: [{ cantidadMinima: 10, precio: 800 }] } }, vend.c);
    chequear('(preparación) la vendedora publicó', r.e === 200, r.t);
    const idPub = 'ped' + t;
    const item = function (extra) { return Object.assign({ id: idPub, cantidad: 2, vendedorId: vend.id, nombre: 'Campera real', precioUnitario: 1000 }, extra || {}); };

    console.log('Comprar sin identidad aprobada');
    r = await post('/api/pedidos/crear', { pais: 'UY', datos: DATOS, items: [item()] });
    chequear('Sin sesión → 401', r.e === 401, r.e);
    r = await post('/api/pedidos/crear', { pais: 'UY', datos: DATOS, items: [item()] }, comp.c);
    chequear('Sin documentación → 403', r.e === 403 && /documentaci/.test(r.j.error || ''), r.t);
    await post('/api/verificacion', { fotos: { dniFrente: PNG, dniDorso: PNG, rostro: PNG } }, comp.c);
    r = await post('/api/pedidos/crear', { pais: 'UY', datos: DATOS, items: [item()] }, comp.c);
    chequear('Con la verificación pendiente → 403', r.e === 403 && /pendiente/.test(r.j.error || ''), r.t);
    r = await get('/api/pedidos', comp.c);
    chequear('No se creó ningún pedido', r.e === 200 && r.j.pedidos.length === 0, r.t);

    console.log('Comprar con identidad aprobada');
    await post('/api/admin/verificacion/resolver', { usuarioId: comp.id, decision: 'aprobada' }, admin);
    r = await post('/api/pedidos/crear', { pais: 'UY', datos: DATOS, items: [item({ precioUnitario: 1, nombre: 'Regalo' })] }, comp.c);
    chequear('Crea el pedido → 200', r.e === 200 && r.j.pedidos && r.j.pedidos.length === 1, r.t);
    const ped = r.j.pedidos[0];
    chequear('El precio y el nombre los pone el servidor (no el celular)', ped.items[0].precioUnitario === 1000 && ped.items[0].nombre === 'Campera real' && ped.total === 2000, ped);
    chequear('Queda a nombre del comprador y del vendedor reales', ped.compradorId === comp.id && ped.vendedorId === vend.id && ped.estado === 'pendiente', ped);
    r = await post('/api/pedidos/crear', { pais: 'UY', datos: DATOS, items: [item({ cantidad: 10 })] }, comp.c);
    chequear('Precio mayorista según la cantidad (10 × 800)', r.e === 200 && r.j.pedidos[0].total === 8000, r.t);
    r = await post('/api/pedidos/crear', { pais: 'UY', datos: DATOS, items: [item({ id: 'no-existe' })] }, comp.c);
    chequear('Publicación inexistente → 409', r.e === 409, r.e);
    r = await post('/api/pedidos/crear', { pais: 'UY', datos: DATOS, items: [item({ vendedorId: otro.id })] }, comp.c);
    chequear('Vendedor que no es el dueño de la publicación → 409', r.e === 409, r.e);
    r = await post('/api/pedidos/crear', { pais: 'UY', datos: Object.assign({}, DATOS, { direccion: '' }), items: [item()] }, comp.c);
    chequear('Datos incompletos → 400', r.e === 400, r.e);
    r = await post('/api/pedidos/crear', { pais: 'UY', datos: DATOS, items: [item({ cantidad: -3 })] }, comp.c);
    chequear('Cantidad inválida → 400', r.e === 400, r.e);

    console.log('Quién ve cada pedido');
    r = await get('/api/pedidos', vend.c);
    chequear('La vendedora ve los pedidos que le hicieron', r.e === 200 && r.j.pedidos.some(function (p) { return p.id === ped.id; }), r.t);
    r = await get('/api/pedidos', otro.c);
    chequear('Un tercero no ve ninguno', r.e === 200 && r.j.pedidos.length === 0, r.t);
    r = await get('/api/pedidos');
    chequear('Sin sesión → 401', r.e === 401, r.e);

    console.log('Cambios no permitidos');
    const copia = function (f) { const c = JSON.parse(JSON.stringify(ped)); f(c); return c; };
    r = await post('/api/pedidos/actualizar', { pedido: copia(function (c) { c.total = 1; }) }, comp.c);
    chequear('El comprador no puede cambiar el total → 403', r.e === 403, r.t);
    r = await post('/api/pedidos/actualizar', { pedido: copia(function (c) { c.items[0].precioUnitario = 1; }) }, vend.c);
    chequear('Nadie puede cambiar los productos → 403', r.e === 403, r.t);
    r = await post('/api/pedidos/actualizar', { pedido: copia(function (c) { c.estado = 'enviado'; c.historial.push({ estado: 'enviado', fecha: 1 }); }) }, comp.c);
    chequear('El comprador no puede marcar "enviado" → 403', r.e === 403, r.t);
    r = await post('/api/pedidos/actualizar', { pedido: copia(function (c) { c.estado = 'preparando'; c.historial.push({ estado: 'preparando', fecha: 1 }); }) }, vend.c);
    chequear('La vendedora no puede preparar sin aceptar antes → 403', r.e === 403, r.t);
    r = await post('/api/pedidos/actualizar', { pedido: copia(function (c) { c.aceptado = 5; c.historial.push({ estado: 'pendiente', fecha: 5, aceptado: true }); }) }, otro.c);
    chequear('Un tercero no puede tocar el pedido → 403', r.e === 403, r.t);
    r = await post('/api/pedidos/actualizar', { pedido: Object.assign(copia(function () {}), { id: 'NV-0000-000000' }) }, comp.c);
    chequear('Un pedido inventado no existe → 404', r.e === 404, r.t);
    r = await post('/api/pedidos/actualizar', { pedido: copia(function (c) { c.estado = 'entregado'; c.historial.push({ estado: 'entregado', fecha: 1 }); }) }, comp.c);
    chequear('El comprador no puede marcar "entregado" sin que se haya enviado → 403', r.e === 403, r.t);

    console.log('Flujo normal');
    const paso = async function (nombre, quien, f) {
        const g = await get('/api/pedidos', quien.c);
        const actual = g.j.pedidos.find(function (p) { return p.id === ped.id; });
        f(actual);
        const x = await post('/api/pedidos/actualizar', { pedido: actual }, quien.c);
        chequear(nombre, x.e === 200, x.t);
        return actual;
    };
    await paso('La vendedora acepta', vend, function (p) { p.aceptado = Date.now(); p.historial.push({ estado: 'pendiente', fecha: Date.now(), aceptado: true }); });
    await paso('Pasa a preparando', vend, function (p) { p.estado = 'preparando'; p.historial.push({ estado: 'preparando', fecha: Date.now() }); });
    await paso('Pasa a listo', vend, function (p) { p.estado = 'listo'; p.historial.push({ estado: 'listo', fecha: Date.now() }); });
    await paso('Despacha con seguimiento', vend, function (p) { p.seguimiento = { empresa: 'DAC', codigo: 'X1' }; p.estado = 'enviado'; p.historial.push({ estado: 'enviado', fecha: Date.now() }); });
    await paso('El comprador marca entregado', comp, function (p) { p.estado = 'entregado'; p.historial.push({ estado: 'entregado', fecha: Date.now() }); });
    r = await post('/api/pedidos/actualizar', { pedido: copia(function (c) { c.estado = 'entregado'; c.calificacionVendedor = { estrellas: 9, comentario: 'x', fecha: 1 }; }) }, comp.c);
    chequear('Calificación con 9 estrellas → 403', r.e === 403, r.t);
    await paso('El comprador califica', comp, function (p) { p.calificacionVendedor = { estrellas: 5, comentario: 'Bien', fecha: Date.now() }; });
    await paso('El comprador reclama', comp, function (p) { p.reclamo = { tipo: 'devolucion', motivo: 'Otro motivo', comentario: '', fecha: Date.now(), estado: 'solicitado', respuesta: '', historial: [{ estado: 'solicitado', fecha: Date.now() }] }; });
    r = await get('/api/pedidos', comp.c);
    const rec = r.j.pedidos.find(function (p) { return p.id === ped.id; });
    rec.reclamo.estado = 'aprobado'; rec.reclamo.historial.push({ estado: 'aprobado', fecha: Date.now() });
    r = await post('/api/pedidos/actualizar', { pedido: rec }, comp.c);
    chequear('El comprador no puede aprobar su propio reclamo → 403', r.e === 403, r.t);
    await paso('La vendedora aprueba el reclamo', vend, function (p) { p.reclamo.estado = 'aprobado'; p.reclamo.historial.push({ estado: 'aprobado', fecha: Date.now() }); });

    console.log('Suspensión para comprar');
    r = await post('/api/admin/cuenta/banear', { usuarioId: comp.id, tipo: 'temporal', alcance: 'comprar', dias: 3, motivo: 'Contracargos' }, admin);
    r = await post('/api/pedidos/crear', { pais: 'UY', datos: DATOS, items: [item()] }, comp.c);
    chequear('Con suspensión para comprar → 403', r.e === 403 && /comprar/.test(r.j.error || ''), r.t);

    console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo bien');
    process.exit(fallos ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
