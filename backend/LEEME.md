# Backend de NIVAN — parte 1: cuentas y sesiones

Node.js. Para pruebas locales no hace falta instalar nada. Para producción usa PostgreSQL (dependencia `pg`).

## Dónde se guardan los datos
- **Sin `DATABASE_URL`** → archivo `datos/db.json` (para probar en el celular/compu).
- **Con `DATABASE_URL`** → PostgreSQL. Las tablas se crean solas al arrancar.

## Publicarlo gratis (Render + Neon)
**1. Base de datos en Neon (gratis, sin tarjeta, no vence)**
- Entrá a neon.com, creá cuenta y un proyecto.
- Copiá la *connection string* (empieza con `postgresql://...`).

**2. Servidor en Render (plan gratis)**
- Subí la carpeta `Nivan` completa (con `backend/` adentro) a GitHub.
- En Render: **New → Blueprint** y elegí el repo. Cuando pida `DATABASE_URL`, pegá la de Neon.
  (A mano: Web Service, *Root Directory* `backend`, *Build* `npm install`, *Start* `node server.js`,
  variables `DATABASE_URL` y `DATABASE_SSL=1`.)
- Cuando termine, `https://tu-app.onrender.com/api/salud` tiene que responder `"almacen":"postgres"`.

Render configura solo `HOST`, `HTTPS` y `CONFIAR_PROXY` (detecta la variable `RENDER`).

**Límites del plan gratis**
- Render duerme el servidor tras 15 min sin visitas: el primer ingreso tarda cerca de 1 minuto.
  Un monitor gratis (UptimeRobot) que visite `/api/salud` cada 5 min lo mantiene despierto.
- Neon gratis: 0,5 GB de datos y 100 horas de cómputo por mes. Si se pasan, se pausa hasta el mes siguiente.
- No usen el Postgres gratis de Render: se borra a los 30 días.

Prueba contra el servidor publicado: `BASE=https://tu-app.onrender.com node prueba.js` (crea una cuenta de prueba real).

## Probarlo desde el celular (Android + Termux)
1. Instalá **Termux desde F-Droid** (la de Play Store está vieja y no anda bien).
2. En Termux:
   ```
   pkg update
   pkg install nodejs unzip
   termux-setup-storage
   ```
   (aceptá el permiso de archivos)
3. Descargá `Nivan.zip` desde el chat. Queda en *Descargas*. Después:
   ```
   cd ~
   unzip -o ~/storage/downloads/Nivan.zip
   cd Nivan/backend
   node server.js
   ```
4. Abrí Chrome y entrá a `http://localhost:3000` → es la app, servida por tu backend.
5. Para correr la prueba automática: abrí otra sesión de Termux (deslizá desde el borde izquierdo → *New session*) y:
   ```
   cd ~/Nivan/backend
   node prueba.js
   ```
   Tienen que pasar las 25 pruebas.

Dejá Termux abierto mientras lo usás. Para frenar el servidor: `Ctrl + C` (en el teclado extra de Termux, tecla CTRL y después C).

## Datos
- Todo queda en `Nivan/backend/datos/db.json` (y una copia `db.json.bak` que se renueva cada vez que arrancás).
- Hacé copia de esa carpeta de vez en cuando.
- Nunca se guarda la contraseña: solo su hash.

## API de esta parte
| Ruta | Qué hace |
|---|---|
| `GET /api/salud` | Dice si el servidor está vivo. |
| `POST /api/registro` | `{nombre, email, password, pais}` → crea la cuenta y deja la sesión iniciada. |
| `POST /api/login` | `{email, password}` → inicia sesión. |
| `POST /api/logout` | Cierra la sesión. |
| `GET /api/yo` | Devuelve la cuenta de la sesión actual (o 401). |

## Variables opcionales
- `DATABASE_URL` conexión a PostgreSQL (si no está, usa archivo).
- `DATABASE_SSL=1` si la base está afuera de Render.
- `PORT=3000` puerto.
- `HOST=0.0.0.0` para que otros dispositivos de tu wifi puedan entrar (por defecto solo el propio celular).
- `HTTPS=1` cuando lo publiques con certificado (activa cookies "Secure"). En Render es automático.
- `CONFIAR_PROXY=1` solo si lo ponés detrás de tu propio proxy. En Render es automático.
- `NIVAN_DATOS=/otra/carpeta` dónde guardar los datos.

## Ya conectado a la app
Registro, login, cierre de sesión, cambio de contraseña y confirmación de contraseña usan el servidor (`js/28-servidor.js`).
Rutas nuevas: `POST /api/password {actual, nueva}` y `POST /api/confirmar-password {password}`.
Las cuentas viejas creadas solo en un celular no pueden entrar: hay que registrarse de nuevo.

