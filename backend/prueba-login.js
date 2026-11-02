// Prueba del bloqueo escalonado de login, por fases (entre fases el servidor se reinicia y se vence la espera: ver probar-login.sh).
const BASE = process.env.BASE || 'http://localhost:3000';
const FASE = Number(process.env.FASE || 1);
async function post(ruta, b) { const r = await fetch(BASE + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json().catch(() => ({})) }; }
let fallos = 0; function chk(n, c, x) { if (c) console.log('✔', n); else { fallos++; console.log('✘', n, x || ''); } }
(async () => {
    const email = 'login@gmail.com', bien = 'ClaveBuena1!', mala = 'Incorrecta1!';
    let r;
    if (FASE === 1) {
        r = await post('/api/registro', { nombre: 'Lu Test', email, password: bien, aceptoTerminos: true });
        chk('registro', r.s === 201, JSON.stringify(r));
        r = await post('/api/login', { email, password: mala });
        chk('1er fallo: quedan 2', r.s === 401 && r.j.quedan === 2, JSON.stringify(r));
        r = await post('/api/login', { email, password: mala });
        chk('2do fallo: queda 1', r.s === 401 && r.j.quedan === 1, JSON.stringify(r));
        r = await post('/api/login', { email, password: mala });
        chk('3er fallo: bloqueo 5 min', r.s === 429 && r.j.bloqueada && r.j.esperaSeg === 300, JSON.stringify(r));
        r = await post('/api/login', { email, password: bien });
        chk('bloqueada: ni la correcta entra', r.s === 429 && r.j.bloqueada, JSON.stringify(r));
    } else if (FASE === 2) {
        r = await post('/api/login', { email, password: mala });
        chk('tras 5 min: 1 de 2 intentos (quedan 1)', r.s === 401 && r.j.quedan === 1, JSON.stringify(r));
        r = await post('/api/login', { email, password: mala });
        chk('2do: bloqueo 30 min', r.s === 429 && r.j.esperaSeg === 1800, JSON.stringify(r));
    } else if (FASE === 3) {
        r = await post('/api/login', { email, password: mala });
        chk('tras 30 min: 1 intento y bloqueo 24 h', r.s === 429 && r.j.esperaSeg === 86400 && /24 horas/.test(r.j.error), JSON.stringify(r));
    } else if (FASE === 4) {
        r = await post('/api/login', { email, password: bien });
        chk('tras 24 h la correcta entra', r.s === 200, JSON.stringify(r));
        r = await post('/api/login', { email, password: mala });
        chk('y el contador vuelve a empezar (quedan 2)', r.s === 401 && r.j.quedan === 2, JSON.stringify(r));
        r = await post('/api/login', { email: 'noexiste@gmail.com', password: mala });
        chk('email inexistente: mismo mensaje, no revela nada', r.s === 401 && r.j.quedan === 2, JSON.stringify(r));
    }
    console.log(fallos ? 'FALLÓ ' + fallos : 'OK fase ' + FASE);
    process.exit(fallos ? 1 : 0);
})();
