// Loop principal del agente conversacional con tool use.
//
// El formato interno es el nativo de Anthropic Messages (tool_use /
// tool_result); agent/llm.js traduce a cualquier proveedor OpenAI-compatible.
// NUNCA se asume Anthropic por defecto: el proveedor sale de LLM_PROVIDER.
//
// ACÁ CONVERGEN TODOS LOS CANALES. Es la propiedad que hace que este archivo
// sea el lugar correcto para el handoff, el buffer y las métricas: anclarlos en
// whatsapp/webhook.js cuando el agente despliega Telegram significa que no se
// ejecutan nunca. Esa propiedad hay que preservarla a propósito.

const { crearClienteAnthropic } = require('./llm');
const { buildSystemPrompt } = require('./prompts');
const { TOOL_DEFINITIONS, ejecutarHerramienta } = require('./tools');
const { cargarHistorial, persistirInteraccion } = require('./memory');
const handoff  = require('./handoff');
const buffer   = require('./buffer');
const metricas = require('./metricas');
const config   = require('../config');

// Cliente perezoso: sin credenciales el constructor lanza error, y este módulo
// también se carga desde los simuladores locales (chat / tests / telegram mock)
// que inyectan un cliente doble de pruebas.
let cliente = null;
let clienteOverride = null; // inyectado por tests y modo mock

function _setClienteParaTests(c) { clienteOverride = c; }

function obtenerCliente() {
  if (clienteOverride) return clienteOverride;
  if (!cliente) cliente = crearClienteAnthropic();
  return cliente;
}

// La config se lee en CADA llamada, no al cargar el módulo. Igual que en
// buffer.js, handoff.js y metricas.js, y por una razón que ya se pagó: cuando
// esto eran `const` de arriba, el arnés cambiaba la variable y el núcleo seguía
// usando el default. Dos verificaciones dieron verde por el motivo equivocado.
//
// El MODELO no sale de agente.config.json a propósito: el proveedor y el modelo
// son credencial y costo, viven en `.env` (LLM_PROVIDER / LLM_MODEL) y los lee
// agent/llm.js. Este default solo aplica al camino nativo de Anthropic.
const modelo         = () => process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const maxTokens      = () => config.valor('limites.max_tokens_respuesta'); // es mensajería, no un ensayo
const MAX_RONDAS_TOOL = 6;    // límite de rondas de tool use (evita bucles)

// Timeout duro por llamada al modelo, con AbortController: sin esto una llamada
// colgada deja al cliente esperando para siempre y bloquea su cola serial.
// 25 s y 3 intentos vienen del agente de Gesta, que corre con tráfico real
// (la directiva decía 20 s y 1 reintento, sin evidencia detrás).
// "3 reintentos" se implementa como 3 INTENTOS TOTALES a propósito: cuatro
// llamadas de 25 s son 100 s de espera, y a esa altura el cliente ya se fue.
const timeoutModeloMs = () => config.valor('limites.timeout_modelo_ms');
const intentosModelo  = () => Math.max(1, config.valor('limites.intentos_modelo'));
const ESPERAS_REINTENTO_MS = [1500, 3000, 5000];

const FALLBACK_VACIO = 'Perfecto, queda anotado. ¿Te ayudo con algo más? 😊';
const MENSAJE_ERROR  =
  'Estoy teniendo problemas técnicos momentáneos. Escríbeme de nuevo en unos segundos, por favor. 🔄';
// Mensaje puente: se manda si el modelo se demoró más que la primera ventana,
// para que el silencio no se lea como abandono.
const MENSAJE_PUENTE =
  'Dame un segundo, estoy revisando eso… 🔎';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function esErrorTransitorio(error) {
  const status = error?.status;
  if (status && (status >= 500 || status === 429)) return true;
  if (status) return false;
  return /econnreset|etimedout|socket hang up|terminated|network|abort|premature/i
    .test(error?.message || error?.name || '');
}

