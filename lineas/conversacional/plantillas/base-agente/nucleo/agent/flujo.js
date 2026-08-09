// Varios agentes especializados en vez de uno solo. (A-02 del plan, paso 6)
//
// LO PRIMERO, PORQUE ORDENA TODO LO DEMÁS: esto viene APAGADO. Sin
// `flujo.agentes` en agente.config.json, cada función de este archivo devuelve
// "no hay flujo" y agent/core.js toma exactamente el mismo camino que tomaba
// antes de que este archivo existiera — mismo prompt, mismas herramientas, ni
// un byte de diferencia. No es prudencia decorativa: es la conclusión que la
// fábrica ya había registrado y que este paso tenía escrita como condición.
//
// POR QUÉ ESTABA CONDICIONADO. La arquitectura de ocho agentes por cliente que
// se usó de referencia es CONSECUENCIA de tener miles de clientes, no la causa
// de haberlos conseguido. Partir el agente en cinco antes de que las métricas
// lo pidan deja cinco prompts que mantener, cinco formas de contestar distinto
// y el mismo negocio atendido peor. El disparador honesto es un panel de
// métricas con conversaciones reales que muestre al agente único mezclando
// etapas o ignorando reglas — no una fecha ni un gusto arquitectónico.
//
// QUÉ ES UN "AGENTE" ACÁ, Y QUÉ NO ES. No es un archivo de código ni un proceso
// aparte: es una DECLARACIÓN en la configuración con cuatro cosas —
//
//     id             cómo lo nombra el modelo para entregarle la conversación
//     rol            qué hace, en pocas líneas, y se anexa al prompt base
//     herramientas   cuáles de las tools del cliente ve (el resto no existen)
//     entrega_a      a quiénes puede pasarles la conversación
//
// Eso es deliberado y es lo que hace posible el criterio de éxito del paso: el
// MISMO código de cliente (agent/prompts.js, agent/tools.js, la capa de datos)
// corre con un agente o con cuatro, y lo único que cambia es un archivo JSON.
// Si cada agente fuera un módulo JS, activar el flujo obligaría a escribir
// cuatro archivos nuevos por cliente — es decir, el problema del fork otra vez,
// multiplicado por cuatro, que es exactamente lo que la auditoría advirtió.
//
// CÓMO SE CAMBIA DE AGENTE, Y POR QUÉ NO HAY ROUTER. El diseño original preveía
// un `modelos.router`: una llamada extra al LLM por turno, solo para decidir
// quién contesta. Acá lo decide el agente que ya está conversando, con una
// herramienta que inyecta el núcleo (`cambiar_etapa`) y una lista CERRADA de
// destinos. Cuesta cero llamadas extra, es determinista, y el cambio surte
// efecto DENTRO del mismo turno: el especialista contesta de inmediato en vez
// de obligar a la persona a escribir otra vez. Un router habría duplicado el
// costo por turno justo en el paso cuya única justificación es el costo.
//
// LA TRAMPA QUE HAY QUE EVITAR SIEMPRE: que el cambio de agente se le anuncie a
// la persona como si la pasaran con alguien más ("te derivo con un asesor").
// Sigue siendo el mismo bot, así que esa frase es una promesa que nadie va a
// cumplir — y es indistinguible, para quien está del otro lado, del handoff a
// un humano de verdad. Está dicho en el prompt, dicho en la descripción de la
// herramienta, y hay un invariante del arnés (`cambio_de_agente_no_finge_humano`)
// que pone la suite en rojo si igual ocurre.

const config = require('../config');

const NOMBRE_TOOL = 'cambiar_etapa';
const TODOS = '*';

let avisoNombreDado = false;
let avisoLargoDado  = false;
let avisoDesconocidoDado = false;

// Como en el resto del núcleo, la config se lee en CADA llamada y no al cargar
// el módulo: el arnés cambia el flujo entre escenarios dentro de una misma
// corrida, y con constantes de arriba seguiría probando el primero.
const agentes = () => config.valor('flujo.agentes');
const maxSaltos = () => Math.max(0, config.valor('flujo.max_saltos_turno'));

/** ¿Este agente corre con flujo? Sin agentes declarados, no. */
function activo() {
  return config.valor('flujo.activo') && agentes().length > 0;
}

/** El agente con el que empieza una conversación nueva. */
function inicial() {
  const lista = agentes();
  if (!lista.length) return null;
  const pedido = config.valor('flujo.inicial');
  return lista.find((a) => a.id === pedido) || lista[0];
}

function porId(id) {
  return agentes().find((a) => a.id === id) || null;
}

