// Capa de datos del cliente — pieza de la SEMILLA, no del núcleo.
//
// ESTE ARCHIVO ES EL PUNTO DE UNIÓN de las dos mitades:
//
//   NÚCLEO  → database/nucleo-db.js: conexión, fallback en memoria y las tres
//             tablas sin las que el núcleo no funciona (sesiones, estado_canal,
//             metricas). Se sincroniza y NO se edita acá.
//   CLIENTE → todo lo de abajo de la línea: los repositorios del vertical. Son
//             el modelo de negocio y se reescriben enteros en cada proyecto.
//
// Con SUPABASE_URL + SUPABASE_SERVICE_KEY el núcleo persiste de verdad, en las
// tablas prefijadas que declara `datos.prefijo` de agente.config.json. Sin esas
// variables todo queda en memoria: sirve para demo y para los evals, y se
// pierde en cada reinicio.
//
// Contrato que el núcleo EXIGE (ya resuelto por crearBaseNucleo):
//   db.sesiones.get(canalId)            -> { messages: [] } | null
//   db.sesiones.upsert(canalId, msgs)   -> void
//   db.estadoCanal.get(canalId)         -> { modo_humano, humano_desde } | null
//   db.estadoCanal.set(canalId, estado) -> void
//   db.metricas.registrar(fila)         -> void   (opcional)

const { crearBaseNucleo, resetMemoria } = require('./nucleo-db');

const nucleo = crearBaseNucleo();

// ─── Dominio del cliente ─────────────────────────────────────────────────────
// Todo lo de acá abajo es producto. En un proyecto real, estos repositorios
// leen las tablas del vertical (propiedades, citas, catálogo…) declaradas en
// database/schema.sql. En la semilla, una lista fija en memoria.

const HORARIOS = [
  { dia: 'lunes',     abre: '09:00', cierra: '18:00' },
  { dia: 'martes',    abre: '09:00', cierra: '18:00' },
  { dia: 'miercoles', abre: '09:00', cierra: '18:00' },
  { dia: 'jueves',    abre: '09:00', cierra: '18:00' },
  { dia: 'viernes',   abre: '09:00', cierra: '17:00' },
];

const db = {
  ...nucleo,
  horarios: {
    async listar() {
      return HORARIOS.map((h) => ({ ...h }));
    },
  },
};

/** Deja la base como recién sembrada. Lo usan los evals entre escenarios. */
function resetDemo() {
  resetMemoria();
  // Un cliente con datos de dominio mutables (visitas, citas, leads) los vuelve
  // a sembrar acá. Si no, entre escenarios se arrastra el estado del anterior.
}

module.exports = { db, resetDemo, modo: nucleo.modo };
