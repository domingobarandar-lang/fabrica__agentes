// Compuerta previa a la entrega.  Uso: npm run entrega
//
// POR QUÉ EXISTE: `npm test` dice que el agente hace lo que dice el SPEC y
// `npm run validar` dice que la configuración es coherente. Ninguno de los dos
// contesta la pregunta de la fase 6 del pipeline: *¿esto que voy a entregar es
// el producto del cliente, o todavía es la semilla con dos cosas cambiadas?*
// Un agente puede tener la suite entera en verde y salir con el prompt de
// ejemplo, un hito que nunca se marca y un caso de uso del SPEC que jamás se
// probó — porque todo eso es consistente consigo mismo.
//
// EL TRUCO ES QUE LA SEMILLA SE DECLARA SEMILLA. Cada archivo de `ejemplo/`
// lleva el marcador `SEMILLA` (o `"_semilla": true` en los JSON) en su primera
// línea. Si el marcador sigue ahí, nadie reescribió ese archivo. No hay que
// adivinar por parecido ni mantener una lista de frases sospechosas: el
// marcador se borra solo cuando el archivo se reescribe de verdad, que es
// exactamente cuando deja de ser semilla.
//
// CERO EFECTOS EXTERNOS, igual que todo lo demás en la fábrica: lee archivos y
// corre `git ls-files`. No abre red, no carga el modelo, no toca la base.
//
// Dos severidades, y la diferencia importa:
//   BLOQUEA — esto NO se entrega así. Sale con código 1.
//   REVISA  — sale igual, pero alguien tiene que mirarlo antes de la demo.

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');

let bloquea = [];
let revisa  = [];
const B = (que, porque) => bloquea.push({ que, porque });
const R = (que, porque) => revisa.push({ que, porque });

// ─── Qué archivos mira ───────────────────────────────────────────────────────

const IGNORAR_DIR = new Set(['node_modules', '.git', '.probar', 'dist', 'coverage']);
const IGNORAR_ARCHIVO = new Set(['package-lock.json', 'pnpm-lock.yaml', '.env']);
const EXTENSIONES = new Set(['.js', '.mjs', '.cjs', '.json', '.sql', '.md', '.toml', '.txt']);

function* recorrer(dir, base = '') {
  let entradas;
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entradas) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!IGNORAR_DIR.has(e.name)) yield* recorrer(path.join(dir, e.name), rel);
    } else if (!IGNORAR_ARCHIVO.has(e.name) && EXTENSIONES.has(path.extname(e.name))) {
      yield rel;
    }
  }
}

const leer = (rel) => {
  try { return fs.readFileSync(path.join(RAIZ, rel), 'utf8'); } catch { return null; }
};
const existe = (rel) => fs.existsSync(path.join(RAIZ, rel));

// ─── 1. La semilla sigue puesta ──────────────────────────────────────────────
//
// Dos listas y no una, porque la semilla tiene dos clases de archivo y
// confundirlas produce el peor de los avisos: el que siempre suena. Los de
// PRODUCTO se reescriben enteros al personalizar un cliente (el prompt, las
// tools, el dominio, los escenarios, el conocimiento) — si conservan el
// marcador, la personalización no ocurrió. Los de ANDAMIO se ajustan pero
// mantienen su forma (el runner de evals, el servidor, el bot): ahí el marcador
// es correcto que siga, y flagearlo entrenaría a todo el mundo a ignorar esto.

const SEMILLA_PRODUCTO = [
  'agent/prompts.js',
  'agent/tools.js',
  'database/supabase.js',
  'evals/escenarios.js',
];
const SEMILLA_ANDAMIO = ['evals/correr.js', 'index.js', 'telegram/bot.js'];

// `agente.config.json` NO va por marcador y esa excepción tiene motivo: es el
// único archivo de la semilla que se edita EN SU LUGAR en vez de reescribirse,
// así que un marcador suyo sobreviviría a la personalización y pediría un paso
// extra que alguien va a olvidar. Se revisa por valores, que cambian sí o sí.
const VALORES_SEMILLA = [
  ['cliente.id',               'ejemplo'],
  ['cliente.nombre',           'Negocio de ejemplo'],
  ['datos.prefijo',            'ejemplo'],
  ['identidad.nombre_agente',  'el asistente de ejemplo'],
];

