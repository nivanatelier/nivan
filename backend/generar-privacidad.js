// Genera /privacidad.html a partir de los textos de js/27-legal.js (AR y UY).
// Uso:  node generar-privacidad.js tu-correo@ejemplo.com
// Hay que volver a correrlo cada vez que cambie la política en js/27-legal.js.
'use strict';
const fs = require('fs');
const path = require('path');

const contacto = process.argv[2] || 'nivanatelier@gmail.com';
if (!contacto) console.warn('AVISO: falta el correo de contacto. Corré: node generar-privacidad.js tu-correo@ejemplo.com');
const CONTACTO = contacto || '[PEGAR-CORREO-DE-CONTACTO]';

const raiz = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'js', '27-legal.js'), 'utf8');
const m = src.match(/const TEXTOS_LEGALES_NIVAN = (\{[\s\S]*?\n\});/);
if (!m) { console.error('No encontré TEXTOS_LEGALES_NIVAN en js/27-legal.js'); process.exit(1); }
const T = (new Function('return ' + m[1]))();

const hoy = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
const esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };

function aHtml(texto) {
    texto = texto.replace(/\[fecha de publicación\]/g, hoy);
    const bloques = texto.split(/\n\s*\n/);
    let html = '', lista = false;
    bloques.forEach(function (b, i) {
        const lineas = b.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
        if (!lineas.length) return;
        if (lineas.every(function (l) { return l.indexOf('- ') === 0; })) {
            html += '<ul>' + lineas.map(function (l) { return '<li>' + esc(l.slice(2)) + '</li>'; }).join('') + '</ul>';
        } else if (i === 0) {
            html += '<h2>' + esc(lineas[0]) + '</h2>';
        } else if (/^\d+\. /.test(lineas[0]) && lineas.length === 1) {
            html += '<h3>' + esc(lineas[0]) + '</h3>';
        } else {
            html += '<p>' + lineas.map(esc).join('<br>') + '</p>';
        }
    });
    return html;
}

const secciones = Object.keys(T).map(function (pais) {
    const nombre = pais === 'UY' ? 'Uruguay' : pais === 'AR' ? 'Argentina' : pais;
    return '<section id="' + pais.toLowerCase() + '">' + aHtml(T[pais].privacidad) + '</section>';
}).join('\n');

const html = '<!DOCTYPE html>\n<html lang="es"><head><meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>Política de privacidad · Nivan</title>\n' +
'<style>:root{color-scheme:light dark}body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:0 auto;padding:20px;}' +
'nav a{margin-right:12px}h2{margin-top:2em}h3{margin-top:1.5em}section{border-top:1px solid #8884;padding-top:8px}</style>\n' +
'</head><body>\n<h1>Nivan · Política de privacidad</h1>\n' +
'<p>Contacto para consultas y pedidos sobre tus datos: <a href="mailto:' + CONTACTO + '">' + CONTACTO + '</a></p>\n' +
'<p>Para borrar tu cuenta y tus datos entrá a <a href="/eliminar-cuenta.html">Eliminar cuenta</a>.</p>\n' +
'<nav>' + Object.keys(T).map(function (p) { return '<a href="#' + p.toLowerCase() + '">' + (p === 'UY' ? 'Uruguay' : p === 'AR' ? 'Argentina' : p) + '</a>'; }).join('') + '</nav>\n' +
secciones + '\n</body></html>\n';

fs.writeFileSync(path.join(raiz, 'privacidad.html'), html);
console.log('Listo: privacidad.html (' + Object.keys(T).join(', ') + ')');
