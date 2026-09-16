// Adapter LLM multi-proveedor — reemplazo drop-in del agent/llm.js de chaski.
//
// core.js habla el formato Anthropic Messages (system, tools con input_schema,
// bloques tool_use / tool_result, respuesta { stop_reason, content }). Este
// adapter mantiene esa interfaz intacta y traduce por debajo al formato
// OpenAI-compatible (/v1/chat/completions) que exponen Groq, DeepSeek, Gemini,
// OpenRouter, Together, Ollama, vLLM, etc.
//
// Cambiar de proveedor = cambiar variables de entorno. Cero cambios de código.
//
//   LLM_PROVIDER   anthropic | groq | deepseek | gemini | openrouter | ollama | openai-compat
//   LLM_API_KEY    key del proveedor (ollama no la necesita)
//   LLM_MODEL      ej: llama-3.3-70b-versatile, deepseek-chat, gemini-3.5-flash
//                  (los nombres CADUCAN: `gemini-2.0-flash` dejó de existir y la
//                   API responde 404. Confirmar contra /v1beta/models antes de
//                   desplegar.)
//   LLM_BASE_URL   solo para "openai-compat" (proveedor no listado en PRESETS)
//
// Retrocompatible: si LLM_PROVIDER no está definido y existe ANTHROPIC_API_KEY,
// se comporta exactamente igual que el llm.js original de chaski.

const PRESETS = {
  groq:       { baseUrl: 'https://api.groq.com/openai/v1' },
  deepseek:   { baseUrl: 'https://api.deepseek.com/v1' },
  gemini:     { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1' },
  ollama:     { baseUrl: 'http://localhost:11434/v1', keyOpcional: true },
  'openai-compat': {}, // requiere LLM_BASE_URL
};

// ---------- Traducción Anthropic Messages -> OpenAI chat.completions ----------

function aMensajesOpenAI(system, messages) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });

  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === 'assistant') {
      const texto = m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const toolCalls = m.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => {
          const tc = {
            id: b.id,
            type: 'function',
            function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
          };
          // Lo que el proveedor colgó de su propia tool call vuelve TAL CUAL.
          // Ver la nota de `extra_content` más abajo: sin esto, Gemini 3.x
          // rechaza con 400 la segunda llamada de cualquier turno con
          // herramienta — o sea, todos los turnos que importan.
          if (b._extra) tc.extra_content = b._extra;
          return tc;
        });
      const msg = { role: 'assistant', content: texto || null };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      out.push(msg);
    } else {
      // user: puede mezclar bloques de texto y tool_result
      for (const b of m.content) {
        if (b.type === 'tool_result') {
          out.push({
            role: 'tool',
            tool_call_id: b.tool_use_id,
            content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
          });
        } else if (b.type === 'text') {
          out.push({ role: 'user', content: b.text });
        }
      }
    }
  }
  return out;
}

