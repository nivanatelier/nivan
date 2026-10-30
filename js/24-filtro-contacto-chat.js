// ==============================
// FILTRO DE CONTACTO EN EL CHAT
// ==============================
// 1) Teléfonos: no se pueden pasar, ni con números, ni con letras ("once cuarenta y
//    cinco"), ni con números romanos, ni separados con espacios, puntos o símbolos,
//    ni con letras parecidas a números (o = 0, l = 1), ni partidos en varios mensajes.
// 2) Redes sociales: si el que escribe es una tienda (a cualquier cuenta) o es un
//    comprador que le escribe a una tienda, se bloquea el mensaje y se suma una
//    infracción. Con infracciones repetidas se suspende el chat de la cuenta.
//
// Las suspensiones se guardan en este dispositivo (como el resto de la app).

// Cuántos dígitos seguidos (ya sea en números, palabras o romanos) cuentan como teléfono.
const MIN_DIGITOS_TELEFONO_NIVAN = 8;

// Escalera de sanciones por infracciones de redes sociales.
// horas: null = permanente. El número de la infracción es la posición + 1.
const SANCIONES_RED_SOCIAL_NIVAN = [
    { horas: 0 },     // 1ª: se bloquea el mensaje y se avisa
    { horas: 24 },    // 2ª: 24 horas sin poder escribir
    { horas: 168 },   // 3ª: 7 días
    { horas: null }   // 4ª en adelante: permanente
];

