// Motor de evaluación del agente. Es del NÚCLEO: lo comparten todos los
// clientes y no se edita en el proyecto.
//
// REPARTO DE TRABAJO:
//   núcleo   → el motor (esto), los perfiles de cliente difícil y los
//              invariantes que valen para cualquier rubro.
//   cliente  → los escenarios (CU-* del SPEC y ADV-* adversariales). Son el
//              producto: describen su negocio y nadie más los puede escribir.
//
// Antes de esto, cada agente escribía su arnés completo de cero — mock del LLM,
// runner, reporte — y cada uno lo escribía distinto. Uno de ellos lo escribió
// con una puerta a modelo real (`MOCK === 'true' || !ANTHROPIC_API_KEY`), así
// que bastaba tener una key en el .env para que `npm test` saliera a la API.
// Eso viola la regla dura de cero efectos externos en QA, y es la razón por la
// que el bloqueo de abajo está en el motor y no en la buena intención de cada
// proyecto.

// ─── CERO EFECTOS EXTERNOS ───────────────────────────────────────────────────
// VA ANTES DE LOS require: database/supabase.js decide en tiempo de carga si
// usa Supabase o memoria, así que limpiar el entorno después no serviría de
// nada. No hay variable capaz de encender el modo real: no existe la puerta.
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_KEY;
delete process.env.LLM_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.WHATSAPP_TOKEN;

// ─── LA QA PRUEBA LA CONFIG QUE SE ENTREGA ───────────────────────────────────
// Y por eso se borran también los overrides de entorno del contrato. La
// precedencia .env > agente.config.json es correcta en producción (palanca sin
// redeploy), pero en QA convierte la suite en algo que depende del .env de
// quien la corre: dos personas con el mismo repo obtienen resultados distintos,
// y "pasó en mi máquina" deja de significar nada. Peor: el .env no se versiona,
// así que lo que se probó no queda registrado en ninguna parte.
// Se descubrió corriendo la suite con un .env que traía HANDOFF_ACTIVO=false —
// cuatro escenarios en rojo por una variable que no está en ningún archivo
// revisado. Acá adentro manda el archivo, punto.
// (BUFFER_MS se borra igual: el motor lo fija él mismo, perfil por perfil.)
const config = require('../config'); // sin efectos al cargar: solo lee el JSON cuando se le pregunta
for (const def of Object.values(config.ESQUEMA)) {
  if (def.env) delete process.env[def.env];
}

const { processMessage, _setClienteParaTests } = require('../agent/core');
const { MENSAJE_DERIVACION } = require('../agent/handoff');
const buffer = require('../agent/buffer');
const { TOOL_DEFINITIONS } = require('../agent/tools');
const { buildSystemPrompt } = require('../agent/prompts');
const conocimiento = require('../agent/conocimiento');
const flujo = require('../agent/flujo');
const { db, resetDemo } = require('../database/supabase');
const { cargarCatalogo, derivar } = require('./perfiles');
const { construirReglas, OMITIDA } = require('./reglas');

// ─── Fechas relativas (zona horaria del cliente) ─────────────────────────────
// Los escenarios no pueden traer fechas fijas: "el lunes" tiene que seguir
// siendo el próximo lunes dentro de seis meses. La zona sale de
// `cliente.zona_horaria`: un agente en otro país probaba con el calendario de
// Chile y el escenario "hoy" podía caer en otro día.

const zona = () => config.valor('cliente.zona_horaria');
const DIAS  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: zona() });

function addDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function diaSemanaISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function proximo(diaObjetivo, desde) {
  let f = addDias(desde, 1);
  while (diaSemanaISO(f) !== diaObjetivo) f = addDias(f, 1);
  return f;
}
function natural(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${DIAS[diaSemanaISO(iso)]} ${d} de ${MESES[m - 1]}`;
}
function calcularFechas() {
  const hoy = hoyChile();
  return {
    hoy,
    ayer: addDias(hoy, -1),
    manana: addDias(hoy, 1),
    lunes: proximo(1, hoy), martes: proximo(2, hoy), miercoles: proximo(3, hoy),
    jueves: proximo(4, hoy), viernes: proximo(5, hoy), sabado: proximo(6, hoy),
    domingo: proximo(0, hoy),
    natural, addDias,
  };
}

// ─── Doble guionizado del LLM ────────────────────────────────────────────────
// Sirve el guión del turno paso a paso. Respeta TOOL_DEFINITIONS: si el guión
// pide una herramienta que el agente NO tiene definida, responde como lo haría
// el modelo real ("eso no lo tengo") en vez de fingir que existe. Así el arnés
// detecta capacidades faltantes en lugar de taparlas.

function crearMock() {
  const estado = {
    cola: [], toolLog: [], contador: 0, fechas: null, systemPrompt: null,
    llamadas: 0,        // llamadas al modelo (un turno con tool son DOS: pedirla y responder)
    turnosVistos: 0,    // turnos frescos que vio el modelo — esto es lo que el buffer agrupa
    textoDelTurno: '',  // el texto tal como le llegó al modelo, ya agrupado
  };

  const ctxGuion = () => ({
    fechas: estado.fechas,
    lastResult(nombre) {
      for (let i = estado.toolLog.length - 1; i >= 0; i--) {
        const e = estado.toolLog[i];
        if (e.name === nombre && e.result != null) return e.result;
      }
      return null;
    },
  });

  const texto = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });

  async function create(params) {
    estado.llamadas++;
    estado.systemPrompt = params.system;
    const disponibles = new Set((params.tools || []).map((t) => t.name));

    // Un mensaje de usuario con contenido de texto plano = turno nuevo. Si viene
    // como array, son los tool_result de una ronda del mismo turno.
    const ultimo = params.messages[params.messages.length - 1];
    if (typeof ultimo?.content === 'string') {
      estado.turnosVistos++;
      estado.textoDelTurno = ultimo.content;
    }

    // Recoger los tool_result que devolvió el loop del agente
    if (Array.isArray(ultimo?.content)) {
      for (const bloque of ultimo.content) {
        if (bloque.type !== 'tool_result') continue;
        const pendiente = estado.toolLog.find((e) => e.id === bloque.tool_use_id);
        if (!pendiente) continue;
        try { pendiente.result = JSON.parse(bloque.content); }
        catch { pendiente.result = bloque.content; }
      }
    }

    const paso = estado.cola.shift();
    if (!paso) return texto('¿Te ayudo con algo más? 😊');

    if (paso.tools) {
      const faltantes = paso.tools.filter((t) => !disponibles.has(t.name));
      if (faltantes.length) {
        for (const t of faltantes) {
          estado.toolLog.push({ id: null, name: t.name, input: null, result: null, inexistente: true });
        }
        estado.cola.length = 0;
        return texto('Mmm, eso todavía no lo tengo disponible 😅');
      }
      const contenido = paso.tools.map((t) => {
        const input = typeof t.input === 'function' ? t.input(ctxGuion()) : (t.input || {});
        const id = `toolu_eval_${++estado.contador}`;
        estado.toolLog.push({ id, name: t.name, input, result: null });
        return { type: 'tool_use', id, name: t.name, input };
      });
      return { stop_reason: 'tool_use', content: contenido };
    }

    return texto(typeof paso.text === 'function' ? paso.text(ctxGuion()) : paso.text);
  }

  return {
    estado,
    ctxGuion,
    cliente: { messages: { create }, beta: { messages: { create } } },
  };
}

// ─── Motor ───────────────────────────────────────────────────────────────────

/**
 * @param {object} cfg
 * @param {string}   cfg.nombre           nombre del agente, para el encabezado
 * @param {number}  [cfg.maxChars=600]    tope de largo de una respuesta
 * @param {RegExp}  [cfg.patronId]        cómo se ve un id de resultado (p.ej. /\bP\d+\b/g)
 * @param {number}  [cfg.topeResultados]  cuántos resultados puede listar de una vez
 * @param {RegExp}  [cfg.patronDato]      qué dato no se puede inventar (default: montos en pesos)
 * @param {object}  [cfg.camposCaptura]   campos que no se pueden re-preguntar
 * @param {RegExp[]}[cfg.fugaExtra]       patrones propios que nunca deben salir
 * @param {string[]}[cfg.perfiles]        ids a correr; por defecto, todos los del catálogo
 * @param {string[]}[cfg.perfilesExtra]   rutas a catálogos JSON propios del cliente
 */
function crearMotor(cfg = {}) {
  // `nombre` sale de agente.config.json si el cliente no lo pasa: el encabezado
  // del reporte dice de quién es la suite sin repetir el dato en dos archivos.
  const configMotor = {
    nombre: cfg.nombre || config.valor('cliente.nombre'),
    maxChars: cfg.maxChars ?? 600,
    patronDato: cfg.patronDato === null ? null : (cfg.patronDato ?? /\$\s?\d[\d.,]*/g),
    ...cfg,
  };

  const catalogo = cargarCatalogo(cfg.perfilesExtra || []);
  const reglas = construirReglas(configMotor);
  const mock = crearMock();
  _setClienteParaTests(mock.cliente);

  const args = process.argv.slice(2);
  const filtro = (bandera) => {
    const a = args.find((x) => x.startsWith(`--${bandera}=`));
    return a ? a.split('=').slice(1).join('=') : null;
  };

  async function correr(escenarios) {
    const fechas = calcularFechas();
    mock.estado.fechas = fechas;

    const soloPerfil    = filtro('perfil');
    const soloEscenario = filtro('escenario');
    const verboso       = args.includes('--verboso');

    const perfiles = catalogo.filter((p) => {
      if (soloPerfil) return p.id === soloPerfil;
      if (cfg.perfiles) return cfg.perfiles.includes(p.id);
      return true;
    });
    const casos = escenarios.filter((e) => !soloEscenario || e.nombre.includes(soloEscenario));

    console.log('═'.repeat(74));
    console.log(`Evals — ${configMotor.nombre}   ·   MOCK siempre: 0 tokens, sin credenciales, sin red`);
    console.log(`Hoy (Chile): ${fechas.hoy}   ·   ${casos.length} escenarios × ${perfiles.length} perfiles`);
    // Qué configuración se probó, dicho en el reporte: la misma suite da
    // resultados distintos con el flujo encendido y apagado, y "pasó la QA" sin
    // decir cuál de las dos no significa nada.
    if (flujo.activo()) {
      console.log(`Flujo: ${flujo.agentes().length} agentes, empieza en "${flujo.inicial().id}"`);
    }
    console.log('═'.repeat(74));

    const resultados = [];
    let corrida = 0;

    for (const escenario of casos) {
      const admitidos = escenario.perfiles
        ? perfiles.filter((p) => escenario.perfiles.includes(p.id))
        : perfiles;

      console.log(`\n▸ ${escenario.nombre}`);

      for (const perfil of admitidos) {
        corrida++;
        const r = await correrUno(escenario, perfil, fechas, corrida, verboso);
        resultados.push(r);
        const marca = r.ok ? '✅' : '❌';
        console.log(`   ${marca} [${perfil.id}] ${perfil.titulo}`);
        if (!r.ok) for (const e of r.errores) console.log(`        · ${e}`);
      }
    }

    // ── Resumen ──
    const fallas = resultados.filter((r) => !r.ok);
    const reglasCorridas = resultados.reduce((n, r) => n + r.reglasEvaluadas, 0);
    console.log('\n' + '═'.repeat(74));
    console.log(
      `RESUMEN: ${resultados.length - fallas.length}/${resultados.length} corridas OK` +
      `   ·   ${reglasCorridas} verificaciones automáticas de invariantes`
    );
    if (fallas.length) {
      console.log('\nFallaron:');
      for (const f of fallas) console.log(`  ❌ ${f.escenario}  [${f.perfil}]`);
    }
    console.log('═'.repeat(74));
    process.exitCode = fallas.length ? 1 : 0;
    return { total: resultados.length, fallas: fallas.length, resultados };
  }

  async function correrUno(escenario, perfil, fechas, corrida, verboso) {
    const errores = [];
    const check = (cond, msg) => { if (!cond) errores.push(msg); };
    let reglasEvaluadas = 0;

    // Estado limpio: base sembrada de nuevo, buffer vacío y un canal distinto.
    // El canal distinto no es paranoia — el estado de handoff vive por canal y
    // un escenario que deriva dejaría mudos a los siguientes.
    await resetDemo?.();
    buffer._limpiar();
    mock.estado.toolLog.length = 0;
    mock.estado.cola.length = 0;

    const canalId = `569${String(90000000 + corrida)}`;
    const { turnos, ventanaMs } = derivar(escenario, perfil);
    process.env.BUFFER_MS = String(ventanaMs ?? 0);

    const ctx = {
      canalId,
      telefono: canalId,      // alias, los escenarios viejos lo llaman así
      fechas,
      perfil: perfil.id,
      respuestas: [],         // indexado por turno ORIGINAL, estable entre perfiles
      todas: [],
      db,
      get toolLog() { return mock.estado.toolLog; },
      // El prompt tal como le llegó al modelo. Se expone para que un escenario
      // pueda comprobar lo que NO tiene que estar ahí: el caso concreto es el
      // corpus de conocimiento, que si viaja en el prompt hace inútil la
      // herramienta que lo carga y se paga en cada turno.
      get systemPrompt() { return mock.estado.systemPrompt || ''; },
      lastResult: (n) => mock.ctxGuion().lastResult(n),
      // En qué agente del flujo quedó la conversación. Con un agente único
      // devuelve null, así que un escenario que la use declara por sí solo que
      // está probando un flujo.
      async agente() {
        if (!flujo.activo()) return null;
        const estado = await db.estadoCanal.get(canalId);
        return estado?.agente_actual || flujo.inicial()?.id || null;
      },
      // Lo que el núcleo recordó de la persona, para comprobar que un agente no
      // vuelve a pedir lo que otro ya tomó.
      async lead() {
        return (await db.estadoCanal.get(canalId))?.lead || {};
      },
    };

    try {
      if (escenario.seed) await escenario.seed(ctx);

      for (const turno of turnos) {
        if (turno.partes.length > 1 && !(ventanaMs > 0)) {
          throw new Error(
            `El perfil "${perfil.id}" parte un turno en ${turno.partes.length} mensajes pero no declara ventana_ms. ` +
            'Sin ventana el buffer no agrupa y el guión del mock se queda corto.'
          );
        }

        mock.estado.cola = [...(turno.modelo || [])];
        const antesTools = mock.estado.toolLog.length;
        mock.estado.llamadas = 0;
        mock.estado.turnosVistos = 0;
        mock.estado.textoDelTurno = '';

        // Varios mensajes se mandan SIN esperar entre ellos: así caen dentro de
        // la misma ventana y el buffer los une, que es lo que se quiere probar.
        const enviados = turno.partes.map((p) => processMessage(canalId, p));
        const devueltas = await Promise.all(enviados);
        const respuesta = devueltas[devueltas.length - 1];

        if (devueltas.length > 1) {
          const previas = devueltas.slice(0, -1).filter((r) => r !== null);
          check(
            previas.length === 0,
            `el buffer respondió ${previas.length} vez/veces de más: mensajes seguidos son UN turno`
          );
          // Se cuentan TURNOS, no llamadas al modelo: un turno que usa una
          // herramienta llama al modelo dos veces por diseño (pedirla y
          // responder con su resultado). Contar llamadas daba rojo en cualquier
          // escenario con tools, que son justamente los que más importan.
          check(
            mock.estado.turnosVistos === 1,
            `${turno.partes.length} mensajes seguidos llegaron al modelo como ${mock.estado.turnosVistos} turnos (debía ser 1)`
          );
          const perdidas = turno.partes.filter((p) => !mock.estado.textoDelTurno.includes(p));
          check(
            perdidas.length === 0,
            `el modelo no recibió ${perdidas.length} de los mensajes agrupados: ${perdidas.join(' | ')}`
          );
        }

        ctx.todas.push(respuesta);
        if (turno.origen != null) ctx.respuestas[turno.origen] = respuesta;

        if (verboso || perfil.id === 'feliz') {
          for (const p of turno.partes) console.log(`        Cliente: ${p}`);
          console.log(`        Bot:     ${respuesta === null ? '(silencio)' : respuesta.replace(/\n/g, ' ⏎ ')}`);
        }

        // ── Invariantes del núcleo, en cada turno ──
        const contexto = {
          respuesta,
          mensajesUsuario: turno.partes,
          llamadasModelo: mock.estado.llamadas,
          toolLog: mock.estado.toolLog.slice(antesTools),
          toolLogAcumulado: mock.estado.toolLog,
          // Las del cliente MÁS las que inyecta el núcleo: si no, el invariante
          // de fuga no cubriría `cargar_conocimiento` ni `cambiar_etapa`, que son
          // tools que el cliente nunca declaró y que el modelo igual puede
          // nombrarle a un cliente final.
          toolNames: [
            ...[...TOOL_DEFINITIONS, ...conocimiento.definiciones(TOOL_DEFINITIONS)].map((t) => t.name),
            ...(flujo.activo() ? [flujo.NOMBRE_TOOL] : []),
          ],
          systemPrompt: mock.estado.systemPrompt || safeSystemPrompt(),
          perfil,
        };
        for (const regla of reglas) {
          const veredicto = regla.evaluar(contexto);
          if (veredicto === OMITIDA) continue;
          reglasEvaluadas++;
          if (veredicto) errores.push(`[${regla.id}] ${veredicto}`);
        }

        if (turno.espera_derivacion) {
          check(respuesta === MENSAJE_DERIVACION, 'pidió una persona y no recibió el mensaje de derivación');
          const despues = await processMessage(canalId, 'hola? sigues ahí?');
          check(despues === null, `tras derivar, el bot volvió a hablar: "${despues}"`);
        }

        if (turno.despues) await turno.despues(ctx, check);
      }

      if (escenario.expect) await escenario.expect(ctx, check);
    } catch (error) {
      errores.push(`excepción durante la conversación: ${error.message}`);
    }

    return {
      escenario: escenario.nombre,
      perfil: perfil.id,
      ok: errores.length === 0,
      errores,
      reglasEvaluadas,
    };
  }

  return { correr, mock, fechas: calcularFechas, natural };
}

function safeSystemPrompt() {
  try { return buildSystemPrompt(); } catch { return ''; }
}

module.exports = { crearMotor, calcularFechas, natural };