/**
 * En qué agente está esta conversación.
 *
 * @param {string} canalId
 * @param {object|null} estadoPrevio fila de estado_canal ya leída por el núcleo.
 *        Se pasa para no ir a la base tres veces por turno (handoff, flujo y
 *        lead miran la misma fila). Un agente SIN flujo no paga ninguna lectura
 *        extra: esta función sale antes de tocar nada.
 * @returns {object|null} el agente, o null si no hay flujo
 */
function actual(canalId, estadoPrevio) {
  if (!activo()) return null;

  const guardado = estadoPrevio?.agente_actual;
  if (!guardado) return inicial();

  const encontrado = porId(guardado);
  if (encontrado) return encontrado;

  // El cliente editó el flujo y hay conversaciones a medio camino en un agente
  // que ya no existe. Volver al inicial y seguir atendiendo: dejar la
  // conversación muerta porque cambió un JSON sería mucho peor que reempezar.
  if (!avisoDesconocidoDado) {
    avisoDesconocidoDado = true;
    console.warn(
      `[Flujo] ${canalId} venía en el agente "${guardado}", que ya no está declarado. ` +
      'Vuelve al inicial; si esto se repite, hubo un cambio de flujo con conversaciones abiertas.'
    );
  }
  return inicial();
}

// ─── Lo que ve el modelo ─────────────────────────────────────────────────────

const etiqueta = (a) => a.titulo || a.id;

/**
 * Las herramientas del cliente que ESTE agente puede usar.
 *
 * `[]` es "ninguna" y `["*"]` es "todas". Que la lista vacía no signifique
 * "todas" es a propósito: repartir las herramientas es el motivo entero de
 * partir el agente, así que el descuido de no escribirlas tiene que verse en la
 * primera prueba —el agente no puede hacer nada— y no pasar por un flujo que
 * en realidad no separa nada.
 */
function herramientasDe(agente, definiciones = []) {
  if (!agente) return definiciones;
  if (agente.herramientas.includes(TODOS)) return definiciones;
  const permitidas = new Set(agente.herramientas);
  return definiciones.filter((t) => permitidas.has(t?.name));
}

/** Intenciones de conocimiento que ve este agente; null = todas. */
function intencionesDe(agente) {
  if (!agente || agente.conocimiento.includes(TODOS)) return null;
  return agente.conocimiento;
}

/**
 * La herramienta de cambio, o [] si este agente no tiene a quién entregarle.
 * Un agente terminal NO la recibe: mandar una tool con enum vacío es un 400 del
 * proveedor, y aunque no lo fuera, ofrecerle al modelo una salida que no existe
 * es pedirle que la use.
 */
function definiciones(agente, existentes = []) {
  if (!activo() || !agente || !agente.entrega_a.length) return [];

  if (existentes.some((t) => t?.name === NOMBRE_TOOL)) {
    if (!avisoNombreDado) {
      avisoNombreDado = true;
      console.warn(`[Flujo] agent/tools.js ya define "${NOMBRE_TOOL}": el núcleo no inyecta la suya y el flujo no podrá avanzar.`);
    }
    return [];
  }

  const destinos = agente.entrega_a.map((id) => porId(id)).filter(Boolean);

  return [{
    name: NOMBRE_TOOL,
    description:
      'Pasa la conversación a la parte del asistente que corresponde cuando lo que pide la ' +
      'persona no es lo tuyo. Llámala ANTES de responder y sigue tú mismo la conversación con ' +
      'las instrucciones nuevas. NO le anuncies el cambio a la persona ni le digas que la ' +
      'derivas con alguien: sigues siendo el mismo asistente y nadie más va a escribirle. ' +
      'Destinos: ' + destinos.map((d) => `${d.id} (${etiqueta(d)})`).join('; ') + '.',
    input_schema: {
      type: 'object',
      properties: {
        etapa: {
          type: 'string',
          enum: agente.entrega_a,
          description: 'Identificador exacto del destino, tal como aparece en el prompt.',
        },
        motivo: {
          type: 'string',
          description: 'En pocas palabras, qué pidió la persona. Queda en el registro, no se le muestra.',
        },
      },
      required: ['etapa'],
    },
  }];
}

const esTool = (nombre) => nombre === NOMBRE_TOOL;

/**
 * Bloque que se anexa al prompt de sistema del cliente. Lo agrega el núcleo en
 * agent/core.js por el mismo motivo que el índice de conocimiento: agent/prompts.js
 * lo reescribe entero cada cliente, y lo que dependa de que se acuerde de
 * copiarlo se pierde en el primer proyecto.
 */
