# Formulario "Seguridad de los datos" (Data safety) de Play Console

Armado mirando lo que **hoy** hace el código (app + `backend/`). Play Console está en inglés: al lado de cada
respuesta va el nombre en inglés tal como aparece en el formulario. Si cambiás algo en la app o el servidor,
revisá este archivo: lo que declarás tiene que coincidir con lo que la app hace y con `privacidad.html`.

## 1. Preguntas generales

| Pregunta del formulario | Respuesta | Por qué |
|---|---|---|
| ¿Tu app recopila o comparte alguno de los tipos de datos requeridos? (*Does your app collect or share any of the required user data types?*) | **Sí** | Cuentas, pedidos, chats, fotos. |
| ¿Todos los datos se cifran en tránsito? (*Is all of the user data collected by your app encrypted in transit?*) | **Sí** | La app habla con el servidor por HTTPS (Render lo fuerza) y las contraseñas se guardan con hash. Vale mientras la app se use solo desde `https://`. |
| ¿Ofrecés una forma de pedir que se borren los datos? (*Do you provide a way for users to request that their data be deleted?*) | **Sí** | Dentro de la app: Privacidad y seguridad → Eliminar cuenta. Fuera de la app: `https://TU-URL/eliminar-cuenta.html`. |
| URL para pedir el borrado | `https://TU-URL/eliminar-cuenta.html` | Ya existe y usa `POST /api/eliminar-cuenta`. |
| ¿Revisión de seguridad independiente? | No | No hay. |
| Público objetivo | Solo mayores de 18 | Lo dice la política y la verificación rechaza menores. No marcar "Familias". |

## 2. Datos que se recopilan

"Recopilar" = salen del celular hacia tu servidor. Para cada uno, Play pide: ¿obligatorio u opcional?,
¿se comparte con terceros? y para qué se usa.

| Categoría (Play) | Tipo de dato (Play) | Qué es en Nivan | Obligatorio | Para qué (Play) |
|---|---|---|---|---|
| Información personal (*Personal info*) | Nombre (*Name*) | Nombre real de la cuenta, apodo | Sí | Funcionalidad de la app; Administración de cuenta; Prevención de fraude, seguridad y cumplimiento |
| | Dirección de correo (*Email address*) | Email de la cuenta | Sí | Funcionalidad; Administración de cuenta; Comunicaciones (código de recuperar contraseña, aviso de dispositivo nuevo) |
| | ID de usuario (*User IDs*) | ID de cuenta, ID público, ID de tienda | Sí | Funcionalidad; Administración de cuenta |
| | Dirección (*Address*) | Dirección, ciudad y código postal del pedido | Sí, al comprar | Funcionalidad (entregar el pedido al vendedor) |
| | Número de teléfono (*Phone number*) | Teléfono del pedido | Sí, al comprar | Funcionalidad |
| Información financiera (*Financial info*) | Historial de compras (*Purchase history*) | Pedidos: prendas, total, método elegido ("Tarjeta", "Mercado Pago"), estado | Sí, al comprar o vender | Funcionalidad |
| Fotos y videos (*Photos and videos*) | Fotos (*Photos*) y Videos (*Videos*) | Fotos/videos de publicaciones, foto de perfil, portafolio, **fotos del documento y selfie de verificación** | Verificación: sí para comprar/vender. El resto: opcional | Funcionalidad; Prevención de fraude, seguridad y cumplimiento |
| Mensajes (*Messages*) | Otros mensajes en la app (*Other in-app messages*) | Chats y preguntas al vendedor | Opcional | Funcionalidad |
| Actividad en la app (*App activity*) | Otro contenido generado por usuarios (*Other user-generated content*) | Reseñas, comentarios, publicaciones del feed, reportes | Opcional | Funcionalidad; Prevención de fraude, seguridad y cumplimiento |
| Identificadores (*Device or other IDs*) | Dispositivo u otros ID | Dirección IP y navegador (user-agent) de cada sesión, y una huella de los dispositivos conocidos | Sí (automático) | Prevención de fraude, seguridad y cumplimiento (avisar de ingresos nuevos) |

Notas:
- **IP y user-agent**: Google no dice con claridad si la IP cae en "Device or other IDs". Declararlo es lo prudente
  y no cuesta nada; no declararlo y que Google lo considere dato recopilado sí puede traer problemas.
- **Cara / biometría**: Play no tiene una categoría "biometría". La comparación de rostro con el documento
  (`face-api`) se hace **en el celular**; al servidor solo llegan las fotos, que se declaran como *Photos*.
  Igual la política ya pide consentimiento expreso antes de empezar, y eso está bien.

## 3. Datos que NO se recopilan (no marcar)

