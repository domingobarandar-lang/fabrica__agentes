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

## 2026-07-13 — Pedido dental-sanmartin: arquitectura

**Decisión**: base `agente-citas` extendida con agenda por profesional (tabla `profesionales` + columna en `citas` + tool `ver_profesionales` + disponibilidad por doctor con colación 13-14 excluida). Canal demo: Telegram (token 1 del pool). Runtime: Gemini free tier (key 1 del pool) vía el adapter de la fábrica. Datos: base en memoria para demo; Supabase recién en producción.

**Contexto**: la base calcula disponibilidad global por fecha, pero el pedido exige 3 doctores con agendas independientes — es extensión de datos/tools, no rediseño. Además el guard de `telegram/bot.js` exigía `ANTHROPIC_API_KEY` incluso con otro proveedor: se adapta para aceptar `LLM_PROVIDER` + `LLM_API_KEY`. Detalle completo en `clientes/dental-sanmartin/SPEC.md`.

**Descartado**: (a) modelar doctores como "servicios" del catálogo — rompería mis_citas/cancelar y el catálogo real de tratamientos; (b) `npm test` contra Gemini real — los tests quedan mock-only por diseño (sin `ANTHROPIC_API_KEY` nunca gastan); la validación real es José conversando por Telegram.

## 2026-07-13 — Documentación en Notion bajo "Chaski — Centro de Operaciones"

**Decisión**: el hub "🏭 Fábrica de Agentes" vive dentro del centro de operaciones Chaski existente, con base de datos de Pedidos propia. La bitácora de agentes existente (`/bitacora-chaski`) se sigue usando para cambios a agentes ya entregados.

**Contexto**: José ya opera desde ese centro en Notion; duplicar estructuras dispersaría la información.

## 2026-07-15 — Segundo frente: Modo Mejora de agentes existentes

**Decisión**: la fábrica suma al frente de construcción un **modo mejora** para agentes ya armados: José entrega el agente (archivo/carpeta), los agentes del repo actúan como referencia e interlocutor de **solo lectura** (se los hace "conversar"/contrastar en mock con el agente entregado), y las mejoras se aplican únicamente al agente entregado. Autonomía diferenciada: análisis, diagnóstico y diseño de mejoras 100% autónomos; **aplicar cambios requiere propuesta concreta aprobada por José**. En construcción la autonomía sigue siendo casi total.

**Contexto**: José ya usa mucho este flujo (repo + archivo con un agente suyo, mejorarlo sin tocar el del repo) y pidió formalizarlo el 2026-07-15. Detrás del agente entregado hay algo armado y en uso — por eso el modo exige propuestas primero y cambios quirúrgicos.

**Descartado**: tratar la mejora como un pedido `/fabrica` más — el pipeline de 8 fases y la autonomía total están diseñados para construir desde cero, no para intervenir un agente en producción.

## 2026-07-14 — Pedido inmobiliaria-demo: arquitectura

**Decisión**: base `agente-citas` clonada, con las tools de citas reconvertidas a visitas (disponibilidad/agendar/ver/cancelar restringidas a lunes, miércoles y jueves 11:00–14:00, slots de 30 min) más las tools del vertical inmobiliario (`buscar_propiedades`, `detalle_propiedad`, `registrar_lead` con score determinístico frío/tibio/caliente, `info_corredora`). Canal demo: **terminal** (`npm run chat`) por pedido explícito de José — no se consume token de Telegram del pool ni se registra el agente como subagente en `.claude/agents`. Runtime: Gemini 2.0 Flash free tier vía el adapter de la fábrica — **key 2 del pool** (la 1 quedó asignada a dental-sanmartin). Datos: base en memoria para demo.

**Contexto**: el pedido es agendamiento + calificación de leads + atención general — calza con `agente-citas` extendido con catálogo liviano de propiedades, igual patrón que dental-sanmartin (extensión de datos/tools, no rediseño). El score de leads se calcula en la tool (no lo "opina" el LLM) para que sea verificable en QA mock. José quiere hablar con el agente por terminal: `scripts/chat-local.js` ya viene en la base y con la key free tier la conversación real cuesta $0.

**Descartado**: (a) `agente-retail` como base — el catálogo de propiedades es secundario al flujo visita/lead y perdería mis_citas/cancelar ya probados; (b) bot de Telegram para la demo — instrucción explícita de José, el token del pool queda disponible para producción; (c) que el LLM asigne el score del lead — no determinístico, imposible de testear en mock.

## 2026-07-15 — Pedido inmobiliaria-demo: build y QA cerrados

**Decisión**: build completo (12 tools/reglas del SPEC, 8 propiedades + 1 visita + 1 lead semilla, `npm run chat` como demo real por terminal) y QA en mock con 18/18 escenarios en verde (12 casos de uso + 6 adversariales de `clientes/inmobiliaria-demo/SPEC.md`). Se corrigió un bug real encontrado por la suite: en `agendarVisita` (`agent/tools.js`) el chequeo de "slot ocupado" corría antes que el de idempotencia, así que un "confirmo" repetido del mismo cliente chocaba con su propia visita recién creada en vez de reconocerla como ya agendada (ADV-2). Se reordenaron los chequeos: idempotencia primero, disponibilidad después. Reporte completo en `clientes/inmobiliaria-demo/QA.md`.

**Contexto**: el build se hizo en dos tramos por límite de sesión del subagente `desarrollador` (se cortó dos veces); se retomó desde el estado real en disco cada vez, sin perder trabajo. El bug de ADV-2 solo apareció al correr la suite completa — la propia política de "mock siempre primero" de la fábrica lo atrapó antes de que José probara la demo real.

**Descartado**: reintentar el build con un tercer subagente — con el trabajo ya casi terminado y de alta calidad, completar la verificación y el fix directamente fue más rápido y confiable que otro ciclo de subagente con riesgo de nuevo corte.