function bloqueRol(agente) {
  if (!activo() || !agente) return '';

  const lineas = [
    '',
    `TU PAPEL EN ESTA CONVERSACIÓN — ${etiqueta(agente)}`,
    agente.rol.trim(),
  ];

  if (agente.entrega_a.length) {
    const destinos = agente.entrega_a.map((id) => porId(id)).filter(Boolean);
    lineas.push(
      '',
      'Si lo que la persona necesita NO es lo tuyo, llama a ' + NOMBRE_TOOL + ' con uno de estos:',
      ...destinos.map((d) => `- ${d.id}: ${etiqueta(d)}`),
      'Hazlo en silencio: no anuncies el cambio ni digas que la derivas con otra persona.',
      'Sigues siendo el mismo asistente y nadie más va a escribirle.'
    );
  }

  // El tope de 40 líneas del diseño es de CALIDAD, igual que el de 800 palabras
  // del conocimiento: un rol de 200 líneas es el prompt monolítico otra vez, con
  // la complejidad extra de repartirlo. Acá se avisa; en `npm run validar` es
  // error, que es el momento en que alguien mira. Recortarlo en ejecución sería
  // peor: dejaría al agente sin la mitad de sus instrucciones sin que se note.
  const largo = agente.rol.split('\n').length;
  if (largo > 40 && !avisoLargoDado) {
    avisoLargoDado = true;
    console.warn(
      `[Flujo] el rol de "${agente.id}" tiene ${largo} líneas y el tope es 40. ` +
      'Un rol así de largo es el prompt monolítico otra vez: pártelo en dos agentes.'
    );
  }

  return lineas.join('\n');
}

/** Prompt del cliente + el papel del agente actual. Sin flujo, lo devuelve tal cual. */
function anexarRol(prompt, agente) {
  const bloque = bloqueRol(agente);
  return bloque ? `${prompt}\n${bloque}` : prompt;
}

// ─── Ejecución de la herramienta ─────────────────────────────────────────────

/**
 * Resuelve `cambiar_etapa`. NO persiste: de eso se encarga agent/core.js, que
 * es quien sabe si el turno terminó bien.
 *
 * @param {object} input lo que pidió el modelo
 * @param {object} agenteActual
 * @param {number} saltosDados en este turno
 * @returns {{ resultado: object, destino: object|null }}
 */
function ejecutar(input = {}, agenteActual, saltosDados = 0) {
  const pedido = String(input?.etapa || '').trim();

  // El enum del esquema es una indicación, no una garantía: el modelo puede
  // mandar cualquier cosa y algunos proveedores no lo validan. Se comprueba acá
  // contra la lista real, igual que la intención del conocimiento.
  if (!agenteActual || !agenteActual.entrega_a.includes(pedido)) {
    return {
      destino: null,
      resultado: {
        error: `Desde acá no puedes pasar a "${pedido}".`,
        destinos_disponibles: agenteActual?.entrega_a || [],
      },
    };
  }

  // El tope de saltos por turno. Dos agentes que se entregan la conversación el
  // uno al otro consumirían las rondas de tool del turno completo y la persona
  // se quedaría sin respuesta: el bot "pensando" y nada en pantalla.
  if (saltosDados >= maxSaltos()) {
    return {
      destino: null,
      resultado: {
        error: `Ya cambiaste de etapa ${saltosDados} vez/veces en este mismo mensaje. ` +
               'Responde ahora con lo que tienes y, si hace falta, cambia en el mensaje siguiente.',
      },
    };
  }

  const destino = porId(pedido);
  return {
    destino,
    resultado: {
      ok: true,
      etapa: destino.id,
      titulo: etiqueta(destino),
      // Las instrucciones nuevas ya viajan en el prompt de sistema de la ronda
      // siguiente; esto es el acuse, no el contenido.
      mensaje: `Ahora te toca a ti la parte "${etiqueta(destino)}". Sigue tus instrucciones nuevas ` +
               'y responde a la persona sin mencionarle que cambiaste de etapa.',
    },
  };
}

// ─── Para el validador y el arnés ────────────────────────────────────────────

/** Los agentes tal como quedaron resueltos, para informar. */
function resumen() {
  return {
    activo: activo(),
    inicial: inicial()?.id || null,
    agentes: agentes().map((a) => ({
      id: a.id,
      titulo: etiqueta(a),
      lineas_rol: a.rol.split('\n').length,
      herramientas: a.herramientas,
      conocimiento: a.conocimiento,
      entrega_a: a.entrega_a,
    })),
  };
}

/** Para los tests: vuelve a permitir los avisos de una sola vez. */
function _recargar() {
  avisoNombreDado = false;
  avisoLargoDado = false;
  avisoDesconocidoDado = false;
}

module.exports = {
  NOMBRE_TOOL,
  TODOS,
  activo,
  agentes,
  inicial,
  porId,
  actual,
  herramientasDe,
  intencionesDe,
  definiciones,
  esTool,
  bloqueRol,
  anexarRol,
  ejecutar,
  resumen,
  _recargar,
};