| Dato | Por qué no |
|---|---|
| Ubicación (aproximada o precisa) | `geolocation` solo se usa para probar el permiso en Privacidad → Permisos; nunca se envía. La ciudad del pedido es una dirección que escribe la persona. |
| Datos de tarjeta / información de pago | La app no cobra: "Mercado Pago" todavía no está conectado. Marca, últimos 4 dígitos, titular y vencimiento de tarjetas guardadas quedan **solo en el celular** (no pasan por el servidor). |
| Medidas del cuerpo, salud y fitness | `nivanPerfilCorporal` y el modelo 3D quedan solo en el celular. |
| Contactos, calendario, SMS, llamadas, archivos | No se leen. |
| Audio | No se graba. La cámara se usa para la selfie y fotos; no hay micrófono. |
| Navegación web, historial de búsqueda, apps instaladas | No se recopilan (las búsquedas se resuelven en el celular). |
| Registros de fallas y diagnósticos | No hay Sentry, Firebase ni Analytics. |
| Publicidad | No hay anuncios de terceros ni ID de publicidad. Las "publicidades" del Home son de tiendas dentro de Nivan. |

Si más adelante agregás Mercado Pago real, Firebase/Analytics, notificaciones push o ubicación, hay que actualizar el formulario.

## 4. ¿Se comparten datos con terceros? (*Data sharing*)

Respuesta recomendada: **No se comparten** datos con terceros.

Google no cuenta como "compartir" que un proveedor procese datos **por tu cuenta y solo para darte el servicio**.
Los proveedores que usa Nivan están en esa situación:

| Proveedor | Qué recibe | Tipo |
|---|---|---|
| Render | Todo lo que pasa por el servidor | Hosting |
| Neon | La base de datos (cuentas, pedidos, chats, fotos de verificación) | Hosting de datos |
| Cloudinary | Fotos y videos de publicaciones | Hosting de archivos |
| Brevo | Email de la cuenta y el texto del mensaje (recuperar contraseña, avisos) | Envío de emails |

Lo que **sí** ven otras personas (no es compartir con terceros, pero sí lo dice la política): el perfil y la tienda
público, y comprador/vendedor ven nombre, teléfono y dirección del pedido que comparten.

## 5. Tratamiento seguro (*Data handling*)

- Cifrado en tránsito: **Sí**.
- Eliminación: **Sí**, con las dos vías de arriba. Al eliminar se borran la cuenta, sesiones, publicaciones,
  reseñas, chats, dispositivos, fotos de verificación y las fotos/videos en Cloudinary. **Se conservan** los pedidos ya
  hechos en el historial de la otra persona. Si Play lo pregunta, declará esa excepción.
- Las fotos del documento y la selfie se borran al rechazar la verificación. Si se aprueba, se guardan en el servidor hasta que la administración las borre (también se borran al cancelar la identidad, con un baneo permanente o al eliminar la cuenta). **Ajustá la política de privacidad y el formulario de Play a esto.**

## 6. Antes de enviar el formulario, corregí esto

1. **`privacidad.html` tiene el contacto sin completar**: `[PEGAR-CORREO-DE-CONTACTO]`.
   Corré `node backend/generar-privacidad.js tu-correo@ejemplo.com` y volvé a desplegar. Sin eso Google rechaza la política.
2. **La política dice cosas que el servidor hoy no hace.** La cláusula 3 habla de conservar una huella (hash) del
   número de documento y de guardar de forma permanente las fotos de usuarios sancionados, para que no vuelvan a registrarse.
   En el código, al rechazar la verificación se borran las fotos (al aprobar se conservan hasta que la administración las borre), no se guarda ninguna huella del documento
   y el baneo se aplica por cuenta/email. La política tiene que describir lo que realmente pasa: o se implementa
   eso, o se ajusta el texto. (No toqué la política: es un texto legal y es decisión tuya.)
3. **La política dice que se recopilan "registros técnicos" y "tipo de dispositivo"**: está bien, pero acordate de
   que tiene que coincidir con lo declarado arriba (IP y navegador).
4. **La app carga código desde terceros mientras funciona**: `face-api` y sus modelos desde `cdn.jsdelivr.net`,
   y fuentes de Google Fonts e imágenes de Imgur. No son "datos que vos recopilás", pero esos sitios ven la IP
   de quien usa la app. Lo más prolijo es mencionarlo en la política y, a futuro, alojarlos en tu propio servidor.
5. Probá `https://TU-URL/.well-known/assetlinks.json` (con la huella SHA-256 de Play App Signing) y
   `https://TU-URL/eliminar-cuenta.html` desde el celular antes de enviar.
