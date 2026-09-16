// Conocimiento del negocio, por carpetas. (A-03 del plan)
//
// EL PROBLEMA QUE RESUELVE: todo lo que el negocio "sabe" —formas de pago, cómo
// llegar, política de cambios, qué incluye cada plan— termina pegado dentro del
// prompt de sistema. Eso tiene tres costos que se pagan siempre:
//   1. Se paga en tokens EN CADA TURNO, aunque nadie pregunte por eso.
//   2. El prompt crece hasta que el modelo deja de respetar las reglas duras,
//      que quedan sepultadas entre párrafos de catálogo.
//   3. Actualizar un dato obliga a editar código y volver a desplegar.
//
// LA FORMA: el agente recibe en el prompt SOLO el índice (una línea por tema,
// ~20 líneas en total) y una herramienta para traer el contenido del tema que
// haga falta, cuando haga falta. El corpus vive en archivos de texto dentro de
// `conocimiento/`, que son producto del cliente: se editan sin tocar una línea
// de código y sin que el núcleo se entere.
//
//   conocimiento/
//     _indice.json          ← intención → archivo + descripción + keywords
//     formas-de-pago.md
//     como-llegar.md
//
// POR QUÉ LA TOOL LA INYECTA EL NÚCLEO Y NO agent/tools.js: por la misma razón
// que el guarda de silencio no vive en cada canal. Si dependiera de que cada
// proyecto se acuerde de declararla, el día que alguien reescriba tools.js el
// agente se queda con el índice en el prompt y sin forma de cargar nada — y eso
// se ve como "el bot dice que no tiene el dato", que es indistinguible de un
// negocio que efectivamente no lo tiene.
//
// TOPE DURO DE 800 PALABRAS POR ARCHIVO. No es cosmético: un archivo de 3.000
// palabras se lleva el turno completo, tapa el resto del contexto y devuelve una
// respuesta peor que no tener nada. Cuando un tema no cabe, la respuesta correcta
// es partirlo en dos intenciones, no subir el tope. En ejecución el texto se
// RECORTA (nunca romper una respuesta al cliente) y `npm run validar` lo marca
// como ERROR antes de que llegue a producción.
//
// FALLA ABIERTO, a diferencia de agente.config.json. Un índice ilegible NO tumba
// al agente: se registra un error ruidoso, la herramienta no se ofrece y el bot
// sigue atendiendo — dirá "no tengo ese dato", que es cierto. Al revés (caerse
// entero) dejaría sin atención a todos los que escriben por cualquier otra cosa.
// La asimetría con config.js es deliberada: arrancar con una CONFIGURACIÓN que
// nadie decidió es atender mal sin saberlo; arrancar sin conocimiento es atender
// menos, y se nota.

const fs   = require('fs');
const path = require('path');

const config = require('../config');

const ARCHIVO_INDICE = '_indice.json';
const NOMBRE_TOOL    = 'cargar_conocimiento';

// Este archivo se sincroniza a `agent/`, así que la raíz del proyecto es el
// directorio de arriba. Se prueba también contra el cwd para que un script
// lanzado desde otra carpeta encuentre igual la carpeta de conocimiento.
const RAICES = [path.resolve(__dirname, '..'), process.cwd()];

let cache = null;          // { activo, carpeta, temas, errores, avisos }
let avisoDado = false;     // el error del índice roto se grita una vez, no por turno

function carpetaConfigurada() {
  return config.valor('conocimiento.carpeta') || 'conocimiento';
}

function topePalabras() {
  return Math.max(1, config.valor('conocimiento.tope_palabras'));
}

function contarPalabras(texto) {
  const limpio = String(texto || '').trim();
  return limpio ? limpio.split(/\s+/).length : 0;
}

// ─── Lectura del índice ──────────────────────────────────────────────────────

