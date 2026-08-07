// Validador de agente.config.json.  Uso: npm run validar
//
// POR QUÉ ESTÁ EN JS Y NO EN POWERSHELL: el esquema del contrato vive una sola
// vez, en config.js. Escribirlo de nuevo en un .ps1 habría creado dos
// definiciones que se desincronizan el día que alguien agrega un campo con
// prisa — y la que se desincroniza es siempre la que no corre en CI. Acá corre
// en la máquina del cliente, en Railway y desde la fábrica (el envoltorio
// scripts/validar-config.ps1 llama a este mismo archivo).
//
// Qué revisa, en orden de gravedad:
//   ERROR  — el agente NO puede arrancar así. Sale con código 1.
//   AVISO  — arranca, pero hay algo que alguien debería mirar. No bloquea: un
//            aviso que bloquea termina silenciado.

const fs   = require('fs');
const path = require('path');

const RAIZ   = path.resolve(__dirname, '..');

// Cargar el .env ANTES que la config: si no, el validador informa como valor
// efectivo el del archivo, y justo lo que tiene que denunciar es cuando el .env
// lo está tapando. La primera versión decía "HANDOFF_ACTIVO pisa handoff.activo
// (queda en true)" con el .env diciendo false — detectaba el problema y mentía
// sobre su consecuencia.
try { require(path.join(RAIZ, 'node_modules', 'dotenv')).config({ path: path.join(RAIZ, '.env') }); }
catch { /* sin dotenv instalado: se valida igual, con el entorno tal cual */ }

const config = require(path.join(RAIZ, 'config'));

const errores = [];
const avisos  = [];
let resuelto  = null;

async function main() {
  // ─── 1. El archivo existe y cumple el esquema ──────────────────────────────
  const rutaConfig = path.join(RAIZ, config.ARCHIVO);
  if (!fs.existsSync(rutaConfig)) {
    console.error(`\n❌ No existe ${config.ARCHIVO} en ${RAIZ}`);
    console.error('   Un proyecto de cliente siempre debe tener el suyo: es donde se declara qué hace este agente.\n');
    return 1;
  }

  let crudo;
  try {
    crudo = JSON.parse(fs.readFileSync(rutaConfig, 'utf8'));
  } catch (error) {
    console.error(`\n❌ ${config.ARCHIVO} no es JSON válido: ${error.message}\n`);
    return 1;
  }

  const veredicto = config.validar(crudo);
  errores.push(...veredicto.errores);
  avisos.push(...veredicto.avisos);

  // Sin un esquema válido, el resto de las comprobaciones mentiría.
  if (errores.length) { informar(); return 1; }

  resuelto = config.resuelto();

  revisarEnv();
  revisarCanales();
  await revisarHerramientas();
  revisarConocimiento();
  revisarHitos();
  revisarRailway();

  informar();
  return errores.length ? 1 : 0;
}

// ─── 2. El .env que tapa la config ───────────────────────────────────────────
// La precedencia entorno > archivo es a propósito (palanca sin redeploy), pero
// tiene que ser VISIBLE: un override olvidado es un agente corriendo con una
// configuración que no está en ningún archivo revisado.

function revisarEnv() {
  const rutaEnv = path.join(RAIZ, '.env');
  if (!fs.existsSync(rutaEnv)) return;

  const declaradas = new Set(
    fs.readFileSync(rutaEnv, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => l.split('=')[0].trim())
  );
  for (const [ruta, def] of Object.entries(config.ESQUEMA)) {
    if (!def.env || !declaradas.has(def.env)) continue;
    avisos.push(
      `${def.env} está en .env y pisa "${ruta}" (queda en ${JSON.stringify(resuelto[ruta])}). ` +
      'Si es un override de emergencia, bórralo cuando pase la emergencia.'
    );
  }
}

// ─── 3. Los tokens que la config nombra existen en .env.example ──────────────
// La config declara el NOMBRE de la variable; si ese nombre no está
// documentado, quien despliegue no tiene cómo saber qué configurar en Railway.

