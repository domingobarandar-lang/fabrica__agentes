// Prueba de humo del núcleo conversacional.
//
// POR QUÉ EXISTE: los archivos del núcleo no se pueden ejecutar solos —
// agent/core.js pide ./prompts y ./tools, agent/memory.js pide
// ../database/supabase, y ninguno de esos vive en nucleo/. Este script arma el
// OVERLAY (núcleo + ejemplo) en un directorio temporal según MANIFIESTO.json y
// corre ahí. Es el mismo mecanismo que usa sincronizar-nucleo.ps1 sobre un
// proyecto real, así que de paso valida que el manifiesto esté bien escrito
// ANTES de usarlo contra un cliente.
//
// CERO EFECTOS EXTERNOS: el cliente LLM es un doble guionizado inyectado con
// _setClienteParaTests. No hay red, no hay credenciales, no hay tokens.
//
// Uso: npm run humo   (desde base-agente/nucleo/)

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ_NUCLEO = path.resolve(__dirname, '..');   // base-agente/nucleo
const RAIZ_BASE   = path.resolve(RAIZ_NUCLEO, '..'); // base-agente
const MANIFIESTO  = path.join(RAIZ_BASE, 'MANIFIESTO.json');

// El overlay se arma DENTRO de nucleo/ a propósito: así Node encuentra
// nucleo/node_modules subiendo directorios y no hay que instalar dos veces.
const DIR_PRUEBA = path.join(RAIZ_NUCLEO, '.probar');

let fallos = 0;
let pasos  = 0;

function check(condicion, mensaje) {
  pasos++;
  if (condicion) {
    console.log(`  ✅ ${mensaje}`);
  } else {
    fallos++;
    console.log(`  ❌ ${mensaje}`);
  }
}

// ─── Armado del overlay ───────────────────────────────────────────────────────

function armarOverlay() {
  if (!fs.existsSync(MANIFIESTO)) {
    console.error(`ERROR: no encuentro el manifiesto en ${MANIFIESTO}`);
    process.exit(1);
  }
  const manifiesto = JSON.parse(fs.readFileSync(MANIFIESTO, 'utf8'));

  fs.rmSync(DIR_PRUEBA, { recursive: true, force: true });
  fs.mkdirSync(DIR_PRUEBA, { recursive: true });

  const capas = [...manifiesto.nucleo, ...manifiesto.ejemplo];
  const faltantes = [];

  for (const { origen, destino } of capas) {
    const rutaOrigen  = path.join(RAIZ_BASE, origen);
    const rutaDestino = path.join(DIR_PRUEBA, destino);
    if (!fs.existsSync(rutaOrigen)) {
      faltantes.push(origen);
      continue;
    }
    fs.mkdirSync(path.dirname(rutaDestino), { recursive: true });
    fs.copyFileSync(rutaOrigen, rutaDestino);
  }

  if (faltantes.length) {
    console.error('ERROR: el manifiesto apunta a archivos que no existen:');
    faltantes.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }

  return capas.length;
}

// ─── Doble guionizado del LLM ─────────────────────────────────────────────────
// Devuelve las respuestas de una cola, en orden. Si el guión se queda corto,
// falla ruidosamente en vez de inventar una respuesta.

function crearClienteFalso(guion) {
  const cola = [...guion];
  const llamadas = [];
  return {
    llamadas,
    messages: {
      async create(params, opciones = {}) {
        llamadas.push({ ...params, _signal: opciones.signal });
        if (!cola.length) {
          throw new Error('El guión del mock se quedó sin respuestas');
        }
        const siguiente = cola.shift();
        return typeof siguiente === 'function' ? siguiente(params, opciones) : siguiente;
      },
    },
  };
}

const texto   = (t) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const usaTool = (name, input = {}) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 'tu_1', name, input }],
});