function leer() {
  if (cache) return cache;

  const nombre  = carpetaConfigurada();
  const carpeta = RAICES.map((r) => path.join(r, nombre)).find((c) => fs.existsSync(c)) || null;

  // Sin carpeta no hay nada que hacer, y NO es un error: la mayoría de los
  // agentes arrancan sin conocimiento y lo suman después.
  if (!carpeta || !config.valor('conocimiento.activo')) {
    cache = { activo: false, carpeta, temas: [], errores: [], avisos: [] };
    return cache;
  }

  const rutaIndice = path.join(carpeta, ARCHIVO_INDICE);
  const { temas, errores, avisos } = analizar(carpeta, rutaIndice);

  if (errores.length && !avisoDado) {
    avisoDado = true;
    console.error(
      `[Conocimiento] ${rutaIndice} tiene ${errores.length} problema(s); ` +
      'el agente sigue atendiendo SIN esos temas:\n' +
      errores.map((e) => `  - ${e}`).join('\n')
    );
  }

  cache = { activo: temas.length > 0, carpeta, temas, errores, avisos };
  return cache;
}

/**
 * Lee y valida el índice contra el disco. Lo usan la carga en runtime y
 * `npm run validar`, que es lo que hace que el validador no mienta: revisa
 * exactamente lo mismo que el agente va a ejecutar.
 */
function analizar(carpeta, rutaIndice) {
  const errores = [];
  const avisos  = [];

  if (!fs.existsSync(rutaIndice)) {
    errores.push(`falta ${ARCHIVO_INDICE} en ${carpeta}: sin índice, los archivos de conocimiento no los ve nadie`);
    return { temas: [], errores, avisos };
  }

  let crudo;
  try {
    crudo = JSON.parse(fs.readFileSync(rutaIndice, 'utf8'));
  } catch (error) {
    errores.push(`${ARCHIVO_INDICE} no es JSON válido: ${error.message}`);
    return { temas: [], errores, avisos };
  }

  // Marca de la semilla. Un proyecto nuevo nace con el conocimiento del negocio
  // de ejemplo —una dirección y unas formas de pago que suenan reales y no lo
  // son—, y el bot las afirmaría con toda seguridad. Se avisa hasta que alguien
  // borre esta línea del índice, que es el gesto de "ya lo revisé".
  const semilla = crudo?._semilla === true;

  const lista = Array.isArray(crudo?.temas) ? crudo.temas : null;
  if (!lista) {
    errores.push(`${ARCHIVO_INDICE} debe tener una lista "temas": [{ intencion, archivo, descripcion }]`);
    return { temas: [], errores, avisos };
  }

  const tope   = topePalabras();
  const vistas = new Set();
  const temas  = [];

  for (const [i, t] of lista.entries()) {
    const donde = `tema #${i + 1}${t?.intencion ? ` ("${t.intencion}")` : ''}`;

    if (!t?.intencion || !/^[a-z][a-z0-9_]*$/.test(t.intencion)) {
      errores.push(`${donde}: "intencion" debe ser minúsculas, números y guión bajo (es lo que el modelo escribe para pedirlo)`);
      continue;
    }
    if (vistas.has(t.intencion)) {
      errores.push(`${donde}: la intención "${t.intencion}" está repetida — el modelo pediría una y recibiría la otra`);
      continue;
    }
    if (!t.descripcion || String(t.descripcion).trim().length < 10) {
      errores.push(`${donde}: falta "descripcion". Es lo ÚNICO que el modelo lee para decidir si carga este tema`);
      continue;
    }
    if (!t.archivo || typeof t.archivo !== 'string') {
      errores.push(`${donde}: falta "archivo"`);
      continue;
    }

    // El archivo nunca puede salirse de la carpeta. La intención la elige el
    // MODELO, así que su nombre es entrada no confiable; el path se resuelve y
    // se comprueba, no se confía en que el JSON esté bien escrito.
    const ruta = path.resolve(carpeta, t.archivo);
    if (ruta !== path.join(carpeta, t.archivo) || !ruta.startsWith(carpeta + path.sep)) {
      errores.push(`${donde}: "archivo" apunta fuera de ${path.basename(carpeta)}/ ("${t.archivo}")`);
      continue;
    }
    if (!fs.existsSync(ruta)) {
      errores.push(`${donde}: el archivo "${t.archivo}" no existe — el agente ofrecería el tema y no podría cargarlo`);
      continue;
    }

    const contenido = fs.readFileSync(ruta, 'utf8');
    const palabras  = contarPalabras(contenido);
    if (palabras > tope) {
      errores.push(
        `${donde}: "${t.archivo}" tiene ${palabras} palabras y el tope es ${tope}. ` +
        'Pártelo en dos intenciones; subir el tope empeora la respuesta en vez de mejorarla'
      );
    }
    if (!palabras) avisos.push(`${donde}: "${t.archivo}" está vacío`);

    vistas.add(t.intencion);
    temas.push({
      intencion: t.intencion,
      archivo: t.archivo,
      descripcion: String(t.descripcion).trim(),
      keywords: Array.isArray(t.keywords) ? t.keywords.map(String) : [],
      ruta,
      palabras,
      contenido,
    });
  }

  if (!temas.length && !errores.length) {
    avisos.push(`${ARCHIVO_INDICE} no declara ningún tema`);
  }
  if (semilla && temas.length) {
    avisos.push(
      'los temas siguen siendo los de la SEMILLA (dirección y formas de pago de un negocio ' +
      'inventado). Reemplázalos por los del cliente y borra "_semilla": true del índice — ' +
      'un bot que afirma una dirección falsa con total seguridad es peor que uno que no sabe'
    );
  }
  return { temas, errores, avisos };
}

