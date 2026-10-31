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

## Revisar identidades (verificación manual)
La app no analiza las fotos: las recibe y quedan "pendientes". Mientras tanto la persona ya puede vender.
1. En Render → Environment agregá `ADMIN_EMAILS` con el email (o varios, separados por coma) de las cuentas de Nivan que van a revisar.
2. Iniciá sesión en la app con esa cuenta y abrí `https://TU-APP.onrender.com/admin-verificaciones.html`.
3. "Ver fotos" → Aprobar o Rechazar (con motivo). Al resolver, las fotos se borran del servidor.
