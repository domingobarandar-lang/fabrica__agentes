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
const config = require('./config');
const { modo: modoDb } = require('./database/supabase');

const app = express();

// rawBody antes del parseo JSON: sin esto la validación de firma falla siempre.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Estado, útil para el health check de Railway y para saber de un vistazo con
// qué configuración quedó corriendo el servicio. Sin secretos: el nombre de la
// variable del token sí, su valor jamás.
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    agente: config.valor('cliente.nombre'),
    cliente: config.valor('cliente.id'),
    db: modoDb,
    canales: {
      whatsapp: config.valor('canales.whatsapp.activo'),
      telegram: config.valor('canales.telegram.activo'),
    },
    handoff: config.valor('handoff.activo'),
  });
});

app.use('/webhook', webhookRouter);

const PORT = process.env.PORT || 3300;
app.listen(PORT, () => {
  console.log(`[Servidor] ${config.valor('cliente.nombre')} escuchando en puerto ${PORT}`);
  if (modoDb === 'memoria') {
    console.log('[DB] Base EN MEMORIA: todo se pierde al reiniciar. Sirve para demo, no para producción.');
  }
  const varToken = config.valor('canales.whatsapp.token_env');
  if (!process.env[varToken]) {
    console.warn(`[WhatsApp] ${varToken} no configurado — los mensajes salientes se imprimen por consola.`);
  }
});
