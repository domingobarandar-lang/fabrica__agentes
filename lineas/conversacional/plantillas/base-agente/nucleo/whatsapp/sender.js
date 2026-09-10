// Envío de mensajes vía Meta WhatsApp Cloud API.
// Sin WHATSAPP_TOKEN funciona en modo demo: imprime por consola.

const axios = require('axios');
const { prepararEnvio } = require('../agent/estilo');
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
    // Se imprime lo que SALDRÍA, no lo que devolvió el agente: si la demo
    // muestra un muro de texto que en producción habrían sido tres mensajes,
    // la demo miente sobre el producto.
    for (const parte of prepararEnvio(texto)) console.log(`\n[Demo → ${telefono}]\n${parte}\n`);
    return;
  }
  const partes = prepararEnvio(texto);
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

// prepararEnvio vive en agent/estilo.js (y usa dividirMensaje de lib/texto.js):
// lo comparten este archivo y telegram/enviar.js. Tenerlo dos veces fue el
// origen de que el mismo bug existiera en dos canales a la vez — y es también
// por lo que el contrato de forma se hace cumplir acá y no en core.js: acá pasa
// todo lo que ve una persona, y NO pasa el arnés de evals, que tiene que seguir
// viendo el texto crudo para poder ponerse rojo.

module.exports = { sendMessage, markAsRead };
