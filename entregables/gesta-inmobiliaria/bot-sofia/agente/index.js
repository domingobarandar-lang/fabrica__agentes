// Servidor de Sofía — el agente de Gesta Inmobiliaria.
//
// La captura de rawBody NO se toca: whatsapp/webhook.js la necesita para
// validar la firma x-hub-signature-256 de Meta.

require('dotenv').config();
const express = require('express');

const webhookRouter = require('./whatsapp/webhook');
const { guardaCorredora, numeroCorredora } = require('./whatsapp/corredora');
const config = require('./config');
const { modo: modoDb, db } = require('./database/supabase');
const planilla = require('./database/planilla');

const app = express();

app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Estado, para el health check de Railway y para ver de un vistazo con qué
// configuración quedó corriendo. Sin secretos: el nombre de la variable del
// token sí, su valor jamás.
app.get('/', async (_req, res) => {
  let propiedades = null;
  try { propiedades = (await db.propiedades.activas()).length; } catch { /* no crítico */ }
  res.json({
    status: 'ok',
    agente: config.valor('identidad.nombre_agente'),
    cliente: config.valor('cliente.id'),
    db: modoDb,
    planilla: { ...planilla.estado(), en_vivo: Boolean(planilla.urlPlanilla()), propiedades_activas: propiedades },
    ejecutiva_configurada: Boolean(numeroCorredora()),
    handoff: config.valor('handoff.activo'),
  });
});

// El guarda de la corredora va PRIMERO: su "hola" de la mañana abre la ventana
// de 24 horas y no es un cliente que quiera arrendar. Todo lo demás sigue de
// largo al webhook del núcleo.
app.use('/webhook', guardaCorredora, webhookRouter);

const PORT = process.env.PORT || 3300;
app.listen(PORT, async () => {
  console.log(`[Servidor] Sofía — ${config.valor('cliente.nombre')} escuchando en puerto ${PORT}`);

  if (modoDb === 'memoria') {
    console.log('[DB] Base EN MEMORIA: las visitas y captaciones se pierden al reiniciar. Sirve para demo, no para producción.');
  }
  if (!planilla.urlPlanilla()) {
    console.warn('[Planilla] PLANILLA_URL no configurada: Sofía atiende con la copia local datos/propiedades.csv.');
  }
  if (!numeroCorredora()) {
    console.warn('[Aviso] handoff.inbox vacío en agente.config.json: los informes de la ejecutiva NO se envían, solo quedan en el log.');
  }
  const varToken = config.valor('canales.whatsapp.token_env');
  if (!process.env[varToken]) {
    console.warn(`[WhatsApp] ${varToken} no configurado — los mensajes salientes se imprimen por consola.`);
  }

  try {
    const activas = await db.propiedades.activas();
    console.log(`[Planilla] ${activas.length} propiedades publicadas (${planilla.estado().origen}).`);
  } catch (error) {
    console.error('[Planilla] No pude leer las propiedades al arrancar:', error.message);
  }
});
