// Suite de evaluación del agente inmobiliario — Corredora Andes Propiedades.
// Corre SIN canal real y SIN Supabase (base en memoria con las semillas del SPEC).
//
// POLÍTICA DEL SPEC: npm test corre SIEMPRE en mock — 0 tokens, sin credenciales.
// El mock inyecta un doble del cliente LLM que sigue un guión por escenario
// (tool use incluido): se evalúan de forma determinista las herramientas, la
// ventana de visitas Lu/Mi/Ju 11:00–14:00 y el score de leads. La validación
// con modelo real la hace José por terminal (npm run chat) con Gemini free tier.
//
// El mock respeta TOOL_DEFINITIONS: si el guión pide una herramienta que el
// agente NO tiene definida, responde como lo haría el modelo real ("eso no lo
// tengo") — así los tests detectan capacidades faltantes.
//
// Uso: npm test   (o node scripts/test-chat.js)

require('dotenv').config();

// La suite es SIEMPRE mock (ver política de tests del SPEC)
const MODO_MOCK = true;

// El mock corre contra la base EN MEMORIA (no ensuciar un Supabase real)
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
delete process.env.SUPABASE_SERVICE_KEY;

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
      return respuestaTexto('Mmm, eso todavía no lo tengo disponible 😅 Puedo buscarte propiedades o agendarte una visita.');
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

const clienteMock = {
  messages: { create: crearRespuestaMock },
  beta: { messages: { create: crearRespuestaMock } },
};
_setClienteParaTests(clienteMock);

