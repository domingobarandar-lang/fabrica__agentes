// Herramientas de ejemplo — pieza de la SEMILLA, no del núcleo.
// Una sola tool de juguete, con la forma exacta que espera agent/core.js:
//   - TOOL_DEFINITIONS: array de definiciones en formato Anthropic Messages
//   - ejecutarHerramienta(nombre, input, canalId) -> objeto serializable
//
// Al personalizar un cliente, este archivo se REESCRIBE entero. Es el producto.
//
// Tres reglas del núcleo que conviene respetar al escribir tools reales:
//   1. La validación de negocio va DENTRO de la tool, no en el prompt. El
//      modelo puede alucinar; la tool no.
//   2. Toda tool que devuelve listas lleva tope duro de resultados y un campo
//      `hay_mas` cuando hay más, para que el agente pida afinar el filtro.
//   3. Cuando una tool consigue (o no consigue) algo que al dueño le importa,
//      lo marca con `metricas.marcarHito`. Es la única forma que tiene el panel
//      de saber que una conversación terminó en negocio: el núcleo mide turnos
//      y errores, pero no puede saber qué es "convertir" en este rubro.
//
// OJO: acá NO se declara `cargar_conocimiento`. Esa la inyecta el núcleo cuando
// existe la carpeta conocimiento/, y la resuelve él mismo.

const { db } = require('../database/supabase');
const metricas = require('./metricas');

const TOOL_DEFINITIONS = [
  {
    name: 'ver_horario',
    description:
      'Devuelve el horario de atención del negocio. Úsala SIEMPRE que pregunten a qué hora abren o cierran: nunca respondas el horario de memoria.',
    input_schema: {
      type: 'object',
      properties: {
        dia: {
          type: 'string',
          description:
            'Día a consultar en minúsculas y sin tilde: lunes, martes, miercoles, jueves, viernes, sabado, domingo. Omitir para la semana completa.',
        },
      },
      required: [],
    },
  },
];

async function ejecutarHerramienta(nombre, input, canalId) {
  switch (nombre) {
    case 'ver_horario':
      return verHorario(input || {}, canalId);
    default:
      // El núcleo serializa esto como tool_result: el modelo lo lee y responde
      // que no tiene esa capacidad, en vez de inventarla.
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

async function verHorario({ dia }, canalId) {
  const horarios = await db.horarios.listar();
  if (!dia) {
    metricas.marcarHito(canalId, 'consulta_resuelta');
    return { horarios };
  }

  const clave = String(dia).trim().toLowerCase();
  const encontrado = horarios.find((h) => h.dia === clave);
  if (!encontrado) {
    // "No tengo ese dato" es un resultado de negocio, no un error: el panel lo
    // reporta como tasa de "no sé" y ahí se ve qué falta cargar. Un agente que
    // dice mucho que no sabe está funcionando bien y sirviendo mal.
    metricas.marcarHito(canalId, 'sin_dato');
    return {
      sin_match_exacto: true,
      mensaje: `No tengo horario cargado para "${dia}".`,
      alternativas: horarios.slice(0, 2),
    };
  }
  metricas.marcarHito(canalId, 'consulta_resuelta');
  return { horario: encontrado };
}

module.exports = { TOOL_DEFINITIONS, ejecutarHerramienta };
