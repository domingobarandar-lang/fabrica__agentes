// Superficie de configuración del agente: `agente.config.json`.
//
// POR QUÉ EXISTE: hasta el paso 3 la configuración del agente vivía repartida en
// variables de entorno sueltas (BUFFER_MS, HANDOFF_TIMEOUT_MIN, TELEGRAM_TOKEN…).
// Eso tiene tres problemas que se pagan en un cliente real: no se puede revisar
// de un vistazo qué hace este agente, no queda versionado en git (el `.env` no
// se sube), y un typo en el nombre de una variable no falla — simplemente no
// hace nada, en silencio. Un archivo declarativo, versionado y validado arregla
// los tres.
//
// PRECEDENCIA, y es deliberada:
//
//     variable de entorno  >  agente.config.json  >  default del núcleo
//
// El entorno gana porque es la palanca de emergencia: cambiar una variable en
// Railway toma efecto sin redeploy, y el arnés de evals necesita poder mover la
// ventana del buffer entre escenarios sin reescribir archivos. Pero un `.env`
// no se versiona ni se revisa, así que pisar la config desde ahí es peligroso
// SI ES INVISIBLE: por eso `scripts/validar-config.js` denuncia toda variable
// del `.env` que esté tapando un valor declarado. La palanca sigue, deja de ser
// silenciosa. Por la misma razón `.env.example` ya no trae las variables de
// comportamiento descomentadas: copiarlo tal cual habría tapado el archivo
// entero y la config no habría servido de nada.
//
// QUÉ NO VA ACÁ, NUNCA: el proveedor de LLM ni ninguna credencial. Eso vive en
// `.env` (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`), que es lo que lee
// `agent/llm.js`. Una sola fuente de verdad, y los secretos fuera de git.
//
// CÓMO SE LEE DESDE EL NÚCLEO:
//   const config = require('../config');
//   const ventanaMs = () => config.valor('limites.buffer_ms');
// Siempre como función, nunca como `const` de arriba: la config se resuelve en
// cada llamada. Cuando eran constantes de módulo, el arnés cambiaba la variable
// y el núcleo seguía con el default — dos verificaciones dieron verde por el
// motivo equivocado.

const fs   = require('fs');
const path = require('path');

const ARCHIVO = 'agente.config.json';

// Este archivo se sincroniza a la RAÍZ del proyecto (MANIFIESTO: config.js ->
// config.js), así que __dirname es la carpeta del agente. Se busca ahí primero
// y en el directorio de trabajo después, para que `node scripts/loquesea.js`
// desde otra carpeta encuentre igual el archivo.
const RUTAS_CANDIDATAS = [
  path.join(__dirname, ARCHIVO),
  path.join(process.cwd(), ARCHIVO),
];

