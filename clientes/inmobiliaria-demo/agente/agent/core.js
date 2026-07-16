// Loop principal del agente conversacional con tool use.
// Modelo: Claude (claude-haiku-4-5-20251001 por defecto) vía la API de
// Anthropic, usando el cliente de agent/llm.js — el formato interno ya es
// el nativo de Anthropic Messages (tool_use / tool_result).

const { crearClienteAnthropic } = require('./llm');
const { buildSystemPrompt } = require('./prompts');
const { TOOL_DEFINITIONS, ejecutarHerramienta } = require('./tools');
const { cargarHistorial, persistirInteraccion } = require('./memory');

// Cliente perezoso: sin ANTHROPIC_API_KEY el constructor lanza error, y este
// módulo también se carga desde los simuladores locales (chat / tests /
// telegram mock) que inyectan un cliente doble de pruebas.
let cliente = null;
let clienteOverride = null; // inyectado por tests y modo mock

function _setClienteParaTests(c) { clienteOverride = c; }

function obtenerCliente() {
  if (clienteOverride) return clienteOverride;
  if (!cliente) cliente = crearClienteAnthropic();
  return cliente;
}

// Configurable por entorno: si hay que cambiar de modelo, se cambia la
// variable sin tocar código. Nombres de modelo según la API de Anthropic.
const MODELO          = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TOKENS      = 600;  // respuestas cortas: es mensajería, no un ensayo
const MAX_RONDAS_TOOL = 6;    // límite de rondas de tool use (evita bucles)

const REINTENTOS_API       = 2;
const ESPERAS_REINTENTO_MS = [2000, 4000];

const FALLBACK_VACIO = 'Perfecto, queda anotado. ¿Te ayudo con algo más? 😊';
const MENSAJE_ERROR  =
  'Estoy teniendo problemas técnicos momentáneos. Escríbeme de nuevo en unos segundos, por favor. 🔄';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Llama al modelo con reintentos ante errores transitorios (red, 429, 5xx).
 */
async function crearMensajeClaude(params) {
  const c = obtenerCliente();
  for (let intento = 0; intento <= REINTENTOS_API; intento++) {
    try {
      return await c.messages.create(params);
    } catch (error) {
      const status = error?.status;
      const esTransitorio = !status || status >= 500 || status === 429 ||
        /econnreset|etimedout|socket hang up|terminated|network|aborted|premature/i
          .test(error?.message || '');
      if (!esTransitorio || intento === REINTENTOS_API) throw error;
      const espera = ESPERAS_REINTENTO_MS[intento] ?? 4000;
      console.warn(`[Core] Error de API (intento ${intento + 1}): ${error.message} — reintento en ${espera}ms`);
      await esperar(espera);
    }
  }
}

// Cola serial por teléfono: si un cliente manda dos mensajes seguidos, se
// procesan en orden (dos en paralelo se pisarían el historial). Clientes
// distintos sí corren en paralelo.
const colasPorTelefono = new Map();

/**
 * Punto de entrada público: encola el mensaje en la cola de su teléfono.
 * @param {string} telefono - E.164 sin "+" (o id de chat de Telegram con prefijo tg)
 * @param {string} mensaje
 * @returns {Promise<string>} Respuesta para enviar al cliente
 */
function processMessage(telefono, mensaje) {
  const anterior = colasPorTelefono.get(telefono) ?? Promise.resolve();
  const actual = anterior
    .catch(() => {})
    .then(() => procesarMensajeInterno(telefono, mensaje));
  colasPorTelefono.set(telefono, actual);
  const limpiar = () => {
    if (colasPorTelefono.get(telefono) === actual) colasPorTelefono.delete(telefono);
  };
  actual.then(limpiar, limpiar);
  return actual;
}

/**
 * Loop agéntico completo: historial → Claude → tools → Claude → respuesta.
 */
async function procesarMensajeInterno(telefono, mensaje) {
  const historial = await cargarHistorial(telefono);
  const mensajes  = [...historial, { role: 'user', content: mensaje }];

  const paramsBase = {
    model: MODELO,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(),
    tools: TOOL_DEFINITIONS,
  };

  let respuesta = await crearMensajeClaude({ ...paramsBase, messages: mensajes });
  let rondas = 0;

  while (respuesta.stop_reason === 'tool_use' && rondas < MAX_RONDAS_TOOL) {
    // El contenido del assistant se pasa de vuelta TAL CUAL
    mensajes.push({ role: 'assistant', content: respuesta.content });

    const resultados = [];
    for (const bloque of respuesta.content) {
      if (bloque.type !== 'tool_use') continue;
      let resultado;
      try {
        resultado = await ejecutarHerramienta(bloque.name, bloque.input, telefono);
      } catch (error) {
        console.error(`[Tools] ${bloque.name} falló:`, error.message);
        resultado = { error: `La herramienta falló: ${error.message}` };
      }
      resultados.push({
        type: 'tool_result',
        tool_use_id: bloque.id,
        content: JSON.stringify(resultado),
      });
    }
    // Todos los tool_result van en UN solo mensaje user
    mensajes.push({ role: 'user', content: resultados });

    respuesta = await crearMensajeClaude({ ...paramsBase, messages: mensajes });
    rondas++;
  }

  // Rechazo de seguridad / filtro de contenido: content puede venir vacío y
  // leerlo directo rompería.
  if (respuesta.stop_reason === 'refusal') {
    return 'Sobre eso no te puedo ayudar. Puedo mostrarte el catálogo o agendarte una hora. 😊';
  }

  const texto = respuesta.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim() || FALLBACK_VACIO;

  // El historial persistido guarda solo texto plano (user/assistant); los
  // bloques de tool use viven solo dentro del turno.
  await persistirInteraccion(telefono, historial, mensaje, texto);
  return texto;
}

module.exports = { processMessage, MENSAJE_ERROR, _setClienteParaTests };
