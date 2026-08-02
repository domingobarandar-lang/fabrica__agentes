// Capa de datos de ejemplo — pieza de la SEMILLA, no del núcleo.
// Solo base EN MEMORIA: sin credenciales, sin red, sin efectos externos.
//
// QUÉ ES NÚCLEO Y QUÉ ES CLIENTE (decisión del diseño, ver DECISIONES.md):
//   - Núcleo: la conexión, el fallback en memoria, `sesiones` y `estado_canal`.
//   - Cliente: los repositorios de dominio del vertical (propiedades, citas,
//     catálogo, horarios...). Son el modelo de negocio, no infraestructura,
//     y por eso se reescriben en cada proyecto.
//
// Contrato que el núcleo EXIGE de este archivo:
//   db.sesiones.get(canalId)            -> { messages: [] } | null
//   db.sesiones.upsert(canalId, msgs)   -> void
//   db.estadoCanal.get(canalId)         -> { modo_humano, humano_desde } | null
//   db.estadoCanal.set(canalId, estado) -> void
// OPCIONAL (si no existe, las métricas quedan solo en memoria del proceso):
//   db.metricas.registrar(fila)         -> void
// Todo lo demás (acá: db.horarios) es del cliente.

const sesiones    = new Map();
const estadoCanal = new Map();
const metricas    = [];

// Semilla de demo del vertical de ejemplo
const HORARIOS = [
  { dia: 'lunes',     abre: '09:00', cierra: '18:00' },
  { dia: 'martes',    abre: '09:00', cierra: '18:00' },
  { dia: 'miercoles', abre: '09:00', cierra: '18:00' },
  { dia: 'jueves',    abre: '09:00', cierra: '18:00' },
  { dia: 'viernes',   abre: '09:00', cierra: '17:00' },
];

const db = {
  // ── Núcleo ────────────────────────────────────────────────────────────────
  sesiones: {
    async get(canalId) {
      return sesiones.get(canalId) || null;
    },
    async upsert(canalId, messages) {
      sesiones.set(canalId, { messages, updated_at: new Date().toISOString() });
    },
  },

  // Estado de handoff humano. En un cliente real esto vive en una tabla
  // PREFIJADA por agente (`citas_estado_canal`, etc.): el proyecto Supabase
  // está compartido entre agentes y una tabla sin prefijo cruzaría negocios.
  estadoCanal: {
    async get(canalId) {
      return estadoCanal.get(canalId) || null;
    },
    async set(canalId, estado) {
      estadoCanal.set(canalId, { ...(estadoCanal.get(canalId) || {}), ...estado });
    },
  },

  // Métricas por turno. En un cliente real, tabla PREFIJADA por agente igual
  // que las de arriba (`citas_metricas`, etc.).
  metricas: {
    async registrar(fila) {
      metricas.push(fila);
      if (metricas.length > 1000) metricas.shift();
    },
    async listar() {
      return metricas.map((f) => ({ ...f }));
    },
  },

  // ── Cliente (dominio del vertical) ────────────────────────────────────────
  horarios: {
    async listar() {
      return HORARIOS.map((h) => ({ ...h }));
    },
  },
};

/** Deja la base como recién sembrada. Lo usan los evals entre escenarios. */
function resetDemo() {
  sesiones.clear();
  estadoCanal.clear();
  metricas.length = 0;
}

module.exports = { db, resetDemo };
