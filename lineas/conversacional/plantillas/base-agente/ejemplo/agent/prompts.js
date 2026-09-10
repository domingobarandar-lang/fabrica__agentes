// Prompt de ejemplo — pieza de la SEMILLA, no del núcleo.
// Existe para dos cosas: que `npm run humo` pueda encender el núcleo sin
// depender de ningún cliente, y que un proyecto recién creado con
// nuevo-proyecto.ps1 arranque y responda desde el minuto uno.
//
// LA IDENTIDAD SALE DE agente.config.json (`identidad.*`), no de una cadena
// escrita acá: cambiarle el nombre, el tono o los límites al agente es lo que
// más se pide en una marcha blanca, y hacerlo tocando código significa que cada
// ajuste pasa por un programador.
//
// LA FORMA NO ESTÁ ACÁ, Y ESO ES A PROPÓSITO (desde la 1.7.0). Este archivo
// tenía un bloque FORMATO —mensajes cortos, sin Markdown, un emoji— y era el
// lugar equivocado: se reescribe entero en cada cliente, así que lo que más
// decide si el agente se siente humano o robótico era justo lo primero que se
// borraba. Ahora lo anexa el núcleo (agent/estilo.js), se configura en
// `estilo.*` y lo verifican cinco invariantes del arnés. Al reescribir este
// archivo NO hay que acordarse de copiar nada de eso.
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

FECHA Y HORA ACTUAL: ${ahora}.`;
}

module.exports = { buildSystemPrompt };