if (!usandoMemoria) {
  console.error('Esta suite requiere el modo demo (base en memoria). Quita SUPABASE_URL/SUPABASE_ANON_KEY del .env para correrla.');
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

function calcularFechas() {
  const hoy = hoyChile();
  return {
    hoy,
    pasada: addDias(hoy, -1),          // el rechazo por fecha pasada gana a cualquier otra validación
    lunes: proximo(1, hoy),
    martes: proximo(2, hoy),           // día SIN visitas (para probar el reencauce)
    miercoles: proximo(3, hoy),        // fecha de la visita semilla (Marcela, P2, 12:00)
    jueves: proximo(4, hoy),
  };
}

// ─── Escenarios ───────────────────────────────────────────────────────────────
// Cada escenario: { nombre, turnos: [{ user, modelo: guión-mock, despues? }], seed?, expect }
// `check(cond, msg)` acumula errores. La base en memoria vuelve al estado
// semilla del SPEC antes de cada escenario (resetDemo).

const vigentes = (tel) => db.visitas.proximasPorTelefono(tel, '2000-01-01');

const ESCENARIOS = [
  {
    nombre: 'CU-1: saludo y atención general',
    turnos: [{
      user: 'hola',
      modelo: [{ text: '¡Hola! Soy el asistente de Corredora Andes Propiedades 😊 Puedo buscarte propiedades en venta o arriendo, agendarte una visita (lunes, miércoles y jueves de 11:00 a 14:00) o responder dudas de requisitos y comisiones. ¿Qué andas buscando?' }],
    }],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      check(/andes propiedades/i.test(r), 'No se presenta como Corredora Andes Propiedades');
      check(/buscar|propiedades/i.test(r) && /visita/i.test(r), 'No ofrece sus funciones (buscar propiedades / agendar visita)');
      check(ctx.toolLog.length === 0, 'Llamó herramientas sin necesidad para un saludo');
    },
  },
  {
    nombre: 'CU-3 + CU-2: búsqueda con resultados y captura temprana de contacto',
    turnos: [
      {
        user: 'Busco un depto en arriendo en Ñuñoa, máximo 600 mil',
        modelo: [
          { tools: [{ name: 'buscar_propiedades', input: { operacion: 'arriendo', comuna: 'Ñuñoa', presupuesto_max: 600000 } }] },
          { text: (c) => {
              const r = c.lastResult('buscar_propiedades');
              if (!r?.propiedades?.length) return 'No encontré nada disponible con esos filtros 😔';
              const p = r.propiedades[0];
              return `Tengo un ${p.tipo} en ${p.comuna}: ${p.precio} (GC ${p.gastos_comunes}), ${p.dormitorios}D/${p.banos}B, ${p.m2} m² (${p.id}). ¿Me dejas tu nombre y teléfono para enviarte la ficha y coordinar? 😊`;
            } },
        ],
      },
      {
        user: 'Soy Ana Torres, +56 9 1234 0000',
        modelo: [
          { tools: [{ name: 'registrar_lead', input: { nombre: 'Ana Torres', telefono: '56912340000', operacion: 'arriendo', comuna: 'Ñuñoa', presupuesto: 600000 } }] },
          { text: '¡Gracias, Ana! Quedaste registrada 😊 ¿Quieres agendar una visita al depto de Ñuñoa?' },
        ],
      },
    ],
    async expect(ctx, check) {
      const busqueda = ctx.lastResult('buscar_propiedades');
      check(busqueda?.resultados === 1 && busqueda?.propiedades?.[0]?.id === 'P2', 'La búsqueda debía retornar exactamente P2');
      check(ctx.respuestas[0].includes('560.000'), 'No informa el precio real de P2 ($560.000)');
      check(!/providencia/i.test(ctx.respuestas[0]), 'BUG: ofreció P4 (Providencia, arrendada) en los resultados');
      check(/tel[eé]fono/i.test(ctx.respuestas[0]), 'No pide el teléfono tras la primera búsqueda (captura temprana)');
      const lead = await db.leads.getPorTelefono('56912340000');
      check(!!lead, 'El lead de Ana no quedó registrado');
      check(lead?.score === 'tibio', `Score esperado "tibio" (op+comuna+presupuesto sin urgencia), obtuvo "${lead?.score}"`);
    },
  },
  {
    nombre: 'CU-4: búsqueda sin resultados — ofrece lo cercano y captura el lead igual',
    turnos: [
      {
        user: 'Busco arriendo en Vitacura por 300 mil. Soy Andrés Soto, +56 9 1111 2222',
        modelo: [
          { tools: [{ name: 'buscar_propiedades', input: { operacion: 'arriendo', comuna: 'Vitacura', presupuesto_max: 300000 } }] },
          { tools: [{ name: 'registrar_lead', input: { nombre: 'Andrés Soto', telefono: '56911112222', operacion: 'arriendo', comuna: 'Vitacura', presupuesto: 300000 } }] },
          { text: (c) => {
              const r = c.lastResult('buscar_propiedades');
              if (r?.propiedades?.length) return 'Encontré esto disponible 😊';
              const alt = r?.cercanas?.[0];
              return alt
                ? `En Vitacura por ese monto no tengo nada disponible, te soy honesto 😔 Lo más cercano es un ${alt.tipo} en ${alt.comuna} por ${alt.precio}. ¿Te lo muestro? Quedaste registrado por si entra algo.`
                : 'No tengo alternativas por ahora 😔';
            } },
        ],
      },
    ],
    async expect(ctx, check) {
      const r = ctx.lastResult('buscar_propiedades');
      check(r?.resultados === 0, 'La búsqueda en Vitacura por 300 mil no debía tener match exacto');
      check(Array.isArray(r?.cercanas) && r.cercanas.length > 0, 'buscar_propiedades no ofrece alternativas cercanas');
      check(/no tengo|no hay/i.test(ctx.respuestas[0]) || /honest/i.test(ctx.respuestas[0]), 'No es honesto sobre la falta de match exacto');
      const lead = await db.leads.getPorTelefono('56911112222');
      check(!!lead, 'El lead debía quedar registrado AUNQUE no haya match (regla 2 del SPEC)');
    },
  },
  {
    nombre: 'CU-5: detalle de propiedad + conversión UF→CLP marcada aproximada',
    turnos: [
      {
        user: 'Cuéntame más del depto de Ñuñoa en arriendo',
        modelo: [
          { tools: [{ name: 'detalle_propiedad', input: { id: 'P2' } }] },
          { text: (c) => {
              const f = c.lastResult('detalle_propiedad');
              return `Es un ${f.tipo} en ${f.direccion_referencial}: ${f.precio} + GC ${f.gastos_comunes}, ${f.dormitorios}D/${f.banos}B, ${f.m2} m². ${f.descripcion}`;
            } },
        ],
      },
      {
        user: '¿Y el de venta en Ñuñoa cuánto sale en pesos?',
        modelo: [
          { tools: [{ name: 'detalle_propiedad', input: { id: 'P5' } }] },
          { text: (c) => {
              const f = c.lastResult('detalle_propiedad');
              const conv = f?.conversion_aproximada;
              return conv
                ? `El ${f.id} está en ${f.precio}, que son aproximadamente $${Number(conv.precio_clp_aprox).toLocaleString('es-CL')} (valor aproximado con UF referencial de $${Number(conv.uf_referencial_clp).toLocaleString('es-CL')}).`
                : `El ${f.id} está en ${f.precio}.`;
            } },
        ],
      },
    ],
    async expect(ctx, check) {
      check(ctx.respuestas[0].includes('80.000'), 'No informa los gastos comunes reales de P2 ($80.000)');
      check(/irarr[aá]zaval/i.test(ctx.respuestas[0]), 'No entrega la dirección referencial de P2');
      check(ctx.respuestas[1].includes('134.300.000'), 'La conversión UF→CLP de P5 no es UF 3.400 × $39.500 = $134.300.000');
      check(/aproximad/i.test(ctx.respuestas[1]), 'La conversión no está marcada como aproximada');
    },
  },
  {
    nombre: 'CU-6: agendar visita en día válido (miércoles 11:30) → lead caliente',
    turnos: [
      {
        user: 'Quiero visitar el P2 el miércoles, ¿qué horas tienen? Soy Camila Rojas, +56 9 3333 4444',
        modelo: [
          { tools: [{ name: 'consultar_disponibilidad', input: (c) => ({ fecha: c.fechas.miercoles }) }] },
          { text: (c) => {
              const r = c.lastResult('consultar_disponibilidad');
              const horas = (r?.slots_disponibles || []).join(', ');
              return `Para el ${natural(c.fechas.miercoles)} tengo: ${horas}. ¿Cuál te acomoda? 😊`;
            } },
        ],
      },
      {
        user: 'A las 11:30 porfa',
        modelo: [
          { tools: [{ name: 'agendar_visita', input: (c) => ({ propiedad_id: 'P2', nombre: 'Camila Rojas', telefono: '56933334444', fecha: c.fechas.miercoles, hora: '11:30' }) }] },
          { text: (c) => {
              const r = c.lastResult('agendar_visita');
              return r?.agendada
                ? `¡Listo, Camila! Visita a ${r.visita.propiedad} el ${natural(r.visita.fecha)} a las ${r.visita.hora} ✅`
                : `No pude agendar: ${r?.motivo || 'error'} 😔`;
            } },
        ],
      },
    ],
    async expect(ctx, check) {
      const disp = ctx.lastResult('consultar_disponibilidad');
      check(disp && !disp.slots_disponibles.includes('12:00'), 'BUG: ofrece las 12:00 del miércoles (ocupadas por la visita semilla)');
      const visitas = await vigentes('56933334444');
      check(visitas.length === 1, `Debía quedar 1 visita vigente, hay ${visitas.length}`);
      check(visitas[0]?.fecha === ctx.fechas.miercoles && visitas[0]?.hora === '11:30', 'La visita no quedó el miércoles a las 11:30');
      const lead = await db.leads.getPorTelefono('56933334444');
      check(lead?.score === 'caliente', `Al agendar, el lead debía quedar caliente; obtuvo "${lead?.score}"`);
      check(/listo|✅/i.test(ctx.respuestas[1]), 'La respuesta final no confirma la visita');
    },
  },
  {
    nombre: 'CU-7: día/hora inválido (martes 16:00) — reencauzar sin agendar',
    turnos: [{
      user: '¿Puedo ir a ver el P2 el martes a las 4 de la tarde? Soy Lucas Reyes, +56 9 4444 5555',
      modelo: [
        // Guión "modelo ingenuo": intenta agendar igual; la herramienta debe negarse
        { tools: [{ name: 'agendar_visita', input: (c) => ({ propiedad_id: 'P2', nombre: 'Lucas Reyes', telefono: '56944445555', fecha: c.fechas.martes, hora: '16:00' }) }] },
        { text: (c) => {
            const r = c.lastResult('agendar_visita');
            if (r?.agendada) return 'Listo, quedó agendada tu visita 😊';
            const sug = r?.slot_sugerido;
            return `Ese horario no se puede 😔 Las visitas son solo lunes, miércoles y jueves de 11:00 a 14:00. Lo más cercano que tengo es el ${sug ? `${natural(sug.fecha)} a las ${sug.hora}` : 'próximo día hábil de visita'}. ¿Te sirve?`;
          } },
      ],
    }],
    async expect(ctx, check) {
      const visitas = await vigentes('56944445555');
      check(visitas.length === 0, 'BUG: agendó una visita un martes a las 16:00 (fuera de la ventana)');
      const r = ctx.lastResult('agendar_visita');
      check(r && r.agendada === false && r.slot_sugerido, 'agendar_visita no rechaza el martes o no sugiere el slot válido más cercano');
      check(r?.slot_sugerido?.fecha === ctx.fechas.miercoles, `El slot sugerido debía ser el miércoles siguiente (${ctx.fechas.miercoles}), fue ${r?.slot_sugerido?.fecha}`);
      check(/lunes, miércoles y jueves/i.test(ctx.respuestas[0]), 'No explica la ventana de visitas (lunes, miércoles y jueves de 11:00 a 14:00)');
    },
  },
  {
    nombre: 'CU-8: ver y cancelar visita',
    async seed(ctx) {
      await db.visitas.crear({ propiedad_id: 'P3', nombre: 'Javiera Muñoz', telefono: '56955556666', fecha: ctx.fechas.jueves, hora: '11:00' });
    },
    turnos: [
      {
        user: '¿Cuándo quedó mi visita? Mi número es +56 9 5555 6666',
        modelo: [
          { tools: [{ name: 'mis_visitas', input: { telefono: '56955556666' } }] },
          { text: (c) => {
              const r = c.lastResult('mis_visitas');
              if (!r?.visitas?.length) return 'No encontré visitas vigentes con ese número 😊';
              const v = r.visitas[0];
              return `Tienes visita a ${v.propiedad} el ${natural(v.fecha)} a las ${v.hora}. ¿Necesitas cambiarla? 😊`;
            } },
        ],
      },
      {
        user: 'Cancélala por favor',
        modelo: [
          { tools: [{ name: 'cancelar_visita', input: { telefono: '56955556666' } }] },
          { text: (c) => {
              const r = c.lastResult('cancelar_visita');
              return r?.cancelada ? `Listo, cancelé tu visita del ${natural(r.visita.fecha)} ✅ Cuando quieras retomamos.` : `No pude cancelar: ${r?.motivo || 'error'}`;
            } },
        ],
      },
    ],
    async expect(ctx, check) {
      check(/maip[uú]/i.test(ctx.respuestas[0]), 'Antes de cancelar no le dice QUÉ visita tiene (propiedad de Maipú)');
      const visitas = await vigentes('56955556666');
      check(visitas.length === 0, 'La visita no quedó cancelada');
      check(/cancel/i.test(ctx.respuestas[1]), 'La respuesta final no confirma la cancelación');
    },
  },
  {
    nombre: 'CU-9: requisitos de arriendo y comisiones (de la FAQ, sin inventar)',
    turnos: [
      {
        user: '¿Qué piden para arrendar?',
        modelo: [
          { tools: [{ name: 'info_corredora', input: { tema: 'requisitos_arriendo' } }] },
          { text: (c) => c.lastResult('info_corredora')?.respuesta || 'No tengo esa información cargada 😅' },
        ],
      },
      {
        user: '¿Y cuánto cobran de comisión?',
        modelo: [
          { tools: [{ name: 'info_corredora', input: { tema: 'comisiones' } }] },
          { text: (c) => c.lastResult('info_corredora')?.respuesta || 'No tengo esa información cargada 😅' },
        ],
      },
    ],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      check(/3 veces|3x/i.test(r), 'No informa la renta 3x (requisito clave que nunca se omite)');
      check(/liquidaciones/i.test(r), 'No menciona las 3 últimas liquidaciones');
      check(/dicom/i.test(r), 'No menciona el informe Dicom');
      check(/aval/i.test(r), 'No menciona la alternativa del aval');
      check(/garant[ií]a/i.test(r), 'No menciona el mes de garantía al firmar');
      const c2 = ctx.respuestas[1];
      check(/50%/.test(c2) && /2%/.test(c2) && /IVA/i.test(c2), 'Las comisiones no salen de la FAQ (50% arriendo / 2% venta + IVA)');
    },
  },
  {
    nombre: 'CU-10: propiedad ya arrendada — informar, ofrecer alternativas y registrar lead',
    turnos: [{
      user: 'Vi un depto en Providencia en 480 lucas, ¿sigue disponible? Soy Diego Pérez, +56 9 6666 7777',
      modelo: [
        { tools: [{ name: 'detalle_propiedad', input: { id: 'P4' } }] },
        { tools: [{ name: 'buscar_propiedades', input: { operacion: 'arriendo', comuna: 'Providencia', presupuesto_max: 500000 } }] },
        { tools: [{ name: 'registrar_lead', input: { nombre: 'Diego Pérez', telefono: '56966667777', operacion: 'arriendo', comuna: 'Providencia', presupuesto: 480000, propiedad_interes: 'P4' } }] },
        { text: (c) => {
            const ficha = c.lastResult('detalle_propiedad');
            const busq = c.lastResult('buscar_propiedades');
            const alts = busq?.propiedades?.length ? busq.propiedades : (busq?.cercanas || []);
            const lista = alts.slice(0, 2).map((p) => `${p.tipo} en ${p.comuna} por ${p.precio}`).join(' y ');
            return ficha?.disponible === false
              ? `Ese depto ya se arrendó, te soy honesta 😔 Pero tengo alternativas parecidas: ${lista}. Quedaste registrado por si se libera algo similar. ¿Te muestro alguna?`
              : 'Sí, sigue disponible 😊';
          } },
      ],
    }],
    async expect(ctx, check) {
      const ficha = ctx.lastResult('detalle_propiedad');
      check(ficha?.disponible === false && ficha?.estado === 'arrendada', 'detalle_propiedad no marca P4 como arrendada');
      check(/arrend/i.test(ctx.respuestas[0]), 'No le informa al cliente que la propiedad ya se arrendó');
      const busq = ctx.lastResult('buscar_propiedades');
      const ids = [...(busq?.propiedades || []), ...(busq?.cercanas || [])].map((p) => p.id);
      check(ids.length > 0 && !ids.includes('P4'), 'Las alternativas ofrecidas incluyen la propiedad arrendada (o no hay alternativas)');
      const lead = await db.leads.getPorTelefono('56966667777');
      check(!!lead && lead.propiedad_interes === 'P4', 'El interés del cliente por P4 no quedó registrado en el lead');
    },
  },
  {
    nombre: 'CU-11: score determinístico — caliente / tibio / frío',
    turnos: [
      {
        user: 'Necesito arriendo en Ñuñoa hasta 600 mil, me cambio este mes. Valentina Díaz, +56 9 0101 0101',
        modelo: [
          { tools: [{ name: 'registrar_lead', input: { nombre: 'Valentina Díaz', telefono: '56901010101', operacion: 'arriendo', comuna: 'Ñuñoa', presupuesto: 600000, urgencia: 'inmediata' } }] },
          { text: (c) => `Anotada, Valentina 😊 (score ${c.lastResult('registrar_lead')?.lead?.score})` },
        ],
      },
      {
        user: 'Yo también busco en Ñuñoa hasta 600, pero en unos 2 meses más. Rodrigo Lagos, +56 9 0202 0202',
        modelo: [
          { tools: [{ name: 'registrar_lead', input: { nombre: 'Rodrigo Lagos', telefono: '56902020202', operacion: 'arriendo', comuna: 'Ñuñoa', presupuesto: 600000, urgencia: 'media' } }] },
          { text: (c) => `Anotado, Rodrigo 😊 (score ${c.lastResult('registrar_lead')?.lead?.score})` },
        ],
      },
      {
        user: 'Yo solo estoy mirando, sin presupuesto claro. Pablo Vidal, +56 9 0303 0303',
        modelo: [
          { tools: [{ name: 'registrar_lead', input: { nombre: 'Pablo Vidal', telefono: '56903030303', operacion: 'arriendo', comuna: 'Ñuñoa', urgencia: 'baja' } }] },
          { text: (c) => `Anotado, Pablo 😊 (score ${c.lastResult('registrar_lead')?.lead?.score})` },
        ],
      },
    ],
    async expect(ctx, check) {
      const scores = await Promise.all(['56901010101', '56902020202', '56903030303'].map(async (t) => (await db.leads.getPorTelefono(t))?.score));
      check(scores[0] === 'caliente', `Urgencia inmediata + presupuesto debía dar "caliente", dio "${scores[0]}"`);
      check(scores[1] === 'tibio', `Operación+comuna+presupuesto con urgencia media debía dar "tibio", dio "${scores[1]}"`);
      check(scores[2] === 'frío', `"Solo mirando" sin presupuesto debía dar "frío", dio "${scores[2]}"`);
    },
  },
  {
    nombre: 'CU-11b: upsert por teléfono — el lead semilla se actualiza, no se duplica',
    turnos: [{
      user: 'Hola, soy Marcela Fuentes de nuevo (+56 9 8765 4321): ahora puedo llegar hasta 650 mil',
      modelo: [
        { tools: [{ name: 'registrar_lead', input: { nombre: 'Marcela Fuentes', telefono: '+56 9 8765 4321', presupuesto: 650000 } }] },
        { text: (c) => {
            const r = c.lastResult('registrar_lead');
            return r?.registrado ? `Actualizado, Marcela 😊 Presupuesto hasta $${Number(r.lead.presupuesto).toLocaleString('es-CL')}.` : 'No pude actualizar tus datos 😔';
          } },
      ],
    }],
    async expect(ctx, check) {
      const r = ctx.lastResult('registrar_lead');
      check(r?.actualizado === true, 'No detectó al lead semilla existente (debía ser update, no insert)');
      const lead = await db.leads.getPorTelefono('56987654321');
      check(lead?.presupuesto === 650000, 'El presupuesto del lead no se actualizó a 650.000');
      check(lead?.comuna === 'Ñuñoa' && lead?.operacion === 'arriendo', 'El upsert borró campos que ya se sabían (comuna/operación)');
      check(lead?.score === 'caliente', 'Marcela tiene visita agendada (semilla): su score debía seguir caliente');
    },
  },
  {
    nombre: 'CU-12: fuera de alcance (tasación) — derivar al corredor en una línea',
    turnos: [{
      user: '¿Me pueden tasar mi casa para venderla?',
      modelo: [{ text: 'Las tasaciones las ve directamente un corredor del equipo 😊 Yo puedo buscarte propiedades, agendarte visitas o responder dudas de requisitos y comisiones. ¿Te ayudo con algo de eso?' }],
    }],
    async expect(ctx, check) {
      check(/corredor/i.test(ctx.respuestas[0]), 'No deriva al corredor humano');
      check(/propiedades|visita/i.test(ctx.respuestas[0]), 'No reencamina hacia lo que sí puede hacer');
      check(ctx.toolLog.length === 0, 'Llamó herramientas sin necesidad para algo fuera de alcance');
    },
  },
  {
    nombre: 'ADV-1: visita en fecha pasada — rechazo claro + próximo día válido',
    turnos: [{
      user: 'Agéndame ayer a las 11 en el P1, soy Pedro Soto, +56 9 7777 8888',
      modelo: [
        { tools: [{ name: 'agendar_visita', input: (c) => ({ propiedad_id: 'P1', nombre: 'Pedro Soto', telefono: '56977778888', fecha: c.fechas.pasada, hora: '11:00' }) }] },
        { text: (c) => {
            const r = c.lastResult('agendar_visita');
            if (r?.agendada) return 'Listo, quedó agendada 😊';
            const sug = r?.slot_sugerido;
            return `Esa fecha ya pasó 😅 Solo agendo de hoy en adelante. El próximo día de visita es el ${sug ? `${natural(sug.fecha)} a las ${sug.hora}` : 'lunes, miércoles o jueves que viene'}. ¿Te sirve?`;
          } },
      ],
    }],
    async expect(ctx, check) {
      const visitas = await vigentes('56977778888');
      check(visitas.length === 0, 'BUG: agendó una visita en una fecha pasada');
      const r = ctx.lastResult('agendar_visita');
      check(r?.agendada === false && /pas[oó]/.test(r?.motivo || ''), 'agendar_visita no rechaza fechas pasadas');
      check(r?.slot_sugerido?.fecha >= ctx.fechas.hoy, 'No sugiere un próximo día válido futuro');
      check(/pas[oó]/i.test(ctx.respuestas[0]), 'No le explica al cliente que la fecha ya pasó');
    },
  },
  {
    nombre: 'ADV-2: doble "confirmo" — la visita NO se duplica',
    turnos: [
      {
        user: 'Confirmo la visita al P5 el lunes a las 11:00, soy Tomás Vera, +56 9 8888 9999',
        modelo: [
          { tools: [{ name: 'agendar_visita', input: (c) => ({ propiedad_id: 'P5', nombre: 'Tomás Vera', telefono: '56988889999', fecha: c.fechas.lunes, hora: '11:00' }) }] },
          { text: (c) => {
              const r = c.lastResult('agendar_visita');
              return r?.agendada ? `¡Listo, Tomás! Visita el ${natural(r.visita.fecha)} a las ${r.visita.hora} ✅` : `No pude: ${r?.motivo}`;
            } },
        ],
      },
      {
        user: 'Sí, confirmo!',
        modelo: [
          // Guión "modelo ingenuo": repite la llamada — la herramienta debe ser idempotente
          { tools: [{ name: 'agendar_visita', input: (c) => ({ propiedad_id: 'P5', nombre: 'Tomás Vera', telefono: '56988889999', fecha: c.fechas.lunes, hora: '11:00' }) }] },
          { text: (c) => {
              const r = c.lastResult('agendar_visita');
              return r?.ya_estaba_agendada ? 'Está todo listo, Tomás 😊 Tu visita ya quedó agendada.' : (r?.agendada ? 'Listo de nuevo 😊' : `Error: ${r?.motivo}`);
            } },
        ],
      },
    ],
    async expect(ctx, check) {
      const visitas = await vigentes('56988889999');
      check(visitas.length === 1, `BUG ADV-2: el doble "confirmo" dejó ${visitas.length} visitas (debía quedar 1)`);
      const r = ctx.lastResult('agendar_visita');
      check(r?.ya_estaba_agendada === true, 'La segunda llamada no reportó que la visita ya existía');
    },
  },
  {
    nombre: 'ADV-3: propiedad inexistente ("la P20") — no inventar fichas',
    turnos: [{
      user: '¿Me das el detalle de la P20?',
      modelo: [
        { tools: [{ name: 'detalle_propiedad', input: { id: 'P20' } }] },
        { text: (c) => {
            const r = c.lastResult('detalle_propiedad');
            return r?.existe === false
              ? 'Esa propiedad no está en nuestro catálogo 😅 ¿Te ayudo a buscar? Dime si es venta o arriendo y en qué comuna.'
              : `Aquí está: ${JSON.stringify(r)}`;
          } },
      ],
    }],
    async expect(ctx, check) {
      const r = ctx.lastResult('detalle_propiedad');
      check(r?.existe === false, 'detalle_propiedad no reporta que P20 no existe');
      check(/no est[aá]|no existe|no encontr/i.test(ctx.respuestas[0]), 'No informa honestamente que la propiedad no existe');
      check(/buscar|venta o arriendo/i.test(ctx.respuestas[0]), 'No ofrece hacer una búsqueda como alternativa');
    },
  },
  {
    nombre: 'ADV-4: slot ocupado por la semilla (miércoles 12:00 en P2) — ofrecer el siguiente libre',
    turnos: [
      {
        user: 'Quiero ver el P2 el miércoles a las 12:00, soy Carolina Núñez, +56 9 0000 1111',
        modelo: [
          { tools: [{ name: 'agendar_visita', input: (c) => ({ propiedad_id: 'P2', nombre: 'Carolina Núñez', telefono: '56900001111', fecha: c.fechas.miercoles, hora: '12:00' }) }] },
          { text: (c) => {
              const r = c.lastResult('agendar_visita');
              if (r?.agendada) return 'Listo 😊';
              const sug = r?.slot_sugerido;
              return `Las 12:00 de ese día ya está tomada 😔 Te puedo ofrecer las ${sug?.hora} del mismo día. ¿Te sirve?`;
            } },
        ],
      },
      {
        user: 'Ya, dale',
        modelo: [
          { tools: [{ name: 'agendar_visita', input: (c) => {
              const r = c.lastResult('agendar_visita');
              return { propiedad_id: 'P2', nombre: 'Carolina Núñez', telefono: '56900001111', fecha: r?.slot_sugerido?.fecha || c.fechas.miercoles, hora: r?.slot_sugerido?.hora || '11:30' };
            } }] },
          { text: (c) => {
              const r = c.lastResult('agendar_visita');
              return r?.agendada ? `¡Listo, Carolina! Visita el ${natural(r.visita.fecha)} a las ${r.visita.hora} ✅` : `No pude: ${r?.motivo}`;
            } },
        ],
      },
    ],
    async expect(ctx, check) {
      const visitas = await vigentes('56900001111');
      check(visitas.length === 1, `Debía quedar 1 visita de Carolina, hay ${visitas.length}`);
      check(visitas[0]?.hora !== '12:00', 'BUG ADV-4: agendó encima del slot ocupado (12:00)');
      const delDia = await db.visitas.listarPorFecha(ctx.fechas.miercoles);
      check(delDia.some((v) => v.hora === '12:00'), 'La visita semilla de las 12:00 desapareció (no debía tocarse)');
      check(/tomada|ocupad/i.test(ctx.respuestas[0]), 'No le explica al cliente que el slot está ocupado');
    },
  },
  {
    nombre: 'ADV-5: dato que no está en la ficha (mascotas) — no inventar + nota en el lead',
    turnos: [{
      user: '¿Aceptan mascotas en la casa de Maipú? Soy Fernanda Ruiz, +56 9 0000 2222',
      modelo: [
        { tools: [{ name: 'detalle_propiedad', input: { id: 'P3' } }] },
        { tools: [{ name: 'registrar_lead', input: { nombre: 'Fernanda Ruiz', telefono: '56900002222', operacion: 'arriendo', comuna: 'Maipú', propiedad_interes: 'P3', nota: 'Confirmar si aceptan mascotas en P3' } }] },
        { text: 'Ese dato no está en la ficha, así que no te quiero inventar: lo confirmo con el corredor y te avisamos al número que me dejaste 😊' },
      ],
    }],
    async expect(ctx, check) {
      check(/confirmo con el corredor/i.test(ctx.respuestas[0]), 'No responde "lo confirmo con el corredor" ante el dato faltante');
      check(!/s[ií], aceptan|no aceptan/i.test(ctx.respuestas[0]), 'BUG: inventó la respuesta sobre mascotas');
      const lead = await db.leads.getPorTelefono('56900002222');
      check(/mascotas/i.test(lead?.nota || ''), 'La duda de mascotas no quedó anotada en el lead');
    },
  },
  {
    nombre: 'ADV-6: cliente cambia de propiedad/fecha 2 veces — sin visitas fantasma',
    turnos: [
      {
        user: 'Quiero visitar el P1 el lunes. Soy Matías Bravo, +56 9 0000 3333',
        modelo: [{ text: '¡Claro! El lunes tengo visitas entre 11:00 y 14:00. ¿Qué hora te acomoda para el P1? 😊' }],
      },
      {
        user: 'Mmm mejor el P5, y el jueves',
        modelo: [{ text: 'Perfecto, el P5 el jueves entonces. ¿A qué hora entre 11:00 y 14:00? 😊' }],
      },
      {
        user: 'Ya: P5, el jueves a las 11:30. Confirmo',
        modelo: [
          { tools: [{ name: 'agendar_visita', input: (c) => ({ propiedad_id: 'P5', nombre: 'Matías Bravo', telefono: '56900003333', fecha: c.fechas.jueves, hora: '11:30' }) }] },
          { text: (c) => {
              const r = c.lastResult('agendar_visita');
              return r?.agendada ? `¡Listo, Matías! Visita al P5 el ${natural(r.visita.fecha)} a las ${r.visita.hora} ✅` : `No pude: ${r?.motivo}`;
            } },
        ],
      },
    ],
    async expect(ctx, check) {
      const visitas = await vigentes('56900003333');
      check(visitas.length === 1, `BUG ADV-6: quedaron ${visitas.length} visitas (los cambios previos no debían crear visitas fantasma)`);
      check(visitas[0]?.propiedad_id === 'P5' && visitas[0]?.fecha === ctx.fechas.jueves && visitas[0]?.hora === '11:30', 'La visita final no es la última confirmada (P5, jueves 11:30)');
    },
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  const fechas = calcularFechas();
  mockState.fechas = fechas;

  console.log('═'.repeat(72));
  console.log(`Suite de conversaciones — Agente inmobiliario (Corredora Andes Propiedades)  ·  modo: MOCK (siempre, política del SPEC)`);
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
        mockState.queue = [...(turno.modelo || [])];
        const respuesta = await processMessage(ctx.telefono, turno.user);
        ctx.respuestas.push(respuesta);
        console.log(`    Cliente: ${turno.user}`);
        console.log(`    Bot:     ${respuesta.replace(/\n/g, '\n             ')}`);
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
