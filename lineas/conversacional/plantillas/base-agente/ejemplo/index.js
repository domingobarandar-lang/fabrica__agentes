// Servidor de ejemplo — pieza de la SEMILLA, no del núcleo.
// Levanta Express con el webhook de WhatsApp del núcleo montado. Un proyecto
// recién creado con nuevo-proyecto.ps1 arranca con esto y responde.
//
// Al personalizar: cambiar el nombre del servicio y el puerto. La captura de
// rawBody NO se toca: whatsapp/webhook.js la necesita para validar la firma
// x-hub-signature-256 de Meta.

require('dotenv').config();
const express = require('express');

const webhookRouter = require('./whatsapp/webhook');

const app = express();

// rawBody antes del parseo JSON: sin esto la validación de firma falla siempre.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

app.get('/', (_req, res) => {
  res.json({ status: 'ok', servicio: 'Agente de ejemplo (semilla de la Fábrica)', db: 'memoria' });
});

app.use('/webhook', webhookRouter);

const PORT = process.env.PORT || 3300;
app.listen(PORT, () => {
  console.log(`[Servidor] Agente de ejemplo escuchando en puerto ${PORT}`);
  console.log('[DB] Base EN MEMORIA: todo se pierde al reiniciar. Es la semilla, no producción.');
  if (!process.env.WHATSAPP_TOKEN) {
    console.warn('[WhatsApp] WHATSAPP_TOKEN no configurado — los mensajes salientes se imprimen por consola.');
  }
});
