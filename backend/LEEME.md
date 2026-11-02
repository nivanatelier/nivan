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
| `POST /api/medida` | Solicitud de prenda a medida: se manda por mail a `MAIL_ATELIER` (por defecto nivanatelier@gmail.com, necesita Brevo configurado); responder el mail va a la clienta. Máx. 5 por día y cuenta. |
| `POST /api/reportes` | `{tipo, objetivoId, motivo, detalle}` con tipo `publicacion`, `usuario`, `post` (post de perfil: id `idDueño_fecha`) o `comentario`. Llega al mismo panel de moderación de la administración. |
| `POST /api/login` | `{email, password}` → inicia sesión. Si la contraseña es incorrecta hay bloqueo escalonado por cuenta (se guarda en la base): 3 intentos → espera de 5 min; 2 intentos más → 30 min; 1 intento más → 24 h (y se repite cada 24 h). Durante la espera ni la contraseña correcta entra. Un ingreso correcto o restablecer la contraseña por email lo reinicia. |
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

## Ver otro país y "Se busca"
- Desde el menú lateral, cualquier persona puede **mirar** las publicaciones del otro país (Argentina ↔ Uruguay). Es solo para mirar: no hay carrito, comprar ni chat.
- Si le gusta algo, toca **"¿Alguien vende algo así en mi país?"** y deja un pedido (con una nota opcional).
- Los pedidos se juntan en **"Se busca"** (menú lateral y Panel de Vendedor): cada pedido se muestra una sola vez con cuántas personas lo buscan, para que quienes venden en ese país vean qué falta. Desde ahí se puede sumar ("Yo también lo busco"), cerrar el propio pedido o ir a **Publicar algo así**.
- Límites: 10 pedidos por día por cuenta, uno por publicación, y el servidor ignora los de cuentas baneadas. Las publicaciones que se muestran son las mismas que ya eran públicas (nada nuevo se expone).
- Prueba automática: `node prueba-busquedas.js` con el servidor andando (ver el encabezado del archivo).

## Si los mails de "Olvidé mi contraseña" no llegan
La app siempre responde "te mandamos un código" aunque el envío falle (así nadie puede averiguar qué emails tienen cuenta).
El panel ya no tiene botón de prueba de mails: el error real se ve en los logs de Render (busca "Brevo respondió"). Causas más comunes:
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
4. "Ver fotos" → Aprobar o Rechazar (con motivo). Al **rechazar** las fotos se borran del servidor; al **aprobar** se guardan para poder revisarlas después y se borran cuando vos lo decidas (botón "Eliminar fotos"), al cancelar la identidad, con un baneo permanente o al eliminarse la cuenta.
   - Botón **Baneados / suspendidos**: lista por categoría (permanente, temporal, vender, comprar, comprar y vender), de la medida más antigua a la más reciente, con "Quitar medida".
   - Botón **Identidades aceptadas**: de la más antigua a la más reciente; "Ver fotos", "Eliminar fotos" y "Cancelar identidad". Arriba hay un botón **Eliminar TODAS las fotos guardadas** (borra las de todas las personas ya revisadas; las pendientes no se tocan y las identidades siguen aceptadas). Cancelar la identidad la deja como rechazada con el motivo: no puede vender y sus publicaciones no se ven (no se borran) hasta que se acepte de nuevo.
   - **Baneo permanente**: borra para siempre sus publicaciones, sus fotos/videos y las fotos de su identidad.
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

## Desactivar cuenta (en el servidor)
- Mi cuenta → Privacidad y seguridad → Eliminar / desactivar cuenta → **Desactivar temporalmente**: pide la contraseña y llama a `POST /api/desactivar`.
- Mientras está desactivada: su perfil no sale en `GET /api/perfiles`, sus publicaciones no se ven ni se pueden comprar, nadie puede escribirle y se cierran todas sus sesiones.
- Para reactivarla: iniciar sesión y aceptar la pregunta de la app (`POST /api/reactivar`). Si no acepta, se cierra la sesión y sigue desactivada.
- La base crea la columna sola al arrancar (migración 10). Se puede eliminar la cuenta estando desactivada.