// Un modelo que nunca contesta pero respeta el AbortController, como haría
// fetch o el SDK real. Si el núcleo no pasara la señal, esto colgaría el test.
const cuelga = () => (params, opciones = {}) => new Promise((_, reject) => {
  const signal = opciones.signal;
  if (!signal) return; // sin señal: cuelga de verdad, y el test lo delata
  signal.addEventListener('abort', () => {
    const e = new Error('The operation was aborted');
    e.name = 'AbortError';
    reject(e);
  });
});

// Bot de Telegram falso: solo anota lo que le habrían mandado.
function crearBotFalso() {
  const enviados = [];
  return { enviados, async sendMessage(chatId, texto) { enviados.push({ chatId, texto }); } };
}

// Captura lo que el modo demo de whatsapp/sender.js imprimiría por consola.
function capturarConsola(fn) {
  const original = console.log;
  const salida = [];
  console.log = (...args) => salida.push(args.join(' '));
  return Promise.resolve()
    .then(fn)
    .finally(() => { console.log = original; })
    .then(() => salida.join('\n'));
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Escenarios ───────────────────────────────────────────────────────────────

async function main() {
  console.log('\nPrueba de humo del núcleo conversacional');
  console.log('modo: MOCK incondicional · 0 tokens · sin credenciales\n');

  const copiados = armarOverlay();
  console.log(`Overlay armado en .probar/ (${copiados} archivos del manifiesto)\n`);

  const cargar = (...partes) => require(path.join(DIR_PRUEBA, ...partes));

  // ── 0. Los DEFAULTS que son decisiones de negocio ───────────────────────────
  // Se verifican ANTES de tocar ninguna variable de entorno. Están acá porque
  // cambiarlos sin querer es barato y las consecuencias no lo son.
  console.log('0. Los defaults que costaron caro');
  const handoffMod = cargar('agent', 'handoff.js');
  const bufferMod  = cargar('agent', 'buffer.js');

  check(handoffMod.timeoutMin() === null,
    'la derivación a humano es DEFINITIVA por defecto (sin timeout que reviva al bot)');
  check(bufferMod.ventanaMs() === 6000,
    'la ventana de agrupación es 6 s (el número que corre en producción)');
  check(bufferMod.esExcepcion('quiero hablar con una persona') === 'handoff',
    'pedir un humano se salta la ventana de agrupación');

  // EL CANDADO: aunque alguien vacíe la lista de excepciones, el handoff sigue.
  const excepcionesPrevias = process.env.BUFFER_EXCEPCIONES;
  process.env.BUFFER_EXCEPCIONES = '';
  check(bufferMod.esExcepcion('necesito hablar con una persona') === 'handoff',
    'CANDADO: con BUFFER_EXCEPCIONES vacío, el handoff SIGUE saltándose la ventana');
  if (excepcionesPrevias == null) delete process.env.BUFFER_EXCEPCIONES;
  else process.env.BUFFER_EXCEPCIONES = excepcionesPrevias;

  // A partir de acá el buffer se apaga salvo donde se prueba a propósito:
  // esperar 6 s por escenario haría que nadie corra esta prueba.
  process.env.BUFFER_MS = '0';

  const core = cargar('agent', 'core.js');
  const { processMessage, MENSAJE_ERROR, MENSAJE_PUENTE, _setClienteParaTests } = core;
  const { db, resetDemo } = cargar('database', 'supabase.js');
  const { sendMessage } = cargar('whatsapp', 'sender.js');
  const { enviarTelegram } = cargar('telegram', 'enviar.js');
  const metricas = cargar('agent', 'metricas.js');

  // ── 1. El núcleo enciende y devuelve texto ──────────────────────────────────
  console.log('\n1. El núcleo enciende y responde texto');
  const cliente1 = crearClienteFalso([texto('Hola, soy el asistente de ejemplo. ¿En qué te ayudo?')]);
  _setClienteParaTests(cliente1);

  const r1 = await processMessage('humo-1', 'hola');
  check(typeof r1 === 'string' && r1.length > 0, 'processMessage devuelve un string no vacío');
  check(/asistente de ejemplo/i.test(r1), 'la respuesta es la del guión, no un fallback');
  check(cliente1.llamadas.length === 1, 'se llamó al modelo exactamente una vez');
  check(
    typeof cliente1.llamadas[0].system === 'string' && cliente1.llamadas[0].system.includes('REGLA DURA'),
    'el system prompt del ejemplo llegó al modelo'
  );
  check(
    Array.isArray(cliente1.llamadas[0].tools) && cliente1.llamadas[0].tools.some((t) => t.name === 'ver_horario'),
    'las TOOL_DEFINITIONS del ejemplo llegaron al modelo'
  );
  check(cliente1.llamadas[0]._signal instanceof AbortSignal,
    'el núcleo pasa un AbortSignal al proveedor (el timeout puede cortar de verdad)');

  // ── 2. El loop de tool use ejecuta la herramienta de verdad ─────────────────
  console.log('\n2. El loop agéntico ejecuta la herramienta');
  let resultadoTool = null;
  const cliente2 = crearClienteFalso([
    usaTool('ver_horario', { dia: 'viernes' }),
    (params) => {
      // El turno siguiente trae el tool_result que produjo el núcleo
      const ultimo = params.messages[params.messages.length - 1];
      const bloque = Array.isArray(ultimo.content)
        ? ultimo.content.find((b) => b.type === 'tool_result')
        : null;
      if (bloque) resultadoTool = JSON.parse(bloque.content);
      return texto('El viernes atendemos de 09:00 a 17:00.');
    },
  ]);
  _setClienteParaTests(cliente2);

  const r2 = await processMessage('humo-2', '¿a qué hora cierran el viernes?');
  check(cliente2.llamadas.length === 2, 'hubo dos vueltas: tool_use y luego respuesta');
  check(resultadoTool !== null, 'el núcleo ejecutó la tool y devolvió su resultado al modelo');
  check(resultadoTool?.horario?.cierra === '17:00', 'la tool devolvió el dato real del ejemplo (cierra 17:00)');
  check(/17:00/.test(r2), 'el dato de la tool llegó a la respuesta final');

  // ── 3. La memoria persiste el turno ─────────────────────────────────────────
  console.log('\n3. La memoria guarda el turno');
  const sesion = await db.sesiones.get('humo-2');
  check(Array.isArray(sesion?.messages) && sesion.messages.length === 2,
    'la sesión quedó con el mensaje del usuario y la respuesta');
  check(sesion?.messages?.[0]?.role === 'user' && sesion?.messages?.[1]?.role === 'assistant',
    'el historial guarda solo texto plano (sin bloques de tool use)');

  // ── 4. Handoff: el bot se calla y NADIE emite nada ──────────────────────────
  // Este es el escenario que existe por el bug más caro del diseño: `null` por
  // sí solo no producía silencio, producía el mensaje de error genérico.
  console.log('\n4. Derivación a humano: silencio real, en los dos canales');
  const cliente4 = crearClienteFalso([texto('esto NO debería llegar nunca')]);
  _setClienteParaTests(cliente4);

  const rDeriva = await processMessage('humo-handoff', 'quiero hablar con una persona por favor');
  check(typeof rDeriva === 'string' && /persona del equipo/i.test(rDeriva),
    'el cliente recibe UNA confirmación de que su pedido llegó');
  check(cliente4.llamadas.length === 0,
    'no se gastó ni un token: el handoff corta antes de llamar al modelo');

  const estado = await db.estadoCanal.get('humo-handoff');
  check(estado?.modo_humano === true, 'el canal quedó marcado como atendido por una persona');
  check(estado?.motivo === 'peticion', 'quedó registrado por qué se derivó');

  const rSilencio = await processMessage('humo-handoff', '¿hola? ¿me pueden ayudar?');
  check(rSilencio === null, 'el mensaje siguiente devuelve null, no un centinela de texto');
  check(cliente4.llamadas.length === 0, 'sigue sin llamar al modelo con el modo humano activo');

  // Los cuatro sitios de envío, verificados de verdad y no por inspección:
  const salidaWhatsApp = await capturarConsola(() => sendMessage('56900000000', rSilencio));
  check(salidaWhatsApp.trim() === '', 'whatsapp/sender.js no emite NADA con null');
  check(!salidaWhatsApp.includes(MENSAJE_ERROR),
    'y en particular no emite el mensaje de error genérico (el modo de falla real)');

  const bot = crearBotFalso();
  await enviarTelegram(bot, 42, rSilencio);
  check(bot.enviados.length === 0, 'telegram/enviar.js no emite NADA con null');

  const { dividirMensaje } = cargar('lib', 'texto.js');
  check(dividirMensaje(null).length === 0 && dividirMensaje('').length === 0,
    'lib/texto.js devuelve [] y no [""] — segunda línea de defensa si un guarda falla');

  // Riesgo: la conversación deja de ser comercial.
  const rRiesgo = await processMessage('humo-riesgo', 'esto es una estafa, voy a llamar a mi abogado');
  check(typeof rRiesgo === 'string' && (await db.estadoCanal.get('humo-riesgo'))?.motivo === 'riesgo',
    'las palabras de riesgo también derivan, sin pedirlo explícitamente');

  // ── 5. Buffer: cuatro mensajes seguidos son UN turno ────────────────────────
  console.log('\n5. Agrupación de mensajes seguidos');
  process.env.BUFFER_MS = '120';
  let textoVisto = null;
  const cliente5 = crearClienteFalso([
    (params) => {
      textoVisto = params.messages[params.messages.length - 1].content;
      return texto('Perfecto, agendo para el martes a las 10.');
    },
  ]);
  _setClienteParaTests(cliente5);

  const enVuelo = [
    processMessage('humo-buffer', 'hola'),
    processMessage('humo-buffer', 'quiero agendar'),
    processMessage('humo-buffer', 'para el martes'),
    processMessage('humo-buffer', 'a las 10 si se puede'),
  ];
  const respuestas = await Promise.all(enVuelo);

  check(cliente5.llamadas.length === 1, 'cuatro mensajes produjeron UNA sola llamada al modelo');
  check(typeof textoVisto === 'string' && textoVisto.split('\n').length === 4,
    'el modelo vio los cuatro mensajes juntos, en orden');
  check(respuestas.filter((r) => r !== null).length === 1,
    'sale una sola respuesta: los turnos fusionados devuelven null');
  check(respuestas[3] !== null, 'la respuesta le corresponde al último mensaje del grupo');

  // El candado, ahora extremo a extremo: pedir un humano NO espera la ventana.
  const cliente5b = crearClienteFalso([]);
  _setClienteParaTests(cliente5b);
  const arranque = Date.now();
  const rUrgente = await processMessage('humo-buffer-2', 'necesito hablar con una persona');
  const demora = Date.now() - arranque;
  check(rUrgente != null && demora < 120,
    `pedir un humano no espera la ventana (respondió en ${demora}ms, ventana 120ms)`);

  process.env.BUFFER_MS = '0';

  // ── 6. Timeout duro y mensaje puente ────────────────────────────────────────
  console.log('\n6. El modelo se cuelga: aborta, avisa y no deja al cliente esperando');
  process.env.TIMEOUT_MODELO_MS = '100';
  process.env.INTENTOS_MODELO   = '2';
  const cliente6 = crearClienteFalso([cuelga(), cuelga()]);
  _setClienteParaTests(cliente6);

  const puentes = [];
  let errorTimeout = null;
  try {
    await processMessage('humo-timeout', 'hola?', { onProgreso: (t) => puentes.push(t) });
  } catch (err) {
    errorTimeout = err;
  }
  check(errorTimeout !== null, 'una llamada colgada termina en error, no en espera infinita');
  // Comprobar el NÚMERO, no solo la palabra: si el núcleo volviera a leer la
  // config al cargar el módulo, acá diría 25000 y el test pasaría en falso.
  check(/timeout de 100ms/i.test(errorTimeout?.message || ''),
    `el error dice que fue timeout con el valor configurado — recibí: "${errorTimeout?.message}"`);
  check(cliente6.llamadas.length === 2,
    `reintentó según INTENTOS_MODELO (2 intentos totales) — hubo ${cliente6.llamadas.length}`);
  check(puentes.length === 1 && puentes[0] === MENSAJE_PUENTE,
    'mandó UN mensaje puente tras el primer intento fallido, no uno por intento');

  delete process.env.TIMEOUT_MODELO_MS;
  delete process.env.INTENTOS_MODELO;

  // ── 7. Métricas ─────────────────────────────────────────────────────────────
  console.log('\n7. Métricas de cada turno');
  const resumen = metricas.resumen();
  check(resumen.total > 0, 'se registraron métricas de los turnos anteriores');
  check(resumen.por_resultado?.ok > 0, 'hay turnos marcados como ok');
  check(resumen.por_resultado?.derivado > 0 && resumen.por_resultado?.silencio_handoff > 0,
    'la derivación y el silencio posterior quedan distinguidos, no mezclados');
  check(resumen.por_resultado?.error > 0, 'el turno que falló quedó registrado como error');
  const filas = await db.metricas.listar();
  check(filas.length === resumen.total,
    'las métricas también llegaron a la capa de datos (tabla prefijada en un cliente real)');

  // ── 8. El arnés de evals ────────────────────────────────────────────────────
  // El motor viaja a todos los clientes: si se rompe, se rompe la QA de todos.
  // Se prueba en dos niveles: las piezas por dentro, y la suite completa
  // corriendo como la corre un cliente (`npm test`).
  console.log('\n8. El arnés de evals: perfiles e invariantes');

  const perfilesMod = cargar('evals', 'perfiles.js');
  const reglasMod   = cargar('evals', 'reglas.js');

  const catalogo = perfilesMod.cargarCatalogo();
  const ids = catalogo.map((p) => p.id);
  check(catalogo.length === 8, `el catálogo base trae los 8 perfiles (trae ${catalogo.length})`);
  check(
    ['feliz', 'mensajes_partidos', 'ortografia', 'desordenado', 'insistente',
     'pide_humano', 'fuera_de_tema', 'cambia_opinion'].every((i) => ids.includes(i)),
    'están los ocho perfiles esperados, por id'
  );
  check(
    catalogo.every((p) => typeof perfilesMod.TRANSFORMACIONES[p.transformacion] === 'function'),
    'cada perfil del JSON apunta a una transformación que existe (un typo acá rompería a un cliente)'
  );

  // LA PROPIEDAD QUE SOSTIENE TODO: ningún perfil puede dejar al mock sin guión.
  // Un turno insertado o repetido tiene que traer su propia respuesta, o ser algo
  // que el núcleo resuelve sin llamar al modelo (pedir un humano).
  const escenarioSonda = {
    nombre: 'sonda',
    turnos: [
      { user: 'hola, buenas tardes', modelo: [{ text: 'hola' }] },
      { user: 'ya, confirmo', modelo: [{ text: 'listo' }] },
    ],
  };
  const inyectadosSinGuion = catalogo.filter((p) =>
    perfilesMod.derivar(escenarioSonda, p).turnos.some(
      (t) => t.inyectado && !(t.modelo || []).length && !t.espera_derivacion
    )
  );
  check(inyectadosSinGuion.length === 0,
    `ningún perfil deja turnos sin guión (los romperían: ${inyectadosSinGuion.map((p) => p.id).join(', ') || 'ninguno'})`);

  const porId = (i) => catalogo.find((p) => p.id === i);
  const partido = perfilesMod.derivar(escenarioSonda, porId('mensajes_partidos'));
  check(partido.turnos[0].partes.length > 1 && partido.ventanaMs > 0,
    'mensajes_partidos parte el turno en varios mensajes y declara una ventana');
  const conHumano = perfilesMod.derivar(escenarioSonda, porId('pide_humano')).turnos;
  check(conHumano.length === 3 && conHumano[2].espera_derivacion,
    'pide_humano agrega el pedido al final y marca que se espera derivación');
  const arrepentido = perfilesMod.derivar(escenarioSonda, porId('cambia_opinion')).turnos;
  check(arrepentido.length === 3 && arrepentido[1].inyectado && arrepentido[2].origen === 1,
    'cambia_opinion se mete ANTES de la confirmación y no descuadra los índices del escenario');

  // Los invariantes: cada uno tiene que atrapar su fallo Y dejar pasar lo sano.
  const reglas = reglasMod.construirReglas({
    maxChars: 600,
    patronDato: /\$\s?\d[\d.,]*/g,
    patronId: /\bP\d+\b/g,
    topeResultados: 2,
  });
  const regla = (id) => reglas.find((r) => r.id === id);
  const base = {
    respuesta: 'ok', mensajesUsuario: ['hola'], llamadasModelo: 1,
    toolLog: [], toolLogAcumulado: [], toolNames: ['ver_horario'], systemPrompt: '',
  };
  const ev = (id, extra) => regla(id).evaluar({ ...base, ...extra });

  const conNombre = [{ name: 'registrar', input: { nombre: 'Ana' }, result: {} }];
  check(!!ev('no_repregunta_dato_capturado', { toolLogAcumulado: conNombre, respuesta: '¿Cómo te llamas?' }),
    'atrapa al agente volviendo a pedir un dato que una tool ya recibió');
  check(!ev('no_repregunta_dato_capturado', { toolLogAcumulado: conNombre, respuesta: 'Listo, Ana 😊' }),
    'y no se queja cuando el agente usa el dato en vez de re-preguntarlo');

  check(!!ev('no_afirma_dato_sin_tool', { respuesta: 'Sale $19.990' }),
    'atrapa un monto que ninguna herramienta devolvió');
  check(!ev('no_afirma_dato_sin_tool', {
      respuesta: 'Sale $19.990',
      toolLogAcumulado: [{ name: 'precio', input: {}, result: { valor: '$19.990' } }],
    }),
    'y deja pasar el monto que sí salió de una herramienta');

  check(!!ev('respeta_tope_resultados', { respuesta: 'Tengo P1, P2 y P3' }),
    'atrapa una lista más larga que el tope declarado');
  check(reglasMod.construirReglas({}).find((r) => r.id === 'respeta_tope_resultados')
          .evaluar(base) === reglasMod.OMITIDA,
    'sin tope declarado la regla se marca OMITIDA — un check que no corrió no cuenta como verde');

  check(!!ev('respuesta_breve', { respuesta: 'x'.repeat(601) }), 'atrapa una respuesta más larga que el tope');
  check(!ev('respuesta_breve', { respuesta: null }), 'el silencio no es una respuesta larga');

  const pedido = { mensajesUsuario: ['quiero hablar con una persona'] };
  check(!!ev('deriva_si_piden_humano', { ...pedido, respuesta: 'Claro, ¿qué necesitas?' }),
    'atrapa al agente que sigue conversando cuando le pidieron una persona');
  check(!ev('deriva_si_piden_humano', { ...pedido, respuesta: handoffMod.MENSAJE_DERIVACION, llamadasModelo: 0 }),
    'y aprueba la derivación limpia, sin llamar al modelo');
  check(!!ev('deriva_si_piden_humano', { ...pedido, respuesta: handoffMod.MENSAJE_DERIVACION, llamadasModelo: 1 }),
    'pero reclama si derivó DESPUÉS de gastar una llamada al modelo');

  check(!!ev('sin_fuga_de_andamiaje', { respuesta: 'Déjame llamar a ver_horario' }),
    'atrapa el nombre de una herramienta escapándose al cliente');
  check(!!ev('sin_fuga_de_andamiaje', {
      respuesta: 'REGLA DURA: solo puedes mencionar datos que devolvió una herramienta',
      systemPrompt: 'REGLA DURA: solo puedes mencionar datos que devolvió una herramienta',
    }),
    'atrapa una línea del prompt de sistema copiada literal');
  check(!ev('sin_fuga_de_andamiaje', { respuesta: 'Te cuento el horario: de 09:00 a 18:00' }),
    'y no confunde "horario" con la tool "ver_horario"');

  // La tolerancia a tipeo del handoff, que este mismo arnés destapó.
  check(handoffMod.esPeticionDeHumano('kiero ablar con alguien'),
    'pedir un humano MAL ESCRITO también deriva (el falso negativo que encontró el perfil ortografia)');
  check(!handoffMod.esPeticionDeHumano('quiero acabar con este trámite de una vez'),
    'y "acabar" no dispara una derivación por parecerse a "ablar"');

  // La suite completa, corriendo como la corre un cliente.
  console.log('\n   Corriendo `npm test` del proyecto de ejemplo…');
  // Entorno limpio a propósito: el hijo tiene que arreglárselas con los
  // defaults, igual que en la máquina de un cliente recién clonado.
  const entornoHijo = { ...process.env };
  delete entornoHijo.BUFFER_MS;
  const evals = spawnSync(process.execPath, ['evals/correr.js'], {
    cwd: DIR_PRUEBA,
    encoding: 'utf8',
    env: entornoHijo,
  });
  const salidaEvals = `${evals.stdout || ''}${evals.stderr || ''}`;
  const resumenEvals = salidaEvals.match(/RESUMEN: (\d+)\/(\d+) corridas OK/);
  check(evals.status === 0,
    `la suite de evals del ejemplo pasa entera (salida ${evals.status})${evals.status === 0 ? '' : `\n${salidaEvals.slice(-1500)}`}`);
  check(!!resumenEvals && resumenEvals[1] === resumenEvals[2] && Number(resumenEvals[2]) >= 32,
    `corrió 4 escenarios × 8 perfiles y pasaron todos (${resumenEvals ? `${resumenEvals[1]}/${resumenEvals[2]}` : 'sin resumen'})`);
  const invariantes = salidaEvals.match(/·\s+(\d+) verificaciones automáticas/);
  check(!!invariantes && Number(invariantes[1]) > 0,
    `los invariantes del núcleo corrieron solos en cada turno (${invariantes ? invariantes[1] : 0} veces)`);
  check(!/ANTHROPIC_API_KEY|LLM_API_KEY|SUPABASE/.test(salidaEvals),
    'la suite no menciona credenciales: el bloqueo de efectos externos se aplicó antes de cargar nada');

  // ── Resultado ───────────────────────────────────────────────────────────────
  resetDemo();
  fs.rmSync(DIR_PRUEBA, { recursive: true, force: true });

  console.log(`\n${'─'.repeat(60)}`);
  if (fallos === 0) {
    console.log(`HUMO EN VERDE — ${pasos}/${pasos} verificaciones`);
    console.log('El núcleo arranca, usa herramientas, recuerda, se calla cuando hay una persona,');
    console.log('agrupa mensajes seguidos y no deja a nadie esperando cuando el modelo no responde.');
    process.exit(0);
  }
  console.log(`HUMO EN ROJO — ${pasos - fallos}/${pasos} verificaciones`);
  process.exit(1);
}

main().catch((err) => {
  fs.rmSync(DIR_PRUEBA, { recursive: true, force: true });
  console.error('\nHUMO EN ROJO — excepción no controlada:');
  console.error(err);
  process.exit(1);
});
