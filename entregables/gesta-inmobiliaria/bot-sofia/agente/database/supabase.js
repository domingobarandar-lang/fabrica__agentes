// Capa de datos de Sofía. Punto de unión de las dos mitades:
//
//   NÚCLEO  → database/nucleo-db.js: conexión, memoria y las tres tablas sin las
//             que el núcleo no funciona (sesiones, estado_canal, metricas).
//   CLIENTE → todo lo de abajo: el dominio de la corredora.
//
// EL DOMINIO DE GESTA TIENE DOS MITADES QUE NO SE PARECEN:
//
//   · Las PROPIEDADES son de solo lectura y no viven acá: viven en la planilla
//     de Google que la corredora ya mantiene (database/planilla.js). Copiarlas a
//     una tabla obligaría a alguien a mantener dos verdades, y la que se
//     quedaría atrás sería siempre la de la base.
//   · Las VISITAS y las CAPTACIONES sí se escriben, y son el registro de lo que
//     el agente consiguió. Van en Supabase con el prefijo del agente.
//
// Sin Supabase todo esto es memoria y se pierde al reiniciar: sirve para la
// demo y para los evals. El aviso a la ejecutiva por WhatsApp NO depende de la
// base — si la base falla, la corredora igual se entera. Esa separación es a
// propósito: el lead llega al teléfono de una persona aunque el registro falle.

const { crearBaseNucleo, resetMemoria } = require('./nucleo-db');
const planilla = require('./planilla');
const buscar   = require('./buscar');

const nucleo = crearBaseNucleo();

// ─── Registro en memoria (o en Supabase si hay credenciales) ─────────────────

const memoria = { visitas: [], captaciones: [] };

const tabla = (nombre) => {
  const prefijo = require('../config').valor('datos.prefijo');
  return `${prefijo}_${nombre}`;
};

async function guardar(nombre, fila) {
  const registro = { ...fila, creado_en: new Date().toISOString() };
  memoria[nombre].push(registro);

  if (nucleo.modo !== 'supabase' || !nucleo.supabase) return registro;
  try {
    const { error } = await nucleo.supabase.from(tabla(nombre)).insert(registro);
    if (error) throw new Error(error.message);
  } catch (error) {
    // Nunca romper el turno por un problema de registro: la persona ya está
    // esperando respuesta y la ejecutiva ya recibió el aviso por WhatsApp.
    console.error(`[DB] No pude guardar en ${tabla(nombre)}:`, error.message);
  }
  return registro;
}

const db = {
  ...nucleo,

  propiedades: {
    /** Todas las publicables de la planilla. */
    async activas() {
      return planilla.activas();
    },
    /** Una por su id (el código de su link publicado). */
    async porId(id) {
      const todas = await planilla.activas();
      return todas.find((p) => p.id === String(id).trim()) || null;
    },
    /** De qué propiedad habla este texto. */
    async buscarEnTexto(texto, tope = 3) {
      return buscar.porTexto(await planilla.activas(), texto, tope);
    },
    /** Filtro por operación / comuna / tipo. */
    async filtrar(filtros, tope = 3) {
      return buscar.porFiltros(await planilla.activas(), filtros, tope);
    },
    estado: planilla.estado,
  },

  visitas: {
    registrar: (fila) => guardar('visitas', fila),
    listar: () => memoria.visitas.map((v) => ({ ...v })),
  },

  captaciones: {
    registrar: (fila) => guardar('captaciones', fila),
    listar: () => memoria.captaciones.map((c) => ({ ...c })),
  },
};

/** Deja la base como recién sembrada. Lo usan los evals entre escenarios. */
function resetDemo() {
  resetMemoria();
  memoria.visitas.length = 0;
  memoria.captaciones.length = 0;
  // La planilla NO se limpia: los evals la siembran una vez con el CSV del
  // repo y la releen en cada escenario. Limpiarla acá haría que cada escenario
  // saliera a buscar el archivo de nuevo.
}

module.exports = { db, resetDemo, modo: nucleo.modo };
