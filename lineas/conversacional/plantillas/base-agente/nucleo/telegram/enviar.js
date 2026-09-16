// Envío por Telegram. Vive en el NÚCLEO, no en el bot.js de cada cliente.
//
// POR QUÉ ESTÁ ACÁ: esta función era byte-idéntica en los dos agentes que
// existían, y con ella viajaba su propia copia de dividirMensaje. Pero la razón
// de fondo es otra: el guarda del silencio tiene que estar en el ENVÍO, y el
// envío tiene que estar en código sincronizado. Si vive en una copia por
// cliente, basta que un cliente se quede atrás para que un handoff termine
// mandándole al usuario "estoy teniendo problemas técnicos".

const { dividirMensaje } = require('../lib/texto');
const botones = require('../agent/botones');

/**
 * Envía un texto por Telegram, partido si excede el tope.
 *
 * @param {object} bot    instancia de node-telegram-bot-api
 * @param {number|string} chatId
 * @param {string|null} texto  `null` = no responder (handoff humano activo)
 * @param {{ canalId?: string, botones?: Array }} [opciones]
 */
async function enviarTelegram(bot, chatId, texto, opciones = {}) {
  // GUARDA DE SILENCIO — primera línea, sin excepciones.
  if (texto == null) {
    botones.limpiar(opciones.canalId ?? `tg${chatId}`);
    return;
  }

  // Los botones se declaran igual que en WhatsApp y acá salen como teclado en
  // línea. El canal cambia; la tool del cliente no se entera.
  const lista = opciones.botones !== undefined
    ? botones.normalizar(opciones.botones)
    : botones.tomar(opciones.canalId ?? `tg${chatId}`);

  const partes = dividirMensaje(texto);
  for (let i = 0; i < partes.length; i++) {
    // El teclado viaja con el ÚLTIMO trozo: es donde la persona lo va a buscar.
    const extra = (i === partes.length - 1 && lista.length)
      ? { reply_markup: botones.tecladoTelegram(lista) }
      : {};
    try {
      await bot.sendMessage(chatId, partes[i], { parse_mode: 'Markdown', ...extra });
    } catch {
      // Markdown mal balanceado: reintentar en plano antes de darlo por perdido
      await bot.sendMessage(chatId, partes[i], extra);
    }
  }
}

module.exports = { enviarTelegram };
