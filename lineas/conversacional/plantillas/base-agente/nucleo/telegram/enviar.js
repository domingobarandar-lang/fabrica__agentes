// Envío por Telegram. Vive en el NÚCLEO, no en el bot.js de cada cliente.
//
// POR QUÉ ESTÁ ACÁ: esta función era byte-idéntica en los dos agentes que
// existían, y con ella viajaba su propia copia de dividirMensaje. Pero la razón
// de fondo es otra: el guarda del silencio tiene que estar en el ENVÍO, y el
// envío tiene que estar en código sincronizado. Si vive en una copia por
// cliente, basta que un cliente se quede atrás para que un handoff termine
// mandándole al usuario "estoy teniendo problemas técnicos".

const { dividirMensaje } = require('../lib/texto');

/**
 * Envía un texto por Telegram, partido si excede el tope.
 *
 * @param {object} bot    instancia de node-telegram-bot-api
 * @param {number|string} chatId
 * @param {string|null} texto  `null` = no responder (handoff humano activo)
 */
async function enviarTelegram(bot, chatId, texto) {
  // GUARDA DE SILENCIO — primera línea, sin excepciones.
  if (texto == null) return;

  for (const parte of dividirMensaje(texto)) {
    try {
      await bot.sendMessage(chatId, parte, { parse_mode: 'Markdown' });
    } catch {
      // Markdown mal balanceado: reintentar en plano antes de darlo por perdido
      await bot.sendMessage(chatId, parte);
    }
  }
}

module.exports = { enviarTelegram };
