# Pipeline de la Fábrica

Flujo completo de un pedido, de la frase del cliente al producto entregado. Cada fase tiene responsable y definición de "terminado" (DoD). El orquestador (sesión principal) despacha; los subagentes ejecutan.

**Dónde vive el proyecto.** Los proyectos NO viven dentro de este repo. Cada uno nace en una carpeta externa por cliente (ver `CLAUDE.md` → "Dónde viven los proyectos"). En este documento `<RUTA_PROYECTO>` es la ruta absoluta de la carpeta del proyecto (ej. `C:\Users\Adela\clientes\taller-lucas\orden-trabajo\`). El orquestador la crea con `nuevo-proyecto.ps1` y **se la pasa a cada subagente**; ningún subagente la asume ni usa el directorio actual.

## Fase 0 — Clasificación de línea (orquestador)

Antes de cualquier otra cosa, decidir en qué **línea de producción** entra el pedido. Cuatro preguntas, en orden:

1. **¿El valor central es una conversación, o es un proceso interno del negocio?**
   Conversación (contestar, agendar hablando, responder catálogo) → candidata a **conversacional**. Un objeto que avanza por estados con avisos (una orden, una cotización, un ciclo de sesiones) → candidata a **automatización**.
2. **¿Hay un objeto que cambia de estado y alguien tiene que enterarse en cada cambio?**
   Sí → automatización (orden de trabajo, cotización y cierre, sesiones recurrentes). No → conversacional.
3. **¿Quién marca el avance: una persona del negocio, el reloj (tiempo), o el cliente respondiendo?**
   Solo una persona empuja el estado → base pelada (producto 1). Además hay avisos por tiempo → necesita la pieza "reloj". Además el cliente responde y eso mueve el estado → necesita la pieza "oreja". (Ver `lineas/automatizacion/LINEA.md`.)
4. **¿Calza en alguna ficha de catálogo de la línea elegida?**
   Sí → puerta estándar. No → **puerta a medida** (abajo).

**Desempate (pedido mixto).** Un pedido que quiere las dos cosas ("que avise el estado Y que además conteste") es de automatización con el bot como canal (premisa 4). **PERO mientras `lineas/automatizacion/plantillas/base-proceso/` no exista, la parte de automatización no se puede construir todavía.** Regla dura: el desempate rutea a la **línea que puede entregar hoy** (conversacional) y la parte de automatización se marca como camino manual pendiente (abajo), nunca se promete auto-ruteada a una línea sin fábrica.

**DoD**: línea elegida y registrada en el BRIEF; si es automatización, pieza extra identificada (base / reloj / oreja); si no calza en catálogo, marcado como a-medida.

### Puerta a medida

Cualquier pedido que no calce en ningún catálogo entra igual, sin pedirle permiso al catálogo, con un pipeline más liviano: Intake → Spec mínima → Build a criterio → QA con cero efectos externos → entrega. No se le construye plantilla.

**Regla de graduación**: cuando un pedido a medida se repite por **segunda vez**, se gradúa a producto estándar y **recién ahí** se le escribe ficha de catálogo y plantilla. No antes: no se construye maquinaria para algo que pasó una sola vez.

### Automatización antes de que exista base-proceso

Hoy la línea de automatización tiene catálogo (fichas de producto) pero **no** tiene `base-proceso` construido. Hasta que exista:

- `/fabrica` **no** habilita ruteo automático de build a automatización.
- Un pedido de automatización se clasifica, se cotiza leyendo su ficha, y se marca como **camino manual**: el orquestador avisa a José que ese pedido requiere construir `base-proceso` primero (decisión de stack con el cliente real en mano, ver `docs/ARQUITECTURA.md`).

## Fase 1 — Intake (orquestador)

Entrada: la frase de José con el pedido (`/fabrica "..."`) y la línea ya clasificada (fase 0).

1. Crear la carpeta del proyecto con `nuevo-proyecto.ps1` (crea la carpeta externa, `git init`, `.gitignore` antes del primer add). Obtener `<RUTA_PROYECTO>`.
2. Escribir `<RUTA_PROYECTO>\BRIEF.md` con la plantilla de `clientes/_plantilla/BRIEF.md`: qué pidió, línea, ficha de catálogo más cercana (o a-medida), canal, datos que maneja, presupuesto conocido, y el bloque de intake propio de la línea (ver el `LINEA.md` correspondiente).
3. Registrar el pedido en Notion (base "Pedidos") con estado `Intake` y el campo **Ruta** = `<RUTA_PROYECTO>`.

**DoD**: carpeta externa creada con git propio, brief escrito, pedido en Notion con su ruta, línea y ficha (o a-medida) identificadas.

## Fase 2 — Spec (analista)

Convertir el brief en spec ejecutable. Si el pedido es difuso, usar `/spec` de gstack como guía de estructura. El orquestador le pasa al analista `<RUTA_PROYECTO>` y la ficha de la línea.

- **Conversacional**: casos de uso (¿qué conversaciones resuelve el bot?), tools, tablas + datos semilla, fuera de alcance v1.
- **Automatización**: el objeto y sus estados, quién marca cada avance, a quién se avisa en cada cambio, qué pasa si se atrasa, qué ve el dueño en el panel. Piezas extra (reloj/oreja) explícitas.

**DoD**: `<RUTA_PROYECTO>\SPEC.md` con casos de uso numerados y verificables.

## Fase 3 — Arquitectura (orquestador)

Decisiones registradas en `docs/DECISIONES.md`:

- **Conversacional — base a clonar**: `agente-citas` (reservar/agendar) o `agente-retail` (catálogo/pedidos). Desde cero solo si ninguna calza — justificarlo.
- **Automatización — base**: `lineas/automatizacion/plantillas/base-proceso/` (cuando exista). Stack en `docs/ARQUITECTURA.md`.
- **Canal**: Telegram para demo/validación (gratis, sin aprobación de Meta); WhatsApp Cloud API para producción.
- **LLM runtime**: según tabla de `docs/ARQUITECTURA.md` y presupuesto del cliente. Por defecto: proveedor barato OpenAI-compatible, nunca Anthropic por defecto.
- **Datos**: Supabase (schema propio por cliente); base en memoria solo para demo.

**DoD**: sección nueva en DECISIONES.md con base elegida, canal, proveedor LLM y por qué.

## Fase 4 — Build (desarrollador)

**Conversacional** (detalle en `lineas/conversacional/plantillas/base-agente/README.md`):

1. Clonar la base: copiar `chaski-agentes/agente-*` → `<RUTA_PROYECTO>\agente\` (sin `node_modules`, sin `.env`).
2. Reemplazar `agent/llm.js` por `lineas/conversacional/plantillas/base-agente/llm.js` y actualizar `.env.example` con las variables `LLM_*`.
3. Personalizar: `agent/prompts.js` (personalidad, negocio, horarios), `agent/tools.js` (acciones del vertical), `database/schema.sql` + datos semilla, textos de `telegram/bot.js` y `whatsapp/*` si aplica.
4. `npm install` y verificar que `npm run telegram:mock` corre.

**Automatización**: se construye desde `base-proceso` (cuando exista), con el emisor de avisos detrás del cortafuegos (ver `docs/ARQUITECTURA.md`).

**DoD**: el modo de prueba corre en verde con casos del SPEC, **cero efectos externos**.

## Fase 5 — QA (qa)

- **Conversacional**: adaptar/extender `scripts/test-chat.js` con escenarios del SPEC (mínimo: 1 por caso de uso + 2 adversariales: cliente confundido, pedido imposible). `npm test` y `npm run telegram:mock`.
- **Automatización**: correr la suite del proceso verificando que el **emisor simuló** y que hubo **cero llamadas externas** (ni WhatsApp real, ni mensajes al cliente final). El target de QA lo define `base-proceso`.
- **Regla dura de toda la fábrica**: QA siempre primero con **cero efectos externos** (ni tokens de LLM, ni mensajes reales). Una pasada real (LLM o envío) solo con proveedor/modo aprobado explícitamente por José.
- Bugs → `/investigate` de gstack para la causa raíz, no parches de síntoma.

**DoD**: todos los escenarios en verde; reporte breve de QA en `<RUTA_PROYECTO>\QA.md`.

## Fase 6 — Kit de entrega (marketing)

En `<RUTA_PROYECTO>\entrega\`:

- `DEMO.md`: guion de demo de 5 minutos para que José se lo muestre al cliente.
- `ONE-PAGER.md`: qué hace, beneficios en lenguaje del cliente, qué necesita el cliente para producción.
- `OPERACION.md`: cómo se administra, costos mensuales estimados de runtime/hosting.

**DoD**: los tres archivos listos; precio NO incluido (lo fija José).

## Fase 7 — Documentación (documentador)

- Actualizar estado del pedido en Notion (base "Pedidos") → `Listo para revisión`, y confirmar el campo Ruta.
- Volcar decisiones de la fase 3 y resultado de QA a la página del pedido en Notion.
- Si se tocó un agente Chaski existente: además `/bitacora-chaski`.

**DoD**: Notion refleja el estado real; DECISIONES.md al día.

## Fase 8 — Revisión de José (humano)

José prueba el producto y da feedback. Cada iteración de feedback vuelve a la fase que corresponda (spec, build o QA) — no se parcha sin actualizar SPEC.md.

**DoD**: José dice "aprobado" → estado `Entregado` en Notion. Recién ahí se habla de deploy a producción (Railway + credenciales del cliente, con costos aprobados por José).
