// Cómo ESCRIBE el agente. El contrato de forma del chat.
//
// POR QUÉ ESTÁ EN EL NÚCLEO Y NO EN EL PROMPT DEL CLIENTE. Hasta la 1.6.0 las
// reglas de forma —mensajes cortos, sin Markdown, un emoji— vivían en el bloque
// FORMATO de `agent/prompts.js` de la semilla. Y `prompts.js` es producto: al
// personalizar un cliente SE REESCRIBE ENTERO. O sea que lo que más decide si un
// agente se siente humano o robótico era justo lo primero que se borraba, y
// quedaba dependiendo de si quien escribió el prompt ese día se acordó de
// copiarlo. Nadie se entera: el bot responde bien, solo que escribe como
// informe. Es el mismo razonamiento por el que el índice del conocimiento lo
// anexa el núcleo y no el prompt (ver el comentario de `armarParams` en core.js).
//
// LAS DOS MITADES, Y POR QUÉ VIVEN EN LUGARES DISTINTOS:
//   anexar()        pide el estilo, en el prompt.   → hace que salga bien.
//   prepararEnvio() lo hace cumplir, en el envío.   → evita que salga mal.
//
// La segunda corre en el ENVÍO y no en core.js, y eso es deliberado: el arnés de
// evals llama a `processMessage`, así que una limpieza hecha antes de devolver
// el texto dejaría a los invariantes viendo la respuesta ya limpia — un prompt
// roto pasaría verde para siempre y la limpieza taparía el problema en vez de
// denunciarlo. Con la limpieza en el envío, QA ve el texto CRUDO y se pone rojo
// (donde alguien mira) y el cliente final ve el texto limpio (donde corre). Es
// la misma regla de la casa que el tope de 40 líneas por rol.
//
// LO QUE ESTE MÓDULO NO DECIDE: qué dice el agente. Eso es del cliente (prompt,
// tools, conocimiento). Acá solo está la forma, que no cambia con el rubro: una
// inmobiliaria y una clínica dicen cosas distintas, pero las dos se leen mal
// cuando mandan un muro de texto con viñetas y tres preguntas juntas.

const config = require('../config');
const { dividirMensaje } = require('../lib/texto');

const activo         = () => config.valor('estilo.activo');
const maxCaracteres  = () => config.valor('estilo.max_caracteres');
const maxBurbujas    = () => config.valor('estilo.max_burbujas');
const maxEmojis      = () => config.valor('estilo.max_emojis');
const unaPregunta    = () => config.valor('estilo.una_pregunta');

// ─── Lo que en un chat se lee como documento ────────────────────────────────
// UNA SOLA DEFINICIÓN, la comparten el limpiador y el invariante de evals
// (`evals/reglas.js` los importa de acá). Si el que detecta y el que limpia
// tuvieran cada uno su propia lista, el día que se agregue una marca a uno y no
// al otro QA quedaría verde sobre algo que igual se envía sucio.
const MARCAS_DE_DOCUMENTO = [
  { id: 'negritas', re: /(\*\*|__)(?=\S)[\s\S]+?\1/, como: '**negritas** de Markdown' },
  { id: 'titulos',  re: /^[ \t]{0,3}#{1,6}[ \t]+\S/m, como: '## títulos' },
  { id: 'enlaces',  re: /\[[^\]\n]+\]\(\s*https?:\/\/[^)\s]+\s*\)/, como: '[texto](enlace) de Markdown' },
];

// Una viñeta suelta la escribe una persona ("- el jueves a las 10"); tres ya son
// un informe. El tope está acá y no en la config porque no es preferencia del
// cliente: es dónde deja de parecer un mensaje.
const TOPE_VINETAS = 3;
const RE_VINETA = /^[ \t]{0,3}[-*+][ \t]+\S/gm;