const esSemilla = (texto) => /\bSEMILLA\b/.test(texto) || /"_semilla"\s*:\s*true/.test(texto);

const YA_LO_REESCRIBI = 'Si ya lo reescribiste, borra la línea del marcador';

function revisarSemilla() {
  for (const rel of SEMILLA_PRODUCTO) {
    const t = leer(rel);
    if (t == null) { R(rel, 'no existe: si este proyecto no lo usa, está bien; si lo usa, falta'); continue; }
    if (esSemilla(t)) {
      B(rel, 'todavía es la semilla de la fábrica (conserva el marcador SEMILLA). ' +
             `Este archivo se reescribe entero al personalizar un cliente. ${YA_LO_REESCRIBI}`);
    }
  }

  // El conocimiento es del cliente y la fábrica no puede listar sus archivos de
  // antemano: se revisa la carpeta entera, marcador por marcador. `npm run
  // validar` ya lo menciona, pero como AVISO — que es lo correcto mientras se
  // construye. Acá sube a BLOQUEA: entregar un bot que afirma con seguridad la
  // dirección de un negocio inventado es peor que entregar uno que no sabe.
  const indice = leer('conocimiento/_indice.json');
  if (indice != null && esSemilla(indice)) {
    B('conocimiento/_indice.json', 'el índice del conocimiento sigue siendo el de ejemplo ' +
      '(formas de pago y cómo llegar de un negocio que no existe)');
  }
  try {
    for (const f of fs.readdirSync(path.join(RAIZ, 'conocimiento'))) {
      if (!f.endsWith('.md')) continue;
      const t = leer(`conocimiento/${f}`);
      if (t && esSemilla(t)) {
        B(`conocimiento/${f}`, `es un tema de ejemplo de la fábrica, no del negocio del cliente. ${YA_LO_REESCRIBI}`);
      }
    }
  } catch { /* sin carpeta conocimiento: es válido, el agente responde solo con tools */ }

  for (const rel of SEMILLA_ANDAMIO) {
    if (!existe(rel)) R(rel, 'no existe: revisa que el canal/entrada de este proyecto esté armado');
  }
}

