# Pipeline de la Fábrica

Flujo completo de un pedido, de la frase del cliente al producto entregado — y, cuando tiene tráfico, al bucle que lo mejora (fase 9). Cada fase tiene responsable y definición de "terminado" (DoD). El orquestador (sesión principal) despacha; los subagentes ejecutan.

**Dónde vive el proyecto.** Los proyectos NO viven dentro de este repo. Cada uno nace en una carpeta externa por cliente (ver `CLAUDE.md` → "Dónde viven los proyectos"). En este documento `<RUTA_PROYECTO>` es la ruta absoluta de la carpeta del proyecto (ej. `C:\Users\Adela\clientes\taller-lucas\orden-trabajo\`). El orquestador la crea con `nuevo-proyecto.ps1` y **se la pasa a cada subagente**; ningún subagente la asume ni usa el directorio actual.

**Semáforo y bitácora (protocolo anti-amnesia).** Cada cambio de fase se clasifica en un nivel de semáforo (ver `CLAUDE.md` → "Semáforo de cambios"). Las fases que **cambian comportamiento** — Spec (define/cambia casos de uso), Arquitectura (base, proveedor, schema) y Build — son 🟡 y dejan una entrada en la `BITACORA.md` del cliente (nivel completo, `[🟡 POR LEER]`). Cambiar un comportamiento ya aprobado o el alcance del SPEC es 🔴 (me detengo, causas 7 y 8). Las decisiones de la fase 3 siguen yendo además a `docs/DECISIONES.md`.

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
3. **Pedir el material que el cliente YA tiene** (línea conversacional). Es la fase más barata y la que más sube la calidad del agente: un export del WhatsApp del negocio (200 conversaciones alcanzan), su lista de precios, sus horarios, sus preguntas frecuentes. Va a `<RUTA_PROYECTO>\conversaciones-reales\` (que el `.gitignore` del proyecto excluye: son datos de personas reales). Un agente escrito desde un pedido imaginado habla como el pedido; uno escrito leyendo el chat real del negocio habla como ese negocio — ver `docs/CALIDAD-CONVERSACIONAL.md`, palanca P6.
   **Si el cliente no lo tiene o no lo entrega, el pedido sigue igual**: se anota en el BRIEF que el SPEC va a ser inventado y no observado. Lo que no se puede es no pedirlo.
4. Registrar el pedido en Notion (base "Pedidos") con estado `Intake` y el campo **Ruta** = `<RUTA_PROYECTO>`.

**DoD**: carpeta externa creada con git propio, brief escrito, pedido en Notion con su ruta, línea y ficha (o a-medida) identificadas, y el material real pedido (entregado o su ausencia anotada).

## Fase 2 — Spec (analista)

Convertir el brief en spec ejecutable. Si el pedido es difuso, usar `/spec` de gstack como guía de estructura. El orquestador le pasa al analista `<RUTA_PROYECTO>` y la ficha de la línea.

- **Conversacional**: casos de uso (¿qué conversaciones resuelve el bot?), tools, tablas + datos semilla, fuera de alcance v1, y **`lead.campos`**: qué datos hay que juntar de la persona y con qué parámetro los reciben las tools (sin eso el agente vuelve a preguntar lo que ya le dijeron). Si hay `conversaciones-reales/`, son la fuente principal: de ahí salen los temas de `conocimiento/`, el tono y los adversariales.
- **Automatización**: el objeto y sus estados, quién marca cada avance, a quién se avisa en cada cambio, qué pasa si se atrasa, qué ve el dueño en el panel. Piezas extra (reloj/oreja) explícitas.

**DoD**: `<RUTA_PROYECTO>\SPEC.md` con casos de uso numerados y verificables.

## Fase 3 — Arquitectura (orquestador)

Decisiones registradas en `docs/DECISIONES.md`:

- **Conversacional — base**: siempre el núcleo (`lineas/conversacional/plantillas/base-agente/`), que `nuevo-proyecto.ps1` instancia. Lo que se decide acá es la **ficha de catálogo** que guía el producto (agendamiento, retail, atención) y qué capacidades del núcleo se encienden: `lead.campos` (siempre), `conocimiento/` (casi siempre), `flujo.agentes` (**no**, se decide después con el panel — ver fase 9).
- **Automatización — base**: `lineas/automatizacion/plantillas/base-proceso/` (cuando exista). Stack en `docs/ARQUITECTURA.md`.
- **Canal**: Telegram para demo/validación (gratis, sin aprobación de Meta); WhatsApp Cloud API para producción.
- **LLM runtime**: según tabla de `docs/ARQUITECTURA.md` y presupuesto del cliente. Por defecto: proveedor barato OpenAI-compatible, nunca Anthropic por defecto.
- **Datos**: Supabase (schema propio por cliente); base en memoria solo para demo.

**DoD**: sección nueva en DECISIONES.md con base elegida, canal, proveedor LLM y por qué.

## Fase 4 — Build (desarrollador)

**Conversacional** (detalle en `lineas/conversacional/plantillas/base-agente/README.md`):

1. El proyecto ya nació con `nuevo-proyecto.ps1` y trae **núcleo + semilla**. No se clona nada más, y **el núcleo no se edita dentro del proyecto**: un bug del núcleo se arregla en la fábrica y se re-sincroniza con `scripts/sincronizar-nucleo.ps1`.
2. Llenar `agente.config.json` (identidad, canales, `datos.prefijo`, `lead.campos`, hitos) y correr `npm run validar`. El proveedor de LLM y las credenciales van al `.env` (`LLM_*`), nunca a la config.
3. Personalizar el producto: `agent/prompts.js` (alcance y reglas del rubro), `agent/tools.js` (validación de negocio dentro de la tool), `database/schema.sql` + el bloque de dominio, y `conocimiento/`. **Las reglas de forma no van en el prompt**: las anexa el núcleo (`agent/estilo.js`) y se ajustan en `estilo.*`.
4. `npm install`, `npm test` y `npm run chat`. Antes de entregar, `npm run entrega`.

**Automatización**: se construye desde `base-proceso` (cuando exista), con el emisor de avisos detrás del cortafuegos (ver `docs/ARQUITECTURA.md`).

**DoD**: el modo de prueba corre en verde con casos del SPEC, **cero efectos externos**.

## Fase 5 — QA (qa)

- **Conversacional**: escribir `evals/escenarios.js` con el **camino feliz** de cada CU del SPEC (el motor lo vuelve a correr con los 8 perfiles de cliente difícil) + mínimo 2 adversariales del rubro. Los **13 invariantes** del núcleo corren solos en cada turno; 5 son el contrato de forma (sin Markdown, una pregunta por mensaje, no re-saludar, no hablar como máquina, tope de emojis) y **no se apagan para llegar a verde**: si se ponen rojos, lo que hay que arreglar es el prompt. Si hay `conversaciones-reales/`, los escenarios se copian de ahí en vez de inventarse. `npm test`.
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

## Fase 9 — Operación y mejora continua (José, con la fábrica de apoyo)

**Esta fase solo existe cuando el agente tiene tráfico real.** Es el bucle que separa un agente que se entregó de un agente que sirve, y es lo que la fábrica no tenía: hasta la fase 8 todo lo que sabemos del producto sale de escenarios que escribimos nosotros.

Cada dos semanas, mientras el agente esté en marcha blanca:

1. **`npm run metricas`** en la carpeta del proyecto. Las tres preguntas que hay que contestar están en `docs/CALIDAD-CONVERSACIONAL.md` §8: en qué parte de la conversación se detiene la gente, cuántas conversaciones quedaron a medias y cuántas entradas no soportadas (audios) murieron en silencio.
2. **Leer 10 conversaciones reales completas.** El panel dice *dónde* falla; solo el texto dice *por qué*. Es la misma lectura de la fase 1, ahora con el agente adentro.
3. **Convertir cada hallazgo en un escenario** de `evals/escenarios.js` antes de arreglarlo. Un arreglo sin escenario vuelve.
4. **Anotar en la `BITACORA.md` del proyecto** con su nivel de semáforo. Un cambio de comportamiento es 🟡; cambiar algo que José ya aprobó en el SPEC es 🔴.

Lo que se decide **acá y no antes**: si conviene partir el agente en varios (`flujo.agentes`), qué hitos de negocio importan de verdad, y si el seguimiento proactivo (paso 8 de `CALIDAD-CONVERSACIONAL.md`) vale lo que cuesta.

**DoD**: no tiene — es un bucle. Se corta cuando el cliente deja de ser marcha blanca y pasa a mantención.