function revisarCanales() {
  const rutaEjemplo = path.join(RAIZ, '.env.example');
  const textoEjemplo = fs.existsSync(rutaEjemplo) ? fs.readFileSync(rutaEjemplo, 'utf8') : '';

  for (const canal of ['telegram', 'whatsapp']) {
    if (!resuelto[`canales.${canal}.activo`]) continue;
    const varToken = resuelto[`canales.${canal}.token_env`];
    if (!new RegExp(`^#?\\s*${varToken}\\s*=`, 'm').test(textoEjemplo)) {
      errores.push(
        `el canal "${canal}" está activo y usa ${varToken}, que no aparece en .env.example — ` +
        'nadie va a saber qué variable configurar al desplegar'
      );
    }
    if (!process.env[varToken]) {
      avisos.push(`${varToken} no está en el entorno: el canal "${canal}" arrancará en modo demo/mock`);
    }
  }
}

// ─── 4. Las herramientas del agente están implementadas ──────────────────────
// El modelo solo puede usar lo que TOOL_DEFINITIONS declara y ejecutarHerramienta
// resuelve. Una definición sin implementación es un agente que promete algo y
// contesta "herramienta desconocida" en producción.

async function revisarHerramientas() {
  let mod;
  try {
    mod = require(path.join(RAIZ, 'agent', 'tools'));
  } catch (error) {
    avisos.push(`no pude cargar agent/tools.js para revisarlo: ${error.message}`);
    return;
  }

  const { TOOL_DEFINITIONS, ejecutarHerramienta } = mod;
  if (!Array.isArray(TOOL_DEFINITIONS)) {
    errores.push('agent/tools.js no exporta TOOL_DEFINITIONS como array');
    return;
  }
  for (const t of TOOL_DEFINITIONS) {
    if (!t?.name) { errores.push('hay una tool sin "name" en TOOL_DEFINITIONS'); continue; }
    if (!t.description) avisos.push(`la tool "${t.name}" no tiene description: el modelo no sabrá cuándo usarla`);
    if (!t.input_schema) errores.push(`la tool "${t.name}" no declara input_schema`);
  }
  if (typeof ejecutarHerramienta !== 'function') {
    errores.push('agent/tools.js no exporta ejecutarHerramienta');
    return;
  }

  // El despachador tiene que conocer cada nombre declarado. Se comprueba
  // llamándolo con input vacío y viendo que NO conteste "desconocida". Que
  // falle por validación de negocio es esperable y no se cuenta como error.
  for (const t of TOOL_DEFINITIONS.filter((x) => x?.name)) {
    try {
      const r = await ejecutarHerramienta(t.name, {}, 'validador');
      if (r && typeof r.error === 'string' && /desconocid/i.test(r.error)) {
        errores.push(`la tool "${t.name}" está declarada pero ejecutarHerramienta no la resuelve`);
      }
    } catch { /* validación de negocio: no es asunto de este check */ }
  }
}

// ─── 5. El conocimiento del negocio ──────────────────────────────────────────
// Los tres modos de falla son de cliente, no de programador: el índice apunta a
// un archivo que se renombró, se repite una intención, o un tema creció hasta
// pasarse del tope. Los tres se ven igual en producción — "el bot dice que no
// tiene el dato"— y ninguno tira un error. Acá son ERROR: es el único momento
// en que alguien mira.

let conocimientoRevisado = null;

function revisarConocimiento() {
  let mod;
  try {
    mod = require(path.join(RAIZ, 'agent', 'conocimiento'));
  } catch (error) {
    avisos.push(`no pude cargar agent/conocimiento.js: ${error.message}`);
    return;
  }
  conocimientoRevisado = mod.revisar();
  if (!conocimientoRevisado.carpeta) return;  // sin carpeta no hay nada que revisar

  errores.push(...conocimientoRevisado.errores.map((e) => `conocimiento: ${e}`));
  avisos.push(...conocimientoRevisado.avisos.map((a) => `conocimiento: ${a}`));
}

// ─── 6. Los hitos declarados los marca alguien ───────────────────────────────
// Un hito declarado que ninguna tool marca produce un panel que informa 0%
// eternamente, y 0% se lee como "el agente no convierte" cuando en realidad
// nadie escribió la línea que lo registra. Es búsqueda de texto, así que va
// como aviso: puede marcarse desde otro archivo.

