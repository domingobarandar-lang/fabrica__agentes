// Herramientas de ejemplo — pieza de la SEMILLA, no del núcleo.
// Una sola tool de juguete, con la forma exacta que espera agent/core.js:
//   - TOOL_DEFINITIONS: array de definiciones en formato Anthropic Messages
//   - ejecutarHerramienta(nombre, input, canalId) -> objeto serializable
//
// Al personalizar un cliente, este archivo se REESCRIBE entero. Es el producto.
//
// Dos reglas del núcleo que conviene respetar al escribir tools reales:
//   1. La validación de negocio va DENTRO de la tool, no en el prompt. El
//      modelo puede alucinar; la tool no.
//   2. Toda tool que devuelve listas lleva tope duro de resultados y un campo
//      `hay_mas` cuando hay más, para que el agente pida afinar el filtro.

const { db } = require('../database/supabase');

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
      return verHorario(input || {});
    default:
      // El núcleo serializa esto como tool_result: el modelo lo lee y responde
      // que no tiene esa capacidad, en vez de inventarla.
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

async function verHorario({ dia }) {
  const horarios = await db.horarios.listar();
  if (!dia) return { horarios };

  const clave = String(dia).trim().toLowerCase();
  const encontrado = horarios.find((h) => h.dia === clave);
  if (!encontrado) {
    return {
      sin_match_exacto: true,
      mensaje: `No tengo horario cargado para "${dia}".`,
      alternativas: horarios.slice(0, 2),
    };
  }
  return { horario: encontrado };
}

module.exports = { TOOL_DEFINITIONS, ejecutarHerramienta };