(function() {

    // ---------- Normalización ----------

    const CONFUSABLES = {
        "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "і": "i", "ѕ": "s", "ј": "j",
        "ο": "o", "α": "a", "ε": "e", "ι": "i", "ν": "v", "κ": "k", "ρ": "p", "τ": "t"
    };

    // Letras que se parecen a un número: "l1" "o" "s" "b" ...
    const LETRA_A_DIGITO = { o: "0", l: "1", i: "1", z: "2", e: "3", a: "4", s: "5", g: "9", b: "8", t: "7" };
    const LEET_A_LETRA = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

    function valorDigitoUnicode(ch) {
        // Cualquier dígito de otro alfabeto (árabe, devanagari...) pasa a 0-9.
        let cp = ch.codePointAt(0);
        let inicio = cp;
        while (true) {
            const anterior = String.fromCodePoint(inicio - 1);
            if (/\p{Nd}/u.test(anterior)) inicio--; else break;
        }
        return String((cp - inicio) % 10);
    }

    function normalizarTextoNivan(texto) {
        let s = String(texto || "").normalize("NFKC");
        s = s.replace(/[\u200B-\u200F\u2060\uFEFF\u00AD\u034F\u180E\uFE00-\uFE0F\u20E3]/g, "");
        s = s.replace(/\p{Nd}/gu, function(ch) { return /[0-9]/.test(ch) ? ch : valorDigitoUnicode(ch); });
        s = s.toLowerCase();
        s = s.replace(/[\u0400-\u04FF\u0370-\u03FF]/g, function(ch) { return CONFUSABLES[ch] || ch; });
        s = s.normalize("NFD").replace(/\p{M}/gu, "");
        return s;
    }

    // ---------- Números en palabras ----------

    const UNIDADES = {
        cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
        // portugués
        um: 1, uma: 1, dois: 2, quatro: 4, sete: 7, oito: 8, nove: 9,
        // inglés
        zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
        // italiano / francés (los más usados)
        due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove_it: 9,
        deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9
    };

    const ESPECIALES = {
        diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
        dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22,
        veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
        veintinueve: 29, cien: 100, ciento: 100, ten: 10, eleven: 11, twelve: 12, dez: 10, onze: 11, doze: 12,
        treze: 13, catorze: 14, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
        setenta_pt: 70, oitenta: 80, noventa_pt: 90, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
        seventy: 70, eighty: 80, ninety: 90
    };

    const DECENAS = { treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90 };
    const MULTIPLICADOR = { doble: 2, triple: 3, cuadruple: 4, cuádruple: 4 };

    function valorPalabraNumero(t) {
        if (Object.prototype.hasOwnProperty.call(UNIDADES, t)) return UNIDADES[t];
        if (Object.prototype.hasOwnProperty.call(ESPECIALES, t)) return ESPECIALES[t];
        if (Object.prototype.hasOwnProperty.call(DECENAS, t)) return DECENAS[t];
        return null;
    }

    // Unidades y talles que son romanos "válidos" pero casi siempre significan otra cosa.
    const NO_ROMANOS = ["m", "l", "c", "d", "xl", "xxl", "mm", "cm", "ml", "cc", "cl", "dm", "mi", "di", "li", "mix", "cd", "md", "mc", "lm", "dc", "ci", "mil"];

    function valorRomano(t) {
        if (!/^[ivxlcdm]+$/.test(t) || NO_ROMANOS.indexOf(t) !== -1) return null;
        if (!/^m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/.test(t)) return null;
        const v = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
        let total = 0;
        for (let i = 0; i < t.length; i++) {
            const actual = v[t[i]];
            const siguiente = v[t[i + 1]] || 0;
            total += actual < siguiente ? -actual : actual;
        }
        return total > 0 ? total : null;
    }

    // ---------- Cosas que NO son teléfonos ----------

    function quitarExcepcionesNivan(s) {
        // Número de pedido: NV-2026-123456
        s = s.replace(/\bnv-\d{4}-\d{6}\b/g, " ¤ ");

        // Fechas reales (día 1-31 y mes 1-12): 10/10/2026
        s = s.replace(/\b(\d{1,2})([\/.\-])(\d{1,2})\2(\d{2,4})\b/g, function(todo, d, sep, m) {
            return (Number(d) >= 1 && Number(d) <= 31 && Number(m) >= 1 && Number(m) <= 12) ? " ¤ " : todo;
        });

        // Horas: 10:30
        s = s.replace(/\b\d{1,2}:\d{2}\b/g, " ¤ ");

        // Precios con puntos de miles y moneda: $1.500.000 / 1.500.000 pesos
        s = s.replace(/(?:\$\s*|\b(?:ars|uyu|usd)\s*)\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?/g, " ¤ ");
        s = s.replace(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\s*(?:pesos|ars|uyu|usd|dolares)\b/g, " ¤ ");

        return s;
    }

    // ---------- Teléfonos ----------

    function pasarAItemsNivan(textoNormalizado) {
        const s = quitarExcepcionesNivan(textoNormalizado);
        const partes = s.match(/[a-z0-9]+|[^a-z0-9]+/g) || [];
        const items = []; // { tipo: "num", d: "123" } | { tipo: "relleno" } | { tipo: "corte" } | { tipo: "sep", coma: bool }

        let multiplicador = 1;

        for (let i = 0; i < partes.length; i++) {
            const p = partes[i];

            if (!/^[a-z0-9]/.test(p)) {
                // Separador entre palabras
                if (/[^\s\-._()+*\/|~·•–—#\\^`´\u00A0]/.test(p.replace(/[,;]/g, ""))) {
                    items.push({ tipo: "corte" });
                } else {
                    items.push({ tipo: "sep", coma: /[,;]/.test(p) });
                    continue;
                }
                multiplicador = 1;
                continue;
            }

            // Multiplicadores: "doble siete", "triple cero"
            if (MULTIPLICADOR[p]) { multiplicador = MULTIPLICADOR[p]; continue; }

            // Decena en palabras + "y" + unidad: "cuarenta y cinco"
            if (Object.prototype.hasOwnProperty.call(DECENAS, p)) {
                const sep1 = partes[i + 1], y = partes[i + 2], sep2 = partes[i + 3], unidad = partes[i + 4];
                if (sep1 && /^\s+$/.test(sep1) && y === "y" && sep2 && /^\s+$/.test(sep2) && unidad
                    && Object.prototype.hasOwnProperty.call(UNIDADES, unidad) && UNIDADES[unidad] >= 1) {
                    items.push({ tipo: "num", d: String(DECENAS[p] + UNIDADES[unidad]) });
                    i += 4;
                    multiplicador = 1;
                    continue;
                }
            }

            const palabra = valorPalabraNumero(p);
            if (palabra !== null) {
                items.push({ tipo: "num", d: String(palabra).repeat(multiplicador) });
                multiplicador = 1;
                continue;
            }

            // Token con dígitos (puede traer letras pegadas: "tel1145", "1x1x4")
            if (/[0-9]/.test(p)) {
                const letras = p.replace(/[0-9]/g, "");
                let d = p.replace(/[^0-9]/g, "");
                if (letras && /^[olizeasgbt]+$/.test(letras)) {
                    d = p.split("").map(function(c) { return /[0-9]/.test(c) ? c : LETRA_A_DIGITO[c]; }).join("");
                }
                items.push({ tipo: "num", d: d.repeat(multiplicador) });
                multiplicador = 1;
                continue;
            }

            const romano = valorRomano(p);
            if (romano !== null) {
                items.push({ tipo: "num", d: String(romano).repeat(multiplicador) });
                multiplicador = 1;
                continue;
            }

            // Una letra suelta (que no sea y, o, a, e, u) se tolera como relleno: "1 k 1 k 4"
            if (p.length === 1 && !/[yoaeu]/.test(p)) {
                items.push({ tipo: "relleno" });
                continue;
            }

            items.push({ tipo: "corte" });
            multiplicador = 1;
        }

        return items;
    }

    // Devuelve la tirada más larga de dígitos seguidos.
    function maximaTiradaDigitosNivan(items) {
        let mejor = 0;
        let actual = 0;
        let rellenosSeguidos = 0;
        let pendienteSep = null; // separador entre el último número y el próximo
        let ultimoLargo = 0;

        function cortar() { actual = 0; rellenosSeguidos = 0; pendienteSep = null; ultimoLargo = 0; }

        for (let i = 0; i < items.length; i++) {
            const it = items[i];

            if (it.tipo === "corte") { cortar(); continue; }
            if (it.tipo === "sep") {
                if (actual > 0) pendienteSep = pendienteSep && pendienteSep.coma ? pendienteSep : it;
                continue;
            }
            if (it.tipo === "relleno") {
                if (actual > 0) {
                    rellenosSeguidos++;
                    if (rellenosSeguidos > 1) cortar();
                }
                continue;
            }

            // Número
            // Una coma o punto y coma solo une números si alguno tiene 4 o más cifras: "11,4567,8901"
            // (así una lista de talles "38, 40, 42, 44" no cuenta).
            if (pendienteSep && pendienteSep.coma && it.d.length < 4 && ultimoLargo < 4) {
                actual = 0;
            }

            actual += it.d.length;
            ultimoLargo = it.d.length;
            pendienteSep = null;
            rellenosSeguidos = 0;
            if (actual > mejor) mejor = actual;
        }

        return mejor;
    }

    function tiradaDigitosTextoNivan(texto) {
        return maximaTiradaDigitosNivan(pasarAItemsNivan(normalizarTextoNivan(texto)));
    }

    // previos: mensajes anteriores propios y seguidos (para que no se pueda partir el número en dos).
    function contieneTelefonoNivan(texto, previos) {
        if (tiradaDigitosTextoNivan(texto) >= MIN_DIGITOS_TELEFONO_NIVAN) return true;

        if (Array.isArray(previos) && previos.length) {
            const unido = previos.concat([texto]).join(" ");
            if (tiradaDigitosTextoNivan(unido) >= MIN_DIGITOS_TELEFONO_NIVAN) return true;
        }
        return false;
    }

    // ---------- Redes sociales ----------

    const MARCAS_LARGAS = [
        "instagram", "facebook", "whatsapp", "whatsap", "wathsapp", "tiktok", "snapchat", "twitter",
        "linkedin", "pinterest", "youtube", "linktree", "linktr", "onlyfans", "discord", "messenger", "telegram"
    ];

    const PALABRAS_RED = [
        "insta", "ig", "fb", "face", "wsp", "wpp", "wapp", "wasap", "wasapp", "whats", "guasap", "guatsap",
        "watsap", "wats", "snap", "arroba", "tg"
    ];

    function contieneRedSocialNivan(texto) {
        const crudo = String(texto || "").normalize("NFKC");
        const s = normalizarTextoNivan(texto);

        // @usuario (no cuenta un mail: ahí la @ viene pegada a letras)
        if (/(^|[^a-z0-9._])@[a-z0-9._]{3,}/.test(s)) return true;

        // Enlaces y dominios de redes: instagram.com, wa.me, t.me, x.com, linktr.ee ...
        if (/\b(?:instagram|facebook|fb|tiktok|twitter|x|t|wa|youtu|youtube|linktr|linkedin|snapchat|pinterest|threads|bit)\s*\.\s*(?:com|me|be|ee|ly|net|gg)\b/.test(s)) return true;

        // "mis redes", "redes sociales"
        if (/\b(?:mis\s+redes|red(?:es)?\s+sociales?)\b/.test(s)) return true;

        // Palabras sueltas cortas: insta, ig, fb, wsp ...
        const palabras = s.match(/[a-z0-9]+/g) || [];
        for (let i = 0; i < palabras.length; i++) {
            if (PALABRAS_RED.indexOf(palabras[i]) !== -1) return true;
        }

        // Nombres largos, aunque los separen ("i n s t a g r a m", "w h a t s a p p", "1nstagram")
        const pegado = s.replace(/[^a-z0-9@$]/g, "");
        const leet = pegado.replace(/[01345@$7]/g, function(c) { return LEET_A_LETRA[c]; });
        const variantes = [pegado, leet];
        for (let v = 0; v < variantes.length; v++) {
            for (let m = 0; m < MARCAS_LARGAS.length; m++) {
                const marca = MARCAS_LARGAS[m];
                const pos = variantes[v].indexOf(marca);
                if (pos === -1) continue;
                // "telegrama" es un telegrama, no la red
                if (marca === "telegram" && variantes[v].charAt(pos + marca.length) === "a") continue;
                return true;
            }
        }

        return false;
    }

    window.contieneTelefonoNivan = contieneTelefonoNivan;
    window.contieneRedSocialNivan = contieneRedSocialNivan;
    window.tiradaDigitosTextoNivan = tiradaDigitosTextoNivan;
})();

// ---------- Sanciones ----------

const CLAVE_SANCIONES_CHAT_NIVAN = "nivanSancionesChat";

function leerSancionesChatNivan() {
    const o = leerJSONNivan(CLAVE_SANCIONES_CHAT_NIVAN, {});
    return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
}

// Devuelve null si puede escribir, o el texto con el motivo si está suspendido.
function textoSuspensionChatNivan(idUsuario) {
    const s = leerSancionesChatNivan()[idUsuario];
    if (!s) return null;

    if (s.permanente) {
        return "Tu cuenta está suspendida de forma permanente para enviar mensajes por compartir redes sociales.";
    }
    if (s.hasta && s.hasta > Date.now()) {
        const horas = Math.ceil((s.hasta - Date.now()) / 3600000);
        const texto = horas >= 48 ? Math.ceil(horas / 24) + " días" : horas + (horas === 1 ? " hora" : " horas");
        return "Tu cuenta está suspendida para enviar mensajes por compartir redes sociales. Te quedan " + texto + ".";
    }
    return null;
}

// Suma una infracción y devuelve el texto para mostrar.
function registrarInfraccionRedSocialNivan(idUsuario) {
    const todas = leerSancionesChatNivan();
    const s = todas[idUsuario] || { n: 0, hasta: null, permanente: false };

    s.n += 1;
    const paso = SANCIONES_RED_SOCIAL_NIVAN[Math.min(s.n, SANCIONES_RED_SOCIAL_NIVAN.length) - 1];
    s.ultima = Date.now();

    let texto;
    if (paso.horas === null) {
        s.permanente = true;
        s.hasta = null;
        texto = "No se pueden compartir redes sociales. Tu cuenta quedó suspendida de forma permanente para enviar mensajes.";
    } else if (paso.horas > 0) {
        s.hasta = Date.now() + paso.horas * 3600000;
        texto = "No se pueden compartir redes sociales. Tu cuenta quedó suspendida " +
            (paso.horas >= 48 ? (paso.horas / 24) + " días" : paso.horas + " horas") + " para enviar mensajes.";
    } else {
        texto = "No se pueden compartir redes sociales. Es una advertencia: si lo repetís, tu cuenta se suspende.";
    }

    todas[idUsuario] = s;
    guardarJSONNivan(CLAVE_SANCIONES_CHAT_NIVAN, todas);
    return texto;
}

// Se llama antes de enviar un mensaje. Devuelve null si está todo bien,
// o el texto del aviso si el mensaje se tiene que frenar.
//   chat: el chat (puede ser nuevo, sin mensajes)
//   ladoEmisor / ladoReceptor: "tienda" | "personal"
function revisarMensajeChatNivan(chat, idEmisor, texto, ladoEmisor, ladoReceptor, sinTiendas) {
    const suspension = textoSuspensionChatNivan(idEmisor);
    if (suspension) return suspension;

    // Dos cuentas sin tienda: sin restricciones de palabras.
    if (sinTiendas) return null;

    // Mensajes propios anteriores y seguidos (hasta 3, de los últimos 3 minutos).
    const previos = [];
    const mensajes = (chat && Array.isArray(chat.mensajes)) ? chat.mensajes : [];
    const limite = Date.now() - 3 * 60000;
    for (let i = mensajes.length - 1; i >= 0 && previos.length < 3; i--) {
        const m = mensajes[i];
        if (!m || m.tipo === "contexto" || m.tipo === "compra") continue;
        if (m.de !== idEmisor || m.fecha < limite || !m.texto) break;
        previos.unshift(m.texto);
    }

    // Teléfonos: no se pueden pasar en ningún chat.
    if (contieneTelefonoNivan(texto, previos)) {
        return "No se pueden compartir números de teléfono, ni redes sociales, si detectamos que mandaste una red social tu cuenta va a ser suspendida";
    }

    // Redes sociales: si alguna de las dos cuentas tiene tienda, aplica en todo el chat.
    if (contieneRedSocialNivan(texto)) {
        return registrarInfraccionRedSocialNivan(idEmisor);
    }

    return null;
}