/** Vacía la caché. Para los tests, el validador y quien recargue en caliente. */
function _recargar() {
  cache = null;
  avisoDado = false;
}

// ─── Lo que ve el modelo ─────────────────────────────────────────────────────

/** Los temas cargados, sin el contenido. */
function temas() {
  return leer().temas.map(({ contenido, ruta, ...resto }) => resto);
}

const hay = () => leer().temas.length > 0;

/**
 * Los temas que ve quien está atendiendo. `intenciones` la pasa agent/flujo.js
 * cuando el agente en curso declara un subconjunto; `null` (el default y el
 * caso de un agente único) son todos.
 */
function visibles(intenciones) {
  const { temas: lista } = leer();
  if (!Array.isArray(intenciones)) return lista;
  const permitidas = new Set(intenciones);
  return lista.filter((t) => permitidas.has(t.intencion));
}

/**
 * Definición de la herramienta, o [] si este agente no tiene conocimiento.
 * @param {object[]} [existentes] TOOL_DEFINITIONS del cliente, para no chocar
 * @param {string[]|null} [intenciones] subconjunto visible; null = todas
 */
function definiciones(existentes = [], intenciones = null) {
  const lista = visibles(intenciones);
  if (!lista.length) return [];

  // Un cliente que ya definió su propia `cargar_conocimiento` gana: mandar dos
  // tools con el mismo nombre al proveedor es un 400 en producción, y elegir
  // por él sería peor que avisar.
  if (existentes.some((t) => t?.name === NOMBRE_TOOL)) {
    if (!avisoDado) {
      avisoDado = true;
      console.warn(`[Conocimiento] agent/tools.js ya define "${NOMBRE_TOOL}": el núcleo no inyecta la suya.`);
    }
    return [];
  }

  return [{
    name: NOMBRE_TOOL,
    description:
      'Trae el texto completo de UNO de los temas del negocio listados en el prompt. ' +
      'Ese contenido NO está en tu contexto hasta que la llames: si la consulta cae en ' +
      'alguno de esos temas, llámala ANTES de responder y responde solo con lo que devuelva.',
    input_schema: {
      type: 'object',
      properties: {
        intencion: {
          type: 'string',
          enum: lista.map((t) => t.intencion),
          description: 'Identificador exacto del tema, tal como aparece en el índice del prompt.',
        },
      },
      required: ['intencion'],
    },
  }];
}

const esTool = (nombre) => nombre === NOMBRE_TOOL;

/**
 * Bloque que se le anexa al prompt de sistema: SOLO el índice, nunca el corpus.
 * Lo agrega el núcleo en agent/core.js para que un cliente que reescriba
 * prompts.js —cosa que hacen todos— no se quede sin él.
 */
