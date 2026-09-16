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
  revisarFlujo();
  revisarLead();
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

// Las tools que declara el cliente, para que los checks del flujo puedan
// cruzarlas contra lo que reparte cada agente.
let toolsDeclaradas = null;

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
  toolsDeclaradas = TOOL_DEFINITIONS;
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
  //
  // PERO ESTO EJECUTA LAS TOOLS DE VERDAD, y las tools de un agente real hacen
  // cosas: registran un lead, derivan a una persona, le mandan un WhatsApp a
  // quien atiende. Correr el validador en una máquina con el token de
  // producción en el `.env` le habría mandado a la ejecutiva un aviso de un
  // cliente que no existe — en el peor caso, uno por tool y por corrida.
  //
  // Así que el sondeo corre a oscuras: se apagan las credenciales de SALIDA
  // mientras dura, igual que hace evals/motor.js con la suite. Los envíos caen
  // en modo demo (consola) y la base queda en memoria. Se restauran enseguida,
  // porque los checks de más abajo informan qué variables del `.env` están
  // pisando la config y para eso tienen que verlas.
  const CREDENCIALES_DE_SALIDA = [
    'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID', 'TELEGRAM_TOKEN',
    'SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_ANON_KEY',
    'LLM_API_KEY', 'ANTHROPIC_API_KEY',
  ];
  const guardadas = {};
  for (const clave of CREDENCIALES_DE_SALIDA) {
    if (process.env[clave] !== undefined) { guardadas[clave] = process.env[clave]; delete process.env[clave]; }
  }

  try {
    for (const t of TOOL_DEFINITIONS.filter((x) => x?.name)) {
      try {
        const r = await ejecutarHerramienta(t.name, {}, 'validador-sin-efectos');
        if (r && typeof r.error === 'string' && /desconocid/i.test(r.error)) {
          errores.push(`la tool "${t.name}" está declarada pero ejecutarHerramienta no la resuelve`);
        }
      } catch { /* validación de negocio: no es asunto de este check */ }
    }
  } finally {
    Object.assign(process.env, guardadas);
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

// ─── 6. El flujo multi-agente ────────────────────────────────────────────────
// El grafo (ids repetidos, entregas al vacío, agentes inalcanzables) ya lo
// revisó config.js, porque eso impide arrancar. Acá van los cruces que NECESITAN
// el código del cliente: qué herramientas existen de verdad y qué temas de
// conocimiento hay. Los tres modos de falla de acá se ven igual en producción —
// "el bot no sabe hacer eso"— y ninguno tira un error.

let flujoRevisado = null;

function revisarFlujo() {
  let mod;
  try {
    mod = require(path.join(RAIZ, 'agent', 'flujo'));
  } catch (error) {
    avisos.push(`no pude cargar agent/flujo.js: ${error.message}`);
    return;
  }
  flujoRevisado = mod.resumen();
  const declarados = flujoRevisado.agentes;
  if (!declarados.length) return;                 // agente único: nada que revisar

  if (!resuelto['flujo.activo']) {
    avisos.push(
      `hay ${declarados.length} agentes declarados en "flujo.agentes" pero flujo.activo está en false: ` +
      'el agente corre como uno solo y ese reparto no se aplica'
    );
  }
  if (declarados.length === 1) {
    avisos.push(
      'el flujo declara UN solo agente, que es el agente monolítico con un bloque de prompt extra. ' +
      'Sirve para verificar que activar el flujo no rompe nada; si ya lo comprobaste, agrega el segundo ' +
      'o borra el bloque "flujo"'
    );
  }

  const conocidas = new Set((toolsDeclaradas || []).map((t) => t?.name).filter(Boolean));
  const repartidas = new Set();
  let alguienTieneTodas = false;

  for (const a of declarados) {
    if (!a.titulo || a.titulo === a.id) {
      avisos.push(`el agente "${a.id}" no tiene "titulo": es lo que lee el modelo para decidir a quién entregarle la conversación`);
    }
    if (a.lineas_rol > 40) {
      errores.push(
        `el rol de "${a.id}" tiene ${a.lineas_rol} líneas y el tope es 40. Un rol así de largo es el ` +
        'prompt monolítico otra vez, con el costo extra de repartirlo: pártelo en dos agentes'
      );
    }

    if (a.herramientas.includes(mod.TODOS)) {
      alguienTieneTodas = true;
    } else {
      for (const nombre of a.herramientas) {
        if (toolsDeclaradas && !conocidas.has(nombre)) {
          errores.push(`el agente "${a.id}" declara la herramienta "${nombre}", que no está en TOOL_DEFINITIONS`);
        }
        repartidas.add(nombre);
      }
    }

    if (!a.conocimiento.includes(mod.TODOS) && conocimientoRevisado?.intenciones) {
      for (const intencion of a.conocimiento) {
        if (!conocimientoRevisado.intenciones.includes(intencion)) {
          errores.push(`el agente "${a.id}" declara el tema de conocimiento "${intencion}", que no está en el índice`);
        }
      }
    }

    if (!a.herramientas.length && !a.entrega_a.length) {
      avisos.push(`el agente "${a.id}" no tiene herramientas ni a quién entregarle: solo puede conversar, y de ahí no sale nadie`);
    }
  }

  // Una tool que ningún agente reparte es una capacidad que el cliente pagó y
  // que el modelo no puede usar nunca. Se ve como "el bot no sabe hacer eso".
  if (!alguienTieneTodas && toolsDeclaradas) {
    const huerfanas = [...conocidas].filter((n) => !repartidas.has(n));
    if (huerfanas.length) {
      errores.push(
        `estas herramientas existen pero ningún agente del flujo las tiene declaradas: ${huerfanas.join(', ')}. ` +
        'El modelo no va a poder usarlas nunca'
      );
    }
  }
}

// ─── 7. Los datos que el agente recuerda ─────────────────────────────────────
// Mismo espíritu que el check de hitos: un campo declarado que ninguna
// herramienta recibe nunca se queda para siempre en "te falta", y el agente lo
// pide una y otra vez — el problema exacto que este bloque venía a resolver.

function revisarLead() {
  const campos = resuelto['lead.campos'] || [];
  if (!campos.length || !toolsDeclaradas) return;

  const parametros = new Set();
  for (const t of toolsDeclaradas) {
    for (const p of Object.keys(t?.input_schema?.properties || {})) parametros.add(p.toLowerCase());
  }

  for (const campo of campos) {
    const claves = (campo.claves.length ? campo.claves : [campo.campo]).map((c) => String(c).toLowerCase());
    if (!claves.some((c) => parametros.has(c))) {
      avisos.push(
        `el campo "${campo.campo}" de lead.campos no coincide con ningún parámetro de ninguna herramienta ` +
        `(probé: ${claves.join(', ')}). Nunca se va a llenar, y el agente lo pedirá en cada turno`
      );
    }
  }
}

// ─── 8. Los hitos declarados los marca alguien ───────────────────────────────
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

// ─── 9. railway.toml al día con los canales ──────────────────────────────────

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

    const flujoLinea = !flujoRevisado?.agentes.length
      ? 'un solo agente (sin "flujo.agentes" declarados)'
      : `${flujoRevisado.agentes.length} agentes, empieza en "${flujoRevisado.inicial}"` +
        (flujoRevisado.activo ? '' : ' — APAGADO por flujo.activo');
    const leadLinea = (resuelto['lead.campos'] || []).length
      ? (resuelto['lead.campos'] || []).map((c) => c.campo).join(', ') +
        (resuelto['lead.activo'] ? '' : ' — APAGADO por lead.activo')
      : 'no recuerda datos de la persona';

    console.log(`   Canales activos : ${canales}`);
    console.log(`   Tablas          : ${tablas}`);
    console.log(`   Handoff         : ${handoff}`);
    console.log(`   Buffer          : ${resuelto['limites.buffer_ms']} ms`);
    console.log(`   Conocimiento    : ${conocimiento}`);
    console.log(`   Flujo           : ${flujoLinea}`);
    console.log(`   Recuerda        : ${leadLinea}`);
    console.log(`   Hitos medidos   : ${(resuelto['metricas.hitos'] || []).join(', ') || 'ninguno declarado'}\n`);

    if (flujoRevisado?.agentes.length) {
      for (const a of flujoRevisado.agentes) {
        const tools = a.herramientas.length ? a.herramientas.join(', ') : 'ninguna';
        const salida = a.entrega_a.length ? `→ ${a.entrega_a.join(', ')}` : '(terminal)';
        console.log(`     · ${a.id.padEnd(18)} ${String(a.lineas_rol).padStart(2)} líneas de rol  ·  ${tools}  ${salida}`);
      }
      console.log('');
    }
  }
}

main()
  .then((codigo) => { process.exitCode = codigo; })
  .catch((error) => {
    console.error(`\n❌ El validador se cayó: ${error.message}\n`);
    process.exitCode = 1;
  });
