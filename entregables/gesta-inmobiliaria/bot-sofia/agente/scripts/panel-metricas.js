// Panel de métricas del agente.  Uso: npm run metricas [-- --dias=7]
//
// POR QUÉ EXISTE: el núcleo escribe una fila por turno desde la versión 1.1.0, y
// hasta acá nadie las leía nunca. Una tabla que solo se escribe es trabajo que
// no sirve: la pregunta que hay que poder contestar en una marcha blanca es
// "¿esto está funcionando?", y contestarla mirando el chat no escala.
//
// QUÉ MIDE Y QUÉ NO:
//   · Del NÚCLEO      → volumen, derivaciones, errores, velocidad, tokens.
//                       Significan lo mismo en cualquier rubro.
//   · Del NEGOCIO     → los hitos (agendó, calificó, no supe). El núcleo no
//                       puede saber qué es "calificar" en una dental; el
//                       cliente los marca con metricas.marcarHito() y los
//                       declara en `metricas.hitos` de agente.config.json.
//   · NO mide calidad de conversación. Un agente puede tener 0 errores y
//                       responder pésimo. Eso se mira leyendo chats.
//
// Se separa en dos: `calcular` es una función pura sobre filas (la prueba de
// humo la corre con la conversación que acaba de tener) y el CLI, que lee las
// filas de la capa de datos. Sin esa separación, el panel solo se podría
// probar con una base de verdad — o sea, no se probaría.

const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const DIA_MS = 86400000;

// ─── Cálculo (puro) ──────────────────────────────────────────────────────────

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// La escalera 50/75/90/100. Existe porque un número suelto ("gastaste US$ 45")
// no dice nada sin el techo al lado, y porque el aviso tiene que llegar ANTES
// del 100%: enterarse de que se acabó el tramo gratis el día que se acabó es
// enterarse tarde.
const TRAMOS = [
  { desde: 1.00, tramo: 'excedido', simbolo: '🔴', frase: 'excedido' },
  { desde: 0.90, tramo: 'critico',  simbolo: '🔴', frase: '90% consumido' },
  { desde: 0.75, tramo: 'alerta',   simbolo: '🟡', frase: '75% consumido' },
  { desde: 0.50, tramo: 'aviso',    simbolo: '🟡', frase: '50% consumido' },
  { desde: 0,    tramo: 'ok',       simbolo: '·',  frase: 'holgado' },
];

function escalera(usado, tope) {
  if (!(tope > 0) || usado == null) return null;
  const pct = usado / tope;
  const t = TRAMOS.find((x) => pct >= x.desde);
  return { usado, tope, pct, tramo: t.tramo, simbolo: t.simbolo, frase: t.frase };
}

function mediana(valores) {
  if (!valores.length) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : Math.round((orden[medio - 1] + orden[medio]) / 2);
}

function percentil(valores, p) {
  if (!valores.length) return null;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor(orden.length * p))];
}

/**
 * @param {object[]} filas filas de la tabla de métricas (o de memoria)
 * @param {{ hitosDeclarados?: string[], precioEntrada?: number, precioSalida?: number,
 *           presupuestoMes?: number, topeTurnosDia?: number }} [opciones]
 *        precios y presupuesto en USD (precios por millón de tokens)
 */