/**
 * Llama al modelo con timeout duro y reintentos ante errores transitorios.
 * @returns {Promise<object>} respuesta del modelo
 */
async function crearMensajeClaude(params, opciones = {}) {
  const c = obtenerCliente();
  const intentos = intentosModelo();
  const tope     = timeoutModeloMs();
  let ultimoError;

  for (let intento = 0; intento < intentos; intento++) {
    const controlador = new AbortController();
    const reloj = setTimeout(() => controlador.abort(), tope);
    try {
      const respuesta = await c.messages.create(params, { signal: controlador.signal });
      opciones.contarIntentos?.(intento);
      return respuesta;
    } catch (error) {
      ultimoError = error;
      const abortado = controlador.signal.aborted;
      if (abortado) error.message = `timeout de ${tope}ms al llamar al modelo`;

      if (!abortado && !esErrorTransitorio(error)) throw error;
      if (intento === intentos - 1) break;

      // Solo tras el PRIMER fallo: avisar que seguimos acá. Una sola vez.
      if (intento === 0) opciones.avisarDemora?.();

      const espera = ESPERAS_REINTENTO_MS[intento] ?? 5000;
      console.warn(
        `[Core] Error de API (intento ${intento + 1}/${intentos}): ${error.message} — reintento en ${espera}ms`
      );
      await esperar(espera);
    } finally {
      clearTimeout(reloj);
    }
  }
  opciones.contarIntentos?.(intentos - 1);
  throw ultimoError;
}

// Cola serial por canal: si un cliente manda dos mensajes seguidos, se procesan
// en orden (dos en paralelo se pisarían el historial). Canales distintos sí
// corren en paralelo.
const colasPorCanal = new Map();

/**
 * Punto de entrada público de todos los canales.
 *
 * Capas, de afuera hacia adentro:
 *   buffer  → agrupa mensajes seguidos (con excepciones que no esperan)
 *   cola    → serializa por canal
 *   handoff → si hay una persona a cargo, devuelve null y no responde nadie
 *
 * @param {string} canalId - E.164 sin "+" (WhatsApp) o `tg<chatId>` (Telegram)
 * @param {string} mensaje
 * @param {{ onProgreso?: (texto: string) => any, adjunto?: boolean }} [opciones]
 * @returns {Promise<string|null>} texto a enviar, o `null` = NO ENVIAR NADA
 */
function processMessage(canalId, mensaje, opciones = {}) {
  return buffer.agrupar(
    canalId,
    mensaje,
    (id, textoAgrupado) => encolar(id, textoAgrupado, opciones),
    opciones
  );
}

function encolar(canalId, mensaje, opciones) {
  const anterior = colasPorCanal.get(canalId) ?? Promise.resolve();
  const actual = anterior
    .catch(() => {})
    .then(() => procesarMensajeInterno(canalId, mensaje, opciones));
  colasPorCanal.set(canalId, actual);
  const limpiar = () => {
    if (colasPorCanal.get(canalId) === actual) colasPorCanal.delete(canalId);
  };
  actual.then(limpiar, limpiar);
  return actual;
}

/**
 * Loop agéntico completo: handoff → historial → modelo → tools → modelo → texto.
 */
