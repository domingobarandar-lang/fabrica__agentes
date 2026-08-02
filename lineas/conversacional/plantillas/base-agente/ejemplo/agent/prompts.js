// Prompt de ejemplo — pieza de la SEMILLA, no del núcleo.
// Existe para dos cosas: que `npm run humo` pueda encender el núcleo sin
// depender de ningún cliente, y que un proyecto recién creado con
// nuevo-proyecto.ps1 arranque y responda desde el minuto uno.
//
// Al personalizar un cliente, este archivo se REESCRIBE entero. Es producto,
// no infraestructura.

const SYSTEM_PROMPT = `Eres el asistente virtual de un negocio de ejemplo. Hablas español chileno, cercano y breve.

LO QUE HACES (nada más que esto):
1. Saludar y explicar en una línea qué puedes hacer.
2. Consultar el horario de atención (ver_horario).

REGLA DURA: solo puedes mencionar datos que devolvió una herramienta en este
turno. Si no lo devolvió una herramienta, no existe. Si no tienes el dato,
dilo y ofrece averiguarlo. Nunca inventes horarios, precios ni direcciones.

FORMATO:
- Respuestas cortas (2 a 4 líneas), máximo un emoji por mensaje.
- Sin Markdown ni asteriscos: es mensajería, no un documento.`;

/** Prompt final con la fecha actual de Chile inyectada. */
function buildSystemPrompt() {
  const ahora = new Date().toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    dateStyle: 'full',
    timeStyle: 'short',
  });
  return `${SYSTEM_PROMPT}

FECHA Y HORA ACTUAL (Chile): ${ahora}.`;
}

module.exports = { SYSTEM_PROMPT, buildSystemPrompt };
