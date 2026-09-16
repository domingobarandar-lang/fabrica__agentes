// Webhook de Meta WhatsApp Cloud API: verificación (GET) y mensajes (POST).

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

const { processMessage, MENSAJE_ERROR } = require('../agent/core');
const { sendMessage, markAsRead } = require('./sender');
const botones = require('../agent/botones');

const RE_TELEFONO = /^\d{7,15}$/;
const MAX_MSG_LEN = 4096;

function enProduccion() {
  return process.env.NODE_ENV === 'production'
    || !!process.env.RAILWAY_ENVIRONMENT
    || !!process.env.RAILWAY_PROJECT_ID;
}

/**
 * Valida x-hub-signature-256 contra HMAC-SHA256(rawBody, WHATSAPP_APP_SECRET).
 * Sin APP_SECRET: fail-closed en producción, permisivo en desarrollo.
 */
function verificarFirma(req) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return !enProduccion();

  const firma = req.headers['x-hub-signature-256'];
  if (!firma) return false;
  const esperada = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody || '')
    .digest('hex');
  if (firma.length !== esperada.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
  } catch {
    return false;
  }
}

// GET /webhook — verificación inicial del webhook en Meta for Developers
router.get('/', (req, res) => {
  const modo  = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const reto  = req.query['hub.challenge'];
  if (modo === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(reto);
  }
  res.sendStatus(403);
});

// POST /webhook — mensajes entrantes
router.post('/', (req, res) => {
  if (!verificarFirma(req)) {
    console.warn('[Security] Firma de webhook inválida — rechazado');
    return res.sendStatus(403);
  }

  // Responder 200 de inmediato: Meta reintenta si no respondemos en segundos.
  res.sendStatus(200);

  const mensaje = extraerMensaje(req.body);
  if (!mensaje) return;

  const { telefono, texto, messageId } = mensaje;
  if (!RE_TELEFONO.test(telefono) || !texto || texto.length > MAX_MSG_LEN) {
    console.warn(`[Security] Mensaje descartado (teléfono o texto inválido): ${telefono}`);
    return;
  }

  markAsRead(messageId).catch(() => {});

  // `respuesta` puede ser null (handoff humano activo, o turno fusionado por el
  // buffer). No hay if acá a propósito: el guarda vive dentro de sendMessage,
  // que es código del núcleo. Un guarda en cada canal es un guarda que alguien
  // olvida.
  processMessage(telefono, texto, {
    onProgreso: (puente) => sendMessage(telefono, puente).catch(() => {}),
  })
    .then((respuesta) => sendMessage(telefono, respuesta))
    .catch((err) => {
      console.error('[Webhook] Error procesando mensaje:', err.message);
      sendMessage(telefono, MENSAJE_ERROR).catch(() => {});
    });
});

/**
 * Extrae el primer mensaje del payload de Meta y lo deja como TEXTO.
 *
 * Un botón apretado no llega como texto: llega como `interactive` con el id y
 * el título que mandamos nosotros. Se traduce acá, en el borde del canal, para
 * que de la cola hacia adentro (buffer, core, memoria, evals) exista una sola
 * forma de mensaje — la de siempre, un string. Cuando esto no estaba, apretar
 * un botón era un mensaje que el webhook descartaba en silencio: la persona veía
 * su respuesta en el chat y el bot no contestaba nunca.
 *
 * @returns {{ telefono: string, texto: string, messageId: string } | null}
 */
function extraerMensaje(body) {
  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return null;

  const base = { telefono: String(msg.from || ''), messageId: msg.id };

  if (msg.type === 'text') {
    return { ...base, texto: msg.text?.body || '' };
  }

  // Botón de un mensaje interactivo (el caso normal) o de una plantilla.
  if (msg.type === 'interactive') {
    const r = msg.interactive?.button_reply || msg.interactive?.list_reply;
    if (!r) return null;
    return { ...base, texto: botones.textoDeRespuesta({ id: r.id, titulo: r.title }) };
  }
  if (msg.type === 'button') {
    return { ...base, texto: botones.textoDeRespuesta({ id: msg.button?.payload, titulo: msg.button?.text }) };
  }

  return null;
}

// Se expone solo para la prueba de humo: traducir un botón apretado a texto es
// la clase de función que se rompe sin que ninguna prueba funcional lo note
// (el bot simplemente deja de contestar a quien aprieta un botón).
router._extraerMensaje = extraerMensaje;
// Y la validación de firma, para que un guarda propio del cliente —el que
// atiende al número del negocio antes que al del núcleo— pueda reusarla en vez
// de escribir su propio HMAC. Una segunda implementación de esto es una
// segunda oportunidad de equivocarse en el único punto que separa un webhook
// abierto de uno cerrado.
router._verificarFirma = verificarFirma;

module.exports = router;
