// Prueba: la foto de referencia de la solicitud a medida llega ADJUNTA en el mail (con un "Brevo" falso).
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
let fallos = 0; function chk(n, c, x) { if (c) console.log('✔', n); else { fallos++; console.log('✘', n, x || ''); } }
async function post(base, ruta, b, cookie) {
    const r = await fetch(base + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: cookie || '' }, body: JSON.stringify(b) });
    let j = {}; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j: j, c: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const ENV = { nombre: 'Clara Pérez', direccion: 'Calle 1 234', ciudad: 'Rosario', region: 'Santa Fe', codigoPostal: '2000' };
(async () => {
    const recibidos = [];
    const brevo = http.createServer((q, s) => { let d = ''; q.on('data', x => d += x); q.on('end', () => { recibidos.push(JSON.parse(d)); s.writeHead(201); s.end('{}'); }); }).listen(3981);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nmf-'));
    const env = Object.assign({}, process.env, { PORT: 3982, NIVAN_DATOS: dir, BREVO_API_KEY: 'x', MAIL_DE: 'no-responder@nivan.test', BREVO_URL: 'http://localhost:3981/' });
    const sv = spawn('node', ['server.js'], { env, stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 2000));
    const B = 'http://localhost:3982';
    const campos = [{ etiqueta: '¿Qué querés crear?', valor: 'Vestido' }, { etiqueta: 'Altura (cm)', valor: '165' }];
    try {
        let r = await post(B, '/api/registro', { nombre: 'Clienta Foto', email: 'foto@gmail.com', password: 'ClaveBuena1!', aceptoTerminos: true });
        const ck = r.c;

        r = await post(B, '/api/medida', { email: 'foto@gmail.com', numero: 111111, pais: 'UY', envio: ENV, campos: campos, foto: 'data:image/png;base64,' + PNG }, ck);
        chk('solicitud con foto → 200', r.s === 200 && r.j.ok, JSON.stringify(r));
        let m = recibidos[recibidos.length - 1] || {};
        chk('el mail trae 1 adjunto', Array.isArray(m.attachment) && m.attachment.length === 1, JSON.stringify(Object.keys(m)));
        chk('el adjunto se llama referencia-<número>.png', m.attachment && m.attachment[0].name === 'referencia-111111.png', JSON.stringify(m.attachment && m.attachment[0].name));
        chk('el contenido es exactamente la foto que se mandó', m.attachment && m.attachment[0].content === PNG);
        chk('el texto avisa que hay foto adjunta', /Foto de referencia: adjunta/.test(m.textContent || ''), m.textContent);
        chk('el resto del mail sigue igual (destino, respuesta, datos)', m.to[0].email === 'nivanatelier@gmail.com' && m.replyTo.email === 'foto@gmail.com' && /Altura \(cm\): 165/.test(m.textContent));

        const antes = recibidos.length;
        r = await post(B, '/api/medida', { email: 'foto@gmail.com', pais: 'AR', envio: ENV, numero: 222222, campos: campos }, ck);
        m = recibidos[recibidos.length - 1] || {};
        chk('sin foto no hay adjunto ni aviso', r.s === 200 && recibidos.length === antes + 1 && !m.attachment && !/Foto de referencia/.test(m.textContent || ''));

        r = await post(B, '/api/medida', { email: 'foto@gmail.com', pais: 'AR', envio: ENV, campos: campos, foto: '' }, ck);
        chk('foto vacía = sin foto → 200', r.s === 200);

        // El tope es de 5 solicitudes por día y por cuenta: los casos inválidos van con otra cuenta.
        r = await post(B, '/api/registro', { nombre: 'Clienta Dos', email: 'foto2@gmail.com', password: 'ClaveBuena1!', aceptoTerminos: true });
        const ck2 = r.c;
        const n0 = recibidos.length;
        r = await post(B, '/api/medida', { email: 'foto@gmail.com', pais: 'AR', envio: ENV, campos: campos, foto: 'data:image/svg+xml;base64,' + Buffer.from('<svg onload="alert(1)"/>').toString('base64') }, ck2);
        chk('un SVG se rechaza → 400', r.s === 400, r.s);
        r = await post(B, '/api/medida', { email: 'foto@gmail.com', pais: 'AR', envio: ENV, campos: campos, foto: 'data:text/html;base64,' + Buffer.from('<script>1</script>').toString('base64') }, ck2);
        chk('un HTML disfrazado se rechaza → 400', r.s === 400, r.s);
        r = await post(B, '/api/medida', { email: 'foto@gmail.com', pais: 'AR', envio: ENV, campos: campos, foto: 'http://sitio-malo.com/x.png' }, ck2);
        chk('un enlace en vez de una foto se rechaza → 400', r.s === 400, r.s);
        chk('nada de eso mandó mails', recibidos.length === n0, recibidos.length - n0);
    } finally { sv.kill(); brevo.close(); }
    console.log(fallos ? 'FALLÓ ' + fallos : 'Todo bien.'); process.exit(fallos ? 1 : 0);
})();
