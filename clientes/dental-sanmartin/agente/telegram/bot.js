// Polyfill WebSocket para Node < 22 (Railway usa Node 18): debe ejecutarse
// ANTES de cualquier require que cargue supabase-js (realtime-js exige un
// WebSocket global nativo y crashea si no existe).
if (!globalThis.WebSocket) {
  globalThis.WebSocket = require('ws');
}

// Bot de Telegram del agente de citas — puente Telegram ↔ agent/core.js.
//
// Dos modos, según TELEGRAM_TOKEN_CITAS en .env:
//  - Con token : bot real en modo POLLING (sin webhook — ideal para demo local,
//                no necesita dominio público). Cada chat de Telegram es una
//                conversación independiente del agente (misma memoria que WhatsApp).
//  - Sin token : modo MOCK. No toca Telegram NI la API de Anthropic (inyecta el
//                mismo doble de pruebas del SDK que usa la suite de tests) y
//                simula 3 conversaciones de demostración por consola.
//
// Forzar el mock aunque haya token: `npm run telegram:mock`
// (equivale a `node telegram/bot.js --mock`, también acepta MOCK=true).
//
// Formato: el agente ya responde con *negrita* de un asterisco (estilo
// WhatsApp), que es el mismo Markdown "legacy" de Telegram — compatible tal cual.

require('dotenv').config();

const MODO_MOCK =
  process.env.MOCK === 'true' ||
  process.argv.includes('--mock') ||
  !process.env.TELEGRAM_TOKEN_CITAS;

const MAX_CHARS_TELEGRAM = 4096;

const SALUDO =
  '¡Hola! Soy tu asistente de reservas 😊 Puedo mostrarte el *catálogo de servicios* con sus precios, buscar *horas disponibles*, y *agendar* o *cancelar* una hora. ¿Qué te gustaría?';

const AYUDA =
  'Comandos disponibles:\n' +
  '/start — Ver el mensaje de bienvenida\n' +
  '/help — Ver esta ayuda\n\n' +
  'También puedes escribirme directamente, por ejemplo:\n' +
  '- "¿Qué servicios tienen?"\n' +
  '- "Quiero agendar una hora para el martes"\n' +
  '- "¿Tengo alguna hora agendada?"\n' +
  '- "Cancela mi hora"';

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

// ─── Modo real: polling contra la API de Telegram ────────────────────────────

function arrancarBotReal() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[Telegram] Falta ANTHROPIC_API_KEY en .env — el agente no puede responder.');
    console.error('[Telegram] Para probar sin API keys: npm run telegram:mock');
    process.exit(1);
  }

  const { TelegramBot } = require('node-telegram-bot-api');
  const { processMessage, MENSAJE_ERROR } = require('../agent/core');
  const { usandoMemoria } = require('../database/supabase');

  const bot = new TelegramBot(process.env.TELEGRAM_TOKEN_CITAS, { polling: true });

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
  console.log('[Telegram] Bot de citas escuchando (polling)…');
  console.log(`[Telegram] DB: ${usandoMemoria ? 'en memoria (demo)' : 'Supabase'}`);
  console.log('[Telegram] Escríbele a tu bot en Telegram para probar. Ctrl+C para salir.');
  console.log('─'.repeat(60));
}

// ─── Modo mock: sin Telegram y SIN API de Anthropic ───────────────────────────
// Inyecta un doble de pruebas del SDK vía core._setClienteParaTests (el mismo
// mecanismo de scripts/test-chat.js): ninguna llamada sale a la red.