## Reseñas (en el servidor)
- Las reseñas de las publicaciones de venta las guarda el servidor y las ve cualquier persona. Archivo de la app: `js/34-resenias-servidor.js`.
- El servidor controla las reglas: solo reseña quien compró esa publicación y ya la recibió (pedido "entregado"), dentro de los 30 días desde la entrega.
  Una sola puntuación con estrellas por persona y publicación, y hasta 2 comentarios. Borrar un comentario no devuelve el cupo.
- Nadie puede reseñar a nombre de otra persona ni sus propias publicaciones. Los textos se limpian de `<` y `>`.
- Si se borra la publicación o la cuenta, sus reseñas se borran también.
- Rutas: `GET /api/resenias?pais=AR`, `POST /api/resenias/crear {publicacionId, texto, estrellas}`, `POST /api/resenias/eliminar {id}`.
- La base crea la tabla sola al arrancar (migración 11).
- Los productos del catálogo base (sin vendedor) y las reseñas hechas antes de esto siguen solo en el celular donde se escribieron.
- La notificación "Nueva reseña" al vendedor todavía es local (las notificaciones no están en el servidor).

## Seguidores y likes en el servidor (migración 12)
- Tabla `conjuntos` (coleccion, clave, valor). Dos colecciones: `seguidores` (clave = cuenta seguida, valor = cuenta seguidora; las claves de tienda empiezan con `T:`) y `likes` (clave = id del post, valor = id de quien dio like).
- `POST /api/conjuntos/cambiar` y `GET /api/conjuntos?coleccion=...`. Cada persona solo agrega o saca lo suyo; quien es seguido también puede sacar a un seguidor.
- Si una cuenta es privada, quién la sigue no se ve para terceros (sí para ella y para quien la sigue).
- Al borrar una cuenta se borran sus seguimientos, los de otras personas hacia ella y los likes de sus posts.
- Cliente: `js/35-conjuntos-servidor.js`.

## Comentarios de posts y preguntas al vendedor (en el servidor)
- Archivo de la app: `js/36-comentarios-preguntas-servidor.js`. Las claves de siempre (`nivanComentariosPosts` y `nivanPreguntas`) pasan a ser una copia de lo que dice el servidor.
- **Comentarios de posts** (con respuestas y likes en cada comentario): se bajan al abrir un post y se refrescan cada 6 segundos mientras está abierto.
  Quien comenta, da like o borra lo ve al instante; si no hay internet, el comentario queda pendiente y se manda cuando vuelve la conexión.
  Pueden borrar un comentario quien lo escribió y la dueña o el dueño del post (se van también sus respuestas).
  Si la cuenta del post pasa a privada, los demás dejan de ver y de escribir comentarios.
- **Preguntas al vendedor**: las ve cualquiera; solo responde quien vende, y una sola vez por pregunta. Máximo 100 preguntas por publicación.
  A quien vende le llega el aviso "Nueva pregunta" y a quien preguntó "Te respondieron" (la primera vez que se bajan no se avisa de lo viejo).
- Los textos se limpian de `<` y `>`. Límites: comentario 300 caracteres, pregunta 300, respuesta 500.
- Las publicaciones del catálogo base (sin vendedor) siguen guardando sus preguntas solo en el celular.
- Al eliminar una cuenta se borran sus comentarios, sus preguntas y los comentarios de sus posts.
- La base crea las tablas nuevas sola al arrancar (migración 13). Rutas: `GET /api/comentarios?post=`, `POST /api/comentarios/crear|eliminar|like`,
  `GET /api/preguntas?pais=`, `POST /api/preguntas/crear|responder`.
