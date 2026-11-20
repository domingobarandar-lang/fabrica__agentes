// Webhook de Meta WhatsApp Cloud API: verificación (GET) y mensajes (POST).

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();

const { processMessage, MENSAJE_ERROR } = require('../agent/core');
const { sendMessage, markAsRead } = require('./sender');

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
  // Sin WHATSAPP_VERIFY_TOKEN configurado no se verifica nada: antes, una
  // petición sin hub.verify_token pasaba porque undefined === undefined.
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (modo === 'subscribe' && esperado && token === esperado) {
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

  processMessage(telefono, texto)
    .then((respuesta) => sendMessage(telefono, respuesta))
    .catch((err) => {
      console.error('[Webhook] Error procesando mensaje:', err.message);
      sendMessage(telefono, MENSAJE_ERROR).catch(() => {});
    });
});

/**
 * Extrae el primer mensaje de texto del payload de Meta.
 * @returns {{ telefono: string, texto: string, messageId: string } | null}
 */
function extraerMensaje(body) {
  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || msg.type !== 'text') return null;
  return {
    telefono:  String(msg.from || ''),
    texto:     msg.text?.body || '',
    messageId: msg.id,
  };
}

module.exports = router;
