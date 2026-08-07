// Memoria conversacional: historial por teléfono persistido en Supabase.
// Se guarda solo texto plano (user/assistant) — los bloques de tool use viven
// únicamente dentro del turno en agent/core.js.

const { db } = require('../database/supabase');
const config = require('../config');

// Ventana deslizante: últimos N mensajes (user+assistant). Suficiente contexto
// para una conversación de agendamiento sin inflar el prompt. Un rubro que
// necesite memoria más larga lo sube en `limites.historial_turnos`, sabiendo
// que cada turno extra se paga en tokens de entrada en CADA llamada.
const maxMensajes = () => config.valor('limites.historial_turnos');

/**
 * @param {string} telefono
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
async function cargarHistorial(telefono) {
  try {
    const sesion = await db.sesiones.get(telefono);
    return Array.isArray(sesion?.messages) ? sesion.messages : [];
  } catch (error) {
    console.warn('[Memory] No se pudo cargar historial:', error.message);
    return [];
  }
}

/**
 * Agrega el turno (mensaje del cliente + respuesta) al historial y persiste.
 */
async function persistirInteraccion(telefono, historialPrevio, mensajeUsuario, respuestaTexto) {
  const messages = [
    ...historialPrevio,
    { role: 'user', content: mensajeUsuario },
    { role: 'assistant', content: respuestaTexto },
  ].slice(-maxMensajes());
  try {
    await db.sesiones.upsert(telefono, messages);
  } catch (error) {
    // Perder un turno de historial no debe romper la respuesta al cliente
    console.warn('[Memory] No se pudo persistir historial:', error.message);
  }
}

module.exports = { cargarHistorial, persistirInteraccion };
