// Simulador de conversaciones + suite de evaluación del agente de citas.
// Corre SIN WhatsApp y SIN Supabase (usa la base en memoria). Dos modos:
//
//   - Con ANTHROPIC_API_KEY en .env (y MOCK != 'true'): conversa con el
//     modelo REAL vía la API de Anthropic. Los guiones de mock se ignoran; se
//     evalúa la respuesta y el estado de la DB.
//   - Sin API key, o con MOCK=true: inyecta un MOCK del cliente que sigue un
//     guión por escenario (tool use incluido). Sirve para evaluar de forma
//     determinista el flujo, las herramientas y las validaciones — sin gastar
//     tokens ni necesitar credenciales.
//
// El mock respeta TOOL_DEFINITIONS: si el guión pide una herramienta que el
// agente NO tiene definida, responde como lo haría el modelo real ("eso no lo
// tengo") — así los tests detectan capacidades faltantes.
//
// Uso: npm test   (o node scripts/test-chat.js)
// Forzar mock aunque haya API key: MOCK=true npm test

require('dotenv').config();

const MODO_MOCK = process.env.MOCK === 'true' || !process.env.ANTHROPIC_API_KEY;

// ─── Mock del cliente LLM (se inyecta ANTES de cargar el agente) ─────────────

const mockState = { queue: [], toolLog: [], contadorId: 0, fechas: null };

function ctxMock() {
  return {
    fechas: mockState.fechas,
    lastResult(nombre) {
      for (let i = mockState.toolLog.length - 1; i >= 0; i--) {
        const e = mockState.toolLog[i];
        if (e.name === nombre && e.result != null) return e.result;
      }
      return null;
    },
  };
}

function respuestaTexto(texto) {
  return { stop_reason: 'end_turn', content: [{ type: 'text', text: texto }] };
}

async function crearRespuestaMock(params) {
  const disponibles = new Set((params.tools || []).map((t) => t.name));

  // Registrar los tool_result que devuelve el loop del agente
  const ultimo = params.messages[params.messages.length - 1];
  if (Array.isArray(ultimo?.content)) {
    for (const bloque of ultimo.content) {
      if (bloque.type !== 'tool_result') continue;
      const pendiente = mockState.toolLog.find((e) => e.id === bloque.tool_use_id);
      if (pendiente) {
        try { pendiente.result = JSON.parse(bloque.content); }
        catch { pendiente.result = bloque.content; }
      }
    }
  }

  const paso = mockState.queue.shift();
  if (!paso) return respuestaTexto('¿Te ayudo con algo más? 😊');

  if (paso.tools) {
    const faltantes = paso.tools.filter((t) => !disponibles.has(t.name));
    if (faltantes.length) {
      // La herramienta no existe en TOOL_DEFINITIONS: el modelo real no podría
      // llamarla. Simulamos la respuesta "no puedo" y cortamos el guión del turno.
      for (const t of faltantes) {
        mockState.toolLog.push({ id: null, name: t.name, input: null, result: null, unavailable: true });
      }
      mockState.queue.length = 0;
      return respuestaTexto('Mmm, eso todavía no lo tengo disponible 😅 Puedo mostrarte el catálogo o agendarte una hora.');
    }
    const contenido = paso.tools.map((t) => {
      const input = typeof t.input === 'function' ? t.input(ctxMock()) : (t.input || {});
      const id = `toolu_mock_${++mockState.contadorId}`;
      mockState.toolLog.push({ id, name: t.name, input, result: null });
      return { type: 'tool_use', id, name: t.name, input };
    });
    return { stop_reason: 'tool_use', content: contenido };
  }

  const texto = typeof paso.text === 'function' ? paso.text(ctxMock()) : paso.text;
  return respuestaTexto(texto);
}

const { processMessage, _setClienteParaTests } = require('../agent/core');
const { db, usandoMemoria } = require('../database/supabase');

if (MODO_MOCK) {
  const clienteMock = {
    messages: { create: crearRespuestaMock },
    beta: { messages: { create: crearRespuestaMock } },
  };
  _setClienteParaTests(clienteMock);
}

if (!usandoMemoria) {
  console.error('Esta suite requiere el modo demo (base en memoria). Quita SUPABASE_URL/SUPABASE_KEY del .env para correrla.');
  process.exit(1);
}

// ─── Fechas relativas (zona horaria de Chile) ────────────────────────────────

const TZ = 'America/Santiago';
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

function addDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const diaSemanaISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
function proximo(diaObjetivo, desde) {
  let f = addDias(desde, 1);
  while (diaSemanaISO(f) !== diaObjetivo) f = addDias(f, 1);
  return f;
}
function natural(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${DIAS[diaSemanaISO(iso)]} ${d} de ${MESES[m - 1]}`;
}
const precio = (n) => (n > 0 ? `$${Number(n).toLocaleString('es-CL')}` : 'sin costo de reserva');

function calcularFechas() {
  const hoy = hoyChile();
  let pasada = addDias(hoy, -1);
  if (diaSemanaISO(pasada) === 0) pasada = addDias(pasada, -1); // evitar domingo (cerrado): queremos probar el rechazo por FECHA PASADA, no por día cerrado
  return {
    hoy,
    pasada,
    lunes: proximo(1, hoy),
    martes: proximo(2, hoy),
    jueves: proximo(4, hoy),
    viernes: proximo(5, hoy),
    domingo: proximo(0, hoy),
  };
}

// ─── Escenarios ───────────────────────────────────────────────────────────────
// Cada escenario: { nombre, turnos: [{ user, modelo: guión-mock, despues? }], seed?, expect }
// En modo real (con API key) el guión `modelo` se ignora.
// `check(cond, msg)` acumula errores; los checks marcados soloMock se saltan en modo real.

const vigentes = (tel) => db.citas.proximasPorTelefono(tel, '2000-01-01');

const ESCENARIOS = [
  {
    nombre: 'catálogo completo ("¿Qué servicios tienen?")',
    turnos: [{
      user: '¿Qué servicios tienen disponibles?',
      modelo: [
        { tools: [{ name: 'ver_catalogo', input: {} }] },
        { text: (c) => {
            const r = c.lastResult('ver_catalogo');
            if (!r?.servicios) return 'Por ahora no tengo servicios cargados 😅';
            return 'Tenemos: ' + r.servicios.map((s) => `${s.nombre} (${precio(s.precio)})`).join(' · ') + '. ¿Te agendo una hora? 😊';
          } },
      ],
    }],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      check(/consulta general/i.test(r), 'La respuesta no menciona "Consulta general"');
      check(/limpieza dental/i.test(r), 'La respuesta no menciona "Limpieza dental"');
      check(r.includes('45.000'), 'Los precios no aparecen con punto de miles ($45.000)');
    },
  },
  {
    nombre: 'precio de una consulta',
    turnos: [{
      user: '¿Cuánto cuesta una consulta?',
      modelo: [
        { tools: [{ name: 'ver_catalogo', input: { categoria: 'consulta' } }] },
        { text: (c) => {
            const s = c.lastResult('ver_catalogo')?.servicios?.[0];
            return s ? `La ${s.nombre} cuesta ${precio(s.precio)} (${s.duracion_minutos} min). ¿Quieres que te agende una hora? 😊` : 'No encontré ese servicio en el catálogo 😅';
          } },
      ],
    }],
    async expect(ctx, check) {
      check(ctx.respuestas[0].includes('25.000'), 'No informa el precio $25.000 de la consulta');
    },
  },
  {
    nombre: 'horario de atención ("¿A qué hora abren?")',
    turnos: [{
      user: '¿A qué hora abren?',
      modelo: [
        { tools: [{ name: 'ver_horarios', input: {} }] },
        { text: (c) => {
            const r = c.lastResult('ver_horarios');
            if (!r?.horarios) return 'Mmm, no tengo esa información cargada 😅';
            return 'Nuestro horario: ' + r.horarios.map((h) => (h.cerrado ? `${h.dia}: cerrado` : `${h.dia}: ${h.abre} a ${h.cierra}`)).join(' · ');
          } },
      ],
    }],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      check(r.includes('09:00'), 'No informa la hora de apertura (09:00)');
      check(/lunes/i.test(r), 'No menciona los días de atención');
      check(/domingo.{0,3}\s*cerrado/i.test(r), 'No aclara que el domingo está cerrado');
    },
  },
  {
    nombre: 'agendar hora feliz (martes, con confirmación previa)',
    turnos: [
      {
        user: 'Hola! Quiero agendar una hora para el martes',
        modelo: [
          { tools: [{ name: 'consultar_disponibilidad', input: (c) => ({ fecha: c.fechas.martes }) }] },
          { text: (c) => {
              const r = c.lastResult('consultar_disponibilidad');
              const horas = (r?.horas_disponibles || []).slice(0, 5).join(', ');
              return `Para el ${natural(c.fechas.martes)} tengo: ${horas}. ¿Qué servicio necesitas y a nombre de quién? 😊`;
            } },
        ],
      },
      {
        user: 'Una limpieza dental a las 10:00, soy Camila',
        modelo: [{ text: (c) => `Confirmo entonces: Limpieza dental el ${natural(c.fechas.martes)} a las 10:00, a nombre de Camila. ¿Está bien? 😊` }],
      },
      {
        user: 'Sí, confirmo',
        modelo: [
          { tools: [{ name: 'agendar_cita', input: (c) => ({ nombre: 'Camila', servicio: 'Limpieza dental', fecha: c.fechas.martes, hora: '10:00' }) }] },
          { text: (c) => {
              const r = c.lastResult('agendar_cita');
              return r?.agendada ? `¡Listo, Camila! Quedó agendada tu Limpieza dental el ${natural(c.fechas.martes)} a las 10:00 ✅` : `No pude agendar: ${r?.motivo || 'error'} 😔`;
            } },
        ],
      },
    ],
    async expect(ctx, check) {
      const citas = await vigentes(ctx.telefono);
      check(citas.length === 1, `Debía quedar 1 cita vigente, hay ${citas.length}`);
      check(citas[0]?.fecha === ctx.fechas.martes && citas[0]?.hora === '10:00', 'La cita no quedó el martes a las 10:00');
      check(/limpieza dental/i.test(citas[0]?.servicio || ''), 'El servicio guardado no es Limpieza dental');
      check(/listo|agendada|confirmada/i.test(ctx.respuestas[2]), 'La respuesta final no confirma el agendamiento');
    },
  },
  {
    nombre: 'EDGE: pedir hora para una fecha pasada',
    turnos: [{
      user: 'Quiero una hora para ayer, ¿se puede?',
      modelo: [
        { tools: [{ name: 'consultar_disponibilidad', input: (c) => ({ fecha: c.fechas.pasada }) }] },
        // Guión "modelo ingenuo": si le dieron horas, intenta agendar igual.
        { tools: [{ name: 'agendar_cita', input: (c) => ({ nombre: 'Pedro', servicio: 'Consulta general', fecha: c.fechas.pasada, hora: '11:00' }) }] },
        { text: (c) => {
            const r = c.lastResult('agendar_cita');
            return r?.agendada ? 'Listo, quedó agendada tu hora 😊' : 'Esa fecha ya pasó 😅 Solo puedo agendar de hoy en adelante. ¿Te busco una hora para esta semana?';
          } },
      ],
    }],
    async expect(ctx, check) {
      const citas = await vigentes(ctx.telefono);
      check(citas.length === 0, 'BUG: el agente agendó una cita en una fecha pasada');
      if (ctx.mock) {
        const disp = ctx.lastResult('consultar_disponibilidad');
        check(disp?.error || disp?.disponible === false, 'consultar_disponibilidad no rechaza fechas pasadas (devolvió horas)');
      }
    },
  },
  {
    nombre: 'EDGE: agendar un servicio que no existe en el catálogo',
    turnos: [{
      user: 'Quiero agendar un masaje capilar para el lunes a las 10, soy Pedro',
      modelo: [
        { tools: [{ name: 'consultar_disponibilidad', input: (c) => ({ fecha: c.fechas.lunes }) }] },
        { tools: [{ name: 'agendar_cita', input: (c) => ({ nombre: 'Pedro', servicio: 'masaje capilar', fecha: c.fechas.lunes, hora: '10:00' }) }] },
        { text: (c) => {
            const r = c.lastResult('agendar_cita');
            if (r?.agendada) return 'Listo, quedó agendado tu masaje capilar 😊';
            const lista = (r?.servicios_disponibles || []).join(', ');
            return `No tenemos ese servicio 😅 Lo que sí ofrecemos: ${lista || 'catálogo no disponible'}. ¿Te sirve alguno?`;
          } },
      ],
    }],
    async expect(ctx, check) {
      const citas = await vigentes(ctx.telefono);
      check(!citas.some((c) => /masaje/i.test(c.servicio)), 'BUG: se agendó un servicio inexistente ("masaje capilar")');
      if (ctx.mock) {
        const r = ctx.lastResult('agendar_cita');
        check(r && r.agendada === false && Array.isArray(r.servicios_disponibles), 'agendar_cita no valida el servicio contra el catálogo (o no sugiere alternativas)');
      }
    },
  },
  {
    nombre: 'cancelación simple (confirmando antes cuál es la cita)',
    async seed(ctx) {
      await db.citas.crear({ telefono_cliente: ctx.telefono, nombre_cliente: 'Andrea', servicio: 'Consulta general', fecha: ctx.fechas.martes, hora: '15:00', personas: 1, notas: null });
    },
    turnos: [
      {
        user: 'Quiero cancelar mi hora',
        modelo: [
          { tools: [{ name: 'mis_citas', input: {} }] },
          { text: (c) => {
              const cita = c.lastResult('mis_citas')?.citas?.[0];
              return cita ? `Tienes una ${cita.servicio} el ${natural(cita.fecha)} a las ${cita.hora}. ¿La cancelo? 😊` : 'No encontré citas vigentes a tu nombre 😊';
            } },
        ],
      },
      {
        user: 'Sí, cancélala por favor',
        modelo: [
          { tools: [{ name: 'cancelar_cita', input: {} }] },
          { text: (c) => {
              const r = c.lastResult('cancelar_cita');
              return r?.cancelada ? `Listo, cancelé tu ${r.cita.servicio} del ${natural(r.cita.fecha)} ✅` : `No pude cancelar: ${r?.motivo || 'error'}`;
            } },
        ],
      },
    ],
    async expect(ctx, check) {
      check(/consulta general/i.test(ctx.respuestas[0]), 'Antes de cancelar no le dice al cliente QUÉ cita tiene (falta ver sus citas)');
      const citas = await vigentes(ctx.telefono);
      check(citas.length === 0, 'La cita no quedó cancelada');
      check(/cancel/i.test(ctx.respuestas[1]), 'La respuesta final no confirma la cancelación');
    },
  },
  {
    nombre: 'EDGE: cancelar teniendo VARIAS citas (debe preguntar cuál)',
    async seed(ctx) {
      await db.citas.crear({ telefono_cliente: ctx.telefono, nombre_cliente: 'Marta', servicio: 'Consulta general', fecha: ctx.fechas.jueves, hora: '10:00', personas: 1, notas: null });
      await db.citas.crear({ telefono_cliente: ctx.telefono, nombre_cliente: 'Marta', servicio: 'Limpieza dental', fecha: ctx.fechas.viernes, hora: '11:00', personas: 1, notas: null });
    },
    turnos: [
      {
        user: 'Necesito cancelar mi hora',
        modelo: [
          { tools: [{ name: 'cancelar_cita', input: {} }] },
          { text: (c) => {
              const r = c.lastResult('cancelar_cita');
              if (r?.requiere_seleccion) {
                return 'Tienes ' + r.citas.length + ' horas: ' + r.citas.map((x) => `${x.servicio} el ${natural(x.fecha)} a las ${x.hora}`).join(' y ') + '. ¿Cuál cancelo? 😊';
              }
              return r?.cancelada ? `Listo, cancelé tu ${r.cita.servicio} del ${natural(r.cita.fecha)} ✅` : 'No encontré citas vigentes 😊';
            } },
        ],
        // Con varias citas, el primer turno NO debe cancelar nada todavía
        async despues(ctx, check) {
          const citas = await vigentes(ctx.telefono);
          check(citas.length === 2, 'BUG: canceló una cita a ciegas sin preguntar cuál (el cliente tenía 2)');
        },
      },
      {
        user: 'La del viernes por favor',
        modelo: [
          { tools: [{ name: 'cancelar_cita', input: (c) => {
              const r = c.lastResult('cancelar_cita');
              const cita = r?.citas?.find((x) => x.fecha === c.fechas.viernes);
              return { cita_id: cita?.id ?? 999 };
            } }] },
          { text: (c) => {
              const r = c.lastResult('cancelar_cita');
              return r?.cancelada ? `Listo, cancelé tu ${r.cita.servicio} del ${natural(r.cita.fecha)} ✅` : `No pude cancelar: ${r?.motivo || 'error'}`;
            } },
        ],
      },
    ],
    async expect(ctx, check) {
      const citas = await vigentes(ctx.telefono);
      check(citas.length === 1, `Debía quedar exactamente 1 cita vigente, hay ${citas.length}`);
      check(citas[0]?.fecha === ctx.fechas.jueves, 'Canceló la cita equivocada (debía cancelar la del viernes y conservar la del jueves)');
    },
  },
  {
    nombre: 'EDGE: cambiar cita a una hora ocupada (no debe perder la original)',
    async seed(ctx) {
      // La cita del cliente + otro cliente ocupando el jueves a las 10
      await db.citas.crear({ telefono_cliente: ctx.telefono, nombre_cliente: 'Camila', servicio: 'Limpieza dental', fecha: ctx.fechas.martes, hora: '10:00', personas: 1, notas: null });
      await db.citas.crear({ telefono_cliente: '56922222222', nombre_cliente: 'Otro Cliente', servicio: 'Consulta general', fecha: ctx.fechas.jueves, hora: '10:00', personas: 1, notas: null });
    },
    turnos: [
      {
        user: 'Tengo una hora el martes, ¿la puedo cambiar para el jueves a las 10?',
        modelo: [
          { tools: [{ name: 'consultar_disponibilidad', input: (c) => ({ fecha: c.fechas.jueves }) }] },
          { text: (c) => {
              const r = c.lastResult('consultar_disponibilidad');
              const libres = r?.horas_disponibles || [];
              if (libres.includes('10:00')) return 'Sí, está libre. ¿Confirmo el cambio? 😊';
              return `Esa hora ya está tomada 😔 El ${natural(c.fechas.jueves)} tengo: ${libres.slice(0, 4).join(', ')}. ¿Te sirve alguna?`;
            } },
        ],
        // Clave: como la hora nueva NO estaba libre, la cita original debe seguir viva
        async despues(ctx, check) {
          const citas = await vigentes(ctx.telefono);
          check(citas.some((c) => c.fecha === ctx.fechas.martes), 'BUG: canceló la cita original antes de confirmar que había cupo en la nueva hora');
        },
      },
      {
        user: 'Ya, a las 11 entonces',
        modelo: [
          { tools: [{ name: 'cancelar_cita', input: {} }] },
          { tools: [{ name: 'agendar_cita', input: (c) => ({ nombre: 'Camila', servicio: 'Limpieza dental', fecha: c.fechas.jueves, hora: '11:00' }) }] },
          { text: (c) => {
              const r = c.lastResult('agendar_cita');
              return r?.agendada ? `¡Listo! Te cambié la hora al ${natural(c.fechas.jueves)} a las 11:00 ✅` : `No pude reagendar: ${r?.motivo || 'error'}`;
            } },
        ],
      },
    ],
    async expect(ctx, check) {
      const citas = await vigentes(ctx.telefono);
      check(citas.length === 1, `Debía quedar 1 cita vigente tras el cambio, hay ${citas.length}`);
      check(citas[0]?.fecha === ctx.fechas.jueves && citas[0]?.hora === '11:00', 'El cambio no quedó el jueves a las 11:00');
      check(ctx.respuestas[1].includes('11:00'), 'La respuesta final no confirma la nueva hora');
    },
  },
  {
    nombre: 'EDGE: petición fuera de alcance (delivery) — declinar y reencaminar',
    turnos: [{
      user: '¿Hacen delivery a domicilio?',
      modelo: [{ text: 'Por ahora solo puedo mostrarte el catálogo y agendar o cancelar horas 😊 ¿Te ayudo con alguna de esas cosas?' }],
    }],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      check(/cat[aá]logo/i.test(r) && /agendar/i.test(r), 'No reencamina hacia lo que sí puede hacer (catálogo/agendar)');
      if (ctx.mock) check(ctx.toolLog.length === 0, 'Llamó herramientas sin necesidad para una petición fuera de alcance');
    },
  },
  {
    nombre: 'EDGE: usuario confuso — presentarse y ofrecer opciones',
    turnos: [{
      user: 'hola?? me dijeron que escribiera aquí pero no cacho para qué',
      modelo: [{ text: '¡Hola! Soy tu asistente de reservas 😊 Puedo mostrarte el catálogo de servicios con sus precios, o agendarte una hora. ¿Qué te gustaría?' }],
    }],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      check(/asistente de reservas/i.test(r), 'No se presenta de forma genérica ("asistente de reservas")');
      check(/cat[aá]logo/i.test(r) && /agendar/i.test(r), 'No ofrece sus dos funciones (catálogo y agendar)');
      check(!/gesta|cl[ií]nica|restaurante\s+\w+/i.test(r), 'Se presentó como una empresa específica (debe ser genérico)');
    },
  },
  {
    nombre: 'domingo cerrado',
    turnos: [{
      user: 'Quiero una hora para el domingo',
      modelo: [
        { tools: [{ name: 'consultar_disponibilidad', input: (c) => ({ fecha: c.fechas.domingo }) }] },
        { text: (c) => {
            const r = c.lastResult('consultar_disponibilidad');
            if (r?.disponible === false) return 'El domingo estamos cerrados 😔 ¿Te busco una hora para otro día?';
            return `Para el domingo tengo: ${(r?.horas_disponibles || []).join(', ')}`;
          } },
      ],
    }],
    async expect(ctx, check) {
      check(/cerrad/i.test(ctx.respuestas[0]), 'No informa que el domingo está cerrado');
      const citas = await vigentes(ctx.telefono);
      check(citas.length === 0, 'Agendó una cita en día cerrado');
    },
  },
  {
    nombre: '"¿Tengo alguna hora agendada?" (consultar mis citas)',
    async seed(ctx) {
      await db.citas.crear({ telefono_cliente: ctx.telefono, nombre_cliente: 'Marta', servicio: 'Blanqueamiento', fecha: ctx.fechas.viernes, hora: '12:00', personas: 1, notas: null });
    },
    turnos: [{
      user: '¿Tengo alguna hora agendada?',
      modelo: [
        { tools: [{ name: 'mis_citas', input: {} }] },
        { text: (c) => {
            const r = c.lastResult('mis_citas');
            if (!r?.citas?.length) return 'No tienes citas vigentes 😊 ¿Quieres agendar una?';
            return 'Sí 😊 Tienes: ' + r.citas.map((x) => `${x.servicio} el ${natural(x.fecha)} a las ${x.hora}`).join(' y ');
          } },
      ],
    }],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      check(/blanqueamiento/i.test(r), 'No le informa al cliente su cita vigente (Blanqueamiento)');
      check(r.includes('12:00'), 'No informa la hora de la cita');
    },
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  const fechas = calcularFechas();
  mockState.fechas = fechas;

  console.log('═'.repeat(72));
  console.log(`Suite de conversaciones — Agente de citas  ·  modo: ${MODO_MOCK ? 'MOCK (sin API key o MOCK=true)' : 'MODELO REAL (Claude)'}`);
  console.log(`Hoy (Chile): ${fechas.hoy}  ·  escenarios: ${ESCENARIOS.length}`);
  console.log('═'.repeat(72));

  const resultados = [];
  let n = 0;

  for (const esc of ESCENARIOS) {
    n++;
    await db.resetDemo?.();
    mockState.toolLog.length = 0;
    mockState.queue.length = 0;

    const ctx = {
      telefono: `5691111${String(n).padStart(4, '0')}`,
      fechas,
      respuestas: [],
      mock: MODO_MOCK,
      get toolLog() { return mockState.toolLog; },
      lastResult: (nombre) => ctxMock().lastResult(nombre),
    };

    const errores = [];
    const check = (cond, msg) => { if (!cond) errores.push(msg); };

    console.log(`\n[${n}/${ESCENARIOS.length}] ${esc.nombre}`);
    try {
      if (esc.seed) await esc.seed(ctx);
      for (const turno of esc.turnos) {
        if (MODO_MOCK) mockState.queue = [...(turno.modelo || [])];
        const respuesta = await processMessage(ctx.telefono, turno.user);
        ctx.respuestas.push(respuesta);
        console.log(`    Cliente: ${turno.user}`);
        console.log(`    Bot:     ${respuesta.replace(/\n/g, '\n             ')}`);
        // Formato WhatsApp (solo evaluable con modelo real): *negrita* con un
        // asterisco, nada de Markdown (**, títulos #, links []()).
        if (!MODO_MOCK) {
          check(!/\*\*|^#{1,3}\s|\[[^\]]+\]\([^)]+\)/m.test(respuesta),
            `Respuesta con formato Markdown (WhatsApp usa *negrita* simple): "${respuesta.slice(0, 120)}"`);
        }
        if (turno.despues) await turno.despues(ctx, check);
      }
      await esc.expect(ctx, check);
    } catch (error) {
      errores.push(`Excepción durante la conversación: ${error.message}`);
    }

    const ok = errores.length === 0;
    resultados.push({ nombre: esc.nombre, ok, errores });
    console.log(ok ? '    ✅ PASA' : `    ❌ FALLA:\n${errores.map((e) => `       - ${e}`).join('\n')}`);
  }

  const fallas = resultados.filter((r) => !r.ok);
  console.log('\n' + '═'.repeat(72));
  console.log(`RESUMEN: ${resultados.length - fallas.length}/${resultados.length} escenarios OK`);
  for (const f of fallas) console.log(`  ❌ ${f.nombre}`);
  console.log('═'.repeat(72));
  process.exitCode = fallas.length ? 1 : 0;
}

main().catch((e) => { console.error('Error fatal en la suite:', e); process.exitCode = 1; });