// Muletillas de máquina. No están mal escritas — están mal DICHAS: el cliente
// escribió por WhatsApp esperando que le contesten, y esto le recuerda que le
// contestó un sistema. Ninguna prueba funcional las ve, porque la respuesta es
// correcta.
const MULETILLAS_DE_BOT = [
  /\bcomo (asistente|modelo) (virtual|de lenguaje|de ia)\b/i,
  /\bsoy (un|una) (bot|ia|inteligencia artificial|modelo de lenguaje)\b/i,
  /\bno (estoy programad[oa]|tengo la capacidad|fui entrenad[oa])\b/i,
  /\b(seg[uú]n|consultando) (mi|nuestra) base de datos\b/i,
  /\b(la|en base a la) informaci[oó]n proporcionada\b/i,
  /\bestimad[oa] (usuari[oa]|client[ea])\b/i,
  /\bprocesando (tu|su) (solicitud|petici[oó]n)\b/i,
];

// Saludo al abrir. Solo importa a partir del segundo turno: saludar de nuevo es
// la señal más barata de que el bot no recuerda que ya venían hablando.
const RE_SALUDO_INICIAL = /^[\s¡"'*]*(hola|buenas|buen[oa]s? (d[ií]as|tardes|noches)|qu[eé] tal|hey|saludos)\b/i;

const RE_URL = /https?:\/\/\S+/g;
const RE_EMOJI = /\p{Extended_Pictographic}/gu;

/** Qué marcas de documento trae este texto. Vacío = se lee como un mensaje. */
function marcasDeDocumento(texto) {
  const t = String(texto ?? '');
  if (!t) return [];
  const halladas = MARCAS_DE_DOCUMENTO.filter((m) => m.re.test(t)).map((m) => m.como);
  const vinetas = (t.match(RE_VINETA) || []).length;
  if (vinetas >= TOPE_VINETAS) halladas.push(`una lista de ${vinetas} viñetas`);
  return halladas;
}

/** Cuántas preguntas hace el texto (las URL no cuentan: traen "?" y no preguntan). */
function preguntas(texto) {
  return (String(texto ?? '').replace(RE_URL, ' ').match(/\?/g) || []).length;
}

/** Cuántos emojis trae. */
function emojis(texto) {
  return (String(texto ?? '').match(RE_EMOJI) || []).length;
}

/** La muletilla de máquina que trae, o null. */
function muletillaDeBot(texto) {
  const t = String(texto ?? '');
  const re = MULETILLAS_DE_BOT.find((r) => r.test(t));
  return re ? t.match(re)[0] : null;
}

/** ¿Abre saludando? */
function abreSaludando(texto) {
  return RE_SALUDO_INICIAL.test(String(texto ?? ''));
}

// ─── La mitad del prompt ─────────────────────────────────────────────────────

/**
 * El bloque que se le pide al modelo. Corto a propósito: compite por la
 * atención con las reglas duras del negocio, y una lista de veinte reglas de
 * estilo se obedece peor que seis.
 */
function bloque() {
  if (!activo()) return '';

  const lineas = [
    '',
    'CÓMO ESCRIBES (regla de la casa, no la cambia el rubro)',
    `- Es un chat, no un correo: hasta ${maxCaracteres()} caracteres en total.`,
    '- Sin Markdown: nada de **negritas**, ## títulos ni listas con guiones. En WhatsApp se ven como basura.',
  ];

  if (unaPregunta()) {
    lineas.push(
      '- Una sola pregunta por mensaje. Dos juntas se leen como formulario y la gente contesta una sola.'
    );
  }
  if (maxBurbujas() > 1) {
    lineas.push(
      '- Si tienes dos cosas que decir, sepáralas con una línea en blanco: se envían como ' +
      'dos mensajes cortos seguidos, que es como escribe una persona.'
    );
  }
  lineas.push(
    maxEmojis() > 0
      ? `- Hasta ${maxEmojis()} emoji por mensaje.`
      : '- Sin emojis.',
    '- Saluda solo la primera vez. Si ya vienen conversando, sigue la conversación.',
    '- No hables de ti como sistema ("según mi base de datos", "no estoy programado para", ' +
    '"la información proporcionada"): contesta como quien atiende el mostrador.'
  );
  return lineas.join('\n');
}

/** Prompt + el contrato de forma. Con el estilo apagado, lo devuelve tal cual. */
function anexar(prompt) {
  const b = bloque();
  return b ? `${prompt}\n${b}` : prompt;
}

// ─── La mitad del envío ──────────────────────────────────────────────────────

/**
 * Saca el formato de documento que el canal no renderiza (o renderiza feo).
 * NO toca el contenido: no recorta, no reescribe, no quita emojis ni preguntas
 * de más. Esas se piden en el prompt y se denuncian en QA — un limpiador que
 * "arregle" el fondo escondería para siempre un prompt mal escrito.
 *
 * @returns {{ texto: string, limpiado: string[] }}
 */
function aplicar(texto) {
  const original = String(texto ?? '');
  const limpiado = marcasDeDocumento(original);

  let t = original
    .replace(/(\*\*|__)(?=\S)([\s\S]+?)\1/g, '$2')
    .replace(/\[([^\]\n]+)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/g, '$1: $2')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(RE_VINETA, (m) => m.replace(/[-*+]/, '•'))
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { texto: t, limpiado };
}

/**
 * Parte la respuesta en los mensajes seguidos que va a ver la persona.
 *
 * Corta SOLO en línea en blanco: es el separador que el prompt pide y el único
 * que no puede equivocarse. Cortar por frases partiría "Dr. Pérez" en dos
 * mensajes, que se ve peor que el muro de texto que vino a arreglar.
 */
function burbujas(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return [];
  const tope = maxBurbujas();
  if (tope <= 1) return [t];

  const partes = t.split(/\n[ \t]*\n/).map((p) => p.trim()).filter(Boolean);
  if (partes.length <= tope) return partes;
  // El excedente se pega al último: mandar seis mensajes seguidos es peor que
  // un párrafo largo, y perder el final sería perder la pregunta.
  return [...partes.slice(0, tope - 1), partes.slice(tope - 1).join('\n\n')];
}

/**
 * Punto único del envío: de lo que devolvió el agente a los mensajes que salen.
 * Lo usan telegram/enviar.js y whatsapp/sender.js, que son los dos caminos por
 * los que un texto llega a una persona.
 *
 * DEVUELVE ARRAY VACÍO ANTE null. El guarda del silencio del handoff sigue
 * siendo el primero en cada canal; este es la segunda línea de defensa, igual
 * que en dividirMensaje.
 *
 * @param {string|null|undefined} texto
 * @returns {string[]} mensajes a enviar, en orden
 */
function prepararEnvio(texto) {
  if (texto == null) return [];
  if (!activo()) return dividirMensaje(texto);

  const { texto: limpio, limpiado } = aplicar(texto);
  if (limpiado.length) {
    // Aviso en el log donde corre: se envió bien, pero el prompt de este cliente
    // está pidiendo un informe y en QA eso ya debería estar en rojo.
    console.warn(
      `[Estilo] la respuesta traía ${limpiado.join(' y ')}; se limpió antes de enviar. ` +
      'Revisa el prompt del cliente: es un chat, no un documento.'
    );
  }
  return burbujas(limpio).flatMap((b) => dividirMensaje(b));
}

module.exports = {
  MARCAS_DE_DOCUMENTO,
  MULETILLAS_DE_BOT,
  TOPE_VINETAS,
  activo,
  maxCaracteres,
  maxBurbujas,
  maxEmojis,
  unaPregunta,
  marcasDeDocumento,
  preguntas,
  emojis,
  muletillaDeBot,
  abreSaludando,
  bloque,
  anexar,
  aplicar,
  burbujas,
  prepararEnvio,
};