## Todavía no está hecho
- Recuperar contraseña (hoy es local; necesita envío de emails).
- Perfil, foto, tienda, publicaciones, seguidores, favoritos, carrito, pedidos, chat y reseñas siguen guardándose en cada celular.
- Premium y pagos.

## Emails (recuperar contraseña) — gratis con Brevo
1. Creá una cuenta en brevo.com (plan gratis: 300 emails por día).
2. En Brevo: Senders → agregá y verificá el email desde el que querés enviar (ej. el de Nivan).
3. En Brevo: SMTP & API → API Keys → creá una clave.
4. En Render → tu servicio → Environment: `BREVO_API_KEY` = la clave, `MAIL_DE` = ese email verificado.
Sin esas dos variables, "Olvidé mi contraseña" avisa que el envío no está configurado.
En tu computadora (sin Render) el código aparece en la consola del servidor.

## Fotos y videos en Cloudinary (para que la base no se llene)
La base gratis de Neon tiene 0,5 GB. Si se llena, Neon pausa **toda** la app (también el login). Por eso las fotos y videos de las
publicaciones van a Cloudinary (plan gratis: 25 créditos al mes entre espacio, ancho de banda y transformaciones; no pide tarjeta).
1. Creá una cuenta gratis en cloudinary.com.
2. En su panel, buscá **API Keys** (Settings → API Keys) y copiá la línea **API environment variable**: `CLOUDINARY_URL=cloudinary://clave:secreto@nombre`.
3. En Render → Environment agregá `CLOUDINARY_URL` con el valor `cloudinary://clave:secreto@nombre` (sin el `CLOUDINARY_URL=`). **No lo pegues en chats ni en GitHub: el secreto da acceso a tu cuenta.**
4. Cuando Render termine de desplegar, publicá algo con foto: en Cloudinary tiene que aparecer en la carpeta `nivan`.
- Si Cloudinary falla o no está configurado, las fotos se guardan en la base como respaldo.
- Si se borra la publicación o la cuenta, sus fotos/videos se borran también de Cloudinary.
- Las fotos del documento de identidad NUNCA van a Cloudinary: quedan en la base hasta que las revisan.
- Las fotos que ya estaban en la base siguen funcionando; solo las nuevas van a Cloudinary.

### Freno de seguridad del espacio
Como red de seguridad, al pasar `LIMITE_ALMACEN_MB` (por defecto 350) la base deja de aceptar fotos/videos nuevos. Todo lo demás
sigue andando. El panel de administración muestra cuántos MB se usan. Neon puede contar el espacio un poco distinto: revisá también su panel.

## Reportes y moderación desde la app
- Las personas reportan publicaciones y perfiles con el botón de siempre; ahora el reporte **llega al servidor** (una persona puede reportar cada cosa una sola vez).
- En la cuenta cuyo email está en `ADMIN_EMAILS` (por ejemplo `nivanatelier@gmail.com`), esos botones dicen **Moderar** y abren la ventana de moderación:
  pide la clave del panel (`ADMIN_CLAVE`) si hace falta, muestra la cuenta responsable y los reportes, y deja elegir:
  suspender para **comprar**, para **vender** o para **ambos** (por una cantidad de días), **banear para siempre**, **descartar** los reportes o **cancelar**.
  Siempre hay que escribir el motivo: la persona lo ve.
- Suspendida para vender: el servidor no la deja publicar y sus publicaciones dejan de verse (no se borran). Se recuperan al quitar la medida o al vencer los días.
- Suspendida para comprar: la app le frena la compra y le muestra el motivo. Los pedidos todavía no pasan por el servidor, así que este bloqueo solo se hace cumplir desde la app.
- Banear para siempre: no puede entrar (igual que antes). Las medidas también se pueden ver y quitar desde el panel de administración (buscando la cuenta).
- Los posts del feed y los comentarios todavía no están en el servidor: su botón de reportar sigue funcionando como antes (solo en el celular).
- Prueba automática: `ADMIN_EMAILS=admin@gmail.com ADMIN_CLAVE=... node server.js` y en otra terminal `ADMIN_CLAVE=... node prueba-reportes.js`.

## Si los mails de "Olvidé mi contraseña" no llegan
La app siempre responde "te mandamos un código" aunque el envío falle (así nadie puede averiguar qué emails tienen cuenta).
Para ver el error real: **Mi cuenta → Revisar identidades → clave del panel → "Probar envío de mails"**. Manda un mail de prueba a tu propio email y explica el motivo si falla. Causas más comunes:
1. **Brevo bloquea la IP de Render** (error 401 "unrecognised IP"): Brevo → Security → Authorized IPs → *Deactivate blocking*.
2. `BREVO_API_KEY` tiene que ser una **API key** (`xkeysib-...`), no una clave SMTP (`xsmtpsib-...`).
3. `MAIL_DE` tiene que estar agregado y verificado en Brevo → Senders.
4. Después de cambiar variables en Render hay que esperar a que termine de desplegar.
5. Con un remitente @gmail.com Brevo cambia la dirección por una propia y el mail suele caer en **spam/promociones**. Para que llegue bien, usar un remitente de dominio propio.

