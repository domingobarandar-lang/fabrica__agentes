// Agente de citas — servidor Express con webhook de WhatsApp Cloud API.
// Misma estructura que el contestador de Gesta, versión demo/genérica.

require('dotenv').config();
const express = require('express');

const webhookRouter = require('./whatsapp/webhook');
const { db, usandoMemoria } = require('./database/supabase');

const app = express();

// Captura el rawBody antes del parseo JSON: necesario para validar la firma
// x-hub-signature-256 de Meta en whatsapp/webhook.js.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Ruta de salud para el hosting / uptime checks
app.get('/', (_req, res) => {
  res.json({ status: 'ok', servicio: 'Agente de citas (demo)', db: usandoMemoria ? 'memoria' : 'supabase' });
});

app.use('/webhook', webhookRouter);

const PORT = process.env.PORT || 3300;
app.listen(PORT, () => {
  console.log(`[Servidor] Agente de citas escuchando en puerto ${PORT}`);
  if (usandoMemoria) {
    console.warn('[DB] SUPABASE_URL/SUPABASE_KEY no configuradas — usando base EN MEMORIA con datos demo');
  } else {
    // Test de conexión al arrancar: avisa temprano si falta ejecutar schema.sql
    db.testConexion().then((ok) => {
      if (ok) console.log('[DB] Conexión a Supabase OK');
      else console.warn('[DB] Supabase no responde o faltan tablas — ejecuta database/schema.sql en el SQL Editor');
    });
  }
  if (!process.env.WHATSAPP_TOKEN) {
    console.warn('[WhatsApp] WHATSAPP_TOKEN no configurado — modo demo: los mensajes salientes se imprimen por consola');
    console.warn('[WhatsApp] Para probar sin Meta: npm run chat');
  }
});
