# Arquitectura — independencia del proveedor de LLM y control de costos

Objetivo: que la fábrica y sus productos NO dependan de la API de Anthropic. La dependencia hoy está en un solo lugar (`agent/llm.js` de cada agente clonado), y ahí mismo se corta.

## Principio 1 — Separar fábrica (build) de producto (runtime)

- **Build-time** (diseñar, programar, testear agentes): lo hace Claude Code con la **suscripción**, que es costo fijo mensual. Aquí no hay API de por medio y el "gasto enorme" no existe.
- **Run-time** (el bot del cliente respondiendo mensajes): es lo que escala con el uso y lo que hay que abaratar. Aquí se usa un proveedor barato o local, elegido por cliente.

Regla: **la calidad de la fábrica no se negocia; el costo del runtime sí.** Un bot de agendamiento no necesita el mejor modelo del mundo — necesita seguir un flujo y llamar tools correctamente.

## Principio 2 — El formato OpenAI-compatible es el estándar de facto

Casi todos los proveedores exponen el mismo endpoint `/v1/chat/completions`: Groq, DeepSeek, Gemini (modo compatibilidad), OpenRouter, Together, Mistral, y los servidores locales (Ollama, vLLM, LM Studio). Anthropic es la excepción con formato propio.

Por eso `plantillas/base-agente/llm.js` traduce el formato interno del agente (Anthropic Messages, que ya usa todo el código de chaski) ↔ OpenAI-compatible. Resultado: **cambiar de proveedor = cambiar 3 variables de entorno**, cero cambios de código.

```
LLM_PROVIDER=openai-compat        # o "anthropic" para volver atrás
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile
```

## Principio 3 — Menú de proveedores para runtime (por perfil de cliente)

| Perfil | Proveedor | Modelo típico | Costo aprox. | Cuándo |
|---|---|---|---|---|
| Demo / validación | **Gemini Flash** (free tier) u **Ollama local** | gemini-flash / qwen2.5:14b | $0 | Demos a clientes, desarrollo |
| Cliente chico (≤ ~3.000 msjes/mes) | **DeepSeek** o **Gemini Flash** pagado | deepseek-chat | Centavos de dólar por millón de tokens — para un bot de citas, casi nada | Producción de bajo volumen |
| Cliente que exige latencia | **Groq** | llama-3.3-70b | Barato y el más rápido del mercado | Retail con mucho tráfico |
| Flexibilidad / fallback | **OpenRouter** | el que convenga | Pequeño margen sobre el proveedor | Un solo endpoint, muchos modelos, fallback automático |
| Cliente premium que lo paga | **Anthropic** | claude-haiku | El más caro de esta tabla | Solo si el cliente lo exige y lo financia |
| Volumen alto sostenido | **VPS con vLLM/Ollama** (Railway/Hetzner + GPU o CPU para modelos chicos) | qwen/llama fine-tuneable | Costo fijo mensual | Cuando el variable supera el fijo |

Los precios cambian cada pocos meses — verificar antes de comprometer números con un cliente. La jerarquía relativa (local < deepseek/gemini < groq < anthropic) se ha mantenido estable.

## Principio 4 — Un gateway central: LiteLLM proxy

Cuando haya más de ~3 clientes en producción, levantar **LiteLLM** (proxy open source) en Railway como único endpoint de todos los bots:

- Cada bot apunta al proxy (`LLM_BASE_URL=https://litellm.tu-dominio/v1`) con una **key virtual por cliente**.
- **Presupuesto y rate limit por key**: un cliente nunca te puede quemar la cuenta de otro (ni la tuya).
- **Fallback automático**: si DeepSeek se cae, rutea a Groq sin tocar los bots.
- **Logs y costos por cliente**: sabes exactamente cuánto gasta cada uno → puedes cobrar el runtime con margen (modelo reventa) o pasarles el costo directo.
- Cambio de proveedor global editando solo la config del proxy.

Este es el paso que convierte "varios bots" en "una plataforma".

## Principio 5 — El LLM es el último recurso, no el primero

El mayor ahorro no es el proveedor: es **no llamar al modelo**.

1. **Flujos deterministas primero**: agendar una hora es elegir doctor → día → hora → confirmar. Eso se resuelve con botones/listas de WhatsApp y Telegram (interactive messages) sin gastar un token. El LLM entra solo para lenguaje libre ("¿tienen hora como el jueves en la tarde?").
2. **FAQ cacheadas**: horarios, dirección, precios — respuestas fijas por matching simple antes de llegar al modelo.
3. **Historial recortado + max_tokens bajo**: chaski ya lo hace (600 tokens máx). Mantenerlo.
4. **Modelo chico por defecto, grande por excepción**: si un caso falla con el modelo barato, primero mejorar el prompt/tools; subir de modelo es la última palanca.
5. **Mock para todo el desarrollo**: `MOCK=true` ya está integrado en la base — desarrollo y QA cuestan $0.

## Principio 6 — Modelo de negocio del runtime

Dos opciones por cliente (decisión de José, la fábrica prepara ambas):

- **Cliente paga su propia key** (Gemini/DeepSeek son fáciles de crear): tú cobras solo desarrollo + mantención. Cero riesgo de costo.
- **Reventa vía LiteLLM**: el bot usa tu proxy, tú pagas el proveedor y cobras al cliente una tarifa plana mensual con margen (ej: costo real ~centavos, cobras una mensualidad de "operación del bot"). Requiere los presupuestos por key del Principio 4 para acotar el riesgo.

## Deuda conocida

- Los agentes chaski existentes siguen apuntando a Anthropic — migrar cuando toque tocarlos (no urgente: hoy no tienen tráfico real).
- El adapter traduce tool use en formato estricto; probar siempre `telegram:mock` + 1 conversación real al cambiar de proveedor, porque la calidad del tool-calling varía entre modelos.