// ─── El esquema: única definición del contrato ───────────────────────────────
// De acá salen los defaults, la validación, la lista de variables de entorno que
// pisan, y la documentación que imprime el validador. Está una sola vez a
// propósito: un esquema escrito dos veces (una en JS y otra en PowerShell) se
// desincroniza el día que alguien agrega un campo con prisa.
//
//   tipo        texto | numero | numero_o_nulo | booleano | lista | lista_objetos
//   env         variable de entorno que lo pisa (null = no se puede pisar)
//   def         default del núcleo; función (cfg) => valor si es derivado
//   requerido   si el archivo EXISTE, este campo no puede faltar
//   forma       solo para lista_objetos: el contrato de CADA elemento, con la
//               misma gramática (tipo/def/requerido/patron). Una clave que no
//               esté en `forma` es error, igual que arriba: el modo de falla que
//               este archivo mata es el del campo que no hace nada y no avisa.
const ESQUEMA = {
  'cliente.id':          { tipo: 'texto', env: null, def: 'agente', requerido: true,
                           nota: 'slug del cliente; identifica al agente en logs y métricas' },
  'cliente.nombre':      { tipo: 'texto', env: null, def: 'Agente', requerido: true,
                           nota: 'nombre del negocio, como lo diría una persona' },
  'cliente.vertical':    { tipo: 'texto', env: null, def: '',
                           nota: 'rubro (dental, inmobiliaria, retail…)' },
  'cliente.zona_horaria': { tipo: 'texto', env: 'ZONA_HORARIA', def: 'America/Santiago',
                           nota: 'zona IANA; la usan el prompt y las fechas relativas de los evals' },

  'identidad.nombre_agente': { tipo: 'texto', env: null, def: '',
                           nota: 'cómo se presenta el bot' },
  'identidad.rol':       { tipo: 'texto', env: null, def: '',
                           nota: 'qué hace, en una línea' },
  'identidad.tono':      { tipo: 'texto', env: null, def: '',
                           nota: 'cómo habla' },
  'identidad.no_hacer':  { tipo: 'lista', env: null, def: [],
                           nota: 'límites explícitos que se inyectan al prompt' },

  'canales.telegram.activo':    { tipo: 'booleano', env: null, def: false },
  // El NOMBRE de la variable, no el token. Resuelve la divergencia
  // TELEGRAM_TOKEN_CITAS vs TELEGRAM_TOKEN_INMOBILIARIA sin obligar a renombrar
  // variables en un agente que ya está en uso.
  'canales.telegram.token_env': { tipo: 'texto', env: 'TELEGRAM_TOKEN_VAR', def: 'TELEGRAM_TOKEN' },
  'canales.whatsapp.activo':    { tipo: 'booleano', env: null, def: false },
  'canales.whatsapp.token_env': { tipo: 'texto', env: null, def: 'WHATSAPP_TOKEN' },
  'canales.whatsapp.phone_id_env': { tipo: 'texto', env: null, def: 'WHATSAPP_PHONE_ID' },
  'canales.terminal.activo':    { tipo: 'booleano', env: null, def: true,
                           nota: 'chat por consola; no se despliega, sirve para probar' },

  'handoff.activo':      { tipo: 'booleano', env: 'HANDOFF_ACTIVO', def: true },
  // null = derivación DEFINITIVA. Es el default y es una decisión de negocio,
  // no técnica: ver el encabezado de agent/handoff.js antes de cambiarlo.
  'handoff.timeout_min': { tipo: 'numero_o_nulo', env: 'HANDOFF_TIMEOUT_MIN', def: null },
  'handoff.max_fallos':  { tipo: 'numero', env: 'HANDOFF_MAX_FALLOS', def: 3 },
  'handoff.inbox':       { tipo: 'texto', env: 'HANDOFF_INBOX', def: '',
                           nota: 'a quién avisar cuando se deriva' },

  'limites.historial_turnos':     { tipo: 'numero', env: 'HISTORIAL_TURNOS', def: 30 },
  'limites.max_tokens_respuesta': { tipo: 'numero', env: 'MAX_TOKENS_RESPUESTA', def: 600 },
  'limites.timeout_modelo_ms':    { tipo: 'numero', env: 'TIMEOUT_MODELO_MS', def: 25000 },
  'limites.intentos_modelo':      { tipo: 'numero', env: 'INTENTOS_MODELO', def: 3,
                           nota: 'intentos TOTALES, no adicionales' },
  // El buffer va en `limites` y no dentro de un canal (como proponía el diseño
  // original, que venía de un agente solo-WhatsApp): agent/buffer.js agrupa por
  // canalId sin mirar de qué canal viene, así que la ventana es una sola por
  // agente. Ponerla bajo `canales.whatsapp` habría dejado sin agrupación a un
  // agente de Telegram, que es justo lo que corren los clientes de hoy.
  'limites.buffer_ms':            { tipo: 'numero', env: 'BUFFER_MS', def: 6000,
                           nota: '0 lo desactiva; la ventana mide el silencio' },
  'limites.buffer_max_partes':    { tipo: 'numero', env: 'BUFFER_MAX_PARTES', def: 10 },
  'limites.buffer_excepciones':   { tipo: 'lista', env: 'BUFFER_EXCEPCIONES',
                           def: ['handoff', 'cancelacion', 'adjunto'],
                           nota: '"handoff" está forzado en código: sacarlo de acá no lo apaga' },

  // El prefijo no es cosmético: el proyecto Supabase está COMPARTIDO entre
  // agentes. Una tabla sin prefijo la comparten todos, y el modo_humano de un
  // cliente apagaría el bot de otro agente si coinciden los canal_id.
  'datos.prefijo':            { tipo: 'texto', env: null, def: '', requerido: true,
                           nota: 'prefijo de TODAS las tablas de este agente (ej: dental_citas)' },
  'datos.tabla_sesiones':     { tipo: 'texto', env: 'TABLA_SESIONES',
                           def: (c) => `${c['datos.prefijo']}_sesiones` },
  'datos.tabla_estado_canal': { tipo: 'texto', env: 'TABLA_ESTADO_CANAL',
                           def: (c) => `${c['datos.prefijo']}_estado_canal` },
  'datos.tabla_metricas':     { tipo: 'texto', env: 'TABLA_METRICAS',
                           def: (c) => `${c['datos.prefijo']}_metricas` },

  // El conocimiento del negocio vive en archivos, no en el prompt. Ver
  // agent/conocimiento.js: el agente recibe solo el índice y carga el tema que
  // haga falta con una herramienta.
  'conocimiento.activo':        { tipo: 'booleano', env: 'CONOCIMIENTO_ACTIVO', def: true,
                           nota: 'false apaga la herramienta aunque exista la carpeta' },
  'conocimiento.carpeta':       { tipo: 'texto', env: null, def: 'conocimiento',
                           nota: 'carpeta con _indice.json y los archivos de cada tema' },
  // 800 palabras es un TOPE DE CALIDAD, no de espacio: un tema más largo se come
  // el turno y devuelve una respuesta peor. Cuando no cabe, se parte en dos
  // intenciones. Subirlo es casi siempre la decisión equivocada.
  'conocimiento.tope_palabras': { tipo: 'numero', env: null, def: 800 },

  // ── El flujo: varios agentes especializados en vez de uno solo ──────────────
  // APAGADO MIENTRAS NO HAYA AGENTES DECLARADOS, y eso no es timidez: partir el
  // agente en cinco antes de que las métricas muestren que hace falta deja cinco
  // prompts que mantener en vez de uno. Sin `flujo.agentes`, agent/flujo.js
  // devuelve el mismo camino de siempre y el núcleo no cambia ni un byte del
  // prompt. Ver el encabezado de agent/flujo.js.
  'flujo.activo':  { tipo: 'booleano', env: 'FLUJO_ACTIVO', def: true,
                           nota: 'palanca de emergencia: false vuelve al agente único sin tocar el archivo' },
  'flujo.inicial': { tipo: 'texto', env: null, def: '',
                           nota: 'id del agente con el que empieza una conversación nueva; vacío = el primero de la lista' },
  // Tope de cambios de agente DENTRO de un mismo turno. Sin él, dos agentes que
  // se entregan la conversación el uno al otro consumen las 6 rondas de tool y
  // el cliente no recibe respuesta. 2 alcanza para recepción → especialista →
  // vuelta atrás; más que eso es un flujo mal diseñado, no un caso legítimo.
  'flujo.max_saltos_turno': { tipo: 'numero', env: null, def: 2 },
  'flujo.agentes': {
    tipo: 'lista_objetos', env: null, def: [],
    forma: {
      id:     { tipo: 'texto', requerido: true, patron: /^[a-z][a-z0-9_]*$/,
                nota: 'lo escribe el modelo para entregar la conversación: minúsculas, números y guión bajo' },
      titulo: { tipo: 'texto', def: '', nota: 'nombre legible; sale en el panel de métricas' },
      rol:    { tipo: 'texto', requerido: true,
                nota: 'qué hace ESTE agente y nada más. Se anexa al prompt base; tope 40 líneas' },
      // SIN DEFAULT A PROPÓSITO. Declarar qué herramientas ve cada agente es el
      // motivo entero de partir el agente: si se pudiera omitir, el descuido más
      // barato (no escribirlo) dejaría el flujo sin ninguna separación real y
      // nadie se enteraría. Lista vacía = ninguna; ["*"] = todas.
      herramientas: { tipo: 'lista', requerido: true,
                nota: 'nombres de TOOL_DEFINITIONS que este agente puede usar. [] = ninguna, ["*"] = todas' },
      // Este SÍ tiene default abierto, y la asimetría con `herramientas` es por
      // el modo de falla, no por gusto: el conocimiento ya se carga solo cuando
      // hace falta (solo viaja el índice), así que restringirlo casi no ahorra
      // nada, y olvidarlo se vería como "el bot dice que no tiene el dato" —
      // indistinguible de un negocio que de verdad no lo tiene.
      conocimiento: { tipo: 'lista', def: ['*'],
                nota: 'intenciones de conocimiento/ que este agente ve. ["*"] = todas' },
      entrega_a: { tipo: 'lista', def: [],
                nota: 'ids a los que puede pasarle la conversación. Vacío = agente terminal' },
    },
  },

  // ── Lo que ya se sabe de la persona ─────────────────────────────────────────
  // Sirve con un agente solo, pero con varios es OBLIGATORIO: la forma clásica
  // de fallar de un flujo multi-agente es que el especialista salude de nuevo y
  // vuelva a pedir el nombre que la recepción ya había tomado. El núcleo mira
  // qué datos recibieron las herramientas y se los recuerda al modelo.
  'lead.activo': { tipo: 'booleano', env: 'LEAD_ACTIVO', def: true },
  'lead.campos': {
    tipo: 'lista_objetos', env: null, def: [],
    forma: {
      campo:  { tipo: 'texto', requerido: true, patron: /^[a-z][a-z0-9_]*$/ },
      etiqueta: { tipo: 'texto', def: '', nota: 'cómo se nombra el dato en el prompt ("su teléfono")' },
      claves: { tipo: 'lista', def: [],
                nota: 'nombres de parámetro con que las tools reciben el dato; vacío = el propio campo' },
      requerido: { tipo: 'booleano', def: true,
                nota: 'false = se recuerda si aparece, pero no se lista como pendiente' },
    },
  },

  'metricas.activas':    { tipo: 'booleano', env: 'METRICAS_ACTIVAS', def: true },
  // Hitos del NEGOCIO que el panel reporta por conversación (agendó, calificó,
  // no supe). El núcleo no puede saber qué es "calificar" en cada rubro: da el
  // mecanismo (agent/metricas.js → marcarHito) y el cliente los nombra acá.
  // Declararlos importa aunque nunca ocurran: un hito que marca 0% es una señal,
  // y si el panel no lo lista, esa señal no se ve.
  'metricas.hitos':      { tipo: 'lista', env: null, def: [] },
  // Precio del proveedor de LLM, para que el panel exprese el gasto en dólares
  // además de en tokens. En 0 (default) el panel muestra tokens y dice que no
  // hay precio declarado: inventar una tabla de precios que envejece sola sería
  // mentir sobre plata.
  'metricas.precio_usd_millon_entrada': { tipo: 'numero', env: null, def: 0 },
  'metricas.precio_usd_millon_salida':  { tipo: 'numero', env: null, def: 0 },
  // El techo del plan, para que el panel avise ANTES y no el día que ya pasó.
  // Son DOS topes y no uno porque el gasto se desborda por dos caminos que no se
  // parecen: el dinero (mensual, se proyecta desde el ritmo) y la cuota del
  // proveedor (diaria, se revienta un martes puntual y no se promedia). El free
  // tier de Gemini y compañía se agota en PEDIDOS POR DÍA, así que un cliente
  // puede cruzar al tramo pagado con el costo marcando US$ 0.00 el mes entero.
  // En 0 (default) el panel no dibuja la escalera: un tope inventado avisaría a
  // la hora equivocada, que es peor que no avisar.
  'metricas.presupuesto_usd_mes': { tipo: 'numero', env: 'PRESUPUESTO_USD_MES', def: 0 },
  'metricas.tope_turnos_dia':     { tipo: 'numero', env: null, def: 0,
                           nota: 'pedidos/día del plan del proveedor; el panel lo compara con el día PICO' },
};

