// Métricas por turno. Adelantadas desde el paso 5 del plan por una razón
// práctica: instrumentar el núcleo mientras está abierto cuesta unas líneas,
// retrofitearlo después cuesta tocar cada cliente.
//
// REGLA: registrar una métrica NUNCA puede romper una respuesta al cliente.
// Todo va envuelto y los errores se tragan a propósito.
//
// Persistencia: si la capa de datos del cliente expone `db.metricas.registrar`,
// se usa (tabla PREFIJADA por agente — el proyecto Supabase está compartido).
// Si no existe, quedan en memoria y se ven con `resumen()`. El núcleo no
// obliga a nadie a crear la tabla para poder arrancar.
//
// LO QUE SE MIDE Y LO QUE NO. Duración, resultado, tools, reintentos y tokens
// son del NÚCLEO: significan lo mismo en cualquier rubro. "Calificó un lead",
// "agendó" o "no supe responder" son del NEGOCIO, y el núcleo no tiene forma de
// saber qué es calificar en una dental o en una corredora. Por eso hay un solo
// mecanismo genérico —`marcarHito(canalId, hito)`, que una tool del cliente
// llama cuando ese hecho ocurre— y los hitos que importan se declaran en
// `metricas.hitos` de agente.config.json. Con eso el panel calcula tasa de
// conversión, turnos hasta el hito y tasa de "no sé" sin que el núcleo sepa de
// qué habla el negocio.

const { db } = require('../database/supabase');
const config = require('../config');

const activas = () => config.valor('metricas.activas');
const MAX_EN_MEMORIA = 500;

// LAS COLUMNAS, EN UN SOLO LUGAR. `db.metricas.registrar` hace un INSERT con la
// fila tal cual: una clave que no sea columna hace fallar el insert entero, y
// como los errores de métricas se tragan a propósito, la fila se perdería en
// silencio en producción y nadie se enteraría hasta mirar una tabla vacía.
// Por eso la fila se filtra a esta lista, y por eso hay una verificación en la
// prueba de humo que la compara contra database/schema-nucleo.sql.
const CAMPOS = [
  'ts', 'canal_id', 'resultado', 'motivo', 'duracion_ms', 'rondas_tool', 'tools',
  'partes_agrupadas', 'reintentos', 'tokens_entrada', 'tokens_salida', 'hito',
  // Con qué agente del flujo terminó el turno. Vacío en un agente único. Es lo
  // que permite al panel decir en qué parte de la conversación se cae la gente,
  // que es la única forma de saber si partir el agente sirvió de algo.
  'agente',
];

const memoria = [];
// Hito pendiente por canal: lo marca una tool a mitad del turno y se adjunta a
// la fila que se escribe al terminar ese turno. Uno por turno; el último gana.
const hitosPendientes = new Map();
const camposIgnorados = new Set();

/**
 * Marca que en esta conversación ocurrió un hecho del negocio. Lo llama una
 * tool del cliente:  metricas.marcarHito(canalId, 'agendo')
 * @param {string} canalId
 * @param {string} hito nombre corto; declararlo en `metricas.hitos` de la config
 */
function marcarHito(canalId, hito) {
  if (!canalId || !hito) return;
  hitosPendientes.set(canalId, String(hito));
}

/**
 * @param {{
 *   canal_id: string,
 *   resultado: 'ok'|'error'|'handoff'|'silencio_handoff'|'derivado',
 *   duracion_ms?: number,
 *   rondas_tool?: number,
 *   tools?: string[],
 *   partes_agrupadas?: number,
 *   reintentos?: number,
 *   tokens_entrada?: number|null,
 *   tokens_salida?: number|null,
 *   motivo?: string
 * }} evento
 */
async function registrar(evento) {
  if (!activas()) return;

  const hito = hitosPendientes.get(evento.canal_id);
  if (hito) hitosPendientes.delete(evento.canal_id);

  const completo = { ts: new Date().toISOString(), ...evento, ...(hito ? { hito } : {}) };

  // Filtrar en vez de insertar de más. Un campo nuevo sin columna se avisa una
  // sola vez: el modo de falla que se quiere evitar es el silencioso.
  const fila = {};
  for (const [clave, valor] of Object.entries(completo)) {
    if (CAMPOS.includes(clave)) { fila[clave] = valor; continue; }
    if (!camposIgnorados.has(clave)) {
      camposIgnorados.add(clave);
      console.warn(
        `[Métricas] El campo "${clave}" no es columna de la tabla y se descarta. ` +
        'Agrégalo a CAMPOS en agent/metricas.js y a database/schema-nucleo.sql, o sácalo.'
      );
    }
  }

  memoria.push(fila);
  if (memoria.length > MAX_EN_MEMORIA) memoria.shift();

  try {
    if (typeof db?.metricas?.registrar === 'function') {
      await db.metricas.registrar(fila);
    }
  } catch (error) {
    console.warn('[Métricas] No se pudo persistir:', error.message);
  }
}

/** Resumen de lo que hay en memoria. El panel completo vive en scripts/panel-metricas.js. */
function resumen() {
  const total = memoria.length;
  if (!total) return { total: 0 };

  const porResultado = {};
  let sumaDuracion = 0;
  let conDuracion   = 0;

  for (const f of memoria) {
    porResultado[f.resultado] = (porResultado[f.resultado] || 0) + 1;
    if (typeof f.duracion_ms === 'number') {
      sumaDuracion += f.duracion_ms;
      conDuracion++;
    }
  }

  const duraciones = memoria
    .map((f) => f.duracion_ms)
    .filter((d) => typeof d === 'number')
    .sort((a, b) => a - b);

  return {
    total,
    por_resultado: porResultado,
    duracion_promedio_ms: conDuracion ? Math.round(sumaDuracion / conDuracion) : null,
    duracion_p95_ms: duraciones.length
      ? duraciones[Math.min(duraciones.length - 1, Math.floor(duraciones.length * 0.95))]
      : null,
  };
}

/** Las filas en memoria, para el panel cuando no hay Supabase. */
function filas() {
  return memoria.map((f) => ({ ...f }));
}

/** Para los tests. */
function _limpiar() {
  memoria.length = 0;
  hitosPendientes.clear();
  camposIgnorados.clear();
}

module.exports = { CAMPOS, registrar, marcarHito, resumen, filas, _limpiar };
