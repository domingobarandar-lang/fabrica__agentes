// Prompt de ejemplo — pieza de la SEMILLA, no del núcleo.
// Existe para dos cosas: que `npm run humo` pueda encender el núcleo sin
// depender de ningún cliente, y que un proyecto recién creado con
// nuevo-proyecto.ps1 arranque y responda desde el minuto uno.
//
// LA IDENTIDAD SALE DE agente.config.json (`identidad.*`), no de una cadena
// escrita acá: cambiarle el nombre, el tono o los límites al agente es lo que
// más se pide en una marcha blanca, y hacerlo tocando código significa que cada
// ajuste pasa por un programador. Lo que NO sale de la config es el resto: las
// reglas duras y el formato son criterio de la fábrica, y un cliente no debería
// poder apagarlas editando un JSON.
//
// Al personalizar un cliente, este archivo se REESCRIBE entero. Es producto,
// no infraestructura.

const config = require('../config');

/** Prompt final, con la identidad de la config y la fecha actual inyectadas. */
function buildSystemPrompt() {
  const nombre = config.valor('identidad.nombre_agente') || 'el asistente virtual';
  const rol    = config.valor('identidad.rol') || 'atender a los clientes del negocio';
  const tono   = config.valor('identidad.tono') || 'español chileno, cercano y breve';
  const noHacer = config.valor('identidad.no_hacer');
  const negocio = config.valor('cliente.nombre');
  const zona    = config.valor('cliente.zona_horaria');

  const ahora = new Date().toLocaleString('es-CL', {
    timeZone: zona,
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const limites = noHacer.length
    ? `\nLO QUE NO HACES NUNCA:\n${noHacer.map((l) => `- ${l}`).join('\n')}\n`
    : '';

  return `Eres ${nombre}, de ${negocio}. Tu trabajo es ${rol}. Hablas ${tono}.

LO QUE HACES (nada más que esto):
1. Saludar y explicar en una línea qué puedes hacer.
2. Consultar el horario de atención (ver_horario).
3. Responder los temas que aparecen más abajo en CONOCIMIENTO DEL NEGOCIO,
   cargándolos primero. Ese bloque lo agrega el núcleo solo, con el índice de
   la carpeta conocimiento/: NO copies el contenido de esos archivos acá.
${limites}
REGLA DURA: solo puedes mencionar datos que devolvió una herramienta en este
turno. Si no lo devolvió una herramienta, no existe. Si no tienes el dato,
dilo y ofrece averiguarlo. Nunca inventes horarios, precios ni direcciones.

FORMATO:
- Respuestas cortas (2 a 4 líneas), máximo un emoji por mensaje.
- Sin Markdown ni asteriscos: es mensajería, no un documento.

FECHA Y HORA ACTUAL: ${ahora}.`;
}

module.exports = { buildSystemPrompt };
