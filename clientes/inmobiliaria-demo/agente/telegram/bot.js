// Polyfill WebSocket para Node < 22 (Railway usa Node 18): debe ejecutarse
// ANTES de cualquier require que cargue supabase-js (realtime-js exige un
// WebSocket global nativo y crashea si no existe).
if (!globalThis.WebSocket) {
  globalThis.WebSocket = require('ws');
}

// Bot de Telegram del agente inmobiliario — puente Telegram ↔ agent/core.js.
// La demo v1 es por TERMINAL (npm run chat); este bot queda listo para cuando
// el cliente pida canal Telegram, y su modo mock es la vía de QA sin costo.
//
// Dos modos, según TELEGRAM_TOKEN_INMOBILIARIA en .env:
//  - Con token : bot real en modo POLLING (sin webhook — ideal para demo local,
//                no necesita dominio público). Cada chat de Telegram es una
//                conversación independiente del agente.
//  - Sin token : modo MOCK. No toca Telegram NI la API del LLM (inyecta el
//                mismo doble de pruebas que usa la suite de tests) y simula
//                conversaciones inmobiliarias de demostración por consola.
//
// Forzar el mock aunque haya token: `npm run telegram:mock`
// (equivale a `node telegram/bot.js --mock`, también acepta MOCK=true).

require('dotenv').config();

const MODO_MOCK =
  process.env.MOCK === 'true' ||
  process.argv.includes('--mock') ||
  !process.env.TELEGRAM_TOKEN_INMOBILIARIA;

const MAX_CHARS_TELEGRAM = 4096;

const SALUDO =
  '¡Hola! Soy el asistente de Corredora Andes Propiedades 😊 Puedo buscarte propiedades en venta o arriendo, ' +
  'agendarte una visita (lunes, miércoles y jueves de 11:00 a 14:00) y responder tus dudas de requisitos, comisiones y horarios. ¿Qué andas buscando?';

const AYUDA =
  'Comandos disponibles:\n' +
  '/start — Ver el mensaje de bienvenida\n' +
  '/help — Ver esta ayuda\n\n' +
  'También puedes escribirme directamente, por ejemplo:\n' +
  '- "Busco un depto en arriendo en Ñuñoa"\n' +
  '- "Quiero visitar la propiedad el miércoles"\n' +
  '- "¿Qué piden para arrendar?"\n' +
  '- "¿Cuándo quedó mi visita?"';

const SOLO_TEXTO = 'Solo puedo responder mensajes de texto 😊';

// ─── Envío con límite de largo y fallback de formato ─────────────────────────

function dividirMensaje(texto) {
  if (!texto) return [''];
  if (texto.length <= MAX_CHARS_TELEGRAM) return [texto];
  const partes = [];
  let resto = texto;
  while (resto.length > MAX_CHARS_TELEGRAM) {
    let corte = resto.lastIndexOf('\n', MAX_CHARS_TELEGRAM);
    if (corte < MAX_CHARS_TELEGRAM * 0.5) corte = MAX_CHARS_TELEGRAM;
    partes.push(resto.slice(0, corte));
    resto = resto.slice(corte);
  }
  partes.push(resto);
  return partes;
}

// Telegram rechaza el mensaje completo si el Markdown viene mal balanceado
// (ej: un solo "*"). Si el parseo falla, se reenvía como texto plano.
async function enviarTelegram(bot, chatId, texto) {
  for (const parte of dividirMensaje(texto)) {
    try {
      await bot.sendMessage(chatId, parte, { parse_mode: 'Markdown' });
    } catch {
      await bot.sendMessage(chatId, parte);
    }
  }
}

// Identidad de la conversación: en WhatsApp es el teléfono; aquí el chat de
// Telegram, con prefijo para no chocar con números reales en la misma DB.
const idConversacion = (chatId) => `tg${chatId}`;