// Claves de primer nivel permitidas. Una clave desconocida es un ERROR y no un
// aviso: si alguien escribe "limits" en vez de "limites", su configuración
// entera no se aplica y todo sigue andando con los defaults. Ese es exactamente
// el modo de falla silencioso que este archivo vino a matar.
const RAICES = new Set([
  'cliente', 'identidad', 'canales', 'handoff', 'limites', 'datos', 'conocimiento',
  'flujo', 'lead', 'metricas',
]);

// Claves que se ignoran a propósito: espacio para notas dentro del JSON, que no
// admite comentarios.
const esNota = (clave) => clave.startsWith('_') || clave.startsWith('$');

// Prefijos intermedios válidos, derivados del propio esquema: 'cliente',
// 'canales', 'canales.telegram'… Se calculan en vez de escribirse para que
// agregar una clave al contrato no exija acordarse de otra lista.
const PREFIJOS = new Set();
for (const ruta of Object.keys(ESQUEMA)) {
  const partes = ruta.split('.');
  for (let i = 1; i < partes.length; i++) PREFIJOS.add(partes.slice(0, i).join('.'));
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

let cache = null;                 // { crudo, ruta, existe }
let avisoAusenteDado = false;     // el aviso de "sin archivo" se da una sola vez

function leerArchivo() {
  if (cache) return cache;

  const ruta = RUTAS_CANDIDATAS.find((r) => fs.existsSync(r));
  if (!ruta) {
    // Ausente NO es fatal: el núcleo tiene defaults seguros para todo lo que
    // configura acá, y tiene que poder correr solo (prueba de humo, chat local,
    // un proyecto a medio armar). Lo único que de verdad no puede quedar en un
    // default es el prefijo de las tablas — y eso falla cerrado en
    // database/nucleo-db.js, que es donde el daño sería real.
    if (!avisoAusenteDado) {
      console.warn(
        `[Config] No encontré ${ARCHIVO}: corriendo con los defaults del núcleo. ` +
        'Un proyecto de cliente SIEMPRE debe tener el suyo.'
      );
      avisoAusenteDado = true;
    }
    cache = { crudo: {}, ruta: null, existe: false };
    return cache;
  }

  let crudo;
  try {
    crudo = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (error) {
    // Presente pero ilegible = no compila. Arrancar con defaults acá sería
    // peor que caerse: el agente atendería clientes con una configuración que
    // nadie decidió.
    throw new Error(`[Config] ${ruta} no es JSON válido: ${error.message}`);
  }

  const { errores } = validar(crudo);
  if (errores.length) {
    throw new Error(
      `[Config] ${ruta} tiene ${errores.length} error(es) y no se puede usar:\n` +
      errores.map((e) => `  - ${e}`).join('\n')
    );
  }

  cache = { crudo, ruta, existe: true };
  return cache;
}

/** Vacía la caché. Para los tests y para el validador. */
function _recargar() {
  cache = null;
  avisoAusenteDado = false;
}

function bajar(objeto, ruta) {
  return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), objeto);
}

