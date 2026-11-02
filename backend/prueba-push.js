// Prueba de los avisos push: suscripción, cifrado real (RFC 8291), firma VAPID (RFC 8292) y envío al comentar o recibir un aviso.
// Arranca su propio servidor y un "servicio de push" falso, así que se corre solo:  node prueba-push.js
'use strict';
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const push = require('./push');

let fallos = 0; function chk(n, c, x) { console.log((c ? '  ✔ ' : '  ✘ ') + n + (c ? '' : '  →  ' + (typeof x === 'string' ? x : JSON.stringify(x)))); if (!c) fallos++; }
const b64u = function (b) { return Buffer.from(b).toString('base64url'); };

(async () => {
    const vapid = push.generarClaves();
    const recibidos = [];       // lo que le llega al "servicio de push"
    const estadoPorRuta = { '/push/gone': 410 };
    const falso = http.createServer((q, s) => {
        const trozos = []; q.on('data', c => trozos.push(c));
        q.on('end', () => { recibidos.push({ ruta: q.url, headers: q.headers, cuerpo: Buffer.concat(trozos) }); s.writeHead(estadoPorRuta[q.url] || 201); s.end(); });
    }).listen(3995);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'np-'));
    const env = Object.assign({}, process.env, { PORT: 3996, NIVAN_DATOS: dir, ADMIN_EMAILS: 'admin@gmail.com', VAPID_PUBLIC: vapid.publica, VAPID_PRIVATE: vapid.privada, NIVAN_PUSH_PRUEBA: '1' });
    const sv = spawn('node', ['server.js'], { env, stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 2000));
    const BASE = 'http://127.0.0.1:3996';
    async function pedir(metodo, ruta, b, cookie) { const r = await fetch(BASE + ruta, { method: metodo, headers: { 'Content-Type': 'application/json', cookie: cookie || '' }, body: b === undefined ? undefined : JSON.stringify(b) }); const sc = r.headers.get('set-cookie'); return { e: r.status, j: await r.json().catch(() => ({})), c: sc ? sc.split(';')[0] : null }; }
    const espera = ms => new Promise(r => setTimeout(r, ms));

    // un "celular": claves propias que el servidor solo conoce en público
    function celular(ruta) {
        const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
        const auth = crypto.randomBytes(16);
        return { ecdh, auth, sub: { endpoint: 'http://127.0.0.1:3995' + ruta, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } } };
    }
    function descifrar(cel, cuerpo) {
        const sal = cuerpo.subarray(0, 16), idlen = cuerpo[20], asPub = cuerpo.subarray(21, 21 + idlen), datos = cuerpo.subarray(21 + idlen);
        const uaPub = cel.ecdh.getPublicKey(), compartido = cel.ecdh.computeSecret(asPub);
        const ikm = Buffer.from(crypto.hkdfSync('sha256', compartido, cel.auth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32));
        const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
        const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));
        const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
        d.setAuthTag(datos.subarray(datos.length - 16));
        const plano = Buffer.concat([d.update(datos.subarray(0, datos.length - 16)), d.final()]);
        return JSON.parse(plano.subarray(0, plano.lastIndexOf(2)).toString('utf8'));
    }

    try {
        const pw = 'Clave.Segura1';
        let r = await pedir('GET', '/api/push/clave');
        chk('el servidor publica su clave VAPID', r.e === 200 && r.j.activo === true && r.j.clave === vapid.publica, r.j);
        const A = await pedir('POST', '/api/registro', { aceptoTerminos: true, nombre: 'Ana Duena', email: 'ana@gmail.com', password: pw, pais: 'UY' });
        const B = await pedir('POST', '/api/registro', { aceptoTerminos: true, nombre: 'Beto Comenta', email: 'beto@gmail.com', password: pw, pais: 'UY' });
        const idA = A.j.usuario.id;

        console.log('Suscripción');
        const cel = celular('/push/a'), gone = celular('/push/gone');
        r = await pedir('POST', '/api/push/suscribir', { suscripcion: cel.sub });
        chk('sin sesión → 401', r.e === 401);
        r = await pedir('POST', '/api/push/suscribir', { suscripcion: { endpoint: 'http://evil.example/x', keys: cel.sub.keys } }, A.c);
        chk('un endpoint que no es https → 400', r.e === 400, r.e);
        r = await pedir('POST', '/api/push/suscribir', { suscripcion: { endpoint: cel.sub.endpoint, keys: { p256dh: 'abc', auth: 'def' } } }, A.c);
        chk('claves inválidas → 400', r.e === 400);
        r = await pedir('POST', '/api/push/suscribir', { suscripcion: cel.sub }, A.c);
        chk('Ana activa los avisos en su celular → 200', r.e === 200, r.j);
        r = await pedir('POST', '/api/push/suscribir', { suscripcion: gone.sub }, A.c);
        chk('y en un segundo celular (que después se desinstala)', r.e === 200);

        console.log('\\nEnvío');
        const F = Date.now() - 5000, postId = idA + '_' + F;
        await pedir('POST', '/api/perfil/guardar', { perfil: { portafolio: [{ fecha: F, texto: 'Mi primer post' }], privacidad: { verPerfil: 'todos' } } }, A.c);
        r = await pedir('POST', '/api/comentarios/crear', { postId, texto: 'Qué lindo' }, B.c);
        chk('Beto comenta el post de Ana', r.e === 200, r.j);
        await espera(600);
        const aCel = recibidos.filter(x => x.ruta === '/push/a'), aGone = recibidos.filter(x => x.ruta === '/push/gone');
        chk('el celular de Ana recibe 1 aviso', aCel.length === 1, recibidos.map(x => x.ruta));
        if (aCel.length) {
            const m = aCel[0];
            chk('viaja cifrado (aes128gcm)', m.headers['content-encoding'] === 'aes128gcm' && m.cuerpo.length > 100 && m.cuerpo.indexOf('Qué lindo') < 0);
            const mensaje = descifrar(cel, m.cuerpo);
            chk('Ana lo puede descifrar y dice quién comentó', mensaje.titulo === '💬 Nuevo comentario' && /Beto Comenta comentó tu post/.test(mensaje.texto), mensaje);
            chk('trae etiqueta y destino', /^com:/.test(mensaje.etiqueta) && mensaje.url === '/');
            const au = m.headers.authorization || '';
            const mt = /^vapid t=([^,]+), k=(.+)$/.exec(au);
            chk('lleva la firma VAPID con la clave del servidor', !!mt && mt[2] === vapid.publica, au.slice(0, 40));
            if (mt) {
                const [h, c, f] = mt[1].split('.');
                const pub = Buffer.from(vapid.publica, 'base64url');
                const llave = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
                const ok = crypto.verify('sha256', Buffer.from(h + '.' + c), { key: llave, dsaEncoding: 'ieee-p1363' }, Buffer.from(f, 'base64url'));
                const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
                chk('la firma es válida y es para ese servicio', ok && claims.aud === 'http://127.0.0.1:3995' && claims.exp > Date.now() / 1000 && /^mailto:/.test(claims.sub), claims);
            }
        }
        chk('el celular desinstalado también se intentó (410)', aGone.length === 1);
        r = await pedir('POST', '/api/comentarios/crear', { postId, texto: 'Otro más' }, B.c);
        await espera(600);
        chk('y después se borró: no se le vuelve a mandar', recibidos.filter(x => x.ruta === '/push/gone').length === 1);
        chk('el celular de Ana recibe el segundo', recibidos.filter(x => x.ruta === '/push/a').length === 2);

        console.log('\\nAvisos entre personas');
        const antes = recibidos.length;
        r = await pedir('POST', '/api/notificaciones/enviar', { lista: [{ para: idA, id: 'N1' + Date.now(), datos: { tipo: 'calificacion', titulo: 'Te calificaron', texto: 'Beto te dejó 5 estrellas &amp; un comentario.' } }] }, B.c);
        await espera(600);
        chk('un aviso para Ana también le llega como push', r.e === 200 && recibidos.length === antes + 1 && recibidos[recibidos.length - 1].ruta === '/push/a', r.j);
        if (recibidos.length > antes) {
            const m = descifrar(cel, recibidos[recibidos.length - 1].cuerpo);
            chk('con el texto limpio (sin entidades HTML)', m.titulo === 'Te calificaron' && m.texto === 'Beto te dejó 5 estrellas & un comentario.', m);
        }

        console.log('\\nBaja');
        r = await pedir('POST', '/api/push/baja', { endpoint: cel.sub.endpoint }, B.c);
        const n1 = recibidos.length;
        await pedir('POST', '/api/comentarios/crear', { postId, texto: 'Tercero' }, B.c);
        await espera(600);
        chk('otra cuenta no puede dar de baja el celular de Ana', recibidos.length === n1 + 1);
        r = await pedir('POST', '/api/push/baja', { endpoint: cel.sub.endpoint }, A.c);
        chk('Ana lo da de baja → 200', r.e === 200);
        const n2 = recibidos.length;
        await pedir('POST', '/api/comentarios/crear', { postId, texto: 'Cuarto' }, B.c);
        await espera(600);
        chk('ya no recibe avisos', recibidos.length === n2);
    } finally { sv.kill(); falso.close(); }
    console.log(fallos ? '\nFALLARON ' + fallos : '\nTodo bien.'); process.exit(fallos ? 1 : 0);
})();