async function procesarMensajeInterno(canalId, mensaje, opciones = {}) {
  const arranque = Date.now();
  const partes = mensaje.split('\n').length;

  // ── 1. Handoff: ANTES de gastar un token ────────────────────────────────────
  // Si hay una persona atendiendo, el bot no habla. Devolver `null` (y no un
  // centinela de texto) es deliberado: un centinela que se escape le llega
  // literal al cliente, justo cuando hay alguien molesto al otro lado.
  if (await handoff.enModoHumano(canalId)) {
    console.log(`[Handoff] ${canalId}: modo humano activo — el bot no responde.`);
    await metricas.registrar({ canal_id: canalId, resultado: 'silencio_handoff' });
    return null;
  }

  const deteccion = handoff.detectar(mensaje);
  if (deteccion) {
    await handoff.activar(canalId, deteccion.motivo);
    const historialPrevio = await cargarHistorial(canalId);
    await persistirInteraccion(canalId, historialPrevio, mensaje, handoff.MENSAJE_DERIVACION);
    await metricas.registrar({
      canal_id: canalId,
      resultado: 'derivado',
      motivo: deteccion.motivo,
      duracion_ms: Date.now() - arranque,
      partes_agrupadas: partes,
    });
    // Una última respuesta y después silencio: el cliente tiene que saber que
    // su pedido llegó, no quedarse mirando un chat mudo.
    return handoff.MENSAJE_DERIVACION;
  }

  // ── 2. Loop agéntico ────────────────────────────────────────────────────────
  const historial = await cargarHistorial(canalId);
  const mensajes  = [...historial, { role: 'user', content: mensaje }];

  const paramsBase = {
    model: modelo(),
    max_tokens: maxTokens(),
    system: buildSystemPrompt(),
    tools: TOOL_DEFINITIONS,
  };

  let avisado = false;
  let reintentos = 0;
  const opcionesLlamada = {
    avisarDemora: () => {
      if (avisado || typeof opciones.onProgreso !== 'function') return;
      avisado = true;
      try { opciones.onProgreso(MENSAJE_PUENTE); } catch { /* no crítico */ }
    },
    contarIntentos: (n) => { reintentos = Math.max(reintentos, n); },
  };

  const toolsUsadas = [];
  let rondas = 0;

  try {
    let respuesta = await crearMensajeClaude({ ...paramsBase, messages: mensajes }, opcionesLlamada);

    while (respuesta.stop_reason === 'tool_use' && rondas < MAX_RONDAS_TOOL) {
      // El contenido del assistant se pasa de vuelta TAL CUAL
      mensajes.push({ role: 'assistant', content: respuesta.content });

      const resultados = [];
      for (const bloque of respuesta.content) {
        if (bloque.type !== 'tool_use') continue;
        toolsUsadas.push(bloque.name);
        let resultado;
        try {
          resultado = await ejecutarHerramienta(bloque.name, bloque.input, canalId);
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

      respuesta = await crearMensajeClaude({ ...paramsBase, messages: mensajes }, opcionesLlamada);
      rondas++;
    }

    // Rechazo de seguridad / filtro de contenido: content puede venir vacío y
    // leerlo directo rompería.
    if (respuesta.stop_reason === 'refusal') {
      await metricas.registrar({ canal_id: canalId, resultado: 'ok', motivo: 'refusal',
        duracion_ms: Date.now() - arranque });
      return 'Sobre eso no te puedo ayudar. Puedo mostrarte el catálogo o agendarte una hora. 😊';
    }

    const texto = respuesta.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim() || FALLBACK_VACIO;

    // El historial persistido guarda solo texto plano (user/assistant); los
    // bloques de tool use viven solo dentro del turno.
    await persistirInteraccion(canalId, historial, mensaje, texto);
    await handoff.limpiarFallos(canalId);
    await metricas.registrar({
      canal_id: canalId,
      resultado: 'ok',
      duracion_ms: Date.now() - arranque,
      rondas_tool: rondas,
      tools: toolsUsadas,
      partes_agrupadas: partes,
      reintentos,
    });
    return texto;
  } catch (error) {
    // El bot no pudo responder. Si lleva varios seguidos, deriva en vez de
    // seguir mandando "problemas técnicos" a alguien que ya está molesto.
    const derivo = await handoff.registrarFallo(canalId);
    await metricas.registrar({
      canal_id: canalId,
      resultado: 'error',
      motivo: error?.message?.slice(0, 200),
      duracion_ms: Date.now() - arranque,
      reintentos,
    });
    if (derivo) return handoff.MENSAJE_DERIVACION;
    throw error;
  }
}

module.exports = {
  processMessage,
  MENSAJE_ERROR,
  MENSAJE_PUENTE,
  _setClienteParaTests,
};