function aRespuestaAnthropic(data) {
  const msg = data.choices?.[0]?.message || {};
  const content = [];
  if (msg.content) content.push({ type: 'text', text: msg.content });
  for (const tc of msg.tool_calls || []) {
    let input = {};
    try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { /* args ilegibles -> {} */ }
    const bloque = { type: 'tool_use', id: tc.id, name: tc.function?.name, input };
    // ── extra_content: lo que el proveedor necesita que le devuelvan ──────────
    //
    // Gemini 3.x manda con cada tool call una `thought_signature` dentro de
    // `extra_content.google`, y EXIGE que viaje de vuelta en el mensaje del
    // assistant cuando se reanuda la conversación. Si no llega, responde 400:
    //   "Function call is missing a thought_signature in functionCall parts".
    //
    // Eso rompe el turno entero, y rompe justo los que usan herramienta: la
    // primera llamada funciona, la segunda —la que lleva el tool_result— falla,
    // y el cliente recibe "estoy teniendo problemas técnicos". No se ve en mock
    // (el doble del LLM no manda firmas) ni en una prueba de un solo turno.
    //
    // Se guarda opaco, con nombre propio (`_extra`) para no chocar con el
    // formato Anthropic, y se devuelve tal cual. El núcleo no interpreta nada:
    // el día que otro proveedor cuelgue otra cosa de ahí, viaja igual. El campo
    // sobrevive porque core.js reenvía `respuesta.content` sin tocarlo.
    if (tc.extra_content) bloque._extra = tc.extra_content;
    content.push(bloque);
  }
  // El uso se NORMALIZA al vocabulario de Anthropic (input_tokens /
  // output_tokens), que es el que lee agent/core.js para las métricas. Sin esto
  // el panel de costos quedaba en blanco para todos los proveedores
  // OpenAI-compatibles — o sea, para los que efectivamente se usan.
  const uso = data.usage
    ? {
        ...data.usage,
        input_tokens:  data.usage.input_tokens  ?? data.usage.prompt_tokens,
        output_tokens: data.usage.output_tokens ?? data.usage.completion_tokens,
      }
    : undefined;

  return {
    stop_reason: msg.tool_calls?.length ? 'tool_use' : 'end_turn',
    content,
    usage: uso,
  };
}

// ---------- Clientes ----------

function crearClienteOpenAICompat(proveedor) {
  const preset = PRESETS[proveedor];
  const baseUrl = process.env.LLM_BASE_URL || preset.baseUrl;
  const apiKey = process.env.LLM_API_KEY || (preset.keyOpcional ? 'sin-key' : null);

  if (!baseUrl) throw new Error(`[LLM] LLM_PROVIDER=${proveedor} requiere LLM_BASE_URL en .env`);
  if (!apiKey) throw new Error(`[LLM] Falta LLM_API_KEY en .env para el proveedor ${proveedor}`);

  // Segundo parámetro `{ signal }`: core.js impone un timeout duro con
  // AbortController. Sin pasarlo al fetch, abortar no cerraría el socket y la
  // conexión quedaría colgando aunque el turno ya se dio por perdido.
  const create = async (params, opciones = {}) => {
    const body = {
      model: process.env.LLM_MODEL || params.model,
      max_tokens: params.max_tokens,
      messages: aMensajesOpenAI(params.system, params.messages),
    };
    if (params.tools?.length) {
      body.tools = params.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: opciones.signal,
    });

    if (!res.ok) {
      // core.js reintenta según error.status (429 / 5xx) — mantener el contrato
      const detalle = await res.text().catch(() => '');
      const error = new Error(`[LLM] ${proveedor} respondió ${res.status}: ${detalle.slice(0, 300)}`);
      error.status = res.status;
      throw error;
    }
    return aRespuestaAnthropic(await res.json());
  };

  return { messages: { create }, beta: { messages: { create } } };
}

function crearClienteAnthropicNativo() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('[LLM] Falta ANTHROPIC_API_KEY en .env (o corre en modo mock)');
  }
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // El SDK acepta { signal } como segundo argumento: mismo contrato que el
  // camino OpenAI-compatible, así el timeout de core.js funciona igual en los dos.
  const create = (params, opciones = {}) => client.messages.create(params, opciones);
  return { messages: { create }, beta: { messages: { create } } };
}

/**
 * Punto de entrada. Se exporta también como crearClienteAnthropic para ser
 * drop-in del llm.js original (core.js no se toca).
 */
function crearClienteLLM() {
  const proveedor = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
  if (proveedor === 'anthropic') return crearClienteAnthropicNativo();
  if (!PRESETS[proveedor]) {
    throw new Error(
      `[LLM] Proveedor desconocido "${proveedor}". Válidos: anthropic, ${Object.keys(PRESETS).join(', ')}`
    );
  }
  console.log(`[LLM] Proveedor: ${proveedor} — modelo: ${process.env.LLM_MODEL || '(default del agente)'}`);
  return crearClienteOpenAICompat(proveedor);
}

module.exports = { crearClienteLLM, crearClienteAnthropic: crearClienteLLM };