function calcular(filas, opciones = {}) {
  const ordenadas = [...filas].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const turnos = ordenadas.length;

  // Una conversación = un canal_id. Es la unidad que le importa al dueño: 40
  // turnos pueden ser 40 personas o una sola escribiendo mucho, y no es lo mismo.
  const porCanal = new Map();
  for (const f of ordenadas) {
    const id = f.canal_id || '(sin canal)';
    if (!porCanal.has(id)) porCanal.set(id, []);
    porCanal.get(id).push(f);
  }
  const conversaciones = porCanal.size;

  const porResultado = {};
  for (const f of ordenadas) porResultado[f.resultado || '(sin resultado)'] =
    (porResultado[f.resultado || '(sin resultado)'] || 0) + 1;

  // Derivación: se cuenta por CONVERSACIÓN, no por turno. Un turno `derivado`
  // seguido de tres `silencio_handoff` es una derivación, no cuatro.
  const derivadas = [...porCanal.values()].filter((fs) => fs.some((f) => f.resultado === 'derivado')).length;
  const conError  = [...porCanal.values()].filter((fs) => fs.some((f) => f.resultado === 'error')).length;

  const duraciones = ordenadas.map((f) => num(f.duracion_ms)).filter((d) => d !== null);
  const primeros = [...porCanal.values()]
    .map((fs) => num(fs[0].duracion_ms))
    .filter((d) => d !== null);

  // ── Hitos ──
  // Se listan los declarados aunque nunca hayan ocurrido: un hito en 0% es
  // exactamente la señal que hay que ver, y si no aparece, no se ve.
  const observados = new Set(ordenadas.map((f) => f.hito).filter(Boolean));
  const nombresHito = [...new Set([...(opciones.hitosDeclarados || []), ...observados])];
  const hitos = nombresHito.map((hito) => {
    const alcanzaron = [];
    for (const fs of porCanal.values()) {
      const posicion = fs.findIndex((f) => f.hito === hito);
      if (posicion >= 0) alcanzaron.push(posicion + 1); // turnos hasta llegar, 1-based
    }
    return {
      hito,
      conversaciones: alcanzaron.length,
      tasa: conversaciones ? alcanzaron.length / conversaciones : 0,
      turnos_hasta: mediana(alcanzaron),
      declarado: (opciones.hitosDeclarados || []).includes(hito),
    };
  }).sort((a, b) => b.conversaciones - a.conversaciones);

  // ── Agentes del flujo ──
  // Solo aparece si el cliente partió el agente en varios: en un agente único la
  // columna viene vacía y esta sección no se dibuja. `terminaron` es la que
  // importa de verdad — dónde se quedan las conversaciones — porque es la que
  // dice si partir el agente sirvió de algo o solo agregó pasos.
  const usoAgentes = new Map();
  const tocar = (id, campo) => {
    if (!usoAgentes.has(id)) usoAgentes.set(id, { id, turnos: 0, conversaciones: 0, terminaron: 0 });
    usoAgentes.get(id)[campo]++;
  };
  for (const fs of porCanal.values()) {
    for (const f of fs) if (f.agente) tocar(f.agente, 'turnos');
    for (const id of new Set(fs.map((f) => f.agente).filter(Boolean))) tocar(id, 'conversaciones');
    const ultimo = [...fs].reverse().find((f) => f.agente);
    if (ultimo) tocar(ultimo.agente, 'terminaron');
  }
  const agentes = [...usoAgentes.values()].sort((a, b) => b.turnos - a.turnos);

  // ── Herramientas ──
  const usoTools = {};
  for (const f of ordenadas) {
    const lista = Array.isArray(f.tools) ? f.tools : [];
    for (const t of lista) usoTools[t] = (usoTools[t] || 0) + 1;
  }
  const tools = Object.entries(usoTools)
    .map(([nombre, veces]) => ({ nombre, veces }))
    .sort((a, b) => b.veces - a.veces);

  // ── Tokens y costo ──
  const conTokens = ordenadas.filter((f) => num(f.tokens_entrada) !== null || num(f.tokens_salida) !== null);
  const entrada = conTokens.reduce((s, f) => s + (num(f.tokens_entrada) || 0), 0);
  const salida  = conTokens.reduce((s, f) => s + (num(f.tokens_salida)  || 0), 0);
  const precioEntrada = opciones.precioEntrada || 0;
  const precioSalida  = opciones.precioSalida  || 0;
  const hayPrecio = precioEntrada > 0 || precioSalida > 0;
  const costoUsd = hayPrecio ? (entrada / 1e6) * precioEntrada + (salida / 1e6) * precioSalida : null;

  // ── Ritmo diario, presupuesto y tramo del plan ──
  // DOS escaleras y no una, porque el gasto se sale de madre por dos caminos
  // distintos: el del dinero (mensual, se proyecta) y el de la cuota del
  // proveedor (diaria, NO se promedia). El free tier de Gemini y compañía no se
  // agota en dólares sino en pedidos por día: un cliente puede estar cruzando al
  // tramo pagado todos los martes con el costo marcando US$ 0.00 el mes entero.
  // Por eso el tope del plan se mide contra el día PICO, no contra el promedio.
  const porDia = new Map();
  for (const f of ordenadas) {
    const dia = String(f.ts).slice(0, 10);   // fecha UTC: es la que cuenta la cuota del proveedor, no la del dueño
    if (!porDia.has(dia)) porDia.set(dia, { dia, turnos: 0 });
    porDia.get(dia).turnos++;
  }
  const dias = [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  const diaPico = dias.reduce((mx, d) => (!mx || d.turnos > mx.turnos ? d : mx), null);

  // Proyectar desde menos de un día de datos es inventar. Se dice, no se estima.
  const desdeMs = Date.parse(ordenadas[0]?.ts);
  const hastaMs = Date.parse(ordenadas[turnos - 1]?.ts);
  const spanDias = Number.isFinite(desdeMs) && Number.isFinite(hastaMs) && hastaMs > desdeMs
    ? (hastaMs - desdeMs) / DIA_MS
    : 0;
  const proyectable = spanDias >= 1;
  const costoDia = proyectable && costoUsd != null ? costoUsd / spanDias : null;
  const costoMes = costoDia != null ? costoDia * 30 : null;

  const presupuestoMes = opciones.presupuestoMes || 0;
  const topeTurnosDia  = opciones.topeTurnosDia  || 0;

  // Un tope declarado que todavía no se puede medir NO desaparece del panel: se
  // lista diciendo por qué no se puede medir. Mismo criterio que un hito en 0%.
  let presupuesto = null;
  if (presupuestoMes > 0) {
    presupuesto = costoMes == null
      ? { tope: presupuestoMes, tramo: 'sin_dato', simbolo: '·',
          motivo: hayPrecio ? 'ventana_corta' : 'sin_precio' }
      : { ...escalera(costoMes, presupuestoMes),
          dias_para_agotar: costoDia > 0 ? Math.floor(presupuestoMes / costoDia) : null };
  }
  const planDiario = diaPico ? escalera(diaPico.turnos, topeTurnosDia) : null;
  if (planDiario) planDiario.dia = diaPico.dia;

  return {
    ventana: {
      desde: ordenadas[0]?.ts ?? null,
      hasta: ordenadas[turnos - 1]?.ts ?? null,
    },
    turnos,
    conversaciones,
    por_resultado: porResultado,
    derivacion: { conversaciones: derivadas, tasa: conversaciones ? derivadas / conversaciones : 0 },
    errores: {
      turnos: porResultado.error || 0,
      conversaciones: conError,
      tasa: turnos ? (porResultado.error || 0) / turnos : 0,
    },
    velocidad: {
      primer_contacto_ms: mediana(primeros),
      mediana_ms: mediana(duraciones),
      p95_ms: percentil(duraciones, 0.95),
      turnos_medidos: duraciones.length,
    },
    hitos,
    agentes,
    tools,
    tokens: {
      turnos_con_dato: conTokens.length,
      turnos_sin_dato: turnos - conTokens.length,
      entrada,
      salida,
      por_conversacion: conversaciones ? Math.round((entrada + salida) / conversaciones) : 0,
      costo_usd: costoUsd,
    },
    ritmo: {
      dias_con_datos: dias.length,
      span_dias: Number(spanDias.toFixed(2)),
      proyectable,
      turnos_dia: proyectable ? Math.round(turnos / spanDias) : null,
      dia_pico: diaPico,
      costo_usd_dia: costoDia,
      costo_usd_mes_proyectado: costoMes,
    },
    presupuesto,
    plan_diario: planDiario,
  };
}

// ─── Presentación ────────────────────────────────────────────────────────────

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const ms  = (v) => (v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`);
const miles = (n) => n.toLocaleString('es-CL');
const veces = (n) => `${miles(n)} ${n === 1 ? 'vez' : 'veces'}`;

// Las fechas se guardan en UTC y se muestran en la zona del cliente. Sin esto el
// panel dice "02:09" de una conversación que ocurrió a las 23:09, y un dueño que
// ve una hora que no reconoce deja de creerle al resto del panel.
function fecha(iso, zona) {
  if (!iso) return '—';
  if (!zona) return String(iso).replace('T', ' ').slice(0, 16);
  try {
    return new Date(iso).toLocaleString('es-CL', {
      timeZone: zona, dateStyle: 'short', timeStyle: 'short',
    });
  } catch {
    return String(iso).replace('T', ' ').slice(0, 16);
  }
}

function render(ind, opciones = {}) {
  const L = [];
  const titulo = opciones.nombre || 'Agente';
  L.push('═'.repeat(74));
  L.push(`Panel de métricas — ${titulo}`);
  L.push(`Ventana: ${fecha(ind.ventana.desde, opciones.zona)} → ${fecha(ind.ventana.hasta, opciones.zona)}` +
         `   ·   ${miles(ind.turnos)} turnos   ·   ${miles(ind.conversaciones)} conversaciones`);
  L.push('═'.repeat(74));

  if (!ind.turnos) {
    L.push('');
    L.push('No hay filas de métricas todavía.');
    L.push('');
    L.push(opciones.modo === 'memoria'
      ? 'Este proyecto corre SIN Supabase: las métricas viven en el proceso del bot y se\n' +
        'pierden al reiniciarlo, así que este comando (otro proceso) no las ve. Para\n' +
        'medir de verdad: configura SUPABASE_URL, corre `npm run schema` y aplica el DDL.'
      : 'La tabla existe y está vacía: o el agente no ha conversado, o `metricas.activas`\n' +
        'está en false en agente.config.json.');
    L.push('═'.repeat(74));
    return L.join('\n');
  }

  L.push('');
  L.push('CÓMO LE FUE AL CLIENTE');
  for (const [resultado, n] of Object.entries(ind.por_resultado).sort((a, b) => b[1] - a[1])) {
    L.push(`  ${etiqueta(resultado).padEnd(34)} ${String(miles(n)).padStart(6)}   ${pct(n / ind.turnos)} de los turnos`);
  }
  L.push('');
  L.push(`  Conversaciones derivadas a una persona: ${ind.derivacion.conversaciones} (${pct(ind.derivacion.tasa)})`);
  L.push(`  Conversaciones con algún error:         ${ind.errores.conversaciones} (${pct(ind.errores.tasa)} de los turnos)`);

  L.push('');
  L.push('QUÉ TAN RÁPIDO');
  L.push(`  Primer contacto (mediana)      ${ms(ind.velocidad.primer_contacto_ms)}`);
  L.push(`  Turno típico (mediana)         ${ms(ind.velocidad.mediana_ms)}`);
  L.push(`  Los peores turnos (p95)        ${ms(ind.velocidad.p95_ms)}`);

  if (ind.hitos.length) {
    L.push('');
    L.push('HITOS DEL NEGOCIO   (los declara el cliente en metricas.hitos)');
    for (const h of ind.hitos) {
      const cola = h.conversaciones
        ? `${String(h.conversaciones).padStart(4)} conv.  ${pct(h.tasa).padStart(6)}   ` +
          `mediana ${h.turnos_hasta} turno(s) hasta llegar`
        : '   0 conv.       —   declarado y nunca ocurrió';
      L.push(`  ${h.hito.padEnd(24)} ${cola}`);
    }
  }

  if (ind.agentes.length) {
    L.push('');
    L.push('EN QUÉ PARTE DE LA CONVERSACIÓN   (solo si partiste el agente en varios)');
    for (const a of ind.agentes) {
      L.push(`  ${a.id.padEnd(24)} ${String(a.turnos).padStart(5)} turnos  ·  ` +
             `${String(a.conversaciones).padStart(4)} conv. pasaron  ·  ` +
             `${String(a.terminaron).padStart(4)} quedaron ahí (${pct(a.terminaron / ind.conversaciones)})`);
    }
    L.push('  "Quedaron ahí" es dónde se detuvo cada conversación. Si una parte concentra');
    L.push('  las que se detienen, ahí está el problema — no en el agente que la precede.');
  }

  if (ind.tools.length) {
    L.push('');
    L.push('HERRAMIENTAS MÁS USADAS');
    for (const t of ind.tools.slice(0, 8)) {
      L.push(`  ${t.nombre.padEnd(28)} ${veces(t.veces).padStart(10)}`);
    }
  }

  L.push('');
  L.push('LO QUE CUESTA');
  if (!ind.tokens.turnos_con_dato) {
    L.push('  Tokens: sin dato. El proveedor de LLM no informó uso en ningún turno');
    L.push('          (el modo mock no gasta tokens, así que acá siempre sale vacío).');
  } else {
    L.push(`  Tokens   entrada ${miles(ind.tokens.entrada)}  ·  salida ${miles(ind.tokens.salida)}` +
           `  ·  ${miles(ind.tokens.por_conversacion)} por conversación`);
    if (ind.tokens.turnos_sin_dato) {
      L.push(`           (${ind.tokens.turnos_sin_dato} turno(s) sin dato de uso, no entran en el total)`);
    }
    L.push(ind.tokens.costo_usd == null
      ? '  Costo    no declarado. Pon el precio de tu proveedor en metricas.precio_usd_millon_*\n' +
        '           de agente.config.json y este panel lo convierte a dólares.'
      : `  Costo    US$ ${ind.tokens.costo_usd.toFixed(4)} en la ventana` +
        `  ·  US$ ${(ind.tokens.costo_usd / ind.conversaciones).toFixed(5)} por conversación`);
  }

  const r = ind.ritmo;
  L.push(`  Ritmo    ${r.turnos_dia == null ? '—' : `${miles(r.turnos_dia)} turnos/día`}` +
         `  ·  día más cargado: ${r.dia_pico ? `${r.dia_pico.dia} con ${miles(r.dia_pico.turnos)} turnos` : '—'}` +
         `  ·  ${r.dias_con_datos} día(s) con datos`);
  if (!r.proyectable) {
    L.push('           (menos de 24 h de datos: no se proyecta nada, proyectar desde acá');
    L.push('           sería inventar una cifra que después nadie recuerda que era falsa)');
  }

  // ── Presupuesto y tramo del plan ──
  // Solo se dibuja si el cliente declaró un techo. Sin techo declarado no hay
  // nada contra qué comparar, y una escalera con un tope inventado avisaría a la
  // hora equivocada — que es peor que no avisar.
  if (ind.presupuesto || ind.plan_diario) {
    L.push('');
    L.push('PRESUPUESTO Y TRAMO DEL PLAN');

    const p = ind.presupuesto;
    if (p && p.tramo === 'sin_dato') {
      L.push(`  Dinero   ·  tope US$ ${p.tope.toFixed(2)}/mes declarado, todavía sin poder medirlo:`);
      L.push(p.motivo === 'sin_precio'
        ? '           falta el precio del proveedor (metricas.precio_usd_millon_*).'
        : '           hace falta al menos 24 h de conversaciones para proyectar el mes.');
    } else if (p) {
      L.push(`  Dinero   ${p.simbolo} [${pct(p.pct)} — ${p.frase}]  proyección US$ ${p.usado.toFixed(2)}/mes ` +
             `contra un tope de US$ ${p.tope.toFixed(2)}`);
      if (p.dias_para_agotar != null) {
        L.push(`           al ritmo actual el presupuesto del mes se agota en ${p.dias_para_agotar} día(s)`);
      }
    }

    const d = ind.plan_diario;
    if (d) {
      L.push(`  Plan     ${d.simbolo} [${pct(d.pct)} — ${d.frase}]  el día más cargado (${d.dia}) tuvo ` +
             `${miles(d.usado)} turnos y el tope declarado es ${miles(d.tope)}/día`);
      if (d.tramo === 'excedido') {
        L.push('           ese día el agente SE PASÓ de la cuota del plan. Si el plan es un free');
        L.push('           tier, ahí empezó a cobrar o a rechazar pedidos — revísalo con el proveedor.');
      }
    }
  }

  L.push('');
  L.push('LO QUE ESTE PANEL NO PUEDE DECIR');
  L.push('  · Si las respuestas fueron buenas. Cero errores y cero derivaciones también');
  L.push('    describen a un agente que contesta cualquier cosa sin caerse.');
  L.push('  · Por qué se derivó una conversación: mira la columna `motivo` en la tabla.');
  if (!ind.hitos.length) {
    L.push('  · Cuántas conversaciones terminaron en negocio. Para eso hay que marcar hitos:');
    L.push('    metricas.marcarHito(canalId, "agendo") dentro de la tool que lo consigue.');
  }
  if (!ind.presupuesto && !ind.plan_diario) {
    L.push('  · Si este cliente va camino a salirse de su plan. Declara el techo en');
    L.push('    metricas.presupuesto_usd_mes y metricas.tope_turnos_dia de agente.config.json');
    L.push('    y el panel avisa al 50/75/90/100% en vez de al día que ya pasó.');
  }
  L.push('═'.repeat(74));
  return L.join('\n');
}

function etiqueta(resultado) {
  return {
    ok: 'Respondidos por el bot',
    derivado: 'Derivados a una persona',
    silencio_handoff: 'Silencio (ya atendía una persona)',
    error: 'Errores',
  }[resultado] || resultado;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  try { require(path.join(RAIZ, 'node_modules', 'dotenv')).config({ path: path.join(RAIZ, '.env') }); }
  catch { /* sin dotenv: se lee el entorno tal cual */ }

  const config = require(path.join(RAIZ, 'config'));
  const { db, modo } = require(path.join(RAIZ, 'database', 'supabase'));

  const arg = (bandera) => {
    const a = process.argv.slice(2).find((x) => x.startsWith(`--${bandera}=`));
    return a ? a.split('=').slice(1).join('=') : null;
  };
  const dias = Number(arg('dias')) > 0 ? Number(arg('dias')) : null;

  let filas = [];
  try {
    filas = (await db.metricas?.listar?.()) || [];
  } catch (error) {
    console.error(`\n❌ No pude leer la tabla de métricas: ${error.message}`);
    console.error(`   Tabla esperada: ${config.valor('datos.tabla_metricas')}. ` +
      'Si no existe, corre `npm run schema` y aplica el DDL en Supabase.\n');
    return 1;
  }

  if (dias) {
    const corte = new Date(Date.now() - dias * 86400000).toISOString();
    filas = filas.filter((f) => String(f.ts) >= corte);
  }

  const ind = calcular(filas, {
    hitosDeclarados: config.valor('metricas.hitos'),
    precioEntrada: config.valor('metricas.precio_usd_millon_entrada'),
    precioSalida:  config.valor('metricas.precio_usd_millon_salida'),
    presupuestoMes: config.valor('metricas.presupuesto_usd_mes'),
    topeTurnosDia:  config.valor('metricas.tope_turnos_dia'),
  });

  console.log('\n' + render(ind, {
    nombre: config.valor('cliente.nombre'),
    zona: config.valor('cliente.zona_horaria'),
    modo,
  }) + '\n');
  return 0;
}

module.exports = { calcular, render };

if (require.main === module) {
  main().then((c) => { process.exitCode = c; }).catch((e) => {
    console.error(`\n❌ El panel se cayó: ${e.message}\n`);
    process.exitCode = 1;
  });
}
