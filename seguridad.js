// Página del enlace "¿No fuiste vos?" del email de inicio de sesión.
// El código viaja en el # de la dirección, que el navegador no manda al servidor ni a otros sitios.
(function () {
    const m = /(?:^#|&)t=([^&]+)/.exec(location.hash);
    const token = m ? decodeURIComponent(m[1]) : "";
    history.replaceState(null, "", location.pathname);   // saca el código de la barra de direcciones

    const mensaje = document.getElementById("mensaje"), boton = document.getElementById("boton");
    function decir(txt, clase) { mensaje.textContent = txt; mensaje.className = clase || ""; }
    if (!token) { document.getElementById("formulario").hidden = true; decir("Este enlace no es válido. Abrilo de nuevo desde el email.", "error"); return; }

    boton.addEventListener("click", async function () {
        const nueva = document.getElementById("nueva").value, repetir = document.getElementById("repetir").value;
        if (!nueva || nueva !== repetir) { decir("Las contraseñas no coinciden.", "error"); return; }
        boton.disabled = true; decir("Guardando…");
        try {
            const r = await fetch("/api/seguridad/no-fui-yo", {
                method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token: token, nueva: nueva })
            });
            const d = await r.json().catch(function () { return {}; });
            if (!d.ok) { decir(d.error || "No se pudo cambiar la contraseña.", "error"); boton.disabled = false; return; }
            document.getElementById("formulario").hidden = true;
            mensaje.className = "ok";
            mensaje.innerHTML = "";
            mensaje.append("Listo. Cambiaste tu contraseña y cerramos todas las sesiones. ");
            const a = document.createElement("a"); a.href = "/"; a.textContent = "Iniciar sesión";
            mensaje.append(a);
        } catch (e) { decir("No hay conexión con el servidor. Probá de nuevo.", "error"); boton.disabled = false; }
    });
})();
