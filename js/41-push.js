// ==============================
// NIVAN · Avisos en el celular (notificaciones push)
// ==============================
// Llegan aunque la app esté cerrada: mensajes, preguntas, comentarios, pedidos y demás novedades.
// La persona los activa una vez (botón en Notificaciones) y puede apagarlos cuando quiera.
// Si el servidor no tiene las claves VAPID, esto no muestra nada y no cambia nada.
(function () {
    "use strict";

    const APAGADO = "nivanPushApagado";          // la persona los desactivó a propósito: no se vuelven a activar solos
    const soporta = ("serviceWorker" in navigator) && ("PushManager" in window) && ("Notification" in window);
    let clave = null, activoServidor = false, usuarioSuscripto = null, caja = null;

    function yo() { return (typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id) || null; }
    function apagado() { try { return localStorage.getItem(APAGADO) === "1"; } catch (e) { return false; } }
    function fijarApagado(v) { try { if (v) localStorage.setItem(APAGADO, "1"); else localStorage.removeItem(APAGADO); } catch (e) {} }
    function esIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
    function instalada() { return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }

    function aBytes(b64) {
        const relleno = "=".repeat((4 - b64.length % 4) % 4);
        const crudo = atob((b64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
        const out = new Uint8Array(crudo.length);
        for (let i = 0; i < crudo.length; i++) out[i] = crudo.charCodeAt(i);
        return out;
    }

    async function cargarConfig() {
        if (clave !== null) return;
        const r = await apiNivan("/api/push/clave");
        activoServidor = !!(r && r.ok && r.activo && r.clave);
        clave = activoServidor ? r.clave : "";
    }

    async function suscripcionActual() {
        const reg = await navigator.serviceWorker.ready;
        return reg.pushManager.getSubscription();
    }

    async function suscribir() {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave) }); }
            catch (e) {
                // Si las claves del servidor cambiaron, la suscripción vieja no sirve: se descarta y se crea otra.
                const vieja = await reg.pushManager.getSubscription();
                if (vieja) await vieja.unsubscribe();
                sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave) });
            }
        }
        const r = await apiNivan("/api/push/suscribir", { suscripcion: sub.toJSON() });
        return !!(r && r.ok);
    }

    // Se llama al cerrar sesión: este celular deja de recibir los avisos de esa cuenta.
    window.quitarPushNivan = async function () {
        try {
            if (!soporta || !yo()) return;
            const sub = await suscripcionActual();
            if (sub) await apiNivan("/api/push/baja", { endpoint: sub.endpoint });
        } catch (e) {}
        usuarioSuscripto = null;
    };

    async function activar() {
        if (!soporta) return;
        await cargarConfig();
        if (!activoServidor) { alert("Los avisos al celular todavía no están disponibles."); return; }
        const permiso = await Notification.requestPermission();
        if (permiso !== "granted") { pintar(); return; }
        fijarApagado(false);
        try { await suscribir(); usuarioSuscripto = yo(); } catch (e) { alert("No se pudieron activar los avisos en este celular."); }
        pintar();
    }

    async function desactivar() {
        fijarApagado(true);
        try {
            const sub = await suscripcionActual();
            if (sub) { await apiNivan("/api/push/baja", { endpoint: sub.endpoint }); await sub.unsubscribe(); }
        } catch (e) {}
        usuarioSuscripto = null;
        pintar();
    }

    // ---- El recuadro en Notificaciones ----
    function asegurarCaja() {
        if (caja && document.body.contains(caja)) return caja;
        const pagina = document.getElementById("paginaNotificaciones");
        if (!pagina) return null;
        caja = document.createElement("div");
        caja.id = "cajaPushNivan";
        caja.style.cssText = "margin:10px 0 14px;padding:12px 14px;border-radius:12px;background:rgba(127,127,127,.12);font-size:14px;line-height:1.35;display:none;";
        const titulo = pagina.querySelector(".tituloPagina");
        if (titulo && titulo.nextSibling) pagina.insertBefore(caja, titulo.nextSibling); else pagina.appendChild(caja);
        return caja;
    }

    function pintar() {
        const c = asegurarCaja();
        if (!c) return;
        c.innerHTML = "";
        const boton = function (texto, fn, claro) {
            const b = document.createElement("button");
            b.type = "button"; b.textContent = texto; b.onclick = fn;
            b.style.cssText = "margin-top:8px;padding:9px 14px;border-radius:10px;border:0;font-size:14px;cursor:pointer;" + (claro ? "background:transparent;color:inherit;text-decoration:underline;padding-left:0;" : "background:#fff;color:#111;font-weight:600;");
            return b;
        };
        const linea = function (t) { const p = document.createElement("div"); p.textContent = t; return p; };

        if (!yo()) { c.style.display = "none"; return; }
        if (!soporta) {
            if (esIOS() && !instalada()) {
                c.style.display = "block";
                c.appendChild(linea("📲 Para recibir avisos en tu iPhone, primero agregá Nivan a la pantalla de inicio (Compartir → Agregar a inicio) y abrila desde ahí."));
            } else c.style.display = "none";
            return;
        }
        if (!activoServidor) { c.style.display = "none"; return; }

        c.style.display = "block";
        if (Notification.permission === "denied") {
            c.appendChild(linea("🔕 Los avisos están bloqueados en este navegador. Para recibirlos, permitilos desde los ajustes del sitio y volvé a abrir la app."));
        } else if (Notification.permission === "granted" && !apagado()) {
            c.appendChild(linea("✅ Avisos activados en este celular: te avisamos de mensajes, preguntas, comentarios y pedidos aunque la app esté cerrada."));
            c.appendChild(boton("Desactivar avisos", desactivar, true));
        } else {
            c.appendChild(linea("🔔 Activá los avisos para enterarte al instante de mensajes, preguntas, comentarios y pedidos, aunque la app esté cerrada."));
            c.appendChild(boton("Activar avisos en este celular", activar, false));
        }
    }

    // Quien ya dio permiso se vuelve a suscribir solo (cada cuenta que entra en este celular lo recibe).
    async function mantener() {
        const id = yo();
        if (!soporta || !id) { pintar(); return; }
        try {
            await cargarConfig();
            if (activoServidor && Notification.permission === "granted" && !apagado() && usuarioSuscripto !== id) {
                if (await suscribir()) usuarioSuscripto = id;
            }
        } catch (e) {}
        pintar();
    }

    let ultimo = null;
    function vigilar() {
        const id = yo();
        if (id !== ultimo) { ultimo = id; usuarioSuscripto = null; mantener(); }
    }
    window.addEventListener("load", function () { setTimeout(function () { vigilar(); mantener(); }, 1200); });
    setInterval(vigilar, 2500);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) mantener(); });
})();