- Prueba: `node prueba-comentarios.js` (con el servidor corriendo con una carpeta de datos nueva).

## Avisos (notificaciones) entre personas, en el servidor
- Un aviso para OTRA persona ("te dieron like", "empezó a seguirte", "nuevo pedido", "te respondieron un comentario", cupones, reclamos...) antes solo se guardaba en el celular de quien lo generaba.
  Ahora la app lo manda al servidor (`POST /api/notificaciones/enviar`) y la app de quien lo recibe lo baja desde cualquier celular (`GET /api/notificaciones?desde=`). Archivo de la app: `js/37-avisos-servidor.js`.
- Los avisos para uno mismo (recomendaciones, bajó el precio...) siguen locales. Los de mensajes de chat y de preguntas al vendedor no pasan por acá: ya se generan solos al bajar chats y preguntas.
- Reglas del servidor: solo tipos conocidos; los textos se limpian de `<` y `>`; un aviso de un pedido solo lo pueden mandar las dos personas de ese pedido; el de reseña solo le llega a quien vende esa publicación;
  tope de 1500 avisos por hora por persona y 120 por hora hacia una misma persona; no se manda a cuentas baneadas.
- Avisos que se reemplazan en vez de repetirse: nuevo seguidor, solicitud de perfil, like a publicación, like a comentario (uno por persona y cosa).
- Cada persona conserva los últimos 150 avisos y nada de más de 45 días. Marcar como leído o borrar sigue siendo solo en cada celular.
- La base crea la tabla sola al arrancar (migración 14). Se borran con la cuenta de quien los manda o los recibe.
- Prueba: `node prueba-avisos.js` (con el servidor corriendo con una carpeta de datos nueva y `ADMIN_EMAILS`/`ADMIN_CLAVE`).

## Bloqueos de usuarios y solicitudes para ver un perfil privado (en el servidor)
- **Bloqueos** (`js/35-conjuntos-servidor.js`, colección "bloqueos"): cada persona cambia solo sus propios bloqueos.
  El servidor le entrega a cada una sus bloqueos y los de quienes la bloquearon (así la app esconde a la otra persona en los dos sentidos).
  Los bloqueos de otras personas nunca se envían.
- **El servidor hace cumplir el bloqueo** (aunque alguien modifique la app): quienes se bloquearon no pueden escribirse en el chat,
  comentar ni dar like en los posts del otro, hacerse preguntas en una publicación, seguirse ni pedirse ver el perfil.
- **Solicitudes para ver un perfil privado** (`js/39-solicitudes-servidor.js`): pedir, cancelar, aceptar y rechazar pasan por el servidor.
  Sin internet quedan pendientes y se mandan cuando vuelve. Aceptar una solicitud hace que esa cuenta siga a quien aceptó,
  y recién ahí el servidor le entrega los posts de esa cuenta privada (también puede comentarlos). Rechazar no avisa a nadie.
- Las cuentas privadas ya no "esconden" sus posts de quienes las siguen ni de ellas mismas (antes ni ellas los recuperaban en otro celular).
- Al eliminar una cuenta se borran sus solicitudes y sus bloqueos.
- Rutas: `POST /api/conjuntos/cambiar` (colección `bloqueos`), `GET /api/conjuntos?coleccion=bloqueos`,
  `GET /api/solicitudes`, `POST /api/solicitudes/enviar|cancelar|responder`.
- Prueba: `node prueba-bloqueos.js` (con el servidor corriendo con una carpeta de datos nueva).
- Todavía no se hace cumplir el bloqueo en las compras (pedidos): la app ya esconde el perfil, pero el servidor no lo impide.