// El runtime es el adapter multi-proveedor (agent/llm.js): la credencial
// exigida depende de LLM_PROVIDER, ya no de ANTHROPIC_API_KEY a secas.
function credencialesLLMOk() {
  const proveedor = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
  if (proveedor === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  return proveedor === 'ollama' || !!process.env.LLM_API_KEY; // ollama corre local sin key
}

// ─── Modo real: polling contra la API de Telegram ────────────────────────────

function arrancarBotReal() {
  if (!credencialesLLMOk()) {
    console.error('[Telegram] Faltan credenciales del LLM en .env — el agente no puede responder.');
    console.error('[Telegram] Configura LLM_PROVIDER + LLM_API_KEY (o ANTHROPIC_API_KEY si el proveedor es anthropic).');
    console.error('[Telegram] Para probar sin API keys: npm run telegram:mock');
    process.exit(1);
  }

  const { TelegramBot } = require('node-telegram-bot-api');
  const { processMessage, MENSAJE_ERROR } = require('../agent/core');
  const { usandoMemoria } = require('../database/supabase');

  const bot = new TelegramBot(process.env.TELEGRAM_TOKEN_INMOBILIARIA, { polling: true });

  bot.on('polling_error', (error) => {
    console.error('[Telegram] Error de polling:', error.message);
  });

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const texto = (msg.text || '').trim();

    if (!texto) {
      await bot.sendMessage(chatId, SOLO_TEXTO);
      return;
    }
    if (texto === '/start') {
      await enviarTelegram(bot, chatId, SALUDO);
      return;
    }
    if (texto === '/help') {
      await enviarTelegram(bot, chatId, AYUDA);
      return;
    }

    console.log(`[Telegram ← ${chatId}] ${texto}`);
    try {
      await bot.sendChatAction(chatId, 'typing').catch(() => {});
      const respuesta = await processMessage(idConversacion(chatId), texto);
      await enviarTelegram(bot, chatId, respuesta);
      console.log(`[Telegram → ${chatId}] ${respuesta}`);
    } catch (error) {
      console.error('[Telegram] Error procesando mensaje:', error.message);
      await bot.sendMessage(chatId, MENSAJE_ERROR).catch(() => {});
    }
  });

  console.log('─'.repeat(60));
  console.log('[Telegram] Bot inmobiliario escuchando (polling)…');
  console.log(`[Telegram] DB: ${usandoMemoria ? 'en memoria (demo)' : 'Supabase'}`);
  console.log('[Telegram] Escríbele a tu bot en Telegram para probar. Ctrl+C para salir.');
  console.log('─'.repeat(60));
}

// ─── Modo mock: sin Telegram y SIN API del LLM ───────────────────────────────
// Inyecta un doble de pruebas del cliente LLM vía core._setClienteParaTests
// (el mismo mecanismo de scripts/test-chat.js): ninguna llamada sale a la red.

