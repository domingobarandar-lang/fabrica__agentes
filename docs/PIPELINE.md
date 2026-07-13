# Pipeline de la Fábrica

Flujo completo de un pedido, de la frase del cliente al producto entregado. Cada fase tiene responsable y definición de "terminado" (DoD). El orquestador (sesión principal) despacha; los subagentes ejecutan.

## Fase 0 — Intake (orquestador)

Entrada: la frase de José con el pedido (`/fabrica "..."`).

1. Crear `clientes/<slug>/` (slug corto: `dental-sanmartin`, `petshop-lukas`).
2. Escribir `BRIEF.md` con la plantilla de `clientes/_plantilla/BRIEF.md`: qué pidió, vertical del catálogo más cercana, canal, datos que maneja, presupuesto conocido.
3. Registrar el pedido en Notion (base "Pedidos") con estado `Intake`.

**DoD**: brief escrito, pedido en Notion, vertical identificada.

## Fase 1 — Spec (analista)

Convertir el brief en spec ejecutable. Si el pedido es difuso, usar `/spec` de gstack como guía de estructura.

- Casos de uso concretos (¿qué conversaciones debe resolver el bot?).
- Tools necesarias (¿qué acciones ejecuta: agendar, cancelar, consultar stock...?).
- Datos: tablas, campos, datos semilla de demo.
- Fuera de alcance explícito (qué NO hace la v1).

**DoD**: `clientes/<slug>/SPEC.md` con casos de uso numerados y verificables.

## Fase 2 — Arquitectura (orquestador)

Decisiones registradas en `docs/DECISIONES.md`:

- **Base a clonar**: `agente-citas` (todo lo que sea reservar/agendar) o `agente-retail` (todo lo que sea catálogo/pedidos). Desde cero solo si ninguna calza — justificarlo.
- **Canal**: Telegram para demo/validación (gratis, sin aprobación de Meta); WhatsApp Cloud API para producción.
- **LLM runtime**: según tabla de `docs/ARQUITECTURA.md` y presupuesto del cliente. Por defecto: proveedor barato OpenAI-compatible, nunca Anthropic por defecto.
- **Datos**: Supabase (schema propio por cliente); base en memoria solo para demo.

**DoD**: sección nueva en DECISIONES.md con base elegida, canal, proveedor LLM y por qué.

## Fase 3 — Build (desarrollador)

1. Clonar la base: copiar `chaski-agentes/agente-*` → `clientes/<slug>/agente/` (sin `node_modules`, sin `.env`).
2. Reemplazar `agent/llm.js` por `plantillas/base-agente/llm.js` y actualizar `.env.example` con las variables `LLM_*`.
3. Personalizar: `agent/prompts.js` (personalidad, negocio, horarios), `agent/tools.js` (acciones del vertical), `database/schema.sql` + datos semilla, textos de `telegram/bot.js` y `whatsapp/*` si aplica.
4. `npm install` y verificar que `npm run telegram:mock` corre.

**DoD**: `npm run telegram:mock` completa sin errores con conversaciones del vertical del cliente.

## Fase 4 — QA (qa)

- Adaptar/extender `scripts/test-chat.js` con escenarios del SPEC (mínimo: 1 por caso de uso + 2 adversariales: cliente confundido, pedido imposible).
- `npm test` y `npm run telegram:mock` en verde, **siempre en modo MOCK primero** (0 tokens).
- Si hay presupuesto aprobado por José: una pasada real con el proveedor elegido (no Anthropic salvo que sea el elegido).
- Bugs → `/investigate` de gstack para la causa raíz, no parches de síntoma.

**DoD**: todos los escenarios en verde; reporte breve de QA en `clientes/<slug>/QA.md`.

## Fase 5 — Kit de entrega (marketing)

En `clientes/<slug>/entrega/`:

- `DEMO.md`: guion de demo de 5 minutos para que José se lo muestre al cliente (qué escribirle al bot y qué va a responder).
- `ONE-PAGER.md`: qué hace el agente, beneficios en lenguaje del cliente, qué necesita el cliente para producción (número WhatsApp, datos reales).
- `OPERACION.md`: cómo se administra (cambiar horarios, precios, textos), costos mensuales estimados de runtime.

**DoD**: los tres archivos listos; precio NO incluido (lo fija José).

## Fase 6 — Documentación (documentador)

- Actualizar estado del pedido en Notion (base "Pedidos") → `Listo para revisión`.
- Volcar decisiones de la fase 2 y resultado de QA a la página del pedido en Notion.
- Si se tocó un agente Chaski existente: además `/bitacora-chaski`.

**DoD**: Notion refleja el estado real; DECISIONES.md al día.

## Fase 7 — Revisión de José (humano)

José prueba con `npm run telegram:mock` (o el bot real de demo) y da feedback. Cada iteración de feedback vuelve a la fase que corresponda (spec, build o QA) — no se parcha sin actualizar SPEC.md.

**DoD**: José dice "aprobado" → estado `Entregado` en Notion. Recién ahí se habla de deploy a producción (Railway + credenciales del cliente, con costos aprobados por José).
