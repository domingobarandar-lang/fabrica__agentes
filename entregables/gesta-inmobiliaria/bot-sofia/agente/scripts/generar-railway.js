// Genera railway.toml desde agente.config.json.  Uso: npm run railway
//
// POR QUÉ railway.toml NO VIAJA EN EL NÚCLEO: su `startCommand` decide POR QUÉ
// CANAL atiende el agente (`node telegram/bot.js` vs `node index.js`), y eso es
// una decisión por cliente. Sincronizarlo pisaría a un cliente que despliega por
// WhatsApp con el arranque de uno que despliega por Telegram — el servicio
// levantaría el proceso equivocado y el bot no contestaría a nadie, sin ningún
// error visible. Por eso se GENERA desde los canales declarados y está en
// `nunca_tocar` del manifiesto.

const fs   = require('fs');
const path = require('path');

const RAIZ   = path.resolve(__dirname, '..');
const config = require(path.join(RAIZ, 'config'));

/**
 * Qué proceso arranca Railway, según los canales activos.
 *
 * WhatsApp manda sobre Telegram cuando los dos están activos: WhatsApp necesita
 * un servidor HTTP escuchando el webhook de Meta (index.js), y ese servidor es
 * el que Railway expone. Un agente que quiera los dos canales a la vez arranca
 * el poller de Telegram DESDE index.js, no con dos servicios.
 *
 * @param {object} r contrato resuelto (config.resuelto())
 * @returns {string|null} comando, o null si no hay canal desplegable
 */
function comandoDeArranque(r) {
  if (r['canales.whatsapp.activo']) return 'node index.js';
  if (r['canales.telegram.activo']) return 'node telegram/bot.js';
  return null; // solo terminal: no se despliega, se corre a mano
}

function contenido(comando) {
  return `# GENERADO por scripts/generar-railway.js desde agente.config.json.
# No lo edites a mano: cambia los canales en la config y corre \`npm run railway\`.
# (Está en "nunca_tocar" del manifiesto, así que sincronizar el núcleo no lo pisa.)

[build]
builder = "nixpacks"

[deploy]
startCommand = "${comando}"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
`;
}

function generar() {
  const r = config.resuelto();
  const comando = comandoDeArranque(r);

  if (!comando) {
    console.error(
      '❌ Ningún canal desplegable activo en agente.config.json ' +
      '(terminal no se despliega: es para probar por consola).'
    );
    console.error('   Activa "canales.telegram" o "canales.whatsapp" y vuelve a correr esto.');
    return 1;
  }

  const destino = path.join(RAIZ, 'railway.toml');
  fs.writeFileSync(destino, contenido(comando), 'utf8');
  console.log(`✅ railway.toml generado — startCommand = "${comando}"`);
  return 0;
}

module.exports = { comandoDeArranque, contenido };

// Solo genera cuando se lo invoca directo; el validador lo importa para
// comparar sin escribir nada.
if (require.main === module) process.exitCode = generar();
