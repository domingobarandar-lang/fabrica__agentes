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
const { db }       = require('../database/supabase');
const handoff      = require('./handoff');
const buffer       = require('./buffer');
const metricas     = require('./metricas');
const conocimiento = require('./conocimiento');
const flujo        = require('./flujo');
const botones      = require('./botones');
const lead         = require('./lead');
const config       = require('../config');

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

  // Los botones duran UN turno. Se limpia acá, donde convergen todos los
  // canales, y no en cada canal: si un turno propuso botones y no llegó a
  // enviarlos —derivó a una persona, o el buffer fusionó el mensaje—, esos
  // botones se pegarían al mensaje siguiente, que ya es otra conversación.
  botones.limpiar(canalId);

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

  // ── 2. Quién atiende y qué se sabe ya ───────────────────────────────────────
  // Una sola lectura de estado_canal para el flujo y para los datos de la
  // persona, y SOLO si alguno de los dos está configurado: un agente sin flujo
  // ni campos declarados —que es el default— no paga ni una consulta extra.
  let estadoCanal = null;
  if (flujo.activo() || lead.activo()) {
    try {
      estadoCanal = await db.estadoCanal.get(canalId);
    } catch (error) {
      // No es fatal como en el handoff: acá el peor caso es empezar de nuevo en
      // el agente inicial y volver a preguntar un dato, no hablarle encima a
      // una persona. Se sigue atendiendo.
      console.warn('[Core] No pude leer el estado del canal:', error.message);
    }
  }

  let agente = flujo.actual(canalId, estadoCanal);
  const agenteAlEmpezar = agente?.id ?? null;
  const datosLead = lead.leer(estadoCanal);
  let saltos = 0;

  // ── 3. Loop agéntico ────────────────────────────────────────────────────────
  const historial = await cargarHistorial(canalId);
  const mensajes  = [...historial, { role: 'user', content: mensaje }];

  // Herramientas del cliente que puede usar quien atiende AHORA. Con flujo
  // apagado son todas, que es como funcionó siempre.
  //
  // La excepción de `nombresUsados` no es cosmética: si un agente entrega la
  // conversación a mitad de turno, el historial de ESE turno ya lleva el
  // `tool_use` de una herramienta que el agente nuevo no tiene declarada, y hay
  // proveedores que rechazan un historial que menciona una herramienta ausente.
  // Se conserva por el resto del turno; en el siguiente ya no aparece.
  const nombresUsados = new Set();
  const herramientasVigentes = () => {
    const propias = flujo.herramientasDe(agente, TOOL_DEFINITIONS);
    const rescatadas = TOOL_DEFINITIONS.filter(
      (t) => nombresUsados.has(t?.name) && !propias.includes(t)
    );
    return [...propias, ...rescatadas];
  };

  // El prompt se ARMA en cada ronda, no una vez por turno: si el agente cambia
  // a mitad de turno, el especialista tiene que recibir sus instrucciones y sus
  // herramientas de inmediato. Armarlo una sola vez dejaría al agente nuevo
  // contestando con el prompt del anterior.
  //
  // El conocimiento del negocio se anexa acá y no en prompts.js: el prompt lo
  // reescribe cada cliente, y lo que se olvida de copiar deja al agente con el
  // índice anunciado y sin forma de cargarlo. `anexarIndice` agrega SOLO el
  // índice (una línea por tema); el corpus se trae con la herramienta.
  const armarParams = () => {
    const herramientas = herramientasVigentes();
    const intenciones  = flujo.intencionesDe(agente);
    let system = buildSystemPrompt();
    system = flujo.anexarRol(system, agente);
    system = lead.anexar(system, datosLead);
    system = conocimiento.anexarIndice(system, intenciones);
    return {
      model: modelo(),
      max_tokens: maxTokens(),
      system,
      tools: [
        ...herramientas,
        ...conocimiento.definiciones(herramientas, intenciones),
        ...flujo.definiciones(agente, herramientas),
      ],
    };
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

  // Tokens del turno, sumando todas las rondas. Arrancan en null y no en 0 a
  // propósito: "el proveedor no informó uso" y "gastamos cero" son cosas
  // distintas, y un panel que muestre 0 tokens cuando en realidad no sabe está
  // mintiendo sobre plata.
  let tokensEntrada = null;
  let tokensSalida  = null;
  const contarUso = (uso) => {
    if (!uso) return;
    const entrada = uso.input_tokens ?? uso.prompt_tokens;
    const salida  = uso.output_tokens ?? uso.completion_tokens;
    if (typeof entrada === 'number') tokensEntrada = (tokensEntrada ?? 0) + entrada;
    if (typeof salida === 'number')  tokensSalida  = (tokensSalida  ?? 0) + salida;
  };

  try {
    let respuesta = await crearMensajeClaude({ ...armarParams(), messages: mensajes }, opcionesLlamada);
    contarUso(respuesta.usage);

    while (respuesta.stop_reason === 'tool_use' && rondas < MAX_RONDAS_TOOL) {
      // El contenido del assistant se pasa de vuelta TAL CUAL
      mensajes.push({ role: 'assistant', content: respuesta.content });

      const resultados = [];
      for (const bloque of respuesta.content) {
        if (bloque.type !== 'tool_use') continue;
        toolsUsadas.push(bloque.name);
        let resultado;
        try {
          // Las dos herramientas del núcleo las resuelve el núcleo: las inyectó
          // él y el ejecutarHerramienta del cliente no las conoce.
          if (flujo.esTool(bloque.name)) {
            const cambio = flujo.ejecutar(bloque.input, agente, saltos);
            if (cambio.destino) {
              console.log(`[Flujo] ${canalId}: ${agente.id} → ${cambio.destino.id}` +
                (bloque.input?.motivo ? ` (${bloque.input.motivo})` : ''));
              agente = cambio.destino;
              saltos++;
            }
            resultado = cambio.resultado;
          } else if (conocimiento.esTool(bloque.name)) {
            resultado = conocimiento.ejecutar(bloque.input, flujo.intencionesDe(agente));
          } else if (!herramientasVigentes().some((t) => t?.name === bloque.name)) {
            // El modelo pidió una herramienta que este agente NO tiene. El enum
            // y la lista de tools son indicaciones, no garantías: sin este
            // guarda, repartir las herramientas entre agentes no separa nada,
            // porque el despachador del cliente las conoce todas y ejecutaría
            // igual.
            console.warn(`[Flujo] "${agente?.id}" pidió "${bloque.name}", que no tiene declarada.`);
            resultado = {
              error: `En esta parte de la conversación no puedes usar "${bloque.name}".`,
              herramientas_disponibles: herramientasVigentes().map((t) => t.name),
            };
          } else {
            nombresUsados.add(bloque.name);
            resultado = await ejecutarHerramienta(bloque.name, bloque.input, canalId);
            // Lo que la persona ya contó, para no volver a preguntárselo — sobre
            // todo después de cambiar de agente, que es cuando más se nota.
            Object.assign(datosLead, lead.observar(datosLead, bloque.input));
          }
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

      respuesta = await crearMensajeClaude({ ...armarParams(), messages: mensajes }, opcionesLlamada);
      contarUso(respuesta.usage);
      rondas++;
    }

    // Rechazo de seguridad / filtro de contenido: content puede venir vacío y
    // leerlo directo rompería.
    if (respuesta.stop_reason === 'refusal') {
      await metricas.registrar({ canal_id: canalId, resultado: 'ok', motivo: 'refusal',
        duracion_ms: Date.now() - arranque, agente: agente?.id,
        tokens_entrada: tokensEntrada, tokens_salida: tokensSalida });
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
    // Solo si el turno salió bien: un turno que reventó deja la conversación
    // donde estaba, y reintentar el mismo mensaje vuelve a hacer el cambio.
    await guardarEstado(canalId, estadoCanal, agente, agenteAlEmpezar, datosLead);
    await handoff.limpiarFallos(canalId);
    await metricas.registrar({
      canal_id: canalId,
      resultado: 'ok',
      duracion_ms: Date.now() - arranque,
      rondas_tool: rondas,
      tools: toolsUsadas,
      partes_agrupadas: partes,
      reintentos,
      agente: agente?.id,
      tokens_entrada: tokensEntrada,
      tokens_salida: tokensSalida,
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
      agente: agente?.id,
      tokens_entrada: tokensEntrada,
      tokens_salida: tokensSalida,
    });
    if (derivo) return handoff.MENSAJE_DERIVACION;
    throw error;
  }
}

/**
 * Guarda en qué agente quedó la conversación y qué se sabe de la persona.
 * Escribe UNA vez por turno y solo si algo cambió: sin esto habría una consulta
 * de escritura por cada herramienta que aporta un dato.
 *
 * Nunca rompe una respuesta ya calculada — misma regla que memory.js y
 * metricas.js. El costo de fallar es que la conversación vuelve al agente
 * inicial en el turno siguiente, y por eso el aviso es ruidoso.
 */
async function guardarEstado(canalId, estadoPrevio, agente, agenteAlEmpezar, datosLead) {
  // Si la conversación sigue donde empezó no se escribe nada. En particular, el
  // primer turno no guarda el agente inicial: `flujo.actual` ya lo resuelve solo
  // cuando la fila no dice nada, así que persistirlo sería una consulta de
  // escritura por conversación a cambio de nada.
  const cambioAgente = agente && agente.id !== agenteAlEmpezar;
  const leadPrevio = lead.leer(estadoPrevio);
  const cambioLead = lead.activo() &&
    Object.keys(datosLead).some((k) => datosLead[k] !== leadPrevio[k]);
  if (!cambioAgente && !cambioLead) return;

  const fila = {};
  if (cambioAgente) fila.agente_actual = agente.id;
  if (cambioLead)   fila.lead = datosLead;

  try {
    await db.estadoCanal.set(canalId, fila);
  } catch (error) {
    console.warn('[Core] No pude guardar el estado del canal:', error.message);
  }
}

module.exports = {
  processMessage,
  MENSAJE_ERROR,
  MENSAJE_PUENTE,
  _setClienteParaTests,
};
