# Agente inmobiliario — Corredora Andes Propiedades (demo)

Chatbot para corredora de propiedades: **busca propiedades** (venta/arriendo), **agenda visitas** (solo lunes, miércoles y jueves de 11:00 a 14:00, bloques de 30 min), **califica leads** (frío/tibio/caliente, score determinístico) y responde la FAQ del negocio (requisitos de arriendo, comisiones, horarios). Basado en la plantilla `agente-citas` de chaski, con runtime LLM multi-proveedor (demo: Gemini 2.0 Flash free tier).

**Canal demo v1: terminal.** Sin Telegram/WhatsApp real todavía; el nombre "Corredora Andes Propiedades" es placeholder del cliente.

## Cómo correr

```bash
npm install
```

**Demo real por terminal** (lo que ve José/el cliente — requiere `.env` con `LLM_PROVIDER` + `LLM_API_KEY`):

```bash
npm run chat
```

**QA sin costo** (0 tokens, sin credenciales — mock del LLM con guiones deterministas):

```bash
npm run telegram:mock   # 4 conversaciones inmobiliarias de demostración
npm test                # suite completa: casos de uso CU-1..CU-12 + adversariales ADV-1..6
```

## Configuración

Copiar `.env.example` a `.env` y llenar `LLM_API_KEY` (pool de la fábrica, Gemini free tier). Sin Supabase el agente usa una **base en memoria** con las semillas del SPEC: 8 propiedades (P1–P8, P4 arrendada a propósito), 1 visita pre-agendada (próximo miércoles 12:00, prueba colisión de slot) y 1 lead (prueba upsert por teléfono). Nada sobrevive a un reinicio — para producción, ejecutar `database/schema.sql` en Supabase.

## Reglas de negocio clave

- Visitas SOLO lunes/miércoles/jueves 11:00–14:00; fuera de eso el bot reencauza al slot válido más cercano. El slot es global (un corredor).
- Captura temprana de nombre + teléfono; el lead queda registrado aunque no agende (el lead es el producto).
- Score del lead lo calcula la tool `registrar_lead` (no el LLM): caliente = visita agendada o urgencia inmediata + presupuesto; tibio = operación + comuna + presupuesto con urgencia media/no declarada; frío = el resto.
- Venta en UF, arriendo en CLP; conversión UF→CLP solo si la piden, marcada aproximada (UF referencial $39.500, configurable con `UF_CLP`).
- Nada se inventa: precios, requisitos, comisiones y disponibilidad salen siempre de las tools.

## Estructura

```
agente/
├── index.js               # Servidor Express (canal producción futuro)
├── scripts/
│   ├── chat-local.js      # ← DEMO v1: chat por terminal
│   └── test-chat.js       # Suite mock (siempre 0 tokens)
├── telegram/bot.js        # Bot Telegram (v2) + modo mock de QA
├── agent/
│   ├── core.js            # Loop agéntico (formato Anthropic Messages)
│   ├── llm.js             # Adapter multi-proveedor (Gemini/Groq/DeepSeek/...)
│   ├── prompts.js         # Personalidad + reglas duras del negocio
│   ├── tools.js           # Las 8 tools del SPEC (ventana de visitas, score de leads)
│   └── memory.js          # Historial conversacional
├── database/
│   ├── supabase.js        # Capa de datos: memoria (demo) o Supabase (producción)
│   └── schema.sql         # Tablas propiedades/visitas/leads + semillas del SPEC
└── whatsapp/              # Webhook Meta (canal producción futuro)
```
