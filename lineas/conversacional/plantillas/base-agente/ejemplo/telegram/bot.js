// Bot de Telegram de ejemplo — pieza de la SEMILLA, no del núcleo.
// Puente Telegram ↔ agent/core.js.
//
// EL ENVÍO NO VIVE ACÁ. Se delega en el núcleo: telegram/enviar.js. La razón
// está documentada en DECISIONES.md y es la lección más cara de este diseño:
// para NO responder no basta con que processMessage devuelva null — el envío
// convierte un texto vacío en un POST fallido y el .catch termina mandándole
// al cliente el mensaje de error genérico, justo cuando pidió hablar con una
// persona. El guarda tiene que estar en el envío, y el envío tiene que estar
// en código sincronizado, no en una copia por cliente.
//
// Modos, según TELEGRAM_TOKEN en .env:
//  - Con token : bot real en POLLING (no necesita dominio público).
//  - Sin token : MOCK. No toca Telegram ni la API del LLM.
// Forzar mock con token presente: `npm run telegram:mock`.

if (!globalThis.WebSocket) {
  globalThis.WebSocket = require('ws');
}

require('dotenv').config();

// El nombre de la variable se declara en agente.config.json (canales.telegram
// .token_env) para no obligar a renombrar variables en agentes ya en uso.
const NOMBRE_VAR_TOKEN = process.env.TELEGRAM_TOKEN_VAR || 'TELEGRAM_TOKEN';
const TOKEN = process.env[NOMBRE_VAR_TOKEN];

const MODO_MOCK =
  process.env.MOCK === 'true' ||
  process.argv.includes('--mock') ||
  !TOKEN;

const SALUDO =
  '¡Hola! Soy el asistente de ejemplo de la Fábrica 😊 Puedo contarte el horario de atención. ¿Qué necesitas?';

const idConversacion = (chatId) => `tg${chatId}`;

async function main() {
  const { processMessage, MENSAJE_ERROR, _setClienteParaTests } = require('../agent/core');
  const { enviarTelegram } = require('./enviar');

  if (MODO_MOCK) {
    console.log('[Telegram] MODO MOCK — sin token y sin API. Cero efectos externos.');
    console.log(`[Telegram] Para conectar de verdad: pon ${NOMBRE_VAR_TOKEN} en .env y corre \`npm run telegram\`.`);
    _setClienteParaTests({
      messages: {
        async create() {
          return {
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: '(mock) Atendemos de lunes a viernes. ¿Te sirve?' }],
          };
        },
      },
    });
    console.log(`\nBot: ${SALUDO}`);
    const respuesta = await processMessage(idConversacion('demo'), 'hola');
    // Mismo guarda que el camino real: en la demo que ve el dueño antes de
    // firmar, un "Bot: null" en pantalla no es inocuo.
    if (respuesta != null) console.log(`Bot: ${respuesta}\n`);
    return;
  }

  const TelegramBot = require('node-telegram-bot-api');
  const bot = new TelegramBot(TOKEN, { polling: true });
  console.log('[Telegram] Bot real en modo polling.');

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const textoEntrante = msg.text;
    if (!textoEntrante) return;

    if (textoEntrante === '/start') {
      await enviarTelegram(bot, chatId, SALUDO);
      return;
    }

    try {
      // `respuesta` puede ser null: modo humano activo, o turno fusionado por
      // el buffer. No hay if acá — el guarda vive dentro de enviarTelegram,
      // que es código del núcleo y no se puede olvidar en un cliente.
      const respuesta = await processMessage(idConversacion(chatId), textoEntrante, {
        onProgreso: (puente) => enviarTelegram(bot, chatId, puente).catch(() => {}),
      });
      await enviarTelegram(bot, chatId, respuesta);
    } catch (err) {
      console.error('[Telegram] Error procesando mensaje:', err.message);
      await enviarTelegram(bot, chatId, MENSAJE_ERROR).catch(() => {});
    }
  });
}

main().catch((err) => {
  console.error('[Telegram] No pude arrancar:', err.message);
  process.exit(1);
});