// ─── 2. Trabajo a medias ─────────────────────────────────────────────────────
//
// LA TRAMPA DE ESCRIBIR CÓDIGO EN CASTELLANO: "TODO" es la palabra *todo* y
// "pendiente" es una palabra corriente. Buscar la palabra suelta llenó la
// primera versión de esta lista con «ORDENA TODO LO DEMÁS», «grupo pendiente» y
// «hito pendiente por canal» — treinta hallazgos falsos, que es exactamente
// cómo se entrena a alguien a ignorar una compuerta. Por eso se exige la
// SINTAXIS de marcador (`TODO:` o `TODO(`), que nadie escribe por accidente en
// una frase, en vez de la palabra.
const PENDIENTES = [
  { re: /\bTODO\s*[:(]/,                  nombre: 'TODO' },
  { re: /\bPENDIENTE\s*[:(]/,             nombre: 'PENDIENTE' },
  { re: /\bFIXME\b/,                      nombre: 'FIXME' },
  { re: /\bXXX\b/,                        nombre: 'XXX' },
  { re: /\bHACK\b/,                       nombre: 'HACK' },
  { re: /\bplaceholder\b/i,               nombre: 'placeholder' },
  { re: /\blorem ipsum\b/i,               nombre: 'lorem ipsum' },
  { re: /no implementad[oa]|not implemented/i, nombre: 'sin implementar' },
  { re: /\bTU_[A-Z_]{3,}\b/,              nombre: 'marcador TU_ sin reemplazar' },
  // El {{PREFIJO}} del DDL lo sustituye `npm run schema`, no una persona, y
  // schema-nucleo.js es justamente el script que lo hace: los dos hablan del
  // marcador por oficio.
  { re: /\{\{[A-Z_]{3,}\}\}/,             nombre: 'marcador {{PLANTILLA}} sin sustituir',
    salvo: ['database/schema-nucleo.sql', 'scripts/schema-nucleo.js'] },
];

// Este archivo lleva todos los patrones escritos como literales: si se revisara
// a sí mismo, se denunciaría entero en cada corrida.
const YO_MISMO = 'scripts/listo-para-entrega.js';

function revisarPendientes() {
  const hallazgos = [];
  for (const rel of recorrer(RAIZ)) {
    // .env.example es un catálogo de marcadores por diseño; ese es su trabajo.
    if (rel.endsWith('.env.example') || rel === YO_MISMO) continue;
    const texto = leer(rel);
    if (texto == null) continue;
    texto.split('\n').forEach((linea, i) => {
      for (const p of PENDIENTES) {
        if (p.salvo?.includes(rel)) continue;
        if (p.re.test(linea)) hallazgos.push({ rel, linea: i + 1, nombre: p.nombre, texto: linea.trim().slice(0, 80) });
      }
    });
  }
  // Se listan todos: recortar la lista a los primeros N convierte "quedan 3" en
  // "quedaban 12" el día que alguien confía en el número.
  for (const h of hallazgos) {
    B(`${h.rel}:${h.linea}`, `${h.nombre} — «${h.texto}»`);
  }
}

// ─── 3. Secretos donde no van ────────────────────────────────────────────────
//
// Nunca se imprime el valor encontrado, solo dónde está: un secreto filtrado no
// se arregla copiándolo a la salida de otra herramienta.

const SECRETOS = [
  { re: /\bsk-[A-Za-z0-9]{20,}/,                   nombre: 'clave estilo OpenAI (sk-…)' },
  { re: /\bAIza[0-9A-Za-z_-]{30,}/,                nombre: 'clave de Google/Gemini (AIza…)' },
  { re: /\bghp_[A-Za-z0-9]{30,}/,                  nombre: 'token de GitHub (ghp_…)' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/,          nombre: 'token de Slack' },
  { re: /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/,          nombre: 'token de bot de Telegram' },
  { re: /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/, nombre: 'JWT (llave de Supabase)' },
  { re: /(api[_-]?key|apikey|token|secret|password|contrasena|contraseña)\s*[:=]\s*['"][^'"\s]{16,}['"]/i,
    nombre: 'credencial escrita a mano' },
];

function revisarSecretos() {
  for (const rel of recorrer(RAIZ)) {
    if (rel.endsWith('.env.example')) continue;
    const texto = leer(rel);
    if (texto == null) continue;
    texto.split('\n').forEach((linea, i) => {
      // Leer del entorno es justamente lo correcto: no es un hallazgo.
      if (/process\.env|\w+_env["']?\s*[:=]|\b[A-Z_]+_ENV\b/i.test(linea)) return;
      for (const s of SECRETOS) {
        if (s.re.test(linea)) {
          B(`${rel}:${i + 1}`, `${s.nombre} escrita en el código. Las credenciales viven en .env, nunca en un archivo versionado`);
        }
      }
    });
  }

  // El .env versionado es la forma más común de filtrar todo de una vez.
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '.env'], { cwd: RAIZ, stdio: 'pipe' });
    B('.env', 'está versionado en git. Sácalo YA (`git rm --cached .env`) y rota las credenciales que tenga adentro');
  } catch { /* lo normal: git no lo tiene, o no hay repo */ }

  if (!existe('.gitignore')) {
    B('.gitignore', 'no existe: sin él, el primer `git add .` se lleva el .env con todo adentro');
  } else if (!/^\s*\.env\s*$/m.test(leer('.gitignore') || '')) {
    B('.gitignore', 'no excluye .env');
  }
}

// ─── 4. Lo que el panel no va a poder medir ──────────────────────────────────
//
// El caso inverso —hito declarado que ninguna tool marca— ya lo denuncia
// `npm run validar` (revisarHitos). Acá va el que a nadie se le ocurre y que
// ningún otro control mira: el hito que el código SÍ marca y que no está
// declarado. El panel lo muestra igual… pero solo después de que ocurre por
// primera vez, y lo que hay que poder ver en marcha blanca es justamente el
// negocio que todavía no está pasando.

function revisarMedicion(config) {
  for (const [clave, valorSemilla] of VALORES_SEMILLA) {
    if (config.valor(clave) === valorSemilla) {
      B(`agente.config.json → ${clave}`, `sigue en "${valorSemilla}", el valor de la semilla. ` +
        (clave === 'datos.prefijo'
          ? 'El proyecto de Supabase está compartido: dos agentes con el prefijo "ejemplo" se pisan las tablas'
          : 'Es lo primero que ve el cliente'));
    }
  }

  const declarados = config.valor('metricas.hitos') || [];

  // Solo líneas de CÓDIGO y solo donde un hito puede vivir de verdad: los
  // comentarios del núcleo traen la llamada escrita como ejemplo
  // ("marcarHito(canalId, 'agendo')") y sus scripts la imprimen dentro de
  // mensajes de ayuda. Contar esos ejemplos como hitos reales inventaría
  // negocio que nadie está midiendo.
  const marcados = new Set();
  for (const rel of recorrer(RAIZ)) {
    if (!rel.endsWith('.js')) continue;
    if (rel.startsWith('evals/') || rel.startsWith('scripts/') || rel === 'agent/metricas.js') continue;
    const texto = leer(rel);
    if (texto == null) continue;
    for (const linea of texto.split('\n')) {
      if (/^\s*(\/\/|\*|\/\*)/.test(linea)) continue;
      for (const m of linea.matchAll(/marcarHito\s*\([^,]+,\s*['"`]([^'"`]+)['"`]/g)) marcados.add(m[1]);
    }
  }

  for (const h of marcados) {
    if (!declarados.includes(h)) {
      R(`hito "${h}"`, 'lo marca el código pero no está en metricas.hitos: el panel lo muestra igual, ' +
        'pero no aparece cuando todavía no ocurrió — que es cuando más importa verlo');
    }
  }

  if (!declarados.length) {
    R('metricas.hitos', 'vacío: el panel va a poder decir cuántas conversaciones hubo, no cuántas terminaron en negocio');
  }

  const precio = (config.valor('metricas.precio_usd_millon_entrada') || 0) +
                 (config.valor('metricas.precio_usd_millon_salida') || 0);
  if (!precio) {
    R('metricas.precio_usd_millon_*', 'en 0: el panel reporta tokens pero no puede expresar el gasto en dólares');
  }
  if (!config.valor('metricas.presupuesto_usd_mes') && !config.valor('metricas.tope_turnos_dia')) {
    R('metricas.presupuesto_usd_mes / tope_turnos_dia',
      'sin techo declarado: nadie se va a enterar de que este cliente se salió de su plan hasta que llegue la cuenta');
  }
}

// ─── 5. Cobertura del SPEC ───────────────────────────────────────────────────
//
// El SPEC vive en la raíz del PROYECTO y el agente puede estar en una subcarpeta
// (`<RUTA_PROYECTO>\agente\`), así que se busca en los dos lados.

function revisarCobertura() {
  const rutaSpec = ['SPEC.md', '../SPEC.md'].find((r) => existe(r));
  const escenarios = leer('evals/escenarios.js');

  if (!escenarios) { B('evals/escenarios.js', 'no existe: no hay ninguna prueba de este agente'); return; }

  const ids = (t, pre) => new Set([...t.matchAll(new RegExp(`\\b${pre}-(\\d+)\\b`, 'g'))].map((m) => `${pre}-${m[1]}`));
  const probados = ids(escenarios, 'CU');
  const adversariales = ids(escenarios, 'ADV');

  if (!rutaSpec) {
    R('SPEC.md', 'no lo encontré ni en la carpeta del agente ni una arriba: no puedo verificar que cada caso de uso esté probado');
  } else {
    const declarados = ids(leer(rutaSpec), 'CU');
    const sinProbar = [...declarados].filter((cu) => !probados.has(cu))
      .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
    if (sinProbar.length) {
      B('cobertura del SPEC', `${sinProbar.length} caso(s) de uso sin ningún escenario que los pruebe: ${sinProbar.join(', ')}`);
    }
    if (!declarados.size) R(rutaSpec, 'no tiene casos de uso numerados como CU-n: no hay nada que cruzar');
  }

  // Dos adversariales es el mínimo que pide el subagente de QA. Sin ellos la
  // suite solo demuestra que el agente funciona cuando el cliente se porta bien.
  if (adversariales.size < 2) {
    B('escenarios adversariales', `hay ${adversariales.size} y el mínimo de la fábrica son 2 ` +
      '(pedido imposible y dato que no está en la ficha)');
  }
}

// ─── 6. Los entregables ──────────────────────────────────────────────────────

function revisarEntregables() {
  for (const f of ['entrega/DEMO.md', 'entrega/ONE-PAGER.md', 'entrega/OPERACION.md']) {
    if (!existe(f)) R(f, 'falta (lo produce el subagente marketing en la fase 6 del pipeline)');
  }
  if (!existe('QA.md') && !existe('../QA.md')) R('QA.md', 'falta el reporte de QA');
  if (!existe('BITACORA.md') && !existe('../BITACORA.md')) {
    R('BITACORA.md', 'falta: sin ella los cambios a este agente no quedan registrados en ninguna parte');
  }
  if (!existe('.env.example')) R('.env.example', 'falta: el cliente no va a saber qué variables necesita para producción');
}

// ─── Informe ─────────────────────────────────────────────────────────────────

function informar() {
  const linea = '═'.repeat(74);
  console.log(`\n${linea}`);
  console.log('¿Listo para entregar?');
  console.log(linea);

  if (bloquea.length) {
    console.log(`\n❌ ${bloquea.length} cosa(s) que NO se entregan así:\n`);
    for (const x of bloquea) console.log(`   · ${x.que}\n     ${x.porque}\n`);
  }
  if (revisa.length) {
    console.log(`⚠️  ${revisa.length} cosa(s) para mirar antes de la demo:\n`);
    for (const x of revisa) console.log(`   · ${x.que}\n     ${x.porque}\n`);
  }

  if (!bloquea.length && !revisa.length) {
    console.log('\n✅ Sin observaciones: la semilla quedó atrás, no hay trabajo a medias,');
    console.log('   ninguna credencial en el código, cada CU del SPEC tiene escenario y');
    console.log('   el kit de entrega está completo.\n');
  } else if (!bloquea.length) {
    console.log('✅ Nada bloquea la entrega. Los avisos de arriba no la detienen.\n');
  }

  console.log('Esto NO reemplaza a `npm test` (que el agente haga lo que dice el SPEC) ni a');
  console.log('`npm run validar` (que la configuración sea coherente). Los tres, en ese orden.');
  console.log(`${linea}\n`);
  return bloquea.length ? 1 : 0;
}

/**
 * Corre las seis revisiones y devuelve los hallazgos sin imprimir nada.
 * Separado del CLI a propósito: así la prueba de humo puede apuntar la compuerta
 * contra la semilla y comprobar que la ATRAPA. Una compuerta que nadie verifica
 * es una compuerta que un día deja de cerrar y nadie se entera.
 */
function analizar() {
  bloquea = [];
  revisa  = [];

  revisarSemilla();
  revisarPendientes();
  revisarSecretos();
  revisarCobertura();
  revisarEntregables();

  // La medición se revisa al final y aparte: necesita la config cargada, y si la
  // config está rota eso ya lo denunció `npm run validar` con mejor detalle.
  try {
    revisarMedicion(require(path.join(RAIZ, 'config')));
  } catch (error) {
    R('agente.config.json', `no pude leer la configuración (${error.message}). Corre \`npm run validar\` primero`);
  }

  return { bloquea: [...bloquea], revisa: [...revisa] };
}

function main() {
  try { require(path.join(RAIZ, 'node_modules', 'dotenv')).config({ path: path.join(RAIZ, '.env') }); }
  catch { /* sin dotenv: se lee el entorno tal cual */ }

  analizar();
  return informar();
}

module.exports = { analizar, esSemilla, SEMILLA_PRODUCTO, SEMILLA_ANDAMIO, VALORES_SEMILLA, PENDIENTES, SECRETOS };

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`\n❌ La compuerta de entrega se cayó: ${error.message}\n`);
    process.exitCode = 1;
  }
}
