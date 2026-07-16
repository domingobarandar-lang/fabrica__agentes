// Envío de mensajes vía Meta WhatsApp Cloud API.
// Sin WHATSAPP_TOKEN funciona en modo demo: imprime por consola.

const axios = require('axios');

const API_VERSION = 'v19.0';
const MAX_CHARS   = 4096; // límite de WhatsApp por mensaje de texto

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
 * Envía un mensaje de texto al cliente. Divide en partes si supera MAX_CHARS.
 * @param {string} telefono - E.164 sin "+" (ej: 56912345678)
 * @param {string} texto
 */
async function sendMessage(telefono, texto) {
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

function dividirMensaje(texto) {
  if (!texto) return [''];
  if (texto.length <= MAX_CHARS) return [texto];
  const partes = [];
  let resto = texto;
  while (resto.length > MAX_CHARS) {
    // Cortar en el último salto de línea dentro del límite si existe
    let corte = resto.lastIndexOf('\n', MAX_CHARS);
    if (corte < MAX_CHARS * 0.5) corte = MAX_CHARS;
    partes.push(resto.slice(0, corte));
    resto = resto.slice(corte);
  }
  partes.push(resto);
  return partes;
}

module.exports = { sendMessage, markAsRead };