function revisarHitos() {
  const hitos = resuelto['metricas.hitos'] || [];
  if (!hitos.length) return;

  const rutaTools = path.join(RAIZ, 'agent', 'tools.js');
  if (!fs.existsSync(rutaTools)) return;
  const fuente = fs.readFileSync(rutaTools, 'utf8');

  const huerfanos = hitos.filter((h) => !fuente.includes(h));
  if (huerfanos.length) {
    avisos.push(
      `estos hitos están declarados en metricas.hitos pero no aparecen en agent/tools.js: ` +
      `${huerfanos.join(', ')}. Sin un metricas.marcarHito(canalId, "…") que los registre, ` +
      'el panel los mostrará siempre en 0%.'
    );
  }
}

// ─── 7. railway.toml al día con los canales ──────────────────────────────────

function revisarRailway() {
  const rutaRailway = path.join(RAIZ, 'railway.toml');
  if (!fs.existsSync(rutaRailway)) return;
  let comandoDeArranque;
  try {
    ({ comandoDeArranque } = require(path.join(RAIZ, 'scripts', 'generar-railway')));
  } catch { return; }

  const esperado = comandoDeArranque(resuelto);
  const actual = (fs.readFileSync(rutaRailway, 'utf8').match(/startCommand\s*=\s*"([^"]+)"/) || [])[1];
  if (esperado && actual && actual !== esperado) {
    avisos.push(
      `railway.toml arranca "${actual}" pero los canales activos dicen "${esperado}". ` +
      'Corre `npm run railway` para regenerarlo.'
    );
  }
}

// ─── Informe ─────────────────────────────────────────────────────────────────

function informar() {
  const quien = resuelto ? resuelto['cliente.nombre'] : '(configuración inválida)';
  console.log(`\nValidando ${config.ARCHIVO} — ${quien}\n`);

  if (errores.length) {
    console.log(`❌ ${errores.length} error(es) — el agente NO puede arrancar así:`);
    for (const e of errores) console.log(`   · ${e}`);
    console.log('');
  }
  if (avisos.length) {
    console.log(`⚠️  ${avisos.length} aviso(s):`);
    for (const a of avisos) console.log(`   · ${a}`);
    console.log('');
  }
  if (!errores.length) {
    console.log(avisos.length
      ? '✅ Configuración válida (los avisos no bloquean).\n'
      : '✅ Configuración válida, sin observaciones.\n');

    const tablas = ['datos.tabla_sesiones', 'datos.tabla_estado_canal', 'datos.tabla_metricas']
      .map((k) => resuelto[k]).join(', ');
    const canales = ['telegram', 'whatsapp', 'terminal']
      .filter((c) => resuelto[`canales.${c}.activo`]).join(', ') || 'ninguno';
    const handoff = !resuelto['handoff.activo']
      ? 'APAGADO'
      : resuelto['handoff.timeout_min'] == null
        ? 'activo, derivación DEFINITIVA'
        : `activo, el bot retoma a los ${resuelto['handoff.timeout_min']} min`;

    const conocimiento = !conocimientoRevisado?.carpeta
      ? 'sin carpeta conocimiento/ (el agente responde solo con sus tools)'
      : `${conocimientoRevisado.temas} tema(s), tope ${resuelto['conocimiento.tope_palabras']} palabras` +
        (resuelto['conocimiento.activo'] ? '' : ' — APAGADO por conocimiento.activo');

    console.log(`   Canales activos : ${canales}`);
    console.log(`   Tablas          : ${tablas}`);
    console.log(`   Handoff         : ${handoff}`);
    console.log(`   Buffer          : ${resuelto['limites.buffer_ms']} ms`);
    console.log(`   Conocimiento    : ${conocimiento}`);
    console.log(`   Hitos medidos   : ${(resuelto['metricas.hitos'] || []).join(', ') || 'ninguno declarado'}\n`);
  }
}

main()
  .then((codigo) => { process.exitCode = codigo; })
  .catch((error) => {
    console.error(`\n❌ El validador se cayó: ${error.message}\n`);
    process.exitCode = 1;
  });