function arrancarModoMock() {
  // El mock corre siempre contra la base EN MEMORIA (no ensuciar Supabase real)
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;

  const mockState = { pasos: [], log: [], contadorId: 0 };

  const lastResult = (nombre) => {
    for (let i = mockState.log.length - 1; i >= 0; i--) {
      const e = mockState.log[i];
      if (e.name === nombre && e.result != null) return e.result;
    }
    return null;
  };

  async function crearRespuestaMock(params) {
    // Registrar los tool_result que el loop del agente devuelve al "modelo"
    const ultimo = params.messages[params.messages.length - 1];
    if (Array.isArray(ultimo?.content)) {
      for (const bloque of ultimo.content) {
        if (bloque.type !== 'tool_result') continue;
        const pendiente = mockState.log.find((e) => e.id === bloque.tool_use_id);
        if (pendiente) {
          try { pendiente.result = JSON.parse(bloque.content); }
          catch { pendiente.result = bloque.content; }
        }
      }
    }

    const paso = mockState.pasos.shift();
    if (!paso) return { stop_reason: 'end_turn', content: [{ type: 'text', text: '¿Te ayudo con algo más? 😊' }] };

    if (paso.tools) {
      return {
        stop_reason: 'tool_use',
        content: paso.tools.map((t) => {
          const id = `tu_mock_${++mockState.contadorId}`;
          const input = typeof t.input === 'function' ? t.input() : (t.input || {});
          mockState.log.push({ id, name: t.name, input, result: null });
          return { type: 'tool_use', id, name: t.name, input };
        }),
      };
    }
    const texto = typeof paso.text === 'function' ? paso.text(lastResult) : paso.text;
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: texto }] };
  }

  const clienteMock = {
    messages: { create: crearRespuestaMock },
    beta: { messages: { create: crearRespuestaMock } },
  };

  const core = require('../agent/core');
  core._setClienteParaTests(clienteMock);
  const { processMessage } = core;

  // ── Conversaciones de demostración (rubro inmobiliario) ─────────────────────

  // Próximo miércoles en formato ISO (siempre futuro, día válido de visita),
  // calculado en zona horaria de Chile para que COINCIDA con la fecha de la
  // visita semilla (Marcela, P2, 12:00): así se demuestra en vivo la colisión
  // de slot y el reencauce.
  function proximoMiercoles() {
    let f = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    do {
      const [y, m, d] = f.split('-').map(Number);
      f = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    } while (new Date(`${f}T12:00:00Z`).getUTCDay() !== 3);
    return f;
  }
  const MIERCOLES = proximoMiercoles();
  const TEL_CAMILA = '56955551234';

  const CONVERSACIONES = [
    {
      nombre: 'Búsqueda de propiedades + captura de contacto',
      chatId: 111001,
      turnos: [{
        user: 'Hola, busco un depto en arriendo en Ñuñoa, máximo 600 mil',
        modelo: [
          { tools: [{ name: 'buscar_propiedades', input: { operacion: 'arriendo', comuna: 'Ñuñoa', presupuesto_max: 600000 } }] },
          { text: (last) => {
              const r = last('buscar_propiedades');
              if (!r?.propiedades?.length) return 'No encontré nada disponible con esos filtros 😔';
              const p = r.propiedades[0];
              return `¡Buenas! Tengo un ${p.tipo} disponible en ${p.comuna}: ${p.precio} (GC ${p.gastos_comunes}), ${p.dormitorios}D/${p.banos}B, ${p.m2} m² (${p.id}).\n¿Me dejas tu nombre y teléfono para enviarte la ficha y coordinar? 😊`;
            } },
        ],
      }],
      verificar: (respuestas) => /560\.000/.test(respuestas[0]) && /tel[eé]fono/i.test(respuestas[0]),
    },
    {
      nombre: 'Agendar visita: slot ocupado por la visita semilla → reencauzar',
      chatId: 111002,
      turnos: [
        {
          user: 'Quiero visitar el depto de Ñuñoa (P2) el miércoles a las 12:00. Soy Camila Rojas, +56 9 5555 1234',
          modelo: [
            { tools: [{ name: 'agendar_visita', input: { propiedad_id: 'P2', nombre: 'Camila Rojas', telefono: TEL_CAMILA, fecha: MIERCOLES, hora: '12:00' } }] },
            { text: (last) => {
                const r = last('agendar_visita');
                if (r?.agendada) return `¡Listo, Camila! Visita agendada el ${r.visita.fecha} a las ${r.visita.hora} ✅`;
                const sug = r?.slot_sugerido;
                return sug
                  ? `Uy, las 12:00 de ese miércoles ya está tomada 😔 Te puedo ofrecer las ${sug.hora} del mismo día, ¿te sirve?`
                  : `No pude agendar: ${r?.motivo || 'error'}`;
              } },
          ],
        },
        {
          user: 'Ya, a esa hora entonces',
          modelo: [
            { tools: [{ name: 'agendar_visita', input: () => ({
                propiedad_id: 'P2',
                nombre: 'Camila Rojas',
                telefono: TEL_CAMILA,
                fecha: MIERCOLES,
                hora: lastResult('agendar_visita')?.slot_sugerido?.hora || '11:30',
              }) }] },
            { text: (last) => {
                const r = last('agendar_visita');
                return r?.agendada
                  ? `¡Listo, Camila! Quedó tu visita al depto de Ñuñoa (P2) el miércoles a las ${r.visita.hora} ✅ Un corredor te espera en ${r.visita.direccion_referencial}.`
                  : `No pude agendar: ${r?.motivo || 'error'} 😔`;
              } },
          ],
        },
      ],
      verificar: (respuestas) => /ya está tomada/i.test(respuestas[0]) && /listo|✅/i.test(respuestas[1]),
    },
    {
      nombre: 'Consultar mis visitas (memoria: mismo chat que la conversación 2)',
      chatId: 111002,
      turnos: [{
        user: '¿Cuándo quedó mi visita?',
        modelo: [
          { tools: [{ name: 'mis_visitas', input: { telefono: TEL_CAMILA } }] },
          { text: (last) => {
              const r = last('mis_visitas');
              if (!r?.visitas?.length) return 'No tienes visitas vigentes 😊 ¿Quieres agendar una?';
              return 'Sí 😊 Tienes: ' + r.visitas.map((v) => `${v.propiedad} el ${v.fecha} a las ${v.hora}`).join(' y ');
            } },
        ],
      }],
      verificar: (respuestas) => /ñuñoa/i.test(respuestas[0]),
    },
    {
      nombre: 'FAQ: requisitos de arriendo (sin inventar)',
      chatId: 111003,
      turnos: [{
        user: '¿Qué piden para arrendar?',
        modelo: [
          { tools: [{ name: 'info_corredora', input: { tema: 'requisitos_arriendo' } }] },
          { text: (last) => {
              const r = last('info_corredora');
              return r?.respuesta ? `${r.respuesta}\n\n¿Te ayudo a buscar un arriendo? 😊` : 'No tengo esa información cargada 😅';
            } },
        ],
      }],
      verificar: (respuestas) => /3 veces/i.test(respuestas[0]) && /liquidaciones/i.test(respuestas[0]),
    },
  ];

  return correrDemoMock(CONVERSACIONES, mockState, processMessage);
}