// ─── Coerción ────────────────────────────────────────────────────────────────
// Los valores del entorno llegan siempre como texto; los del JSON ya vienen
// tipados. Una sola función para los dos, así no hay dos reglas.

function convertir(def, valorCrudo) {
  const tipo = def.tipo;
  switch (tipo) {
    case 'lista_objetos': {
      const { items, errores } = normalizarLista(def, valorCrudo);
      return errores.length ? undefined : items;
    }
    case 'numero': {
      const n = Number(valorCrudo);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'numero_o_nulo': {
      if (valorCrudo === null || valorCrudo === '' || valorCrudo === 'null') return null;
      const n = Number(valorCrudo);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }
    case 'booleano': {
      if (typeof valorCrudo === 'boolean') return valorCrudo;
      const t = String(valorCrudo).trim().toLowerCase();
      if (['true', '1', 'si', 'sí'].includes(t)) return true;
      if (['false', '0', 'no'].includes(t)) return false;
      return undefined;
    }
    case 'lista': {
      if (Array.isArray(valorCrudo)) return valorCrudo.map((x) => String(x).trim()).filter(Boolean);
      if (typeof valorCrudo === 'string') {
        return valorCrudo.split(',').map((s) => s.trim()).filter(Boolean);
      }
      return undefined;
    }
    default:
      return valorCrudo == null ? undefined : String(valorCrudo);
  }
}

/**
 * Normaliza una lista de objetos contra su `forma` y devuelve los errores con
 * el índice del elemento, que es lo que hace útil el mensaje: "flujo.agentes[2]"
 * se encuentra en el archivo, "hay un agente mal escrito" no.
 * @returns {{ items: object[], errores: string[] }}
 */
function normalizarLista(def, valorCrudo) {
  const errores = [];
  if (!Array.isArray(valorCrudo)) {
    return { items: [], errores: ['debe ser una lista'] };
  }

  const items = [];
  for (const [i, crudo] of valorCrudo.entries()) {
    const donde = `[${i}]`;
    if (crudo == null || typeof crudo !== 'object' || Array.isArray(crudo)) {
      errores.push(`${donde} debe ser un objeto`);
      continue;
    }

    // Clave que no está en la forma: error, no aviso. Es el mismo motivo que
    // arriba — "herramienta" por "herramientas" no haría nada y nadie se
    // enteraría hasta que el agente contestara que no puede hacer algo.
    for (const clave of Object.keys(crudo)) {
      if (esNota(clave)) continue;
      if (!def.forma[clave]) {
        errores.push(`${donde} clave desconocida "${clave}" (válidas: ${Object.keys(def.forma).join(', ')})`);
      }
    }

    const item = {};
    for (const [clave, campo] of Object.entries(def.forma)) {
      const bruto = crudo[clave];
      if (bruto === undefined) {
        if (campo.requerido) {
          errores.push(`${donde} falta "${clave}"${campo.nota ? ` — ${campo.nota}` : ''}`);
          continue;
        }
        item[clave] = Array.isArray(campo.def) ? [...campo.def] : campo.def;
        continue;
      }
      const convertido = convertir(campo, bruto);
      if (convertido === undefined) {
        errores.push(`${donde} "${clave}" debería ser ${campo.tipo} y vino ${JSON.stringify(bruto)}`);
        continue;
      }
      if (campo.requerido && (convertido === '' || convertido == null)) {
        errores.push(`${donde} "${clave}" no puede estar vacío`);
        continue;
      }
      if (campo.patron && typeof convertido === 'string' && !campo.patron.test(convertido)) {
        errores.push(`${donde} "${clave}" = "${convertido}" no tiene la forma esperada` +
          `${campo.nota ? ` (${campo.nota})` : ''}`);
        continue;
      }
      item[clave] = convertido;
    }
    items.push(item);
  }
  return { items, errores };
}

/**
 * Valor efectivo de una clave del contrato, aplicando la precedencia.
 * @param {string} ruta clave del ESQUEMA, ej: 'limites.buffer_ms'
 */
function valor(ruta) {
  const def = ESQUEMA[ruta];
  if (!def) throw new Error(`[Config] "${ruta}" no está en el contrato de agente.config.json`);

  // El archivo se lee (y se valida) ANTES de mirar el entorno, aunque para esta
  // clave el entorno vaya a ganar igual. Si no, un archivo corrupto se detectaba
  // o no según qué clave preguntara primero el núcleo: con BUFFER_MS puesto en
  // el entorno, el agente arrancaba tan campante y reventaba más tarde, en la
  // primera clave que nadie estuviera pisando. "Config inválida = no compila"
  // no puede depender del orden de lectura.
  const { crudo } = leerArchivo();

  // 1. Entorno. Se lee en CADA llamada: es la palanca sin redeploy.
  if (def.env) {
    const crudo = process.env[def.env];
    // Una cadena vacía es un VALOR para los tipos donde "nada" significa algo:
    // HANDOFF_TIMEOUT_MIN= vacío es "derivación definitiva", BUFFER_EXCEPCIONES=
    // vacío es "sin excepciones" (y la prueba de humo verifica que aun así el
    // handoff se salte la ventana). Para un número o un booleano, en cambio,
    // vacío es un descuido y se ignora.
    const vacioSignifica = def.tipo !== 'numero' && def.tipo !== 'booleano';
    if (crudo != null && (crudo !== '' || vacioSignifica)) {
      const convertido = convertir(def, crudo);
      if (convertido !== undefined) return convertido;
      console.warn(`[Config] ${def.env}="${crudo}" no es un ${def.tipo} válido — la ignoro.`);
    }
  }

  // 2. Archivo.
  const enArchivo = bajar(crudo, ruta);
  if (enArchivo !== undefined) {
    const convertido = convertir(def, enArchivo);
    if (convertido !== undefined) return convertido;
  }

  // 3. Default del núcleo, posiblemente derivado de otras claves.
  if (typeof def.def === 'function') {
    return def.def({
      'datos.prefijo': valor('datos.prefijo'),
    });
  }
  return def.def;
}

/** Todo el contrato resuelto. Para el validador y para imprimir el estado. */
function resuelto() {
  const salida = {};
  for (const ruta of Object.keys(ESQUEMA)) salida[ruta] = valor(ruta);
  return salida;
}

// ─── Validación ──────────────────────────────────────────────────────────────

/**
 * @param {object} crudo contenido del archivo
 * @returns {{ errores: string[], avisos: string[] }}
 */
function validar(crudo) {
  const errores = [];
  const avisos  = [];

  if (crudo == null || typeof crudo !== 'object' || Array.isArray(crudo)) {
    return { errores: [`${ARCHIVO} debe ser un objeto JSON`], avisos };
  }

  // Claves desconocidas, a cualquier profundidad. Recorre el archivo del
  // cliente y exige que cada rama exista en el contrato: una rama que no existe
  // no se aplica, y no aplicarse en silencio es el bug que este archivo mata.
  const esObjeto = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
  (function recorrer(nodo, prefijo) {
    for (const clave of Object.keys(nodo)) {
      if (esNota(clave)) continue;
      const ruta = prefijo ? `${prefijo}.${clave}` : clave;
      if (ESQUEMA[ruta]) continue;                       // hoja válida
      if (PREFIJOS.has(ruta)) {
        if (!esObjeto(nodo[clave])) { errores.push(`"${ruta}" debe ser un objeto`); continue; }
        recorrer(nodo[clave], ruta);
        continue;
      }
      const donde = prefijo ? `dentro de "${prefijo}"` : `(bloques válidos: ${[...RAICES].join(', ')})`;
      errores.push(`clave desconocida "${ruta}" ${donde}`);
    }
  })(crudo, '');

  // Tipos y requeridos.
  for (const [ruta, def] of Object.entries(ESQUEMA)) {
    const bruto = bajar(crudo, ruta);
    if (bruto === undefined) {
      if (def.requerido) errores.push(`falta "${ruta}" (${def.nota || 'requerido'})`);
      continue;
    }
    // Las listas de objetos explican QUÉ elemento está mal y por qué: un
    // "flujo.agentes debería ser lista_objetos" no le sirve a nadie.
    if (def.tipo === 'lista_objetos') {
      const detalle = normalizarLista(def, bruto);
      errores.push(...detalle.errores.map((e) => `"${ruta}"${e.startsWith('[') ? '' : ' '}${e}`));
      continue;
    }

    const convertido = convertir(def, bruto);
    if (convertido === undefined) {
      errores.push(`"${ruta}" debería ser ${def.tipo} y vino ${JSON.stringify(bruto)}`);
      continue;
    }
    if (def.requerido && (convertido === '' || convertido == null)) {
      errores.push(`"${ruta}" no puede estar vacío (${def.nota || ''})`.trim());
    }
  }

  // Un prefijo que no se parece a un prefijo de tabla de Postgres se cae al
  // primer INSERT, y se cae en producción, no acá.
  const prefijo = bajar(crudo, 'datos.prefijo');
  if (typeof prefijo === 'string' && prefijo && !/^[a-z][a-z0-9_]*$/.test(prefijo)) {
    errores.push(`"datos.prefijo" debe ser minúsculas, números y guión bajo, empezando por letra (vino "${prefijo}")`);
  }

  // Tablas explícitas que no llevan el prefijo: legítimo en un agente que ya
  // está en uso con otro nombre, sospechoso en uno nuevo. Aviso, no error.
  if (typeof prefijo === 'string' && prefijo) {
    for (const clave of ['tabla_sesiones', 'tabla_estado_canal', 'tabla_metricas']) {
      const t = bajar(crudo, `datos.${clave}`);
      if (typeof t === 'string' && t && !t.startsWith(prefijo)) {
        avisos.push(`"datos.${clave}" = "${t}" no empieza con el prefijo "${prefijo}" — el proyecto Supabase es compartido, confirma que es a propósito`);
      }
    }
  }

  // Un agente sin ningún canal no atiende a nadie.
  const canales = ['telegram', 'whatsapp', 'terminal']
    .filter((c) => convertir({ tipo: 'booleano' }, bajar(crudo, `canales.${c}.activo`)) === true);
  if (!canales.length) avisos.push('ningún canal activo en "canales": este agente no atiende por ninguna parte');

  // El grafo del flujo: ids repetidos, entregas a agentes que no existen y
  // agentes a los que no se llega nunca. Va acá y no solo en el validador
  // porque un grafo roto tiene que impedir el arranque, igual que un typo: un
  // agente inalcanzable es una parte del producto que el cliente cree tener.
  errores.push(...revisarFlujo(crudo));

  return { errores, avisos };
}

/**
 * El grafo de `flujo.agentes`: ids únicos, entregas que apuntan a alguien que
 * existe, y ningún agente al que no se pueda llegar. Es lo único del flujo que
 * se puede revisar sin cargar el código del cliente — los nombres de las
 * herramientas los revisa scripts/validar-config.js, que sí lee tools.js.
 * @returns {string[]} errores
 */
function revisarFlujo(crudo) {
  const errores = [];
  const bruto = bajar(crudo, 'flujo.agentes');
  if (bruto === undefined) return errores;

  const { items, errores: malFormados } = normalizarLista(ESQUEMA['flujo.agentes'], bruto);
  if (malFormados.length) return errores;   // ya se reportaron con su índice
  if (!items.length) return errores;

  const ids = items.map((a) => a.id);
  const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repetidos.length) {
    errores.push(`"flujo.agentes" repite el id ${[...new Set(repetidos)].join(', ')}: ` +
      'el modelo entregaría a uno y le tocaría el otro');
  }

  const conocidos = new Set(ids);
  for (const a of items) {
    for (const destino of a.entrega_a) {
      if (!conocidos.has(destino)) {
        errores.push(`"flujo.agentes" — "${a.id}" entrega a "${destino}", que no es ningún agente declarado`);
      }
    }
  }

  const inicial = bajar(crudo, 'flujo.inicial') || ids[0];
  if (!conocidos.has(inicial)) {
    errores.push(`"flujo.inicial" = "${inicial}" no es ningún agente declarado ` +
      `(hay: ${ids.join(', ')})`);
    return errores;
  }

  // Alcanzabilidad. Un agente al que nadie entrega es trabajo escrito que no se
  // ejecuta nunca, y se ve como "el bot no sabe hacer eso" — que es justo lo que
  // ese agente existía para resolver.
  const alcanzados = new Set([inicial]);
  const cola = [inicial];
  while (cola.length) {
    // El shift va acá y no dentro del find: como predicado se ejecutaría una vez
    // por elemento y vaciaría la cola antes de recorrerla.
    const id = cola.shift();
    const actual = items.find((a) => a.id === id);
    for (const destino of actual?.entrega_a || []) {
      if (!alcanzados.has(destino)) { alcanzados.add(destino); cola.push(destino); }
    }
  }
  const huerfanos = ids.filter((id) => !alcanzados.has(id));
  if (huerfanos.length) {
    errores.push(`"flujo.agentes" — a ${huerfanos.join(', ')} no se llega nunca desde "${inicial}": ` +
      'ningún agente los declara en su "entrega_a"');
  }

  return errores;
}

// ─── Utilidades para el resto del núcleo ─────────────────────────────────────

/** Token del canal, resuelto por indirección: config dice el NOMBRE, .env el valor. */
function tokenDe(canal) {
  const nombreVar = valor(`canales.${canal}.token_env`);
  return { nombreVar, token: process.env[nombreVar] || '' };
}

module.exports = {
  ARCHIVO,
  ESQUEMA,
  valor,
  resuelto,
  validar,
  tokenDe,
  rutaArchivo: () => leerArchivo().ruta,
  existe: () => leerArchivo().existe,
  _recargar,
};
