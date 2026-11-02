// Prueba del panel de administración: aprobadas con fotos, cancelar identidad, baneados por categoría y baneo permanente.
// Servidor: ADMIN_EMAILS=admin@gmail.com ADMIN_CLAVE=ClaveDelPanel123 NIVAN_DATOS=/tmp/x node server.js  →  node prueba-panel.js
'use strict';
const BASE = process.env.BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);
const CLAVE = process.env.ADMIN_CLAVE || 'ClaveDelPanel123';
async function post(ruta, b, cookie) { const r = await fetch(BASE + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookie || '' }, body: JSON.stringify(b || {}) }); const sc = r.headers.get('set-cookie'); return { e: r.status, j: await r.json().catch(() => ({})), c: sc ? sc.split(';')[0] : null }; }
async function get(ruta, cookie) { const r = await fetch(BASE + ruta, { headers: { cookie: cookie || '' } }); return { e: r.status, j: await r.json().catch(() => ({})) }; }
let fallos = 0; function chk(n, c, x) { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  →  ' + x)); if (!c) fallos++; }
const FOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
(async () => {
    const pw = 'Clave.Segura1';
    let r = await post('/api/registro', { aceptoTerminos: true, nombre: 'Admin Uno', email: 'admin@gmail.com', password: pw, pais: 'UY' });
    const admin = r.c; await post('/api/admin/entrar', { clave: CLAVE }, admin);
    async function persona(nombre) { const x = await post('/api/registro', { aceptoTerminos: true, nombre, email: nombre.toLowerCase().replace(/\s/g, '') + '@gmail.com', password: pw, pais: 'UY' }); return { c: x.c, id: x.j.usuario.id }; }
    async function verificada(nombre) {
        const p = await persona(nombre);
        await post('/api/verificacion', { fotos: { dniFrente: FOTO, dniDorso: FOTO, rostro: FOTO } }, p.c);
        await post('/api/admin/verificacion/resolver', { usuarioId: p.id, decision: 'aprobada' }, admin);
        return p;
    }
    const A = await verificada('Vendedora Uno'), B = await verificada('Vendedora Dos'), C = await verificada('Vendedora Tres');

    console.log('Identidades aceptadas');
    r = await post('/api/admin/aprobadas', {}, A.c);
    chk('una cuenta común no entra → 403', r.e === 403, r.e);
    r = await post('/api/admin/aprobadas', {}, admin);
    chk('lista las 3 aprobadas con fotos guardadas', r.e === 200 && r.j.aprobadas.length === 3 && r.j.aprobadas.every(x => x.tieneFotos), JSON.stringify(r.j));
    chk('de la más antigua a la más reciente', r.j.aprobadas.every((x, i, a) => !i || a[i - 1].revisada <= x.revisada));
    r = await post('/api/admin/verificacion/ver', { usuarioId: A.id }, admin);
    chk('se pueden ver las fotos de una aprobada', r.e === 200 && r.j.fotos && r.j.fotos.rostro === FOTO, r.e);
    r = await post('/api/admin/verificacion/borrar-fotos', { usuarioId: A.id }, admin);
    chk('borrar fotos → 200', r.e === 200);
    r = await post('/api/admin/verificacion/ver', { usuarioId: A.id }, admin);
    chk('ya no hay fotos (404)', r.e === 404, r.e);
    r = await post('/api/admin/aprobadas', {}, admin);
    chk('sigue aprobada pero sin fotos', r.j.aprobadas.find(x => x.id === A.id).tieneFotos === false);
    r = await post('/api/publicaciones/guardar', { publicacion: { id: 'pb1', nombre: 'Campera B', precio: 100, pais: 'UY', medios: [] } }, B.c);
    chk('B publica', r.e === 200, JSON.stringify(r.j));
    r = await get('/api/publicaciones?pais=UY');
    chk('todos ven la publicación de B', r.j.publicaciones && r.j.publicaciones.some(p => p.id === 'pb1'), JSON.stringify(r.j).slice(0, 200));

    console.log('\nBorrar todas');
    const D = await persona('Otra Vendedora'), P = D;
    await post('/api/verificacion', { fotos: { dniFrente: FOTO, dniDorso: FOTO, rostro: FOTO } }, P.c);
    r = await post('/api/admin/verificacion/borrar-todas', {}, B.c);
    chk('cuenta común no puede → 403', r.e === 403);
    r = await post('/api/admin/verificacion/borrar-todas', {}, admin);
    chk('borra las de B y C (A ya estaba borrada)', r.e === 200 && r.j.borradas === 2, JSON.stringify(r.j));
    r = await post('/api/admin/verificacion/ver', { usuarioId: B.id }, admin);
    chk('B sin fotos', r.e === 404);
    r = await post('/api/admin/verificacion/ver', { usuarioId: P.id }, admin);
    chk('la pendiente conserva sus fotos para revisarla', r.e === 200);
    r = await post('/api/admin/aprobadas', {}, admin);
    chk('siguen aceptadas', r.j.aprobadas.length === 3);
    // C vuelve a tener fotos para la prueba del baneo permanente
    await post('/api/admin/cuenta/banear', { usuarioId: P.id, tipo: 'permanente', motivo: 'Prueba de baneo' }, admin);
    r = await post('/api/admin/verificacion/ver', { usuarioId: P.id }, admin);
    chk('baneo permanente borra también las fotos de una pendiente', r.e === 404);

    console.log('\nCancelar identidad');
    r = await post('/api/admin/verificacion/cancelar', { usuarioId: B.id, motivo: 'Fotos dudosas' }, admin);
    chk('cancelar → 200', r.e === 200, JSON.stringify(r.j));
    r = await get('/api/publicaciones?pais=UY');
    chk('la publicación de B deja de verse para los demás', !(r.j.publicaciones || []).some(p => p.id === 'pb1'));
    r = await get('/api/publicaciones?pais=UY', B.c);
    chk('B sí ve la suya', (r.j.publicaciones || []).some(p => p.id === 'pb1'));
    r = await post('/api/publicaciones/guardar', { publicacion: { id: 'pb2', nombre: 'X', precio: 1, pais: 'UY', medios: [] } }, B.c);
    chk('B ya no puede vender → 403', r.e === 403, r.e);
    r = await get('/api/yo', B.c);
    chk('su estado figura rechazada con el motivo', r.j.usuario.verificacion.estado === 'rechazada' && /dudosas/.test(r.j.usuario.verificacion.motivo), JSON.stringify(r.j.usuario.verificacion));
    r = await post('/api/admin/aprobadas', {}, admin);
    chk('sale de la lista de aprobadas', !r.j.aprobadas.some(x => x.id === B.id));
    r = await post('/api/admin/verificacion/cancelar', { usuarioId: B.id }, admin);
    chk('cancelar de nuevo → 404', r.e === 404);
    await post('/api/verificacion', { fotos: { dniFrente: FOTO, dniDorso: FOTO, rostro: FOTO } }, B.c);
    await post('/api/admin/verificacion/resolver', { usuarioId: B.id, decision: 'aprobada' }, admin);
    r = await get('/api/publicaciones?pais=UY');
    chk('al aceptarla de nuevo, la publicación vuelve a verse (no se borró)', (r.j.publicaciones || []).some(p => p.id === 'pb1'));

    console.log('\nBaneados y suspendidos');
    await post('/api/admin/cuenta/banear', { usuarioId: A.id, tipo: 'temporal', dias: 5, motivo: 'Suspendida un tiempo', alcance: 'vender' }, admin);
    await new Promise(x => setTimeout(x, 30));
    await post('/api/admin/cuenta/banear', { usuarioId: B.id, tipo: 'temporal', dias: 3, motivo: 'Suspendida comprar', alcance: 'comprar' }, admin);
    await new Promise(x => setTimeout(x, 30));
    await post('/api/admin/cuenta/banear', { usuarioId: D.id, tipo: 'temporal', dias: 2, motivo: 'Suspendida para vender' , alcance: 'vender' }, admin);
    r = await post('/api/admin/baneados', {}, A.c);
    chk('cuenta común no entra → 403', r.e === 403);
    r = await post('/api/admin/baneados', {}, admin);
    const v = r.j.baneados.filter(x => x.categoria === 'vender');
    chk('lista con categorías', r.e === 200 && v.length === 2 && r.j.baneados.some(x => x.categoria === 'comprar'), JSON.stringify(r.j));
    chk('dentro de cada categoría: de más antiguo a más reciente', v[0].id === A.id && v[1].id === D.id && v[0].fecha <= v[1].fecha);

    console.log('\nBaneo permanente borra todo');
    r = await post('/api/publicaciones/guardar', { publicacion: { id: 'pc1', nombre: 'Campera C', precio: 100, pais: 'UY', medios: [] } }, C.c);
    chk('C publica', r.e === 200);
    r = await post('/api/admin/cuenta/banear', { usuarioId: C.id, tipo: 'permanente', motivo: 'Estafa comprobada' }, admin);
    chk('baneo permanente → 200', r.e === 200, JSON.stringify(r.j));
    r = await post('/api/admin/cuenta/desbanear', { usuarioId: C.id }, admin);
    r = await get('/api/publicaciones?pais=UY', C.c);
    chk('sus publicaciones se borraron para siempre (ni quitando el baneo vuelven)', !(r.j.publicaciones || []).some(p => p.id === 'pc1'));
    r = await post('/api/admin/verificacion/ver', { usuarioId: C.id }, admin);
    chk('sus fotos de identidad también se borraron', r.e === 404, r.e);
    await post('/api/admin/cuenta/banear', { usuarioId: C.id, tipo: 'permanente', motivo: 'Estafa comprobada' }, admin);
    r = await post('/api/admin/baneados', {}, admin);
    chk('aparece como baneo permanente', r.j.baneados.some(x => x.id === C.id && x.categoria === 'permanente' && x.hasta === null));
    r = await post('/api/admin/probar-email', {}, admin);
    chk('el botón/ruta de probar mails ya no existe', r.e === 404, r.e);

    console.log(fallos ? '\nFALLARON ' + fallos : '\nTodo bien.'); process.exit(fallos ? 1 : 0);
})();
