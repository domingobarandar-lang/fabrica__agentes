// Envío de mensajes vía Meta WhatsApp Cloud API.
// Sin WHATSAPP_TOKEN funciona en modo demo: imprime por consola.

const axios = require('axios');
const { dividirMensaje } = require('../lib/texto');

const API_VERSION = 'v19.0';

const modoDemo = () => !process.env.WHATSAPP_TOKEN;

function clienteWhatsApp() {
  return axios.create({
    baseURL: `https://graph.facebook.com/${API_VERSION}/${process.env.WHATSAPP_PHONE_ID}/messages`,
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    timeout: 15_000,
  });
}

/**
 * Envía un mensaje de texto al cliente. Divide en partes si supera el tope.
 *
 * @param {string} telefono - E.164 sin "+" (ej: 56912345678)
 * @param {string|null} texto - `null` = NO ENVIAR NADA (handoff humano activo,
 *   o turno fusionado por el buffer).
 */
async function sendMessage(telefono, texto) {
  // GUARDA DE SILENCIO — primera línea, antes incluso del modo demo.
  //
  // Sin esto, `null` no producía silencio: producía el MENSAJE DE ERROR.
  // dividirMensaje devolvía [''], se posteaba un cuerpo vacío, Meta respondía
  // 400, y el .catch del webhook le mandaba al cliente "estoy teniendo
  // problemas técnicos" — justo cuando había pedido hablar con una persona.
  // Es la lección más cara de este diseño; no la borres.
  if (texto == null) return;

  if (modoDemo()) {
    console.log(`\n[Demo → ${telefono}]\n${texto}\n`);
    return;
  }
  const partes = dividirMensaje(texto);
  for (const parte of partes) {
    await clienteWhatsApp().post('', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: telefono,
      type: 'text',
      text: { body: parte },
    });
  }
}

/** Marca un mensaje recibido como leído (doble tilde azul). No crítico. */
async function markAsRead(messageId) {
  if (modoDemo() || !messageId) return;
  try {
    await clienteWhatsApp().post('', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
  } catch {
    // best-effort: no interrumpir el flujo si falla
  }
}

// dividirMensaje vive en lib/texto.js: lo comparten este archivo y
// telegram/enviar.js. Tenerlo dos veces fue el origen de que el mismo bug
// existiera en dos canales a la vez.

module.exports = { sendMessage, markAsRead };
