// Prueba: la solicitud a medida llega por mail a nivanatelier@gmail.com (con un "Brevo" falso).
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
let fallos = 0; function chk(n, c, x) { if (c) console.log('✔', n); else { fallos++; console.log('✘', n, x || ''); } }
async function post(base, ruta, b, cookie) { const r = await fetch(base + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookie || '' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json().catch(() => ({})), c: (r.headers.get('set-cookie') || '').split(';')[0] }; }
(async () => {
    const recibidos = [];
    const brevo = http.createServer((q, s) => { let d = ''; q.on('data', x => d += x); q.on('end', () => { recibidos.push(JSON.parse(d)); s.writeHead(201); s.end('{}'); }); }).listen(3991);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nm-'));
    const env = Object.assign({}, process.env, { PORT: 3992, NIVAN_DATOS: dir, BREVO_API_KEY: 'x', MAIL_DE: 'no-responder@nivan.test', BREVO_URL: 'http://localhost:3991/', ADMIN_EMAILS: 'admin@gmail.com' });
    const sv = spawn('node', ['server.js'], { env, stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 2000));
    const B = 'http://localhost:3992';
    const ENV = { nombre: 'Clara Pérez', direccion: 'Av. 18 de Julio 1234 apto 5', ciudad: 'Montevideo', region: 'Montevideo', codigoPostal: '11200' };
    try {
        let r = await post(B, '/api/medida', { email: 'a@gmail.com', campos: [{ etiqueta: 'x', valor: 'y' }] });
        chk('sin sesión → 401', r.s === 401);
        r = await post(B, '/api/registro', { nombre: 'Clienta Prueba', email: 'clienta@gmail.com', password: 'ClaveBuena1!', aceptoTerminos: true });
        const ck = r.c;
        r = await post(B, '/api/medida', { email: 'mal', campos: [{ etiqueta: 'x', valor: 'y' }] }, ck);
        chk('email inválido → 400', r.s === 400);
        r = await post(B, '/api/medida', { email: 'clienta@gmail.com', campos: [] }, ck);
        chk('vacía → 400', r.s === 400);
        r = await post(B, '/api/medida', { email: 'clienta@gmail.com', numero: 123456, pais: 'UY', envio: ENV, campos: [{ etiqueta: '¿Qué querés crear?', valor: 'Vestido' }, { etiqueta: 'Altura (cm)', valor: '165' }, { etiqueta: 'Color preferido', valor: 'Negro\nBcc: otro@x.com' }] }, ck);
        chk('solicitud válida → 200', r.s === 200 && r.j.ok, JSON.stringify(r));
        const m = recibidos[0] || {};
        chk('el mail trae nombre, dirección, usuario y país', /Clara Pérez/.test(m.textContent) && /18 de Julio 1234/.test(m.textContent) && /Departamento: Montevideo/.test(m.textContent) && /Uruguay \(pesos uruguayos\)/.test(m.textContent) && /Usuario: /.test(m.textContent), m.textContent);
        chk('el mail va a nivanatelier@gmail.com', m.to && m.to[0].email === 'nivanatelier@gmail.com', JSON.stringify(m.to));
        chk('asunto con número y prenda', /#123456/.test(m.subject || '') && /Vestido/.test(m.subject || ''), m.subject);
        chk('el cuerpo trae los datos', /Altura \(cm\): 165/.test(m.textContent || '') && /clienta@gmail.com/.test(m.textContent || ''));
        chk('responder va a la clienta', m.replyTo && m.replyTo.email === 'clienta@gmail.com');
        chk('un solo destinatario (sin inyección)', m.to.length === 1 && !m.cc && !m.bcc);
        r = await post(B, '/api/medida', { email: 'clienta@gmail.com', pais: 'UY', campos: [{ etiqueta: 'a', valor: 'b' }] }, ck);
        chk('sin dirección → 400', r.s === 400);
        r = await post(B, '/api/medida', { email: 'clienta@gmail.com', envio: ENV, campos: [{ etiqueta: 'a', valor: 'b' }] }, ck);
        chk('sin país → 400', r.s === 400);
        for (let i = 0; i < 3; i++) await post(B, '/api/medida', { email: 'clienta@gmail.com', pais: 'AR', envio: ENV, campos: [{ etiqueta: 'a', valor: 'b' }] }, ck);
        r = await post(B, '/api/medida', { email: 'clienta@gmail.com', pais: 'AR', envio: ENV, campos: [{ etiqueta: 'a', valor: 'b' }] }, ck);
        chk('tope de 5 por día → 429', r.s === 429);
    } finally { sv.kill(); brevo.close(); }
    console.log(fallos ? 'FALLÓ ' + fallos : 'Todo bien.'); process.exit(fallos ? 1 : 0);
})();
