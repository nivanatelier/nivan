# Nivan en la web y en Play Store (sin pagar por mes)

Un solo código para los dos: la web es la app, y Play Store la abre como app (TWA).
Costo: 25 USD **una vez** en Play Console. Hosting gratis (Render + Neon, ver backend/LEEME.md).

## 1. Publicar la web (gratis)
1. Subí la carpeta Nivan a GitHub y desplegala con render.yaml (pasos en backend/LEEME.md).
2. Probá en Chrome del celular: menú ⋮ → "Instalar app". Si aparece, la parte web está lista.
3. Poné UptimeRobot (gratis) visitando /api/salud cada 5 min: sin eso Render duerme y la app tarda ~1 min en abrir.

## 2. Generar el .aab (gratis, sin instalar nada)
1. Entrá a pwabuilder.com, pegá la URL de tu app, "Package for stores" → Android.
2. Package ID: com.nivan.app (o el que prefieras; no se cambia después).
3. Dejá que genere la clave de firma y GUARDÁ el archivo de firma y las contraseñas (si lo perdés, no podés actualizar).
4. Descargá el .aab.

## 3. Play Console
1. Cuenta de desarrollador: 25 USD una sola vez.
2. Subí el .aab. Activá "Play App Signing" y copiá la huella SHA-256 del certificado.
3. Pegá esa huella en `.well-known/assetlinks.json` (y revisá que package_name coincida), volvé a desplegar.
   Sin esto la app muestra una barra del navegador arriba.
4. Verificá: https://TU-URL/.well-known/assetlinks.json tiene que abrir.

## 4. Lo que Google pide (y hoy falta)
- ✅ URL pública de política de privacidad: https://TU-URL/privacidad.html. Antes de publicar corré `node backend/generar-privacidad.js tu-correo@ejemplo.com` y volvé a desplegar.
- Formulario "Seguridad de los datos" (Data safety) completo.
- ✅ Enlace web para eliminar la cuenta: https://TU-URL/eliminar-cuenta.html (usa POST /api/eliminar-cuenta). Falta: que el botón de la app también borre la cuenta del servidor.
- Contenido de usuarios (publicaciones, chats): botones de denunciar y bloquear, y moderación.
- Cuentas personales nuevas: prueba cerrada con 12 testers durante 14 días antes de producción (verificá la regla vigente).
- Capturas, ícono 512 y gráfico de 1024x500.
- Premium: si cobran suscripciones dentro de la app de Android, Google exige Play Billing (se queda 15 %-30 %).
  Alternativa: no cobrar dentro de la app Android.
- Verificación con selfie (face-api): declararlo en privacidad y en Data safety.

## 5. Cada vez que cambien archivos
Subí el número `VERSION` en sw.js. Los cambios de web llegan solos a la app de Play Store, sin nueva revisión.