## Revisar identidades (verificación manual)
La app no analiza las fotos: las recibe y quedan "pendientes". Mientras tanto la persona ya puede vender.
Para entrar al panel hacen falta **tres cosas**: cuenta con sesión iniciada, que su email esté en `ADMIN_EMAILS`, y la clave del panel (`ADMIN_CLAVE`).
1. En Render → Environment agregá:
   - `ADMIN_EMAILS` = los emails de las cuentas de Nivan que van a revisar, separados por coma (los dos).
   - `ADMIN_CLAVE` = una clave larga (mínimo 10 caracteres) que sepan solo ustedes dos. Sin esta variable el panel queda apagado.
2. Iniciá sesión en la app con tu cuenta → **Mi cuenta → Revisar identidades** (el botón solo aparece si sos admin).
3. Ingresá la clave del panel. Queda abierto 20 minutos desde el último uso; "Cerrar panel" lo bloquea ya.
4. "Ver fotos" → Aprobar o Rechazar (con motivo). Al resolver, las fotos se borran del servidor.
5. Cada ingreso, clave incorrecta y decisión queda en los logs de Render. 5 claves incorrectas = bloqueo de 15 minutos.

## Banear cuentas (desde el panel de administración)
Mi cuenta → **Revisar identidades** → clave del panel → sección **Cuentas**.
1. Escribí el email o el ID de la persona (ej: `maria12`) y tocá **Buscar**.
2. **Banear por días**: te pide la cantidad de días y el motivo. Cuando pasa la fecha, la cuenta vuelve sola.
3. **Banear para siempre**: te pide el motivo.
4. **Quitar baneo**: la cuenta vuelve a funcionar al instante.
- El motivo es obligatorio y la persona lo ve (al intentar entrar o al abrir la app).
- Con baneo: no puede entrar, no puede publicar y sus publicaciones dejan de verse en la app.
- Una cuenta baneada **no puede eliminar su cuenta** (si no, se saltearía el baneo y podría registrarse de nuevo).
- Las cuentas de administración (las de `ADMIN_EMAILS`) no se pueden banear.
- Cada baneo queda anotado en los registros de Render (quién, a quién, motivo).
- Rutas: `POST /api/admin/cuenta/buscar`, `/banear {usuarioId, tipo: permanente|temporal, dias, motivo}`, `/desbanear {usuarioId}`.

## Chat con las cuentas de Nivan (sin restricciones)
Las cuentas que están en `ADMIN_EMAILS` (por ejemplo `nivanatelier@gmail.com`) pueden mandar y recibir **números de teléfono y redes
sociales** en el chat, y quien les escribe también. Una cuenta suspendida del chat por compartir redes puede escribirles igual, para apelar.
La app sabe cuáles son esas cuentas por `GET /api/admins` (solo ids, nunca emails). Para que funcione, el email tiene que estar en
`ADMIN_EMAILS` en Render y la cuenta tiene que existir (haber iniciado sesión al menos una vez).

## Chats entre personas (en el servidor)
- Los mensajes de los chats ahora los guarda el servidor: dos personas en celulares distintos (y de países distintos) pueden escribirse.
- Archivo de la app: `js/33-chats-servidor.js`. Cada mensaje que mandás se sube solo; si no hay internet queda guardado en el celular y se sube cuando vuelva.
  La app busca mensajes nuevos cada 4 segundos con un chat abierto y cada 15 segundos si no.
- Solo van al servidor los mensajes de texto, las propuestas, el aviso de compra y el contexto. Lo personal (silenciar un chat, borrarlo solo para uno,
  ocultar un mensaje solo para uno) se queda en cada celular.
- El servidor controla: nadie puede mandar un mensaje "de" otra persona, solo se borran los mensajes propios (y dentro del primer día),
  y cada uno marca como leído solo su lado. Los textos se limpian de `<` y `>`.
- Al eliminar una cuenta se borran sus chats.
- Los mensajes de antes del servidor (los viejos que estaban solo en el celular) se quedan en ese celular.
- La base crea las tablas nuevas sola al arrancar (migración 9). Rutas: `GET /api/chats?desde=`, `POST /api/chats/enviar`, `/eliminar`, `/leido`.
- Prueba: `node prueba-chats.js` (con el servidor corriendo con una carpeta de datos nueva).