async function correrDemoMock(conversaciones, mockState, processMessage) {
  console.log('═'.repeat(64));
  console.log('Telegram — MODO MOCK (sin Telegram real, sin API del LLM)');
  console.log('Simulando conversaciones de demostración — Corredora Andes Propiedades…');
  console.log('═'.repeat(64));

  let fallas = 0;
  for (const [i, conv] of conversaciones.entries()) {
    console.log(`\n[${i + 1}/${conversaciones.length}] ${conv.nombre}  (chat ${conv.chatId})`);
    const respuestas = [];
    try {
      for (const turno of conv.turnos) {
        mockState.pasos = [...(turno.modelo || [])];
        console.log(`  👤 ${turno.user}`);
        const respuesta = await processMessage(idConversacion(conv.chatId), turno.user);
        respuestas.push(respuesta);
        console.log(`  🤖 ${respuesta.replace(/\n/g, '\n     ')}`);
      }
      const ok = conv.verificar ? conv.verificar(respuestas) : respuestas.every(Boolean);
      console.log(ok ? '  ✅ Flujo OK' : '  ❌ FALLA: la respuesta no cumple lo esperado');
      if (!ok) fallas++;
    } catch (error) {
      console.log(`  ❌ FALLA: excepción — ${error.message}`);
      fallas++;
    }
  }

  console.log('\n' + '═'.repeat(64));
  console.log(fallas === 0
    ? `RESUMEN: ${conversaciones.length}/${conversaciones.length} conversaciones OK — el puente Telegram ↔ agente funciona.`
    : `RESUMEN: ${conversaciones.length - fallas}/${conversaciones.length} conversaciones OK (${fallas} con fallas).`);
  console.log('La demo real es por terminal: npm run chat (requiere LLM_PROVIDER + LLM_API_KEY en .env).');
  console.log('Para Telegram real: TELEGRAM_TOKEN_INMOBILIARIA en .env y npm run telegram.');
  console.log('═'.repeat(64));
  process.exitCode = fallas ? 1 : 0;
}

if (MODO_MOCK) {
  arrancarModoMock().catch((e) => { console.error('Error fatal en modo mock:', e); process.exitCode = 1; });
} else {
  arrancarBotReal();
}