function bloqueIndice(intenciones = null) {
  const lista = visibles(intenciones);
  if (!lista.length) return '';

  const filas = lista.map((t) => {
    const claves = t.keywords.length ? ` (${t.keywords.join(', ')})` : '';
    return `- ${t.intencion}: ${t.descripcion}${claves}`;
  });

  return [
    '',
    'CONOCIMIENTO DEL NEGOCIO (no está en este prompt: se carga cuando lo necesitas)',
    ...filas,
    '',
    `Si la consulta cae en uno de esos temas, llama a ${NOMBRE_TOOL} con esa intención ANTES`,
    'de responder: hasta que la llames no tienes el contenido. Si el tema no está en la',
    'lista, no lo inventes: dilo y ofrece averiguarlo.',
  ].join('\n');
}

/** Prompt del cliente + índice. Si no hay conocimiento, devuelve el prompt tal cual. */
function anexarIndice(prompt, intenciones = null) {
  const bloque = bloqueIndice(intenciones);
  return bloque ? `${prompt}\n${bloque}` : prompt;
}

// ─── Ejecución de la herramienta ─────────────────────────────────────────────

/**
 * @param {{ intencion?: string }} input lo que pidió el modelo
 * @param {string[]|null} [intenciones] subconjunto visible para quien atiende.
 *        Se comprueba también acá, y no solo en el enum del esquema, por lo
 *        mismo de siempre: lo que el modelo escribe es entrada no confiable.
 * @returns {object} resultado serializable para el tool_result
 */
function ejecutar(input = {}, intenciones = null) {
  const lista = visibles(intenciones);
  const pedida = String(input?.intencion || '').trim();
  const tema = lista.find((t) => t.intencion === pedida);

  // El modelo puede alucinar una intención. Devolver la lista real en el error
  // es lo que hace que se corrija solo en la ronda siguiente en vez de inventar.
  if (!tema) {
    return {
      error: `No tengo un tema llamado "${pedida}".`,
      temas_disponibles: lista.map((t) => t.intencion),
    };
  }

  const tope = topePalabras();
  let contenido = tema.contenido.trim();
  let truncado = false;

  if (tema.palabras > tope) {
    // Recortar y no fallar: una métrica o un tope nunca pueden romper una
    // respuesta al cliente. El grito va al log y al validador.
    contenido = contenido.split(/\s+/).slice(0, tope).join(' ') +
      `\n\n[…texto recortado: este tema tiene ${tema.palabras} palabras y el tope es ${tope}]`;
    truncado = true;
    console.warn(
      `[Conocimiento] "${tema.intencion}" (${tema.archivo}) supera el tope de ${tope} palabras ` +
      `(${tema.palabras}): se entregó recortado. Pártelo en dos intenciones.`
    );
  }

  return {
    intencion: tema.intencion,
    descripcion: tema.descripcion,
    contenido,
    palabras: Math.min(tema.palabras, tope),
    truncado,
  };
}

// ─── Para el arnés de evals ──────────────────────────────────────────────────

/**
 * Una línea larga y distintiva de cada tema. La usa el invariante
 * `conocimiento_fuera_del_prompt` para detectar el corpus pegado en el prompt
 * de sistema, que es exactamente lo que alguien hace cuando el bot se equivoca
 * ("se lo pongo en el prompt y listo") y multiplica el costo de cada turno.
 */
function muestrasDelCorpus() {
  return leer().temas
    .map((t) => {
      const linea = t.contenido
        .split('\n')
        .map((l) => l.replace(/^[#\-*>\s]+/, '').trim())
        .filter((l) => l.length >= 40)
        .sort((a, b) => b.length - a.length)[0];
      return linea ? { intencion: t.intencion, linea } : null;
    })
    .filter(Boolean);
}

// ─── Para el validador ───────────────────────────────────────────────────────

/** @returns {{ errores, avisos, temas, carpeta, intenciones }} */
function revisar() {
  _recargar();
  const estado = leer();
  return {
    errores: estado.errores,
    avisos: estado.avisos,
    temas: estado.temas.length,
    carpeta: estado.carpeta,
    // Para que el validador pueda cruzar `flujo.agentes[].conocimiento` contra
    // los temas que existen de verdad.
    intenciones: estado.temas.map((t) => t.intencion),
  };
}

module.exports = {
  ARCHIVO_INDICE,
  NOMBRE_TOOL,
  hay,
  temas,
  visibles,
  definiciones,
  esTool,
  ejecutar,
  bloqueIndice,
  anexarIndice,
  muestrasDelCorpus,
  revisar,
  _recargar,
};