function arrancarModoMock() {
  // El mock corre siempre contra la base EN MEMORIA (no ensuciar Supabase real)
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_KEY;

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

  // ── Conversaciones de demostración ──────────────────────────────────────────

  const clp = (n) => `$${Number(n).toLocaleString('es-CL')}`;

  // Próximo martes en formato ISO (siempre futuro, día hábil del horario demo)
  function proximoMartes() {
    const d = new Date();
    do { d.setDate(d.getDate() + 1); } while (d.getDay() !== 2);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  const MARTES = proximoMartes();

  const CONVERSACIONES = [
    {
      nombre: 'Catálogo de servicios',
      chatId: 111001,
      turnos: [{
        user: 'Hola, ¿qué servicios tienen?',
        modelo: [
          { tools: [{ name: 'ver_catalogo', input: {} }] },
          { text: (last) => {
              const r = last('ver_catalogo');
              if (!r?.servicios?.length) return 'Por ahora no tengo servicios cargados 😅';
              return '¡Hola! 😊 Tenemos:\n' +
                r.servicios.map((s) => `• *${s.nombre}* — ${s.precio > 0 ? clp(s.precio) : 'sin costo de reserva'}`).join('\n') +
                '\n\n¿Te agendo una hora?';
            } },
        ],
      }],
      verificar: (respuestas) => /limpieza/i.test(respuestas[0]) && /\$\d/.test(respuestas[0]),
    },
    {
      nombre: 'Agendar una hora (flujo completo con confirmación)',
      chatId: 111002,
      turnos: [
        {
          user: 'Quiero agendar una hora para el martes',
          modelo: [
            { tools: [{ name: 'consultar_disponibilidad', input: { fecha: MARTES } }] },
            { text: (last) => {
                const r = last('consultar_disponibilidad');
                const horas = (r?.horas_disponibles || []).slice(0, 5).join(', ');
                return horas
                  ? `Para el martes ${MARTES} tengo: ${horas}. ¿Qué servicio necesitas y a nombre de quién? 😊`
                  : 'Ese día no tengo horas disponibles 😔 ¿Te busco otro día?';
              } },
          ],
        },
        {
          user: 'Una limpieza dental a las 10:00, soy Camila',
          modelo: [{ text: `Confirmo entonces: *Limpieza dental* el martes ${MARTES} a las 10:00, a nombre de Camila. ¿Está bien? 😊` }],
        },
        {
          user: 'Sí, confirmo',
          modelo: [
            { tools: [{ name: 'agendar_cita', input: { nombre: 'Camila', servicio: 'Limpieza dental', fecha: MARTES, hora: '10:00' } }] },
            { text: (last) => {
                const r = last('agendar_cita');
                return r?.agendada
                  ? `¡Listo, Camila! Tu *Limpieza dental* quedó agendada el martes ${MARTES} a las 10:00 ✅`
                  : `No pude agendar: ${r?.motivo || 'error'} 😔`;
              } },
          ],
        },
      ],
      verificar: (respuestas) => /listo|agendada|✅/i.test(respuestas[2]),
    },
    {
      nombre: 'Consultar mis citas (memoria: mismo chat que la conversación 2)',
      chatId: 111002,
      turnos: [{
        user: '¿Tengo alguna hora agendada?',
        modelo: [
          { tools: [{ name: 'mis_citas', input: {} }] },
          { text: (last) => {
              const r = last('mis_citas');
              if (!r?.citas?.length) return 'No tienes citas vigentes 😊 ¿Quieres agendar una?';
              return 'Sí 😊 Tienes: ' + r.citas.map((c) => `*${c.servicio}* el ${c.fecha} a las ${c.hora}`).join(' y ');
            } },
        ],
      }],
      verificar: (respuestas) => /limpieza dental/i.test(respuestas[0]),
    },
  ];

  return correrDemoMock(CONVERSACIONES, mockState, processMessage);
}

async function correrDemoMock(conversaciones, mockState, processMessage) {
  console.log('═'.repeat(64));
  console.log('Telegram — MODO MOCK (sin Telegram real, sin API de Anthropic)');
  console.log('Simulando conversaciones de demostración…');
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
  console.log('Para conectar Telegram real: pon TELEGRAM_TOKEN_CITAS en .env y corre `npm run telegram` (ver README).');
  console.log('═'.repeat(64));
  process.exitCode = fallas ? 1 : 0;
}

if (MODO_MOCK) {
  arrancarModoMock().catch((e) => { console.error('Error fatal en modo mock:', e); process.exitCode = 1; });
} else {
  arrancarBotReal();
}