## Cupones de descuento (en el servidor)
- Archivo de la app: `js/40-cupones-servidor.js`. Las claves de siempre (`nivanCupones` y `nivanCuponesGuardados_<id>`) pasan a ser una copia de lo que el servidor le muestra a cada persona.
- **Lo crea y maneja la tienda** (crear, pausar/reactivar, cambiar la audiencia, eliminar, enviarle un cupón a alguien): hace falta identidad aprobada.
  Reglas: código de 3 a 20 letras o números, no repetido entre cupones vigentes de cualquier tienda; porcentaje hasta 90%; hasta 100 cupones por tienda; si es de una publicación, tiene que ser suya.
- **Quién ve qué**: cualquiera ve los cupones públicos en el perfil de la tienda; quien cumple (sigue a la tienda o ya le compró) ve los de "seguidores"/"clientes"; los de "solo con el código" no se le muestran a nadie.
  Quien escribe un código lo busca en el servidor (tope de 60 códigos por hora). Cada persona solo ve a quiénes la tienda le habilitó ella misma, nunca la lista completa.
- **El descuento lo calcula el servidor al comprar** (`POST /api/pedidos/crear`): ignora el monto que mande la app. Aplica solo a los productos de esa tienda
  (o de esa publicación), nunca pasa del subtotal, revisa vencimiento, pausa y audiencia, y cuenta el uso de forma segura (si dos personas piden el último uso a la vez, solo una se lo lleva).
  Antes el servidor creía el descuento que mandaba la app (había que poner cualquier monto para comprar gratis).
- Los usos no se devuelven si después se cancela el pedido (igual que antes).
- Los cupones y códigos guardados que una cuenta ya tenía en su celular se suben solos, una sola vez, la primera vez que entra con esta versión.
- Al eliminar una cuenta se borran sus cupones y sus códigos guardados. La base crea las tablas sola al arrancar (migración 17).
- Rutas: `GET /api/cupones`, `POST /api/cupones/crear|actualizar|eliminar|habilitar|buscar|reclamar|quitar`.
- Prueba: `node prueba-cupones.js` (con el servidor corriendo con una carpeta de datos nueva y `ADMIN_EMAILS`/`ADMIN_CLAVE`).
- Todavía local: el aviso y el mensaje de chat de "te envío un cupón" se generan en el celular de la tienda y le llegan a la otra persona por los buzones de avisos y de chats.


## Avisos en el celular (notificaciones push)
Llegan aunque la app esté cerrada: mensajes de chat, preguntas y respuestas, comentarios y respuestas en posts, y todos los avisos entre personas
(pedidos, reseñas, seguidores, cupones, solicitudes...). Cada persona los activa con el botón de **Notificaciones → "Activar avisos en este celular"** y los puede apagar ahí mismo.
No usa librerías externas: el servidor firma con VAPID y cifra cada aviso (`backend/push.js`).

**Para encenderlos (una sola vez):**
1. En tu compu: `cd backend && node generar-vapid.js` → te da `VAPID_PUBLIC` y `VAPID_PRIVATE`.
2. En Render → Environment pegá las dos (la privada es secreta). Opcional: `VAPID_ASUNTO` (por defecto `mailto:nivanatelier@gmail.com`).
3. Redeploy. Sin esas dos variables el botón no aparece y todo lo demás funciona igual. Si cambiás las claves, cada persona tiene que volver a activar los avisos.

**Cómo se cuida:**
- Una cuenta puede tener hasta 5 celulares. Si otra cuenta entra en ese celular, el celular pasa a ser de ella; al cerrar sesión el celular deja de recibir los avisos de esa cuenta.
- Tope de 40 avisos push cada 10 minutos por persona. Los celulares que desinstalaron la app se borran solos.
- Si la app está abierta y a la vista no sale el cartel (ya se ve adentro). El aviso de chat no incluye el texto del mensaje, solo quién escribió.
- iPhone: solo funciona si la app está agregada a la pantalla de inicio (iOS 16.4 o más).
- Rutas: `GET /api/push/clave`, `POST /api/push/suscribir`, `POST /api/push/baja`. Prueba: `node prueba-push.js` (arranca su propio servidor).
