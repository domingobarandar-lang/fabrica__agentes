// Envío de mensajes vía Meta WhatsApp Cloud API.
// Sin WHATSAPP_TOKEN funciona en modo demo: imprime por consola.

const axios = require('axios');
const { dividirMensaje } = require('../lib/texto');
const botones = require('../agent/botones');
const config = require('../config');

const API_VERSION = 'v19.0';

// Indirección a propósito: agente.config.json declara el NOMBRE de la variable
// (`canales.whatsapp.token_env`) y el `.env` guarda el valor. Así un agente que
// ya corre con WHATSAPP_TOKEN_CITAS no tiene que renombrar nada para adoptar la
// config, y el secreto nunca entra a un archivo versionado.
const credenciales = () => ({
  token:   process.env[config.valor('canales.whatsapp.token_env')] || '',
  phoneId: process.env[config.valor('canales.whatsapp.phone_id_env')] || '',
});

const modoDemo = () => !credenciales().token;

function clienteWhatsApp() {
  const { token, phoneId } = credenciales();
  return axios.create({
    baseURL: `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 15_000,
  });
}

/**
 * Envía un mensaje de texto al cliente. Divide en partes si supera el tope.
 *
 * Si hay botones pendientes para este canal (los propuso una tool durante el
 * turno), salen pegados al ÚLTIMO trozo: es donde la persona los va a buscar,
 * después de leer.
 *
 * @param {string} telefono - E.164 sin "+" (ej: 56912345678)
 * @param {string|null} texto - `null` = NO ENVIAR NADA (handoff humano activo,
 *   o turno fusionado por el buffer).
 * @param {{ botones?: Array }} [opciones] - botones explícitos. Se usan tal
 *   cual y NO consumen los pendientes del canal: es el caso de avisarle a otro
 *   número (la ejecutiva) en medio del turno de un cliente.
 */
async function sendMessage(telefono, texto, opciones = {}) {
  // GUARDA DE SILENCIO — primera línea, antes incluso del modo demo.
  //
  // Sin esto, `null` no producía silencio: producía el MENSAJE DE ERROR.
  // dividirMensaje devolvía [''], se posteaba un cuerpo vacío, Meta respondía
  // 400, y el .catch del webhook le mandaba al cliente "estoy teniendo
  // problemas técnicos" — justo cuando había pedido hablar con una persona.
  // Es la lección más cara de este diseño; no la borres.
  if (texto == null) {
    // Un turno que termina en silencio no manda NADA, botones incluidos. Sin
    // esto, un bot derivado a una persona seguiría ofreciendo "agendar visita"
    // con una ejecutiva ya escribiendo del otro lado.
    botones.limpiar(telefono);
    return;
  }

  const propios = opciones.botones !== undefined
    ? botones.normalizar(opciones.botones)
    : botones.tomar(telefono);

  if (modoDemo()) {
    const pie = propios.length
      ? '\n[botones] ' + propios.map((b) => `(${b.titulo})`).join(' ')
      : '';
    console.log(`\n[Demo → ${telefono}]\n${texto}${pie}\n`);
    return;
  }

  if (!propios.length) {
    for (const parte of dividirMensaje(texto)) {
      await clienteWhatsApp().post('', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: telefono,
        type: 'text',
        text: { body: parte },
      });
    }
    return;
  }

  // Con botones el cuerpo tiene un tope más chico (1024, no 4096): lo que no
  // cabe se manda antes como texto normal.
  const { previas, cuerpo } = botones.partirParaInteractivo(texto);
  for (const parte of previas) {
    await clienteWhatsApp().post('', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: telefono,
      type: 'text',
      text: { body: parte },
    });
  }
  await clienteWhatsApp().post('', botones.payloadWhatsApp(telefono, cuerpo, propios));
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
