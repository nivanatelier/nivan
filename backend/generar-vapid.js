// Genera las claves del push. Corrélo UNA vez:  node generar-vapid.js
// Después pegá las dos en Render → Environment (VAPID_PUBLIC y VAPID_PRIVATE). La privada es secreta: no la compartas.
const push = require('./push');
const k = push.generarClaves();
console.log('\nVAPID_PUBLIC  = ' + k.publica);
console.log('VAPID_PRIVATE = ' + k.privada + '\n');
console.log('Si las cambiás más adelante, las personas tienen que volver a activar los avisos.\n');
