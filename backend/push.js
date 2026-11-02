// ==============================
// NIVAN · Notificaciones push (Web Push, sin librerías externas)
// ==============================
// Manda avisos al celular aunque la app esté cerrada. Usa el estándar Web Push:
//   · VAPID (RFC 8292): el servidor se identifica con un par de claves propias (VAPID_PUBLIC / VAPID_PRIVATE).
//   · Cifrado aes128gcm (RFC 8291 / 8188): solo el celular de la persona puede leer el aviso.
// Sin las dos variables, el push queda apagado y todo lo demás sigue igual.
'use strict';
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const PUBLICA = String(process.env.VAPID_PUBLIC || '').trim();
const PRIVADA = String(process.env.VAPID_PRIVATE || '').trim();
const ASUNTO = String(process.env.VAPID_ASUNTO || 'mailto:nivanatelier@gmail.com').trim();
const PRUEBA = process.env.NIVAN_PUSH_PRUEBA === '1';     // solo para las pruebas automáticas: deja usar http://127.0.0.1

const b64u = function (b) { return Buffer.from(b).toString('base64url'); };
const deB64u = function (s) { return Buffer.from(String(s), 'base64url'); };

let claveFirma = null;
function activo() {
    if (!PUBLICA || !PRIVADA) return false;
    if (claveFirma) return true;
    try {
        const pub = deB64u(PUBLICA), d = deB64u(PRIVADA);
        if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) return false;
        claveFirma = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: b64u(d) }, format: 'jwk' });
        return true;
    } catch (e) { console.error('VAPID_PUBLIC / VAPID_PRIVATE inválidas:', e.message); return false; }
}
function clavePublica() { return activo() ? PUBLICA : ''; }

// Un par de claves nuevo (lo usa generar-vapid.js).
function generarClaves() {
    const k = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const j = k.privateKey.export({ format: 'jwk' });
    const pub = Buffer.concat([Buffer.from([4]), deB64u(j.x), deB64u(j.y)]);
    return { publica: b64u(pub), privada: j.d };
}

function jwtVapid(audiencia) {
    const cab = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const cuerpo = b64u(JSON.stringify({ aud: audiencia, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: ASUNTO }));
    const firma = crypto.sign('sha256', Buffer.from(cab + '.' + cuerpo), { key: claveFirma, dsaEncoding: 'ieee-p1363' });
    return cab + '.' + cuerpo + '.' + b64u(firma);
}

// Cifra el mensaje para ese celular (aes128gcm).
function cifrar(texto, p256dh, auth) {
    const uaPub = deB64u(p256dh), secretoAuth = deB64u(auth);
    if (uaPub.length !== 65 || secretoAuth.length < 16) throw new Error('suscripción inválida');
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const asPub = ecdh.getPublicKey();
    const compartido = ecdh.computeSecret(uaPub);
    const ikm = Buffer.from(crypto.hkdfSync('sha256', compartido, secretoAuth, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32));
    const sal = crypto.randomBytes(16);
    const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));
    const cifrador = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const datos = Buffer.concat([cifrador.update(Buffer.concat([Buffer.from(texto, 'utf8'), Buffer.from([2])])), cifrador.final(), cifrador.getAuthTag()]);
    const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
    return Buffer.concat([sal, rs, Buffer.from([asPub.length]), asPub, datos]);
}

function endpointValido(endpoint) {
    try {
        const u = new URL(endpoint);
        if (endpoint.length > 600) return false;
        return u.protocol === 'https:' || (PRUEBA && u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost'));
    } catch (e) { return false; }
}

// Devuelve { ok, estado }. estado 404/410 = la suscripción ya no existe (hay que borrarla).
function enviar(sub, aviso) {
    return new Promise(function (resolver) {
        try {
            if (!activo() || !endpointValido(sub.endpoint)) return resolver({ ok: false, estado: 0 });
            const url = new URL(sub.endpoint);
            const cuerpo = cifrar(JSON.stringify(aviso), sub.p256dh, sub.auth);
            const modulo = url.protocol === 'http:' ? http : https;
            const req = modulo.request({
                hostname: url.hostname, port: url.port || undefined, path: url.pathname + url.search, method: 'POST',
                headers: {
                    'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'Content-Length': cuerpo.length,
                    TTL: '86400', Urgency: 'normal',
                    Authorization: 'vapid t=' + jwtVapid(url.protocol + '//' + url.host) + ', k=' + PUBLICA
                },
                timeout: 10000
            }, function (res) {
                res.resume();
                res.on('end', function () { resolver({ ok: res.statusCode >= 200 && res.statusCode < 300, estado: res.statusCode }); });
            });
            req.on('timeout', function () { req.destroy(); });
            req.on('error', function () { resolver({ ok: false, estado: 0 }); });
            req.end(cuerpo);
        } catch (e) { resolver({ ok: false, estado: 0 }); }
    });
}

module.exports = { activo, clavePublica, generarClaves, enviar, endpointValido, cifrar };
