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

const { db } = require('../database/supabase');

const activas = () => process.env.METRICAS_ACTIVAS !== 'false';
const MAX_EN_MEMORIA = 500;

const memoria = [];

/**
 * @param {{
 *   canal_id: string,
 *   resultado: 'ok'|'error'|'handoff'|'silencio_handoff'|'derivado',
 *   duracion_ms?: number,
 *   rondas_tool?: number,
 *   tools?: string[],
 *   partes_agrupadas?: number,
 *   reintentos?: number,
 *   motivo?: string
 * }} evento
 */
async function registrar(evento) {
  if (!activas()) return;
  const fila = { ts: new Date().toISOString(), ...evento };

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

/** Resumen de lo que hay en memoria. Lo consume el panel cuando exista. */
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

/** Para los tests. */
function _limpiar() {
  memoria.length = 0;
}

module.exports = { registrar, resumen, _limpiar };
