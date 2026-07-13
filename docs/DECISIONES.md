# Registro de decisiones

Formato: fecha — decisión — contexto — alternativas descartadas. Las decisiones de cada pedido también van a la página del pedido en Notion.

---

## 2026-07-13 — Fundación de la fábrica

**Decisión**: crear la fábrica como workspace de Claude Code (`Fabrica_Agentes/`) con skill maestra `/fabrica`, subagentes especializados y pipeline de 8 fases, en vez de un producto de software independiente.

**Contexto**: José quiere entregar pedidos y recibir producto terminado con mínima carga. La suscripción de Claude Code ya cubre el costo de build; lo que hay que industrializar es el proceso, no construir otra plataforma.

**Descartado**: (a) plataforma web propia de generación de agentes — meses de trabajo antes del primer cliente; (b) usar solo n8n/Flowise — sirven para flujos, pero el valor diferencial acá es el loop agéntico con tools ya probado en chaski.

## 2026-07-13 — Base técnica: clonar chaski-agentes

**Decisión**: todo agente nuevo se clona de `chaski-agentes/agente-citas` (agendamiento) o `agente-retail` (catálogo/pedidos), que a su vez nacieron del contestador WhatsApp de Gesta.

**Contexto**: arquitectura ya validada (Express + WhatsApp Cloud API + Telegram polling + Supabase con fallback en memoria + loop agéntico + modo MOCK para QA sin costo + deploy Railway). Reinventarla sería riesgo sin beneficio.

**Descartado**: framework de agentes genérico (LangChain/CrewAI) — más dependencias, menos control, y el código chaski en español es más mantenible para este negocio.

## 2026-07-13 — Runtime independiente de Anthropic

**Decisión**: el punto de acople con Anthropic (`agent/llm.js`) se reemplaza por un adapter multi-proveedor (`plantillas/base-agente/llm.js`) que habla OpenAI-compatible (Groq, DeepSeek, Gemini, OpenRouter, Ollama) manteniendo Anthropic como opción. Proveedor por defecto para demos: Gemini Flash free tier u Ollama local. Escala futura: gateway LiteLLM con presupuesto por cliente.

**Contexto**: el gasto de API a escala de varios clientes sería el principal riesgo del negocio. Build-time queda en la suscripción de Claude Code (costo fijo); runtime en proveedores baratos (costo variable mínimo). Detalle en ARQUITECTURA.md.

**Descartado**: (a) seguir 100% Anthropic — costo por mensaje más alto de la tabla; (b) migrar core.js al formato OpenAI — más invasivo, el adapter logra lo mismo sin tocar código probado.

## 2026-07-13 — Documentación en Notion bajo "Chaski — Centro de Operaciones"

**Decisión**: el hub "🏭 Fábrica de Agentes" vive dentro del centro de operaciones Chaski existente, con base de datos de Pedidos propia. La bitácora de agentes existente (`/bitacora-chaski`) se sigue usando para cambios a agentes ya entregados.

**Contexto**: José ya opera desde ese centro en Notion; duplicar estructuras dispersaría la información.
