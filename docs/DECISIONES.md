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

**Decisión**: el punto de acople con Anthropic (`agent/llm.js`) se reemplaza por un adapter multi-proveedor (`lineas/conversacional/plantillas/base-agente/llm.js`) que habla OpenAI-compatible (Groq, DeepSeek, Gemini, OpenRouter, Ollama) manteniendo Anthropic como opción. Proveedor por defecto para demos: Gemini Flash free tier u Ollama local. Escala futura: gateway LiteLLM con presupuesto por cliente.

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

## 2026-07-16 — Pedido rondas-qr: arquitectura

**Decisión**: primera vertical no conversacional de la fábrica (`rondas-seguridad`, catálogo nuevo). Se construye desde cero como app operativa: API + motor de rondas en Node/Express, PWA offline-first para el guardia (escáner QR con `jsqr` vendorizado + `BarcodeDetector` como atajo cuando el teléfono lo trae, service worker + cola local de eventos), y panel web del administrador con hoja de QR imprimible (`qrcode` de npm, generación server-side). **Sin LLM en runtime**: flujo 100 % determinista, costo por uso $0 — aplicación directa del Principio 5 de ARQUITECTURA.md. Persistencia v1: archivo JSON con escritura atómica (cero dependencias nativas, corre igual en Windows y Railway); migración a SQLite/Postgres documentada en la entrega. Notificaciones al administrador: llamada HTTPS directa a la API de Telegram (sin SDK), `MOCK=true` por defecto; **token 2 del pool asignado a este cliente** (quedan disponibles: 1 token Telegram y 1 key Gemini). Sincronización offline: la PWA es local-first y reenvía eventos idempotentes (crear ejecución con id generado en el teléfono, escaneo por punto, cierre); el servidor revalida todo al recibirlos.

**Contexto**: el pedido reemplaza chapitas iButton + lectora por QR + teléfono del guardia, con informe automático al administrador y alerta de puntos saltados. No hay conversación de por medio: clonar la base chaski habría arrastrado Telegram + LLM sin uso. De paso queda probado que la fábrica puede vender apps operativas simples además de chatbots.

**Descartado**: (a) clonar `agente-citas`/`agente-retail` — nada del loop conversacional aplica; (b) usar un LLM para redactar el informe — la plantilla determinista es verificable en QA mock y cuesta $0; (c) app nativa Android — la PWA cubre cámara + offline sin pasar por tiendas; (d) generador de QR artesanal — `qrcode` de npm está batalla-probado y el riesgo no paga; (e) Supabase en v1 — para pilotos el JSON atómico basta y elimina fricción de credenciales.

**Nota de pipeline**: los subagentes de la fábrica no estaban registrados en esta sesión; las fases las ejecutó el orquestador directamente (la skill lo contempla: el pedido no se detiene).

## 2026-07-16 — Pedido rondas-qr: build y QA cerrados

**Decisión**: build completo en `clientes/rondas-qr/app/` (API Express + motor de rondas idempotente + PWA del guardia offline-first + panel del administrador + hoja de QR imprimible) y QA en verde: 12/12 tests automatizados cubriendo los 14 casos de uso del SPEC más adversariales (permisos cruzados, cierres repetidos, reenvío offline), y smoke test en navegador sobre el servidor real con **round-trip de QR**: el PNG que genera el servidor, decodificado con jsQR (el mismo motor del teléfono), devuelve el payload exacto. Estado del pedido: **Listo para revisión**. Único fix durante QA: `node --test test/` no resuelve en Windows → script cambiado a `node --test`.

**Contexto**: la demo queda sembrada (2 condominios) y con un informe de ejemplo para que el panel no parta vacío. El token 2 de Telegram del pool ya está copiado al `.env` del cliente con `MOCK=true` — activarlo es decisión de José (`MOCK=false` + chat_id del admin, pasos en OPERACION.md). Pool restante: 1 key Gemini + 1 token Telegram.

## 2026-07-17 — Pedido rondas-qr: v1.1 (GPS) + investigación + pase de diseño

**Decisión**: iteración completa sobre el feedback de José, en cinco frentes. (1) **GPS en cada marca** (CU-15/16 nuevos en SPEC.md): la PWA observa la ubicación durante la ronda y la adjunta a cada escaneo; el admin fija la ubicación real de cada punto con "📍 Fijar aquí"; el motor acusa marcas a >75 m (+margen por precisión, tope 50 m) y marcas sin GPS en puntos verificables. El GPS jamás bloquea una marca. Tests 13/13. (2) **Seguridad/veracidad** (/office-hours): modelo de amenaza = el guardia con incentivos; propuesta por capas en `entrega/SEGURIDAD.md` (Capa 1 software puro: velocidad entre puntos, sesgo de reloj, vínculo de dispositivo, hash-chain; Capa 2: NFC vía Web NFC + NTAG213, foto-evidencia); design doc en ~/.gstack/projects/. (3) **Competencia** (/office-hours + búsqueda): categoría madura (QR-Patrol US$3.20/guardia/mes, Silvertrac US$4.99) con jugadores chilenos (Control Guard, Munily, Dgenius); diferenciación en `entrega/COMPETENCIA.md` — reemplazo directo de la chapita sin suite, PWA sin tiendas, offline real, runtime $0. (4) **Lanzamiento**: PWA por navegador, sin App/Play Store (B2B cerrado, ~90 % Android, updates instantáneos); TWA queda como puerta si algún día se exige tienda — `entrega/LANZAMIENTO.md`. (5) **Diseño** (/design-system + /design-critique): tokens unificados entre app del guardia y panel (DESIGN.md nuevo), transiciones y estados de foco, chips con contraste AA corregido (estaban en 3.95:1), y **bug real cazado por la crítica**: el service worker cache-first con nombre fijo servía shell viejo para siempre → network-first con caché versionado de respaldo.

**Contexto**: José pidió además el proyecto empaquetado: `rondas-qr-v1.zip` en su Escritorio (sin node_modules, sin data/, sin .env). Se regenera con la v1.1.

**Descartado**: (a) QR dinámico con pantallas — más caro y frágil que NFC sin ser más seguro; (b) biometría por marca — fricción nocturna injustificada; (c) publicar en tiendas ahora — costo y fricción sin beneficio para un B2B cerrado; (d) subagente revisor adversarial del design doc — sesión spawned, revisión propia registrada (José puede re-correr /office-hours interactivo si quiere el loop completo).

## 2026-07-17 — rondas-qr migrado a repo propio

**Decisión**: por pedido explícito de José, el proyecto sale de la fábrica: carpeta local movida de `clientes/rondas-qr/` a `C:\Users\Adela\rondas-qr\` y repo privado propio `domingobarandar-lang/rondas-qr` (commit inicial `e0af1d2`, 37 archivos, sin `.env` ni `data/`). En la fábrica quedan: la vertical `catalogo/rondas-seguridad.md` (conocimiento de venta, apunta al repo nuevo), la asignación del token 2 en `secrets/README.md` (los valores siguen solo en `secrets/pool.env` y en el `.env` local del proyecto), y este historial de decisiones. El historial git viejo del proyecto permanece en los commits pasados de fabrica__agentes (no se reescribió historia remota — destructivo e innecesario).

**Contexto**: repo propio permite dar acceso al cliente o a otro desarrollador sin exponer la fábrica completa.

## 2026-07-22 — Reestructuración en líneas de producción

**Decisión**: la fábrica pasa de una sola línea (disfrazada de fábrica) a dos líneas que no se mezclan: `lineas/conversacional/` (lo de hoy) y `lineas/automatizacion/` (procesos internos del negocio). Cada línea con su `LINEA.md`, `catalogo/` y `plantillas/`. `docs/` sigue siendo la capa común. `/fabrica` gana una fase 0 que clasifica la línea con 4 preguntas.

**Contexto**: José vende automatización de procesos a pymes de servicio y el pipeline no tenía dónde ponerla (un producto no-bot terminaba construido fuera del repo, sin plantilla). Hay entregas conversacionales con precio acordado, así que el cuello de botella es capacidad de entrega, no venta.

**Descartado**: (a) dos fábricas separadas (repos distintos) — duplica canal/LLM/Notion y mata la premisa "el bot es un canal del proceso"; (b) motor de procesos genérico con presets (Approach C) — es la plataforma genérica que ya se descartó el 13-jul, meses antes del primer peso. Approach A (zonas con capa común) es reversible, barata (~2-3h CC) y es el primer piso de C.

## 2026-07-22 — Los proyectos nacen fuera del repo, una carpeta por cliente

**Decisión**: ningún proyecto de cliente vive dentro de `fabrica__agentes/`. Cada cliente nace en una carpeta propia fuera del repo, con git propio, creada con `nuevo-proyecto.ps1` (crea la carpeta madre si falta, `git init`, `.gitignore` con `.env`/`node_modules` **antes** del primer add, `Test-Path` fail-closed que no sobrescribe un proyecto existente). El orquestador pasa la ruta absoluta externa a cada subagente; los subagentes tienen guarda "sin ruta DETENTE" y nunca usan el directorio actual.

**Contexto**: con volumen real, `clientes/<slug>/` dentro del repo convertía la maquinaria en depósito de proyectos (git lento, imposible entregar/archivar un cliente por separado). El respaldo de las carpetas externas lo maneja José (crea la carpeta madre donde quiera respaldarla).

**Descartado**: `clientes/` versionado como destino de proyectos NUEVOS. Los proyectos que ya viven ahí (marcha blanca: `dental-sanmartin`, `inmobiliaria-demo`) **se quedan; no se migran**. `clientes/_plantilla/` sigue como plantilla de BRIEF.

## 2026-07-22 — Índice de clientes: el disco es la fuente de verdad, Notion es el reporte

**Decisión**: no hay archivo `registro/` local versionado. El disco (la carpeta madre de clientes) es la fuente de verdad de "qué clientes/proyectos existen"; la base "Pedidos" en Notion gana un campo **Ruta** y es la vista de reporte. Caché local derivada de solo lectura como respaldo si Notion no responde; nunca se edita a mano ni manda sobre el disco.

**Contexto**: la revisión de ingeniería (autoplan, 22-jul) notó que hacer a Notion la fuente única invierte la autoridad: un pipeline que crea la carpeta y se cae antes de registrar en Notion dejaría al cliente invisible. El disco no se cae ni tiene rate limit.

**Descartado**: (a) `registro/clientes.md` versionado — refutado por la decisión de no meter proyectos al repo; (b) Notion como registro maestro — invierte la autoridad respecto del disco.

## 2026-07-22 — Premisa 3 revisada: base compartida + piezas reusables

**Decisión** (gate de premisas con José, autoplan): los 3 productos de automatización NO son idénticos. Comparten una **base pelada** (objeto con estados + emisor de avisos + panel), pero el producto 2 y el 3 agregan **piezas reusables**: "reloj" (avisos por tiempo, un cron) y "oreja" (el cliente responde y eso mueve el estado, un webhook). Se construye primero el producto 1 (base pelada, la cuña más angosta); el reloj y la oreja se construyen una vez y se reusan. Las 3 fichas de catálogo se escriben ahora (decisión de José) marcando la pieza extra de cada una.

**Contexto**: la premisa original ("los 3 son el mismo esqueleto") sobrestimaba el reuso y habría hecho parecer gratis al 2 y al 3. José la corrigió en el gate.

**Descartado**: (a) dejar la premisa como "los 3 son iguales" — habría mordido al cotizar el 2/3; (b) dejar solo el producto 1 en el catálogo — José prefirió las 3 fichas ahora para poder cotizar en reunión.

## 2026-07-22 — Cortafuegos de envío: falla cerrado, garantía acotada a QA

**Decisión**: la plantilla `base-proceso` (cuando se construya) lleva un emisor único de avisos que falla cerrado — sin `MODO_ENVIO=produccion` **exacto** simula y lo anuncia en el arranque. Allowlist estricta, anti-duplicado por `(objeto, estado)`, y **la garantía "cero efectos externos" es de build/QA, no de producción** (en producción el cron de Railway envía con su propio entorno). La regla dura de la constitución pasa de "0 tokens" a "cero efectos externos" en QA. `base-proceso` se construye con el primer cliente real de automatización, no antes.

**Contexto**: revisión de ingeniería (autoplan). Protege a los clientes del cliente (que no les lleguen avisos de prueba), no solo la billetera. El anti-duplicado lo agregó la revisión (un reintento no puede avisar dos veces).

**Descartado**: cortafuegos como filtro de producción — falso; en producción sí se envía. Es una guarda de desarrollo/QA.

## 2026-07-22 — Frontera de postventa por tamaño del cambio

**Decisión**: lo entregado sale del alcance de la fábrica. Cambio chico (horario, precio, texto) → José lo edita directo con Claude Code, sin fábrica. Cambio grande (nueva capacidad/tool/flujo/estado) → vuelve a la fábrica y actualiza SPEC + QA. No hay migración de lo ya entregado a la estructura nueva.

**Contexto**: corrige la contradicción de `FLUJO-COMERCIAL.md` (que mandaba todo cambio a la fábrica). La frontera la pone el tamaño, no el tipo.

## 2026-07-23 — Integración con el repo real + rondas fuera del catálogo

**Decisión**: al ir a pushear la reestructura se detectó que la copia local estaba atrasada 4 commits respecto de `origin/main` (era el snapshot de respaldo de OneDrive). Se integró por rebase sobre el remoto real, **preservando** los dos agentes en marcha blanca (`clientes/dental-sanmartin`, `clientes/inmobiliaria-demo`) y el Modo Mejora. Los dos proyectos existentes se quedan dentro de `clientes/` (regla de marcha blanca); la regla "proyectos afuera" aplica a los nuevos. Se quitó del catálogo `catalogo/rondas-seguridad.md` (decisión de José): rondas-qr ya vive en su repo propio y queda fuera del diseño de líneas.

**Contexto**: el trabajo real (agentes entregados + Modo Mejora) estaba solo en GitHub, no en la copia local. **No se forzó el push** para no borrar trabajo entregado (regla 5): se rebaseó encima del remoto.

**Descartado**: force-push de la reestructura — habría borrado los dos agentes entregados y el Modo Mejora.

## 2026-07-23 — Protocolo anti-amnesia: semáforo tri-nivel + bitácora + hook de aviso

**Decisión**: se instala el protocolo que José aprobó en office-hours. (1) **Semáforo de cambios** en `CLAUDE.md`: 🟢 (anoto una línea) / 🟡 (sigo pero queda PENDIENTE DE LECTURA) / 🔴 (me detengo). El nivel no es criterio libre del agente: 🔴 = lista cerrada de 8 causas (las 6 previas + 2 nuevas: cambiar comportamiento aprobado en el SPEC, modificar alcance del SPEC). (2) **Bitácora versionada** append-only por proyecto de cliente (`BITACORA.md`, schema fijo, plantilla en `clientes/_plantilla/`); las decisiones de fábrica siguen en este archivo. (3) **Hook de cierre** en `.claude/settings.json` + `scripts/check-bitacora.ps1` en **modo aviso** (nunca bloquea, try/catch + exit 0): recuerda registrar si se tocaron archivos de comportamiento sin anotar. `nuevo-proyecto.ps1` copia bitácora + hook a cada cliente nuevo, así el aviso también corre en las sesiones de proyecto.

**Contexto**: José pierde el hilo de qué cambió y por qué a lo largo de semanas; quería conciencia sin perder autonomía. Reconciliación con la reestructura: la bitácora vive en la carpeta externa del cliente (no en `clientes/<slug>/` del repo), y el hook se auto-detecta cliente/fábrica.

**Descartado**: (a) hook que **bloquea** el cierre — frustra sesiones de exploración; en v1 solo avisa fuerte, se sube a bloqueo si el aviso se ignora en la práctica; (b) trazabilidad automática completa (loguear cada cambio) — infraestructura para mantener en Windows antes del primer peso; el semáforo + bitácora entrega conciencia, que es lo que José pidió, no detección. Pendiente para v2: correr la suite MOCK en el hook para detección real de regresión (Open Question del diseño).

## 2026-07-30 — Auditoría de la DIRECTIVA de arquitectura: diagnóstico y reordenamiento propuesto [🟡 POR LEER]

**Estado**: **propuesta, NO aplicada. Cero cambios de código en esta sesión.** Sesión de `/gstack-office-hours` cortada antes de elegir alternativa de implementación; se retoma el 2026-07-31.

**Contexto**: José entregó `DIRECTIVA-ARQUITECTURA-FABRICA-AGENTES.md` (Avenida Chanski v1.0). Investiga a Vambe (2.000 clientes, ~8 agentes hiperespecializados por cliente, conocimiento en carpetas cargadas just-in-time, meta-agente de configuración) y a Nexor (agentes de voz con capas de razonamiento, coordinación y memoria), cita el paper de Anthropic sobre context engineering, y ordena ejecutar 14 reglas de auditoría A-01 a A-14 más un contrato de `client.config.json`. Meta del cliente: negocio con clientes pagando; hoy hay un piloto gratis con propuesta comercial enviada y contrato en preparación.

**Auditoría del disco (no de lo declarado)** — estado real por regla:

- **A-02 agente monolítico**: se cumple el diagnóstico. `agent/core.js` maneja todo el ciclo con un solo system prompt en `agent/prompts.js`.
- **A-03 conocimiento monolítico**: parcial. `info_corredora` y `ver_horarios` ya son tools; no hay carpetas por intención ni `_index.json`.
- **A-04 datos por prompt**: **YA CUMPLE**. Catálogo, disponibilidad e info entran por tool con filtros. La directiva asume roto algo que funciona.
- **A-05 estado en historial**: parcial. Existe tabla `leads` con columnas tipadas (`database/schema.sql`), pero el agente no recibe bloque "ya sabes / te falta" y re-deriva del historial.
- **A-06 historial sin límite**: parcial. Ventana de 30 mensajes en `agent/memory.js`; sin compactación.
- **A-07 buffer + lock**: el **lock ya existe** (cola serial por teléfono, `core.js`). Falta el buffer de agrupación (~8 s).
- **A-08 timeout/retry**: el **retry con backoff ya existe**. Falta `AbortController` con timeout duro.
- **A-09 handoff humano**: **CERO**. `modo_humano` no aparece en ningún archivo del repo.
- **A-10 métricas**: **CERO**. No hay tabla de métricas.
- **A-11 evals**: **CERO**. No existe carpeta `evals/`.
- **A-12 `client.config.json`**: **CERO**. El archivo no existe en ninguna parte del repo.
- **A-13 workflows / A-14 feature flags**: no aplican todavía (no hay automatizaciones ni compensaciones de modelo hardcodeadas).
- La directiva manda auditar `FABRICA-AGENTES-BLUEPRINT.md` y `PLAN-EJECUCION-FABRICA.md` (A-01): **ninguno de los dos existe en este repo**. Fue escrita contra otro estado del proyecto.

**Hallazgo principal, y NO está en la directiva**: `agent/core.js` y `agent/llm.js` son **byte-idénticos** entre `dental-sanmartin` e `inmobiliaria-demo` (verificado con `diff`). La personalización real hoy es clonar la carpeta completa y editar solo `prompts.js` + `tools.js`. Con dos clientes no duele; con el tercero entrando por contrato, cada bug del core se arregla N veces a mano.

**Hallazgo operativo**: la plantilla base oficial `C:\Users\Adela\chaski-agentes\` **no es accesible** desde la máquina actual (`C:\Users\user\`). Hoy la fábrica no puede clonar su propia base; la plantilla de facto es `clientes/inmobiliaria-demo/agente/`.

**Reordenamiento propuesto (7 premisas, pendientes del OK de José)**:

1. **P1** — El cuello de botella #1 es el fork de código por cliente, no la especialización del agente.
2. **P2** — La Parte 4 de la directiva se traduce, no se aplica literal: propone carpetas en inglés (`agents/`, `clients/`, `evals/`, `workflows/`) y clientes **dentro** del repo, contra dos reglas duras de `CLAUDE.md` (español en el código; ningún proyecto de cliente dentro de `fabrica__agentes/`). Se adopta el contrato, se rechazan nomenclatura y ubicación.
3. **P3** — Los evals son precondición, y se escriben **primero contra el comportamiento actual** (caracterización) antes de refactorizar. Al revés solo validan el código nuevo y no avisan de la regresión.
4. **P4** — A-09 (handoff) y A-07 (buffer) son bugs de producción, no mejoras de arquitectura, y van antes que cualquier refactor.
5. **P5** — A-02 (partir en cinco agentes) es la **última** fase, no la primera. Se activa por config (`flujos[].agentes`), no como reescritura del core.
6. **P6** — Falta el **canal de distribución del core compartido** (npm privado, submódulo git o script de sincronización versionado). Sin eso, "core compartido" es un deseo: cada cliente sigue siendo una copia y la config no arregla nada. La directiva da esto por hecho y no está.
7. **P7** — El origen de clonado oficial está roto (ver hallazgo operativo): se restaura el acceso o se oficializa la plantilla que sí existe.

**EUREKA registrado**: la arquitectura de Vambe (8 agentes por cliente) es **consecuencia** de tener 2.000 clientes, no la causa de haberlos conseguido. Copiarla antes de tener la escala multiplica el problema del fork en vez de resolverlo: partir el agente en cinco sin resolver la duplicación deja cinco archivos duplicados por cliente en vez de uno. De ahí el reordenamiento: **A-12 (config) y A-11 (evals) son la base; A-02 es consecuencia.**

**Alcance**: la directiva aplica solo a `lineas/conversacional/`. La línea de automatización no tiene plantilla construida (`base-proceso/` solo tiene README) — no hay nada que auditar ahí y meterla ahora rompería la regla de que las líneas no se mezclan.

**Pendiente para la próxima sesión (2026-07-31)**:
- Confirmar o corregir las 7 premisas con José (gate).
- Generar las 3 alternativas de implementación — se diferencian en **secuencia y tamaño de paso**, no en alcance: José pidió los cuatro dolores (fork, evals, bugs de producción, multi-agente), así que el alcance es completo.
- Elegir alternativa y recién ahí escribir el diseño.
- Decidir P6 (mecanismo de distribución del core), que es la pieza que la directiva no cubre.

**Descartado en esta sesión**: (a) aplicar A-01..A-14 en el orden de la directiva — pone el refactor multi-agente antes de la red de seguridad, con contrato en preparación; (b) segunda opinión de otro modelo (Codex no está instalado; el subagente de Claude lo canceló José); (c) búsqueda web de paisaje competitivo — la directiva **ya es** la investigación de paisaje, con fuentes en su apéndice, y buscar de nuevo mandaría términos del negocio afuera sin aportar nada.

## 2026-07-31 — Núcleo compartido: enfoque elegido, canal de distribución y plantilla oficial [🟡 POR LEER]

**Decisión (gate de premisas con José)**: se adopta el **enfoque A — "núcleo mínimo primero, sangre encima"**. Las 7 premisas del 2026-07-30 quedan confirmadas. Secuencia: paso 0 medir la red → 1a extraer el núcleo al repo (🟡) → 1b sincronizar sobre clientes (🔴) → 2 bugs de producción (handoff, buffer, timeout) → 3 reconciliar el arnés de evals → 4 `agente.config.json` + validador → 5 conocimiento por carpetas + métricas → 6 multi-agente por config. Documento de diseño completo en `~/.gstack/projects/domingobarandar-lang-fabrica__agentes/user-main-design-20260731-062404.md`.

**Descartado**: (a) **enfoque B, directiva literal** — reescribe `core.js` (147 líneas probadas) antes de tener evals ni handoff, con contrato en preparación, y deja el fork sin resolver hasta el final; (b) **enfoque C, el tercer cliente es el molde** — deja el handoff en cero en los dos agentes que ya atienden gente. C queda como **plan de respaldo automático** si José resuelve que marcha blanca cuenta como "entregado" (ver Pendiente).

**P6 resuelto — canal de distribución del núcleo**: `scripts/sincronizar-nucleo.ps1`. Modo `-Verificar` por defecto (recalcula SHA256 por archivo sobre disco, nunca confía en lo estampado), escribe solo con `-Aplicar`, aborta ante divergencia local salvo `-Forzar` con respaldo previo, e inventario con `-Todos` sobre la raíz de clientes. Precisión respecto del diagnóstico previo: **ya existía un mecanismo primitivo** (`base-agente/llm.js` se copia a mano sobre `agent/llm.js`, referenciado en `CLAUDE.md:66`); lo que faltaba no era el concepto sino la **contabilidad** (versión, verificación, inventario).

**Descartado para P6**: (a) **npm privado** (GitHub Packages) — exige PAT con `read:packages` en cada repo de cliente y en Railway; credencial nueva = 🔴. Es la opción correcta a largo plazo: **disparador documentado para migrar, el cuarto cliente**; (b) **submódulo git** — el repo del cliente necesitaría acceso al repo privado de la fábrica para deployar, más fricción de submódulos en Windows + Railway.

**P7 resuelto — plantilla oficial**: se oficializa `lineas/conversacional/plantillas/base-agente/nucleo/` y se reescribe su README sin la ruta muerta a `C:\Users\Adela\chaski-agentes\`. `base-agente/llm.js` **se absorbe al núcleo, no se duplica**, y se actualiza la referencia de `CLAUDE.md:66`. Se agrega `nucleo/ejemplo/` (prompts, tools, supabase en memoria, index mínimos) porque los 5 archivos del núcleo tienen `require` colgando (`core.js:7-8` pide `./prompts` y `./tools`; `memory.js:5` pide `../database/supabase`) y sin ejemplo el núcleo no se puede instalar, correr ni testear. También se corrige `nuevo-proyecto.ps1:51`, cuyo default `$RaizClientes = 'C:\Users\Adela\clientes'` tiene el mismo defecto.

**Bugs encontrados en la revisión adversarial del diseño, verificados contra el disco** (no estaban en la directiva ni en la auditoría del 2026-07-30):

- 🔴 **Fuga de QA en dental**: `clientes/dental-sanmartin/agente/scripts/test-chat.js:21` usa `MODO_MOCK = process.env.MOCK === 'true' || !process.env.ANTHROPIC_API_KEY`. Con `ANTHROPIC_API_KEY` en `.env`, **`npm test` llama a la API real** — viola la regla dura "cero efectos externos en QA". Inmobiliaria tiene `const MODO_MOCK = true` incondicional. **Se cierra en el paso 2.** Corrige la afirmación del 2026-07-30 de que el arnés era 100% mock en ambos: era cierto solo para inmobiliaria.
- 🔴 **El handoff estaba diseñado en el canal equivocado**: la v1 del diseño lo anclaba en `whatsapp/webhook.js`, pero el `railway.toml` de **ambos** clientes tiene `startCommand = "node telegram/bot.js"` y la demo de inmobiliaria corre por terminal. No habría llegado a ningún usuario real. **Se mueve a `processMessage` de `agent/core.js`**, punto donde convergen los tres canales (`webhook.js:73`, `bot.js:129`, `chat-local.js:42`).
- 🟡 **`railway.toml` sale del núcleo**: su `startCommand` es una decisión de canal por cliente; sincronizarlo pisaría a un cliente que despliegue por WhatsApp. Se genera desde `agente.config.json` en el paso 4.
- 🟡 **Restricción 5 incumplida en dental**: su `.env.example` documenta `ANTHROPIC_*` y no las `LLM_*`; el adapter cae a `LLM_PROVIDER || 'anthropic'` (`llm.js:142`). Se corrige en el paso 2.
- 🟡 **Ningún cliente tiene `BITACORA.md`** pese a que el semáforo las exige y la plantilla existe. Se crean en el paso 0.
- 🟡 **Tokens de Telegram divergentes** (`TELEGRAM_TOKEN_CITAS` vs `TELEGRAM_TOKEN_INMOBILIARIA`) y **tablas de sesión divergentes** (`citas_sesiones` vs `inmobiliaria_sesiones`). Se resuelven por config (`canales.telegram.token_env`, `datos.tabla_sesiones`) sin renombrar variables en agentes en uso.

**Alcance de absorción al núcleo, fijado por adelantado** (para no dejarlo abierto "hasta abrir el archivo"): de `database/supabase.js` se absorbe **solo** conexión, fallback en memoria y `sesiones` + `estado_canal`; los repositorios de dominio (`propiedades`, `visitas`, `citas`, `catalogo`, `horarios`) se quedan en el cliente porque son el modelo de datos del vertical. De `telegram/bot.js` se extraen **primero** las ~150 líneas de guiones de demo con tool calls hacia `scripts/` del cliente.

**Deuda aceptada a propósito**: el handoff del paso 2 necesita persistencia y la capa de datos está forkeada. En vez de bloquear el paso 2 detrás del paso 4, se usa una tabla nueva `estado_canal` con ~20 líneas de accessor aplicadas **a mano en los dos clientes**, absorbidas después en el paso 4. Veinte líneas duplicadas una vez cuestan menos que dejar el handoff en cero con un contrato en preparación.

**Pendiente 🔴 para José, bloquea el paso 1b**: **¿marcha blanca cuenta como "entregado"?** `CLAUDE.md` dice "lo entregado sale del alcance de la fábrica… no hay migración de lo ya entregado", y los pasos 1b, 2 y 4 son exactamente una migración de los dos agentes existentes (`inmobiliaria-demo` ya tiene carpeta `entrega/`). La propuesta es **marcha blanca ≠ entregado**: un piloto gratis sin contrato firmado sigue bajo alcance de fábrica. Si José resuelve lo contrario, el plan degrada al enfoque C. Además, el script de sincronización sobreescribe archivos de agentes en piloto, lo que activa la **causa 5** del semáforo (sobreescribir trabajo entregado), no solo la causa 6.

**Otros pendientes 🔴**: inbox humano del handoff — Chatwoot implica costo o cuenta nueva; alternativa sin costo para v1, reenviar a un chat de Telegram del dueño. Y el juez LLM del sistema de evals queda **fuera de la v1** por la misma razón (gasta tokens).

**Hallazgos de la segunda ronda de revisión adversarial** (el diseño pasó de 6/10 a 8/10; todos verificados contra el disco):

- 🔴 **La tabla del handoff debe ir prefijada por cliente.** `clientes/dental-sanmartin/agente/.env.example:13-16` declara que el proyecto Supabase está **COMPARTIDO** entre agentes ("Ambos agentes usan el MISMO proyecto Supabase: mismo `SUPABASE_URL` y misma `SUPABASE_ANON_KEY`"), y por eso las tablas de sesión ya van prefijadas. Una tabla `estado_canal` sin prefijo la compartirían todos los agentes del proyecto: el `modo_humano` de un cliente de la dental apagaría el bot de otro agente si coinciden los `canal_id`. Va `citas_estado_canal` / `inmobiliaria_estado_canal`, más `datos.tabla_estado_canal` en el contrato de config v1.
- 🔴 **El mecanismo del handoff se rediseñó por su modo de falla.** La v2 usaba un "centinela" de texto que cada adaptador debía interpretar como no-enviar. Si un adaptador olvidaba el guarda, le mandaba la cadena literal al cliente final **justo durante un handoff**, y el arnés no lo detectaba porque `test-chat.js:678` llama `processMessage` directo sin pasar por `bot.js`. Ahora: `processMessage` resuelve a **`null`**, y **`nucleo/telegram/enviar.js` (~15 líneas) sube al núcleo en el paso 2** para que el guarda viva en código sincronizado. Así los dos canales que ven usuarios reales (WhatsApp vía `sender.js`, Telegram vía `enviar.js`) quedan protegidos por el núcleo.
- 🟡 **Son 4 sitios de llamada a `processMessage` por cliente, no 3**, y las líneas difieren entre clientes: `webhook.js:73` (ambos), `telegram/bot.js` real (dental 120, inmobiliaria 129), `telegram/bot.js` demo mock (299 / 329) y `scripts/chat-local.js` (27 / 42). La deuda del paso 2 se recalculó de "~20 líneas en un archivo" a **~70-90 líneas en dos archivos por cliente**.
- 🟡 **`nucleo/ejemplo/` es un overlay, no una carpeta hermana.** `core.js:7-8` hace `require('./prompts')`, que resuelve dentro de `nucleo/agent/`; un `ejemplo/` al lado nunca resuelve. `MANIFIESTO.json` lo declara como capa superpuesta y el verificador arma núcleo+ejemplo en un temporal — el mismo mecanismo que el sync sobre un cliente real, así que el manifiesto se valida a sí mismo. `ejemplo/` es además la **semilla** que deposita `nuevo-proyecto.ps1`, para que un proyecto nuevo arranque y responda.
- 🟡 **El paso 1a necesita `nucleo/scripts/humo.js`**: sin él no tenía nada que correr (el arnés vive en `scripts/test-chat.js` de cada cliente y el motor extraído llega recién en el paso 3). Inyecta un doble del LLM con `_setClienteParaTests` (`core.js:17`) y verifica tres cosas, una de ellas que el modo humano devuelve `null`.
- 🟢 **`name` del `package.json` del núcleo va fijo** (`nucleo-conversacional`): un marcador `{{NOMBRE}}` no es URL-safe y haría fallar `npm install`. La plantilla del cliente va aparte en `package.json.tpl`. **`.gitignore` sí vuelve al núcleo**: es byte-idéntico y es lo que mantiene `.env` fuera del repo de cada cliente.

**Hallazgo de la tercera ronda (el diseño cerró en 9/10) — vale para cualquier caso de "no responder", no solo el handoff**: en los agentes chaski **no se puede suprimir una respuesta devolviendo `null`**. `whatsapp/sender.js:58` hace `if (!texto) return [''];`, así que `sendMessage(telefono, null)` postea `text: { body: '' }`, Meta responde 400, y el `.catch` de `webhook.js:75-78` dispara **`sendMessage(telefono, MENSAJE_ERROR)`** — el cliente recibe "estoy teniendo problemas técnicos" justo cuando pidió hablar con una persona. Telegram tiene el mismo camino (`bot.js:50-51` es otra copia de `dividirMensaje` con el mismo `if (!texto)`, y el `catch` de `bot.js:123-126` también manda `MENSAJE_ERROR`). **Para no responder hay que agregar un guarda explícito** (`if (texto == null) return;`) en `sender.js` y en el envío de Telegram; el valor de retorno solo no alcanza. Aplica también a rate limit, ventana de 24h de WhatsApp y cualquier silencio futuro. Consecuencia para el plan: el paso 2 toca `sender.js` además de `core.js`, el handoff se sincroniza **apagado** (`HANDOFF_ACTIVO=false`) para no dejar una ventana entre sincronizar y editar los `bot.js`, y `dividirMensaje` se extrae a `nucleo/lib/texto.js` en vez de generar una cuarta copia (hoy existe idéntico en `sender.js:58-72` y `bot.js:50-63`).

**GIRO: el plan cambió de enfoque A a enfoque C — ver la entrada siguiente (2026-07-31, borrado de los dos agentes).** Todo lo de arriba queda como registro de auditoría y de por qué se decidió lo que se decidió; el plan de ejecución vigente es el de la entrada siguiente.

**El argumento de "marcha blanca ≠ entregado" ya no es interpretación.** `docs/FLUJO-COMERCIAL.md:49` pone "Marcha blanca (1 semana)" en el **paso 11, Etapa D**, y `:55` pone "Entrega formal" en el **paso 12, Etapa E**. Marcha blanca es anterior a la entrega por definición del propio flujo, así que "lo entregado" del paso 13 se refiere a lo que ya pasó por el 12. Además `CLAUDE.md:77` llama a los dos proyectos, textual, "dos proyectos **en marcha blanca**". El `entrega/` de inmobiliaria deja de ser contraevidencia: es el kit producido por la fase del pipeline, no prueba de que la capacitación del paso 12 haya ocurrido. **Sigue requiriendo el OK de José**, pero con evidencia documental en vez de criterio.

## 2026-07-31 — Se eliminan dental-sanmartin e inmobiliaria-demo: la fábrica pasa al enfoque C [🔴 AUTORIZADO POR JOSÉ]

**Decisión de José, consultada explícitamente antes de ejecutar**: se eliminan del repo los dos proyectos en marcha blanca (`clientes/dental-sanmartin`, `clientes/inmobiliaria-demo`). Con eso la fábrica **abandona el enfoque A** ("núcleo mínimo primero, sangre encima", que operaba sobre los dos agentes existentes) y **adopta el enfoque C**: el molde se construye en el repo y se valida con el próximo cliente real.

**Causa 🔴 nº 5 del semáforo** (borrar trabajo ya entregado). Se planteó la consulta con las cuatro opciones y sus consecuencias; José eligió borrar ahora sabiendo que equivale a cambiar de enfoque.

**Objeción que se levantó antes de ejecutar, y su resolución**: se advirtió que (a) el repo llamaba a estos proyectos "en marcha blanca", no "de prueba", y que `FLUJO-COMERCIAL.md:49` define marcha blanca como el bot corriendo en paralelo con la atención humana de un cliente real; (b) eran la única fuente del núcleo, porque la base oficial `C:\Users\Adela\chaski-agentes\` es inaccesible desde esta máquina; (c) no estaba resuelto cuál de los dos era el piloto con contrato en preparación. José reafirmó la decisión. Se ejecutó.

**Cómo se ejecutó, y cómo se deshace**: `git rm -r` sobre las dos carpetas (50 archivos). **El borrado quedó preparado en git pero NO commiteado**, para que revertirlo sea un comando y no una arqueología. Nada se perdió de verdad: todo estaba commiteado, no había `.env` reales ni `node_modules`.
- Deshacer completo: `git restore --staged --worktree clientes/`
- Recuperar un archivo puntual después de commitear: `git show ade8903:clientes/inmobiliaria-demo/agente/agent/core.js`
- Commit de respaldo con todo el contenido: **`ade8903`**

**Qué cambia en el plan (y lo simplifica bastante).** Desaparecen las partes más feas del enfoque A:
- **Se acabó el bloqueo 🔴 de "marcha blanca vs entregado"** — la pregunta quedó sin objeto, no hay agentes en uso que tocar.
- **Se acaba la deuda de ~90 líneas duplicadas** del accessor de `estado_canal`: el handoff se escribe **una vez, dentro del núcleo**, en vez de parcharse a mano en dos clientes.
- **Se acaba la reconciliación de dos arneses divergidos**: se toma la versión buena (la de inmobiliaria, mock incondicional y 18 escenarios CU/ADV) desde `ade8903` y se generaliza. La versión con fuga de tokens de dental simplemente no viaja.
- **Se acaba el baile de "sincronizar apagado y encender por cliente"**: no hay clientes que sincronizar todavía.
- **El guarda de `null` en `sender.js` se escribe bien de entrada** en vez de retrofitearse.

**Qué se pierde**: los bugs de producción ya no se arreglan donde hay tráfico real — se arreglan en el molde y se validan con el próximo cliente. Y todo el código de partida hay que sacarlo del historial de git en vez de tenerlo en el árbol de trabajo.

**Actualizaciones de coherencia hechas en la misma sesión** (🟡): `CLAUDE.md` — la "excepción histórica" de los dos proyectos dentro de `clientes/` se elimina; la regla "ningún proyecto de cliente vive en el repo" queda **sin casos especiales**. `README.md` — el árbol de carpetas ya no los lista.

**Plan de ejecución vigente**, en `~/.gstack/projects/domingobarandar-lang-fabrica__agentes/user-main-design-20260731-062404.md` (v5): (1) construir el núcleo en `lineas/conversacional/plantillas/base-agente/` extrayendo desde `ade8903`, con ejemplo ejecutable, prueba de humo y script de sincronización; (2) escribir los bugs de producción **dentro** del núcleo — handoff con guarda en el envío, agrupación de mensajes, timeout, métricas; (3) generalizar el arnés de evals con los 8 perfiles base; (4) `agente.config.json` + validador; (5) conocimiento por carpetas; (6) multi-agente por config si las métricas lo justifican. El primer cliente real valida el molde entero.

## 2026-08-01 — Paso 1 ejecutado: el núcleo conversacional existe y se verifica solo [🟡 POR LEER]

**Decisión / entrega**: se construyó el núcleo compartido de la línea conversacional dentro del repo. **Por primera vez la fábrica puede ejecutar su propio paso 1 de Build**: hasta hoy el README de la plantilla mandaba clonar desde `C:\Users\Adela\chaski-agentes\`, ruta inaccesible desde la máquina de trabajo. Todo verificado corriendo, no solo escrito.

**Qué quedó construido** (`lineas/conversacional/plantillas/base-agente/`):
- `nucleo/` — los 5 archivos que eran byte-idénticos entre los agentes borrados (`agent/core.js` 147, `agent/llm.js` 153, `agent/memory.js` 42, `whatsapp/webhook.js` 95, `whatsapp/sender.js` 74), más `nixpacks.toml`, `.gitignore`, `package.json` y `package.json.tpl`. Rescatados del commit `ade8903` y verificados byte a byte con `cmp` contra el original.
- `ejemplo/` — semilla con doble rol: overlay para la prueba de humo, y punto de partida de un cliente nuevo. `prompts.js`, `tools.js` (una tool con tope y `sin_match_exacto`), `database/supabase.js` (solo memoria, con el contrato `sesiones` + `estadoCanal` que el núcleo exige), `index.js` y `telegram/bot.js`.
- `MANIFIESTO.json` — mapa origen→destino, con la capa `nunca_tocar`. Única fuente de verdad de qué viaja y adónde. Lo consumen tanto la prueba de humo como el sincronizador, así que **el manifiesto se valida a sí mismo** antes de usarse contra un proyecto real.
- `VERSION` — 1.0.0.
- `nucleo/scripts/humo.js` — **11/11 en verde**. Arma el overlay, inyecta un doble del LLM con `_setClienteParaTests` y verifica que el núcleo enciende, que el loop agéntico ejecuta la tool de verdad (el dato viaja tool → modelo → respuesta) y que la memoria persiste solo texto plano. Cero tokens, sin credenciales, sin red.

**`scripts/sincronizar-nucleo.ps1` (P6) — construido y probado con casos reales, no solo escrito**:
- Verificación por defecto: recalcula SHA256 sobre disco, nunca confía en lo estampado. Probado: **0 archivos escritos en modo verificación**.
- Distingue **ATRASADO** (quedó atrás, nadie lo tocó — coincide con lo estampado en `NUCLEO.md`) de **DIVERGIDO** (alguien lo editó en el proyecto).
- **Probado el caso que importa**: se editó `agent/core.js` en un proyecto, el script lo marcó DIVERGIDO, `-Aplicar` **abortó con exit 2** y el parche local sobrevivió intacto.
- `-Forzar` respalda antes de pisar: verificado que el parche quedó en `.respaldo-nucleo-<fecha>/agent/core.js`.
- `-Todos` da el inventario: probado con dos proyectos (uno al día 7/7, otro con 1 divergido + 1 faltante) y una carpeta que no es agente, que correctamente no aparece.

**Bugs de Windows/PS 5.1 encontrados y corregidos durante la prueba** (los tres del mismo tipo: encoding):
1. **Los `.ps1` necesitan BOM UTF-8.** Sin él, PS 5.1 los lee como ANSI y la salida sale con `NÃºcleo` en vez de `Núcleo`. Corregido en `sincronizar-nucleo.ps1` y `nuevo-proyecto.ps1`.
2. **`Out-File -Encoding utf8` escribe CON BOM**, y un BOM en `package.json` rompe parsers de JSON estrictos. El `package.json` generado por `nuevo-proyecto.ps1` se escribe con `UTF8Encoding($false)` explícito. Verificado: primer byte `123` (`{`), y parsea.
3. `Set-Content` en PS 5.1 escribe ANSI por defecto: `NUCLEO.md` se escribe con `Out-File -Encoding utf8` para que los acentos sobrevivan.

**`nuevo-proyecto.ps1` corregido** (🟡): su default `$RaizClientes = 'C:\Users\Adela\clientes'` no existía en esta máquina — ahora se calcula desde la ubicación del script (carpeta hermana del repo), sin hardcodear ningún perfil de usuario. Y para la línea conversacional **instala núcleo + semilla**, así el proyecto nace andando. Antes creaba una carpeta vacía y el agente había que copiarlo a mano desde la ruta muerta.

**Prueba de punta a punta, corriendo**: `nuevo-proyecto.ps1 -Cliente petshop-lira -Proyecto bot-catalogo -Linea conversacional` → `npm install` (130 paquetes) → `npm run telegram:mock` → **el bot arranca y responde**, cero tokens. Ese era el criterio de éxito 6 del diseño y está cumplido.

**Actualizaciones de coherencia** (🟡): `CLAUDE.md` — la sección "Activos base" ya no apunta a `C:\Users\Adela\chaski-agentes\`; la plantilla del repo **es** la base, y se agregó el sincronizador como activo. La ruta del adapter LLM cambió a `nucleo/agent/llm.js` (se movió con `git mv`, así que git conserva la historia del archivo). `README.md` de la plantilla reescrito completo, con las advertencias que costaron caro: que devolver `null` no silencia al bot, que toda tabla nueva va prefijada, y que la lógica transversal va en `processMessage` y no en un canal. `.gitignore` del repo ignora el overlay temporal `.probar/`.

**Lo que NO se hizo y por qué**: no se corrió la suite del agente de referencia rescatado — José interrumpió esa ejecución. El núcleo se verificó con su propia prueba de humo, que es evidencia directa de que el código funciona, pero **no se comprobó que los 18 escenarios del agente de referencia siguieran en verde**. Queda como deuda de verificación: si algo del núcleo estaba roto de antes, la prueba de humo no lo detectaría.

**Siguiente**: paso 2 — handoff humano con el guarda en el envío (`nucleo/telegram/enviar.js` + guarda en `sender.js` + `lib/texto.js` compartido), agrupación de mensajes, timeout con `AbortController`, y métricas. Todo dentro del núcleo, sin gate 🔴, porque ya no hay agentes en uso.

## 2026-08-01 — El agente Gesta ya resolvió parte del paso 2: se adoptan sus decisiones [🟡 POR LEER]

**Hallazgo**: al verificar la bitácora de Notion apareció una entrada de José del 2026-07-30 que yo no había visto — *"Buffer de mensajes + auditoría de una guía externa de 9 fixes (Agente WhatsApp Gesta)"*, commits `4da45e9` y `8aec3bb`. El agente de Gesta **ya implementó, con tráfico real detrás, dos de las cuatro cosas del paso 2** de este plan. Se adoptan sus números y sus reglas en vez de los de la directiva, porque los suyos tienen uso real y los de la directiva son teóricos.

**Corrección 1 — el buffer necesita lista de excepciones, y mi diseño no la tenía.** Gesta dejó escrita la regla: *"cuando un buffer agrupa mensajes, hay que preguntarse qué acción NO puede esperar; la respuesta casi siempre incluye las acciones irreversibles: pedir un humano, cancelar, pagar."* Su caso concreto: si el cliente pide una persona y el contenedor se reinicia durante la ventana de agrupación, **el cliente pidió ayuda y nadie se enteró**. Mi diseño tenía el buffer y el handoff en el mismo paso y nunca dijo que la petición de handoff lo esquiva — era un bug esperando fecha. El buffer del núcleo nace con `excepciones` en config (handoff, cancelación, adjuntos) y con un escenario del arnés que **falla el build** si alguien saca el handoff de esa lista, copiando el candado S34 de Gesta.

**Corrección 2 — el default del timeout de handoff se invierte.** La directiva propone "30 min sin actividad humana → vuelve a modo bot". Gesta **evaluó exactamente esa propuesta y la rechazó como regresión grave**: ahí la derivación es DEFINITIVA y revivir al bot contradice lo que se le prometió al cliente. Nuevo default del núcleo: **`timeout_min: null`, derivación definitiva**; el retorno automático se activa por `agente.config.json` si un cliente lo pide. Razón: si el bot no vuelve, el peor caso es reactivarlo a mano; si vuelve cuando no debía, el cliente descubre que la "persona" era un bot otra vez.

**Corrección 3 — los números salen de producción, no de la directiva.** Ventana del buffer: **6 s** (Gesta) en vez de 8 s (directiva). Timeout del modelo: **25 s con 3 reintentos** (Gesta) en vez de 20 s con 1 (directiva).

**El patrón se repitió, y ya son dos**: José trajo `GUIA-FIXES-GESTA-BOT.md` con 9 fixes "listos para pegar", y la auditoría contra el disco encontró que **4 ya estaban implementados, 1 apuntaba a un archivo inexistente, y 2 reintroducían bugs que `CLAUDE.md` existe para prevenir** (uno de ellos, el incidente real del 27-jul). Es exactamente lo que pasó con `DIRECTIVA-ARQUITECTURA-FABRICA-AGENTES.md`: daba por roto A-04 (que funciona), daba por hecho el canal de distribución (que no existía) y mandaba auditar dos archivos inexistentes. **Regla de operación, ya no una observación**: ninguna guía o directiva externa se ejecuta sin auditarla antes contra el disco, fix por fix. En Gesta ese chequeo costó ~20 minutos y evitó reintroducir el peor bug del proyecto.

**Nota de orden en Notion**: la entrada de Gesta (2026-07-30) quedó **por encima** de las mías del 07-31 y 08-01, así que la bitácora ya no se lee estrictamente de más reciente a más antigua. No se reordenó: mover bloques de ~10.000 caracteres con búsqueda y reemplazo sobre la entrada de otro tiene más riesgo de corromperla que valor tiene el orden. Queda a decisión de José.

## 2026-08-06 — Paso 2: los bugs de producción, escritos dentro del núcleo [🟡 POR LEER]

**Qué se construyó.** El núcleo conversacional pasa de 1.0.0 a **1.1.0** con las cuatro cosas del paso 2, todas escritas una sola vez y distribuidas por `MANIFIESTO.json`. No hubo gate 🔴: no hay agentes en uso a los que parchar.

Archivos nuevos del núcleo: `agent/handoff.js`, `agent/buffer.js`, `agent/metricas.js`, `lib/texto.js`, `telegram/enviar.js`, `.env.example`. Modificados: `agent/core.js`, `agent/llm.js`, `whatsapp/sender.js`, `whatsapp/webhook.js`, y en la semilla `telegram/bot.js` y `database/supabase.js`.

**A-09 handoff.** Check de modo humano como primera línea de `processMessage`, antes de gastar un token. Activo → devuelve `null`, nunca un centinela de texto. Disparadores: petición explícita, palabras de riesgo (abogado, SERNAC, estafa, emergencia, autolesión) y **fallos técnicos consecutivos** (`HANDOFF_MAX_FALLOS=3`): si el bot lleva tres turnos sin poder responder, seguir mandando "problemas técnicos" a alguien que ya está molesto no ayuda a nadie. El cliente recibe **una** confirmación de que su pedido llegó y después silencio — un chat mudo se lee como abandono. Default `HANDOFF_TIMEOUT_MIN` vacío = **derivación definitiva** (corrección de Gesta, ver entrada anterior). `enModoHumano` **falla cerrado**: si no puede leer el estado, asume que hay un humano; peor caso el bot se calla un rato, la alternativa es hablarle encima a una ejecutiva que ya está atendiendo.

**El silencio, verificado en los cuatro sitios de envío y no por inspección.** El guarda `if (texto == null) return;` está en `sendMessage` y en `enviarTelegram`, ambos del núcleo — no hay un `if` por canal que alguien pueda olvidar. Y `lib/texto.js` devuelve `[]` donde antes devolvía `['']`: segunda línea de defensa, porque con `['']` un guarda olvidado terminaba posteando cuerpo vacío → 400 → `MENSAJE_ERROR` al cliente. La prueba de humo verifica **ausencia explícita de `MENSAJE_ERROR`**, que es el modo de falla real, no solo "no emite".

**A-07 buffer.** Ventana de 6 s que mide el silencio (cada mensaje nuevo la reinicia), montada encima de la cola serial. Cuatro mensajes seguidos = un turno; los turnos fusionados devuelven `null`, el mismo `null` que entienden los guardas de envío. Excepciones que no esperan: handoff, cancelación, adjuntos. **`handoff` está forzado en código** (`EXCEPCIONES_OBLIGATORIAS`) y hay una verificación que vacía `BUFFER_EXCEPCIONES` y comprueba que igual se salta la ventana — el candado que Gesta tiene como S34.

**A-08 timeout.** `AbortController` por llamada, 25 s, 3 intentos totales. Se decidió leer "3 reintentos" de Gesta como **3 intentos totales** y no 4 llamadas: cuatro por 25 s son 100 s y a esa altura el cliente ya se fue. `agent/llm.js` acepta ahora `{ signal }` como segundo argumento en los dos caminos (nativo y OpenAI-compatible); sin eso, abortar no cerraba el socket. Se agregó **mensaje puente** (`onProgreso`, opcional por canal): tras el primer intento fallido sale un "dame un segundo" y uno solo, no uno por intento.

**A-10 métricas.** Una fila por turno con duración, rondas de tool, tools usadas, partes agrupadas y reintentos. Distingue `derivado` de `silencio_handoff`, que es la diferencia entre "se derivó" y "el bot se calló". Persisten vía `db.metricas.registrar` **si el cliente la tiene** — el núcleo no obliga a crear la tabla para arrancar. Registrar una métrica nunca puede romper una respuesta: todo va envuelto.

**Dos bugs míos, encontrados por correr la prueba y no por leerla:**
1. **`unref()` en el timer del buffer.** Lo puse "para no retrasar el apagado" y el humo murió en silencio, sin salida y con código 0: Node se va cuando solo quedan timers con `unref`, así que el grupo pendiente nunca se procesa. Traducido a producción: el cliente escribió, el proceso no tenía otra cosa que hacer, y su mensaje se perdió sin dejar rastro. Eliminado, con el comentario que explica por qué no volver a ponerlo.
2. **La config leída al cargar el módulo.** `TIMEOUT_MODELO_MS` e `INTENTOS_MODELO` eran `const` de arriba, así que el arnés cambiaba la variable y el núcleo seguía con el default: dos verificaciones habrían pasado por el motivo equivocado. Toda la config del núcleo (core, buffer, handoff, métricas) se lee ahora **en cada llamada**. La verificación del humo comprueba el **número** configurado (`timeout de 100ms`), no solo la palabra "timeout", justo para que esta regresión no pueda volver en silencio.

**Verificación, corriendo:**
- `npm run humo` → **41/41 en verde**, 0 tokens, sin credenciales, sin red. Sube de 11 a 41 verificaciones y ahora incluye un escenario 0 dedicado a *los defaults que son decisiones de negocio*, que están ahí porque cambiarlos sin querer es barato y las consecuencias no.
- **Punta a punta**: `nuevo-proyecto.ps1 -Cliente petshop-lira -Proyecto bot-catalogo -Linea conversacional` → el sincronizador instaló los **13 archivos** del núcleo nuevo (los 6 nuevos aparecieron solos, porque lee el manifiesto) → `npm install` → **el bot arranca y responde**. Con el buffer en su default el arranque tarda 6,1 s, que es exactamente la ventana: comportamiento correcto, no lentitud.
- Inventario posterior con `sincronizar-nucleo.ps1 -Proyecto <ruta>`: **13/13 AL_DIA**.

**Deuda que sigue abierta**: la suite de 18 escenarios del agente de referencia rescatado **nunca se corrió** (José interrumpió esa ejecución en su momento). El núcleo está verificado por su propia prueba, que es evidencia directa; lo que no está comprobado es que aquellos escenarios sigan en verde contra este núcleo. Se cierra en el paso 3, cuando el arnés se generalice.

**Siguiente**: paso 3 — generalizar el arnés de evals con los 8 perfiles base, tomando la versión de inmobiliaria desde `ade8903` (la de dental no participa: tenía fuga de tokens).

> **Nota de fechas (2026-08-06)**: el reloj de la máquina de trabajo va 5 días atrasado — marca 2026-08-01 cuando la fecha real es 2026-08-06 (confirmado contra el servidor de Notion). Los commits `bf5529b` y `87ba5a8` quedaron fechados 2026-08-01 por esa razón, no porque el trabajo sea de ese día. Las entradas anteriores de este archivo pueden tener el mismo desfase. Conviene ajustar el reloj del sistema antes de seguir: la fecha de un commit no se puede corregir después sin reescribir historia.

## 2026-08-06 — Paso 3: el arnés de pruebas se generaliza (núcleo 1.2.0) [🟡 POR LEER]

**Deuda cerrada primero.** La entrada anterior dejó declarado que los 18 escenarios del agente de referencia nunca se corrieron. El agente ya no vive en el repo (se eliminó en el paso 2 por la regla de carpeta externa), pero sigue en la historia: se extrajo `clientes/inmobiliaria-demo/agente` de `ade8903` a un temporal **fuera** del repo, se instaló y se corrió. **18/18 en verde.** Antes de correrlo se verificó que no pudiera salir a la red: sin `.env`, `MODO_MOCK = true` hardcodeado y el cliente LLM inyectado. La deuda queda cerrada con evidencia, no por caducidad.

**El reparto que ordena todo.** El motor, los perfiles y los invariantes son **núcleo** (iguales para todos). Los escenarios y la config del rubro son **del cliente**: describen su negocio y nadie más los puede escribir. Los dos archivos del cliente (`evals/escenarios.js`, `evals/correr.js`) entraron a `nunca_tocar`, así que sincronizar el núcleo no los pisa jamás.

**Archivos nuevos del núcleo**: `evals/motor.js`, `evals/reglas.js`, `evals/perfiles.js`, `evals/perfiles/_base.json`. En la semilla: `evals/escenarios.js` y `evals/correr.js`. `package.json.tpl` apuntaba su `npm test` a `scripts/test-chat.js`, un archivo que la semilla no tenía — ahora apunta a `evals/correr.js`. Núcleo **1.2.0**, 17 archivos.

**La idea que hace útil el arnés: un escenario escrito, ocho conversaciones corridas.** Escribir a mano el cliente que escribe con faltas, el que se arrepiente, el que insiste y el que pide un humano —por cada caso de uso— es exactamente lo que nadie hace, y por eso no se probaba. Un perfil **transforma** los turnos que el cliente ya escribió. Los ocho: `feliz`, `mensajes_partidos`, `ortografia`, `desordenado`, `insistente`, `pide_humano`, `fuera_de_tema`, `cambia_opinion`.

La propiedad de diseño que lo hace posible: **ningún perfil puede desbalancear el guión del mock**. O no agrega turnos, o el turno que agrega trae su propia respuesta, o lo resuelve el núcleo sin llamar al modelo (pedir un humano). Es una propiedad frágil de las que se rompen sin darse cuenta, así que hay una verificación en el humo que la comprueba perfil por perfil.

Los índices se mantienen estables a propósito: `ctx.respuestas[i]` apunta siempre al turno *i* del escenario original aunque el perfil haya insertado turnos en medio. Sin eso, cada `expect()` del cliente habría que escribirlo ocho veces y el arnés no serviría de nada.

**Seis invariantes deterministas, en cada turno de cada escenario, sin que el cliente escriba nada**: no re-preguntar un dato ya capturado · no afirmar datos que ninguna herramienta devolvió · respetar el tope de resultados · responder en ≤600 caracteres · derivar cuando piden una persona (y **antes** de gastar un token) · no filtrar el prompt de sistema ni el nombre de una tool. Un invariante que no se puede evaluar con la config del cliente se marca **OMITIDA**, nunca aprobada: contar un check que no corrió es inflar la cobertura.

**Juez LLM fuera de la v1, a propósito.** Gastaría tokens en QA — regla dura de la fábrica, y roza la causa 🔴 nº1 del semáforo. Si entra algún día, va detrás de un proveedor gratuito declarado y de una puerta explícita.

**Tres hallazgos, los tres por correr y no por leer:**

1. **Falso negativo en el handoff, encontrado por el perfil `ortografia`.** Las regex exigían `hablar` y `quiero` literales: "kiero ablar con alguien" **no derivaba**. Es el peor falso negativo posible y el que el propio `handoff.js` declara inaceptable dos comentarios más arriba. Corregido con `\bh?abl?ar`, `\b(?:qu|k)iero` y `alguien` a secas. El `\b` no es adorno: sin él `abar` casa dentro de "acabar" y "acabar con alguien" derivaría por error — hay verificación para las dos cosas. Cambio 🟡: altera comportamiento observable del núcleo, sin agente en uso al que afecte.

2. **La guarda `nunca_tocar` estaba documentada y no implementada.** `MANIFIESTO.json` prometía en sus notas que `sincronizar-nucleo.ps1` aborta si un archivo del cliente aparece en la lista del núcleo. El script nunca tuvo esa comprobación: era una propiedad de seguridad escrita y ausente. Importa desde hoy, porque `evals/escenarios.js` —la suite de pruebas del cliente, escrita a mano— está en esa lista: si alguien la moviera al núcleo "para compartirla", un `-Aplicar` borraría las pruebas de todos los clientes sin avisar. Implementada, corre en cada invocación.

3. **Un invariante mío mal medido.** Para comprobar que el buffer agrupa yo contaba llamadas al modelo. Un turno que usa una herramienta llama al modelo **dos veces por diseño** (pedirla y responder con su resultado), así que el check daba rojo en cualquier escenario con tools — o sea, en los que importan. Se cuentan turnos frescos, y además se verifica que el texto agrupado que le llegó al modelo contenga todos los mensajes. Más estricto y correcto.

**Verificación, corriendo:**
- `npm run humo` → **68/68 en verde** (antes 41). Escenario 8 nuevo: los 8 perfiles, los 6 invariantes uno por uno —que atrapen su fallo **y** dejen pasar lo sano— y la suite completa lanzada como subproceso, igual que la corre un cliente.
- **Prueba de mutación**: se rompió a propósito la ventana del buffer y el arnés se puso rojo en los dos escenarios donde importa. El invariante muerde; no está pasando por casualidad.
- **Punta a punta**: proyecto nuevo con `nuevo-proyecto.ps1` → los 4 archivos de evals viajaron solos (el sincronizador lee el manifiesto) → `npm install` → `npm test` → **32/32 corridas, 228 verificaciones automáticas**, sin tocar nada.
- **La regla dura, probada en la condición que la rompió antes**: se puso un `.env` con `ANTHROPIC_API_KEY`, `LLM_API_KEY`, `SUPABASE_URL` y `MOCK=false`. La suite igual corrió 32/32 en mock, sin red. El bloqueo vive en `evals/motor.js` **antes de los `require`** (porque `database/supabase.js` decide en tiempo de carga) y borra las credenciales del entorno: no existe la variable capaz de encender el modo real. El bug de referencia era `MOCK === 'true' || !ANTHROPIC_API_KEY` en el arnés del agente dental — bastaba una key en el `.env` para que `npm test` saliera a la API.
- Inventario posterior: **17/17 AL_DIA**.

**Lo que estas pruebas no miden, y conviene no olvidarlo.** El modelo es un doble guionizado: los perfiles prueban el **núcleo** y los invariantes frente a entradas desordenadas, no la comprensión del lenguaje del LLM. La calidad del tool-calling real se sigue confirmando conversando, y hay que rehacerlo al cambiar `LLM_PROVIDER`.

**Siguiente**: paso 4 — `agente.config.json` + validador, para absorber la configuración que hoy vive en variables sueltas.

---

## 2026-08-06 — Paso 4: la configuración deja de vivir en variables sueltas (núcleo 1.3.0) [🟡 POR LEER]

**Qué se construyó.** El núcleo pasa de 1.2.0 a **1.3.0** (17 → 24 archivos). Un agente ya no se configura tocando código ni adivinando variables de entorno: se configura en **un archivo declarativo, versionado y validado**, `agente.config.json`, con siete bloques (`cliente`, `identidad`, `canales`, `handoff`, `limites`, `datos`, `metricas`). Lo que antes eran once variables sueltas repartidas entre `.env`, defaults en código y nada, hoy se lee de un vistazo y se revisa en un diff.

**La regla de precedencia, y por qué en ese orden**: `variable de entorno` > `agente.config.json` > `default del núcleo`. El entorno gana porque es la palanca de emergencia — apagar el handoff a las 3 AM desde Railway sin redeploy — y porque el arnés de evals necesita mover la ventana del buffer entre escenarios. Pero una palanca invisible es una trampa: `npm run validar` **denuncia toda variable del `.env` que esté tapando un valor declarado**, con el valor efectivo al lado. La palanca sigue; deja de ser silenciosa.

**La trampa que casi se cuela, y que obligó a tocar `.env.example`.** El `.env.example` traía `BUFFER_MS`, `HANDOFF_*` y `MAX_TOKENS_RESPUESTA` **descomentados**. Copiarlo a `.env` —que es literalmente lo que manda el README— habría tapado el archivo de configuración entero, y el paso 4 no habría servido para nada en ningún cliente. Ahora `.env.example` tiene **solo secretos y conexiones**; los overrides van comentados y con la advertencia de que son para emergencias. Hay una verificación estructural en el humo que falla si alguien vuelve a descomentar uno.

**Tres desviaciones deliberadas respecto del documento de diseño del 2026-07-31**, todas por evidencia y no por gusto:

1. **El buffer va en `limites`, no dentro de `canales.whatsapp`.** El diseño lo puso ahí porque venía de un agente solo-WhatsApp. `agent/buffer.js` agrupa por `canalId` sin mirar el canal, así que la ventana es una sola por agente: dejarla bajo WhatsApp habría dejado sin agrupación a los agentes de Telegram, que son los que corren hoy.
2. **El validador es JS (`scripts/validar-config.js`), no PowerShell.** El diseño pedía `validar-config.ps1`. Escribir el esquema una vez en JS y otra en PowerShell son dos definiciones que se desincronizan el día que alguien agrega un campo con prisa — y la que se queda vieja es siempre la que no corre en cada `npm test`. El esquema vive **una sola vez** en `config.js`; `scripts/validar-config.ps1` existe igual, pero como envoltorio de fábrica que llama al validador del proyecto y recorre todos los clientes.
3. **`datos.prefijo` deriva los tres nombres de tabla.** El diseño pedía escribir `tabla_sesiones` y `tabla_estado_canal` a mano. Escribir tres nombres prefijados y acordarse siempre del prefijo es un paso que alguien se salta, y saltárselo en un proyecto Supabase **compartido entre agentes** cruza datos entre negocios. Con el prefijo basta; los `tabla_*` explícitos siguen existiendo para un agente que ya está en uso con otro nombre, y el validador avisa si no llevan el prefijo.

**El reparto de la capa de datos, por fin implementado.** `database/nucleo-db.js` (núcleo) trae conexión a Supabase, fallback en memoria y las tres tablas sin las que el núcleo no funciona: `sesiones`, `estado_canal`, `metricas`. `database/supabase.js` (cliente) es ahora el punto de unión: `{ ...crearBaseNucleo(), ...dominio }`. Antes la semilla era solo-memoria, así que **ningún cliente podía persistir nada sin escribir su propia capa de datos**. Va con su DDL (`database/schema-nucleo.sql`) y `npm run schema`, que sustituye el prefijo solo.

**Dónde falla cerrado, y por qué ahí.** La config ausente **no** es fatal: el núcleo tiene defaults seguros y tiene que poder correr solo. Lo único que no admite default es el prefijo de las tablas, así que el fallo duro está exactamente ahí: con credenciales de Supabase y sin prefijo resuelto, `nucleo-db.js` **se niega a conectarse** en vez de escribir en una tabla que comparten todos los agentes. Config presente pero rota sí es fatal: arrancar con defaults sería atender clientes con una configuración que nadie decidió.

**Cinco hallazgos, los cinco por correr y no por leer:**

1. **La config rota se detectaba o no según qué clave preguntara primero el núcleo.** `valor()` miraba el entorno antes que el archivo, así que con `BUFFER_MS` puesto en Railway un `agente.config.json` corrupto **no rompía nada al arrancar**: reventaba más tarde, en la primera clave que nadie estuviera pisando. "Config inválida = no compila" no puede depender del orden de lectura. Ahora el archivo se lee y valida siempre primero, aunque para esa clave gane el entorno.
2. **La QA dependía del `.env` de quien la corría.** Con un `.env` que traía `HANDOFF_ACTIVO=false`, la suite del proyecto pasó de 32/32 a **28/32**. Rojo es la dirección segura, pero el problema de fondo es otro: dos personas con el mismo repo obtenían resultados distintos, y lo que se probó no quedaba registrado en ninguna parte porque el `.env` no se versiona. `evals/motor.js` ahora borra **todos** los overrides del contrato antes de cargar nada, igual que ya borraba las credenciales. **La QA prueba la configuración que se entrega.**
3. **El validador detectaba el problema y mentía sobre su consecuencia.** Decía "`HANDOFF_ACTIVO` pisa `handoff.activo` (queda en true)" con el `.env` diciendo `false`: no cargaba `dotenv`, así que informaba el valor del archivo como si fuera el efectivo. Un aviso que reporta mal el valor es peor que no avisar.
4. **`npm run chat` terminaba con un stack trace de Node.** Al cortarse la entrada (Ctrl+D, o una tubería que se acaba) el turno en vuelo volvía a preguntarle a un `readline` ya cerrado. Es la pantalla que ve un dueño en la demo previa a firmar. Corregido con una bandera de cierre, y el humo lo corre entero con la entrada cortándose de golpe.
5. **Dos scripts de PowerShell de la fábrica no tenían BOM.** PowerShell 5.1 lee un `.ps1` sin BOM como ANSI: `validar-config.ps1` (nuevo) y `check-bitacora.ps1` (que ya estaba así) imprimían los acentos rotos. 🟢, pero el hook anti-amnesia lleva quién sabe cuánto avisando en jeroglíficos.

**Verificación, corriendo:**
- `npm run humo` → **92/92 en verde** (antes 68). Escenario 9 nuevo: precedencia en sus tres capas, typos que ahora son error, config corrupta, config ausente, fallo cerrado del prefijo, guarda estructural del `.env.example`, identidad en el prompt, `startCommand` según canales, el validador aprobando y rechazando, y el chat local de punta a punta.
- **Prueba de mutación**: se rompieron a propósito las dos guardas nuevas —el borrado de overrides del motor y el fallo cerrado del prefijo— y el humo se puso rojo en la verificación correspondiente, una cada vez. Los invariantes muerden; no están pasando por casualidad.
- **Punta a punta**: proyecto nuevo con `nuevo-proyecto.ps1` → 24 archivos del núcleo + semilla → `agente.config.json` escrito con el prefijo del cliente (`petshop_lira_bot_catalogo`) → `railway.toml` generado (`node telegram/bot.js`, que es lo que corresponde con solo Telegram activo) → validador en verde → `npm install` → `npm test` → **32/32 corridas, 228 verificaciones automáticas**, sin tocar nada.
- **La regla dura, otra vez en la condición que la rompió antes**: con un `.env` que traía `ANTHROPIC_API_KEY`, `LLM_API_KEY`, `SUPABASE_URL` y `MOCK=false`, la suite corrió 32/32 en mock, sin red.
- `npm run schema` emite el DDL con el prefijo ya puesto; `npm run validar` reporta los overrides con su valor efectivo; inventario posterior **24/24 AL_DIA**.

**Lo que este paso NO resuelve, y conviene no olvidarlo.** La ruta de Supabase de `nucleo-db.js` está escrita contra la API de `supabase-js` y verificada por inspección más el modo memoria; **no se ha corrido contra un Supabase real** porque hoy no hay proyecto ni credenciales asignadas. La primera vez que un cliente configure `SUPABASE_URL` hay que correr `npm run schema`, aplicarlo, y verificar los tres accesos a mano. Está anotado acá para que no se descubra en producción.

**Semáforo**: 🟡. Cambia el comportamiento observable del núcleo (de dónde sale la configuración) y toma decisiones de arquitectura no triviales. No hubo gate 🔴: no hay agentes en uso a los que parchar, no se gastó dinero, no se creó ninguna credencial.

**Siguiente**: paso 5 — conocimiento por carpetas (`conocimiento/_indice.json` + tool `cargar_conocimiento`) y el panel de métricas sobre la tabla que este paso acaba de dejar creada.

---

## 2026-08-06 — Paso 5: lo que el negocio sabe sale del prompt, y la tabla de métricas por fin se lee (núcleo 1.4.0) [🟡 POR LEER]

**Qué se construyó.** El núcleo pasa de 1.3.0 a **1.4.0** (24 → 26 archivos). Dos cosas que el plan tenía juntas y que resultaron ser la misma idea aplicada a dos lados: **dejar de pagar por lo que no se usa** (el conocimiento del negocio deja de viajar en cada prompt) y **empezar a usar lo que ya se pagaba** (la tabla de métricas se escribía desde la 1.1.0 y no la leía nadie).

**A-03 — conocimiento por carpetas.** Lo que un negocio sabe (formas de pago, cómo llegar, políticas, qué incluye cada plan) termina siempre pegado dentro del prompt de sistema. Eso cuesta tres cosas a la vez: se paga en tokens **en cada turno aunque nadie pregunte**, empuja las reglas duras hacia el fondo hasta que el modelo deja de respetarlas, y obliga a editar código para cambiar un dato. Ahora vive en `conocimiento/` (un `_indice.json` + un archivo por tema), el agente recibe **solo el índice** —una línea por tema— y el núcleo le inyecta la herramienta `cargar_conocimiento`, que trae el contenido cuando el modelo la llama.

**A-10 — panel de métricas.** `npm run metricas` responde la pregunta que se hace en una marcha blanca: *¿esto está funcionando?* Volumen, derivaciones, errores, velocidad, herramientas más usadas, tokens y costo. La aritmética vive en una función pura (`calcular`) y el CLI solo le pasa las filas: sin esa separación, el panel solo se podría probar con una base de verdad — o sea, no se probaría.

**Cinco decisiones de diseño, con su motivo:**

1. **La tool la inyecta el núcleo, no `agent/tools.js`.** Mismo argumento que el guarda de silencio en el envío: si dependiera de que cada proyecto se acuerde de declararla, el día que alguien reescriba `tools.js` —cosa que hacen todos, es el producto— el agente se queda con el índice anunciado en el prompt y sin forma de cargar nada. Y eso se ve como "el bot dice que no tiene el dato", indistinguible de un negocio que efectivamente no lo tiene. El índice se anexa en `core.js` por la misma razón: `prompts.js` se reescribe entero en cada cliente.
2. **El conocimiento falla ABIERTO; la config falla cerrado.** Es una asimetría deliberada y vale la pena entenderla: un `agente.config.json` roto tumba al agente porque arrancar con una configuración que nadie decidió es atender mal sin saberlo; un `_indice.json` roto **no** lo tumba, porque quedarse sin conocimiento es atender menos —el bot dirá "no lo tengo", que es cierto— y caerse entero es no atenderle a nadie, ni a los que escribían por otra cosa. El error se grita en el log y `npm run validar` lo convierte en error bloqueante antes de desplegar.
3. **El tope de 800 palabras es de calidad, no de espacio.** Un tema de 3.000 palabras se lleva el turno entero y devuelve una respuesta peor que no tener nada. Cuando no cabe, la respuesta correcta es partirlo en dos intenciones, nunca subir el tope. En ejecución **se recorta y se anuncia dentro del propio texto** (un corte silencioso se lee como un negocio que no lo ofrece); en el validador es ERROR.
4. **Los hitos son del negocio y el núcleo no los puede inventar.** El diseño del 31-jul pedía "tasa de calificación, turnos hasta calificar, tasa de no sé": son métricas de un vertical concreto, y el núcleo no tiene forma de saber qué es *calificar* en una dental o en una corredora. En vez de hardcodear un rubro se implementó **un solo mecanismo genérico**: `metricas.marcarHito(canalId, '<hito>')` desde la tool que consigue el hecho, y `metricas.hitos` en la config para declarar los que importan. Con eso salen las tres métricas del diseño y las que ningún rubro futuro va a compartir. **Un hito declarado que nunca ocurre se lista igual, en 0%**: esa es la señal, y si no aparece no se ve.
5. **El costo en dólares solo se muestra si el cliente declara el precio de su proveedor.** Una tabla de precios escrita dentro del núcleo envejece sola y terminaría mintiendo sobre plata. Sin precio declarado, el panel muestra tokens y dice que no hay precio. Y los tokens arrancan en `null`, no en 0: "el proveedor no informó uso" y "gastamos cero" son cosas distintas.

**Seis hallazgos, los seis por correr y no por leer:**

1. **Una métrica nueva sin su columna se pierde en silencio, para siempre.** `db.metricas.registrar` hace el INSERT con la fila tal cual: una clave que no es columna hace fallar el insert **entero**, y como los errores de métricas se tragan a propósito (regla: nunca romper una respuesta al cliente), la fila desaparece sin dejar rastro hasta que alguien mira una tabla vacía semanas después. Agregar `tokens_entrada`, `tokens_salida` y `hito` iba derecho a ese agujero. Ahora la fila se filtra contra una lista `CAMPOS` declarada en `agent/metricas.js`, un campo desconocido se descarta **avisando**, y el humo compara `CAMPOS` contra el DDL de `database/schema-nucleo.sql`. El DDL además trae los `alter table ... add column if not exists`, porque `create table if not exists` no agrega columnas a una tabla que ya existe.
2. **El adapter no normalizaba el uso de tokens.** El camino nativo de Anthropic devuelve `input_tokens/output_tokens` y el OpenAI-compatible `prompt_tokens/completion_tokens`. `llm.js` pasaba el objeto crudo, así que el panel de costos habría quedado en blanco **justo para los proveedores que se usan de verdad** (Gemini, Groq, DeepSeek). Se normaliza en el adapter, que es donde vive la traducción.
3. **La lista de tools del arnés no incluía las del núcleo.** `evals/motor.js` armaba `toolNames` desde `TOOL_DEFINITIONS` del cliente, así que el invariante de fuga no cubría `cargar_conocimiento` — una tool que el cliente nunca declaró y que el modelo igual puede nombrarle a un cliente final.
4. **El panel contaba derivaciones por turno.** Una derivación seguida de tres silencios son cuatro filas y **una** derivación. Contarlas por turno infla justo la métrica que un dueño mira para decidir si el bot le sirve. Se cuenta por conversación (`canal_id`), y hay un check con números elegidos a mano que lo fija.
5. **El panel mostraba la hora en UTC.** Decía "02:09" de una conversación que ocurrió a las 23:09. Un dueño que ve una hora que no reconoce deja de creerle al resto del panel. Se formatea en `cliente.zona_horaria`.
6. **Un proyecto nuevo hereda el conocimiento de la semilla**, que es una dirección y unas formas de pago inventadas — y el bot las afirmaría con total seguridad, que es peor que no saber. No se puede vaciar la semilla (dejaría el `npm test` del proyecto nuevo en rojo y el ejemplo tiene que arrancar andando), así que el índice se marca con `"_semilla": true` y el validador reclama hasta que alguien reemplace los temas y borre esa línea.

**Lo que impide que esto se rompa dentro de seis meses.** Se agregó el **7º invariante** del arnés, `conocimiento_fuera_del_prompt`: pone la suite en rojo si el contenido de un archivo de conocimiento aparece dentro del prompt de sistema. Es la regresión que se hace con buena intención —el bot se equivoca en un dato, alguien pega el archivo en `prompts.js` "para que no falle"— y que **no se nota en ninguna respuesta**: se nota en la factura, en cada turno, aunque nadie pregunte por el tema. Corre en cada turno de cada escenario de todos los clientes.

**La superficie de ataque, porque acá el modelo elige.** La intención la escribe el LLM, así que es entrada no confiable: es una **lista cerrada** (`enum` en el esquema de la tool y comprobación al ejecutar), nunca un nombre de archivo, y un índice que apunte fuera de la carpeta se rechaza al leerlo (`path.resolve` + comparación contra la carpeta, no confianza en el JSON). Verificado con un índice que apunta a `../.env`.

**Verificación, corriendo:**
- `npm run humo` → **126/126 en verde** (antes 92). Escenarios 10 y 11 nuevos: el conocimiento de punta a punta por el loop real, la ruta que se sale de la carpeta, el tope que recorta, el índice roto que **no** tumba al agente, la colisión de nombre de tool, el panel con sus hitos y su aritmética de costo, el estado vacío que explica por qué está vacío, y `CAMPOS` contra el DDL.
- **Prueba de mutación, tres veces**: se pegó el corpus en el prompt (rojo en el humo **y** en 32 corridas de la suite), se dejó `marcarHito` sin efecto (rojo en el hito del panel) y se quitó la guarda de rutas (rojo en el check de la fuga). Cada mutación rompió su verificación y solo la suya.
- **Punta a punta**: proyecto nuevo con `nuevo-proyecto.ps1` → 37 archivos (26 núcleo + 11 semilla) → `npm install` → `npm test` → **40/40 corridas, 345 verificaciones automáticas** (antes 32/40 y 228). El validador reporta los 2 temas de conocimiento y los hitos declarados. `npm run schema` emite el DDL con las columnas nuevas y el prefijo puesto. Inventario posterior: **26/26 AL_DIA**.
- **El criterio de éxito nº7 del diseño, cumplido y verificado**: una conversación completa dentro del proyecto de cliente contestó una consulta usando `cargar_conocimiento` sin que el corpus estuviera en el prompt, y el panel mostró esas 4 filas con sus dos hitos (`consulta_resuelta` 50%, `sin_dato` 50%), sus dos herramientas y su costo.

**Un cambio fuera del núcleo**: `sincronizar-nucleo.ps1` ahora entiende entradas de `nunca_tocar` terminadas en `/` como carpetas completas. Hacía falta: los archivos de `conocimiento/` los nombra el cliente (`planes.md`, `garantia.md`, lo que sea), así que una lista de nombres exactos no protegía nada.

**Lo que este paso NO resuelve.** Sigue en pie que la ruta de Supabase **nunca se ha corrido contra un Supabase real** (paso 4), y ahora hay tres columnas más que dependen de eso. El panel, en un proyecto sin Supabase, no ve nada — y lo dice, pero significa que el primer cliente que quiera medir tiene que configurar la base primero. Y el conocimiento se prueba con un mock: que el modelo **decida bien cuándo cargar un tema** depende del proveedor y se confirma conversando, no acá.

**Semáforo**: 🟡. Cambia el comportamiento observable del agente (una tool nueva, el prompt con un bloque nuevo) y toma decisiones de arquitectura no triviales. Sin gate 🔴: no hay agentes en uso, no se gastó dinero, no se creó ninguna credencial.

**Siguiente**: paso 6 — multi-agente activado por config, **solo si las métricas muestran que hace falta**. El propio diseño lo condiciona a eso, y con el panel recién construido todavía no hay una sola conversación real medida: el disparador honesto es un cliente en marcha blanca, no una fecha.

---

## 2026-08-08 — Paso 6: el agente se puede partir en varios, y viene apagado (núcleo 1.5.0) [🟡 POR LEER]

**El gate que se saltó, dicho de frente.** La entrada anterior dejó el paso 6 condicionado a que las métricas mostraran que hacía falta, y ese disparador **no se ha cumplido**: sigue sin haber una sola conversación real medida. Se planteó así a José y **José decidió construirlo igual**. Queda registrado porque cambia cómo hay que leer este paso: lo construido es la **capacidad**, no la recomendación de usarla. Por eso todo el diseño gira alrededor de que venga apagado y de que activarlo sea una decisión posterior, tomada mirando un panel.

**Qué se construyó.** El núcleo pasa de 1.4.0 a **1.5.0** (26 → 28 archivos). `flujo.agentes` en `agente.config.json` permite partir el agente en varios especializados, cada uno con su papel, sus herramientas y a quién puede entregarle la conversación. Más `lead.campos`, que es lo que impide que el segundo agente vuelva a preguntar lo que el primero ya tomó.

**Un "agente" es una declaración, no un archivo.** Es la decisión que sostiene todo el paso. Si cada agente fuera un módulo JS, activar el flujo obligaría a escribir cuatro archivos nuevos **por cliente** — el problema del fork otra vez, multiplicado por cuatro, que es exactamente lo que el EUREKA del 2026-07-30 advirtió. Con la declaración en config, el mismo `agent/prompts.js`, el mismo `agent/tools.js` y los mismos escenarios corren con uno o con cuatro agentes.

**Cuatro desviaciones respecto del documento de diseño del 2026-07-31**, las cuatro por evidencia:

1. **No hay `modelos.router`.** El diseño preveía una llamada extra al LLM por turno solo para decidir quién contesta. Acá lo decide el agente que ya está conversando, con una tool que inyecta el núcleo y una lista cerrada de destinos: cero llamadas extra, determinista, y el cambio surte efecto **dentro del mismo turno**. Un router habría duplicado el costo por turno justo en el paso cuya única justificación es el costo por turno.
2. **`flujo.agentes`, no `flujos[].agentes`.** Varios flujos implica elegir entre flujos, que es otra vez un router. Un solo grafo con destinos cerrados expresa lo mismo — un "flujo" es un subgrafo — sin nada que enrutar.
3. **`flags` (A-14) queda fuera.** El propio diseño lo manda a backlog dos líneas más abajo de donde lo pide; se respeta el backlog.
4. **`campos_lead` no cuelga del flujo, es su propio bloque `lead`.** Sirve con un agente solo (es A-05, que estaba en "parcial" desde la auditoría). Y **entra en este paso y no después** porque con varios agentes deja de ser una mejora y pasa a ser un requisito: repartir el trabajo sin repartir lo que ya se sabe hace que el especialista salude de nuevo y vuelva a pedir el teléfono, que es peor atención que la del agente único.

**Cinco decisiones de diseño, con su motivo:**

1. **Viene apagado y apagado cuesta cero.** Sin `flujo.agentes`, el prompt no cambia ni un byte, no se ofrece ninguna tool de más y **no hay ni una consulta extra a la base**: la lectura de estado que el flujo necesita solo ocurre si el flujo o los campos están declarados. Verificado como ausencia, no por inspección.
2. **`herramientas` es obligatorio y `[]` significa "ninguna".** Repartir las herramientas es el motivo entero de partir el agente: si se pudiera omitir, el descuido más barato —no escribirlo— dejaría un flujo que parece separar y no separa nada. `["*"]` es "todas", explícito.
3. **`conocimiento` sí tiene default abierto, y la asimetría es deliberada.** El conocimiento ya se carga solo cuando hace falta (solo viaja el índice), así que restringirlo casi no ahorra; y olvidarlo se vería como "el bot dice que no tiene el dato", indistinguible de un negocio que de verdad no lo tiene. Las herramientas fallan ruidosamente, el conocimiento fallaría en silencio: por eso una se declara y la otra se hereda.
4. **El reparto se hace cumplir al EJECUTAR, no solo al declarar.** Es el hallazgo que más cambió el diseño (ver abajo).
5. **El tope de 40 líneas por rol es error del validador, no del arranque.** Igual que las 800 palabras del conocimiento: tumbar un bot en producción porque un prompt creció una línea es absurdo; no avisar nunca es cómo se vuelve al monolito. Error donde alguien mira, aviso en el log donde corre.

**Cinco hallazgos, los cinco por correr y no por leer:**

1. **Repartir herramientas no separaba nada.** La lista de `tools` que se le manda al modelo es una indicación, no una garantía: el despachador del cliente conoce **todas** sus herramientas, así que una tool que el modelo pidiera de más se ejecutaba igual. Sin el guarda en `core.js`, el flujo multi-agente era decorativo. Es el mismo razonamiento que el enum de `cargar_conocimiento`: lo que el modelo escribe es entrada no confiable.
2. **Una columna nueva en `estado_canal` es peor que una en métricas.** Ahí el upsert falla **entero** en vez de tragarse el error, y ese es el camino por el que se marca `modo_humano`: un cliente con el DDL viejo y el núcleo nuevo se habría quedado sin poder derivar a una persona — el bot hablando encima de una ejecutiva — por una columna agregada para otra cosa. Ahora la fila se filtra contra `CAMPOS_ESTADO`, el humo la compara con el DDL, y el DDL trae los `alter table ... add column if not exists`.
3. **Si el agente cambia a mitad de turno, el prompt hay que rearmarlo en esa ronda.** La primera versión lo armaba una vez por turno (como estaba antes), y el especialista contestaba con las instrucciones y las herramientas del anterior: peor que no haber cambiado. Ahora se arma por ronda; la mutación que lo revierte pone cuatro verificaciones en rojo.
4. **El recorrido del grafo tenía el `shift()` dentro del predicado del `find`.** Se ejecutaba una vez por elemento y vaciaba la cola antes de recorrerla, así que declaraba inalcanzable a un agente que sí lo era. Lo destapó el propio fixture de cuatro agentes del humo, que es un grafo válido.
5. **Un cambio de config con conversaciones abiertas dejaba gente parada.** Una conversación guardada en un agente que el cliente borró del archivo volvía `null`. Ahora vuelve al inicial y avisa: reempezar es malo, quedarse mudo es peor.

**La mentira que este paso podía introducir, y el invariante que la ataca.** Cambiar de agente por dentro es cambiar un bloque del prompt; contárselo al cliente como *"te derivo con un especialista"* es, del otro lado, **indistinguible de un handoff a un humano de verdad**. La persona se queda esperando a alguien que no existe y deja de escribir. Y el bot sigue ahí y responde perfecto, así que **ninguna prueba funcional lo detecta**: la respuesta es correcta, lo roto es la promesa. Se ataca en tres lugares —el prompt, la descripción de la tool y el **8º invariante** del arnés, `cambio_de_agente_no_finge_humano`— y solo corre en los turnos donde hubo cambio, para no pisarle el mensaje al handoff legítimo.

**El criterio de éxito nº8 del diseño, cumplido y verificado**: *"el mismo agente corre con `flujos[].agentes` de 1 elemento y de 4, sin cambiar código de cliente"*. La suite del ejemplo pasa **40/40 en las tres configuraciones** —sin flujo, con 1 agente y con 4— sin tocar una línea de `prompts.js`, `tools.js` ni de los escenarios. **Con una precisión que conviene no perder**: pasa con 4 agentes porque la recepción de ese fixture lleva `["*"]` (puerta generalista que escala cuando hace falta, que es un patrón legítimo). Con un reparto **estricto** —la recepción sin herramientas— la misma suite se pone **roja**, y está bien que se ponga: un escenario describe una conversación, y repartir las herramientas cambia la conversación. El arnés dice el escenario y el perfil exactos, y agregar `cambiar_etapa` al guión la devuelve a 40/40. Está documentado en el README como parte del procedimiento de activación.

**Verificación, corriendo:**
- `npm run humo` → **172/172 en verde** (antes 126). Escenario 12 nuevo: apagado no cambia nada, encendido con 1 y con 4 agentes, reparto de herramientas al ejecutar, cambio de agente dentro del turno, persistencia entre turnos, tope de saltos, destino inventado, config cambiada con conversaciones abiertas, el bloque de "ya sabes / te falta", la sanitización del valor que entra al prompt, el invariante, `CAMPOS_ESTADO` contra el DDL y siete formas de armar mal un flujo que el validador rechaza.
- **Prueba de mutación, cuatro veces**: se quitó el guarda de herramientas al ejecutar (1 en rojo), se hizo que `[]` significara "todas" (3 en rojo), se armó el prompt una vez por turno (4 en rojo) y se desactivó el invariante nuevo (1 en rojo). **Cada mutación rompió su verificación y solo la suya.**
- **Punta a punta**: proyecto nuevo con `nuevo-proyecto.ps1` → 39 archivos (28 núcleo + 11 semilla) → validador en verde diciendo "un solo agente" → `npm install` → `npm test` **40/40, 345 verificaciones** (idéntico a la 1.4.0: activar la capacidad no cambió nada). Después, con un flujo estricto de 2 agentes escrito **solo en el JSON**: validador en verde con el grafo dibujado, suite roja señalando los 3 escenarios a actualizar, y tras agregarles `cambiar_etapa` → **40/40 con 369 verificaciones**. `npm run schema` emite las columnas nuevas con el prefijo del cliente. Inventario posterior: **28/28 AL_DIA**.

**Lo que este paso NO resuelve.** Sigue en pie que la ruta de Supabase **nunca se ha corrido contra un Supabase real** (paso 4), y ahora hay tres columnas más que dependen de eso — dos de ellas en `estado_canal`, que es la tabla del handoff. Los `alter table` están escritos, pero la primera vez que un cliente configure Supabase hay que aplicarlos y verificar a mano. Y hay un supuesto sobre el proveedor que solo se confirma conversando: cuando un agente entrega a mitad de turno, el historial de ese turno menciona una herramienta que el agente nuevo ya no declara. El núcleo la conserva por el resto del turno justamente para no ofrecer un historial inconsistente, pero **eso está verificado contra el doble del LLM, no contra un proveedor real**. Y lo de siempre: que el modelo **decida bien cuándo cambiar de agente** depende del proveedor y no se prueba con un mock.

**Semáforo**: 🟡. Cambia el comportamiento observable del agente (una tool nueva, dos bloques nuevos de prompt) y toma decisiones de arquitectura no triviales. Sin gate 🔴: no hay agentes en uso, no se gastó dinero, no se creó ninguna credencial. El único punto que rozaba el rojo era saltarse el gate de métricas, y lo resolvió José.

**Siguiente**: no hay paso 7. El plan del núcleo que arrancó el 2026-07-31 queda **terminado** con la 1.5.0. Lo que falta ya no es construir maquinaria, es usarla: el primer cliente real valida el molde, y de su panel salen las decisiones que hoy están escritas como capacidades apagadas — si el flujo se enciende, qué hitos importan, y si la ruta de Supabase aguanta.

## 2026-09-10 — Calidad conversacional: el contrato de forma sube al núcleo (1.7.0) y la fábrica aprende a calibrar con lo real [🟡 POR LEER]

**Pedido de José**: *"cómo se hacen los agentes que hacen en VambeAI, ya que son más fluidos y tienen mejor servicio al cliente. 1.- encontrar cómo es la mejor forma de construir y diseñar… 2.- Editar la fábrica para llegar a esos resultados"*, y a mitad de sesión: *"conversa con agentes de Vambe y encuentra diferencias, como en respuestas, formatos, iconos, independencia"*.

**Documento nuevo**: [`docs/CALIDAD-CONVERSACIONAL.md`](CALIDAD-CONVERSACIONAL.md) — la investigación, las doce diferencias observables, las siete palancas y el plan por pasos. Es el hermano de `ARQUITECTURA.md`: ese responde *cuánto cuesta correrlo*, este *cómo se siente usarlo*.

**Lo que NO se pudo hacer, dicho de frente**: conversar con un agente de Vambe. Desde la sesión de la fábrica no hay WhatsApp ni teléfono, y el proxy de egress corre cerrado (`selective: false`): `vambe.ai`, Capterra y las webs de reseñas están bloqueadas y solo pasa la búsqueda. En vez de redactar suposiciones como si fueran observaciones, la tabla de diferencias marca **"por sondear"** en lo que falta y el documento trae un **sondeo de 12 mensajes contra PandaGol** —el agente público y gratuito que Vambe lanzó para el Mundial, +52 56 2395 9831— que José corre en 20 minutos. Cada fila del sondeo termina en un número de config, un invariante o un paso del plan; ninguna termina en "hay que rehacer la arquitectura".

**El hallazgo que ordenó todo el trabajo, y que no estaba en el pedido.** Las reglas de forma —mensajes cortos, sin Markdown, un emoji— vivían en el bloque `FORMATO` de `ejemplo/agent/prompts.js`. Y `prompts.js` es producto: **se reescribe entero al personalizar cada cliente**. O sea que lo que más decide si un agente se siente humano o robótico era exactamente lo primero que se borraba, y quedaba dependiendo de si quien escribió el prompt ese día se acordó de copiarlo. No lo detecta nadie: el bot responde bien, solo que escribe como informe. Es el mismo razonamiento que ya había puesto el índice del conocimiento en el núcleo, aplicado a la pieza que faltaba: **lo que vale para todos los clientes no puede vivir en un archivo que cada cliente reescribe.**

**Núcleo conversacional 1.6.0 → 1.7.0** (28 → 29 archivos). `agent/estilo.js`: el contrato de forma, configurable en `estilo.*` (`activo`, `max_caracteres`, `max_burbujas`, `max_emojis`, `una_pregunta`).

**Las decisiones de diseño, con su motivo:**

1. **Se pide en el prompt y se hace cumplir en el ENVÍO, nunca en `core.js`.** Es la decisión que sostiene el módulo. El arnés de evals llama a `processMessage`, así que una limpieza hecha antes de devolver el texto dejaría a los invariantes mirando una respuesta ya limpia: un prompt que pide informes pasaría **verde para siempre** y el limpiador taparía el defecto en vez de denunciarlo. Con la limpieza en `telegram/enviar.js` y `whatsapp/sender.js` —los dos caminos por los que un texto llega a una persona— **QA ve el crudo y se pone rojo, el cliente final ve el limpio**. Hay una verificación del humo que se cae si alguien mueve la limpieza al core.
2. **El limpiador toca la forma, nunca el fondo.** Saca `**negritas**`, `## títulos`, enlaces de Markdown y convierte viñetas; no recorta el largo, no quita emojis ni preguntas de más. Un limpiador que "arregle" el fondo escondería un prompt mal escrito para siempre. Lo que no limpia, lo denuncia el arnés.
3. **Burbujas: una línea en blanco al medio son dos mensajes seguidos.** El corte es **solo** en línea en blanco. Cortar por frases partiría "Dr. Pérez" en dos mensajes, que se ve peor que el muro de texto que vino a arreglar. `max_burbujas: 1` lo apaga.
4. **Cinco invariantes nuevos** (8 → 13): `sin_markdown_en_el_chat`, `una_pregunta_por_mensaje`, `no_vuelve_a_saludar`, `no_habla_como_maquina`, `respeta_tope_emojis`. Los cinco se declaran **OMITIDOS** con `estilo.activo: false`, que es la palanca de emergencia a la 1.6.0.
5. **Un solo tope de largo.** `respuesta_breve` dejó de tener su 600 escrito en el motor: sale de `estilo.max_caracteres`, que es el mismo número que el prompt le pide al modelo. Dos números para la misma regla es cómo se llega a una suite verde sobre respuestas larguísimas.

**Hallazgo por correr y no por leer.** `no_vuelve_a_saludar` puso **la propia suite de la semilla en rojo** (3 de 40) y tenía razón a medias: los perfiles `insistente`, `fuera_de_tema` y `cambia_opinion` insertan un turno donde **la persona escribe "Hola, buenas"**, y el bot saludaba de vuelta. Devolver el saludo a quien saluda es lo que hace cualquiera. La regla ahora se omite si el mensaje del cliente abre con un saludo, y sigue atrapando lo que importa: el "¡Hola! ¿En qué te ayudo?" en el mensaje ocho, sin que nadie lo haya saludado. **Un invariante que se queja de lo bien hecho termina apagado por el primero que lo mire**, y ahí se pierde también lo que sí atrapaba.

**Cambios en la maquinaria de la fábrica** (esto es la parte 2 del pedido):

- **`PIPELINE.md`, fase 1** — se pide siempre el **material real del cliente** (un export de su WhatsApp; con 200 conversaciones alcanza) a `<RUTA_PROYECTO>\conversaciones-reales\`. De ahí salen las preguntas que de verdad le hacen, las palabras del negocio y los escenarios de QA. Si el cliente no lo tiene, el pedido sigue igual pero queda anotado que el SPEC es **inventado y no observado**. Es la palanca de calidad más grande del tiempo de construcción y cuesta cero.
- **`PIPELINE.md`, fase 9 nueva — Operación y mejora continua**: panel cada dos semanas, leer 10 conversaciones completas, y **convertir cada hallazgo en escenario antes de arreglarlo**. Es el bucle que Vambe tiene con 2.300 clientes y nosotros no teníamos con ninguno. Acá —y no antes— se decide si conviene encender `flujo.agentes`, qué hitos importan y si el seguimiento proactivo vale lo que cuesta.
- **Subagentes**: `analista` (conversaciones reales como fuente principal, `lead.campos` obligatorio), `qa` (13 invariantes, escenarios copiados de chats reales, y **los invariantes de forma no se apagan para llegar a verde**), `desarrollador` (reescrito, ver abajo), `marketing` (el bloque *"el agente es suyo"* en el ONE-PAGER).
- **La ventaja comercial que no estábamos contando**: las plataformas grandes **arriendan** el asistente y cobran por paquetes de conversaciones; acá el cliente **queda dueño** de su código, sus datos y su cuenta del proveedor. *"Si mañana desaparecemos, su bot sigue andando."* Ahora es obligatorio en el kit de entrega.

**Dos documentos apuntaban a una base muerta, y eso sí era un bug de la fábrica.** `.claude/agents/desarrollador.md` y `PIPELINE.md` (fases 3 y 4) todavía mandaban a *"clonar `chaski-agentes/agente-citas`"* y *"reemplazar `agent/llm.js`"* — el flujo anterior al núcleo, con la ruta `C:\Users\Adela\chaski-agentes\` que **no existe desde el 2026-07-31**. Un desarrollador que siguiera esas instrucciones construiría desde una carpeta inexistente y, si improvisara, perdería el núcleo entero: handoff, buffer, métricas, evals y ahora el estilo. Se reescribieron contra lo que la fábrica hace hoy (`nuevo-proyecto.ps1` → config → producto → `npm test` → `npm run entrega`). Lo mismo en `lineas/conversacional/LINEA.md`.

**Verificación, corriendo:**
- `npm run humo` → **225/225 en verde** (antes 193). Escenario 14 nuevo, con 32 verificaciones: que el contrato llegue al modelo con un prompt de cliente que no trae ninguna regla de forma, que `processMessage` devuelva el texto **crudo**, que `core.js` no limpie nada, que los dos canales limpien y partan igual, las burbujas y su tope, el tope de 4096 por encima de las burbujas, los cinco invariantes con sus falsos positivos (un rango "10-12" no es viñeta, el "?" de una URL no es pregunta, dos guiones no son un informe y tres sí), el tope único de largo y las cinco reglas declarándose OMITIDAS con el contrato apagado.
- **Prueba de mutación, cinco veces**: limpiar dentro de `core.js` (2 en rojo), `anexar` que no anexa (2), `burbujas` ignorando el tope (1), `no_vuelve_a_saludar` sin mirar si la persona saludó (la suite del ejemplo entera en rojo, que es el falso positivo de arriba) y las reglas sin omitirse con el contrato apagado (1). **Cada mutación rompió su verificación y solo la suya.**
- Suite del ejemplo: **40/40 con 642 verificaciones de invariantes**, con el contrato encendido y `prompts.js` ya sin su bloque `FORMATO`.
- El validador imprime el contrato efectivo: `Escribe : hasta 600 caracteres, 3 mensaje(s) seguidos, 1 emoji(s), una pregunta por mensaje`.
- **No se pudo correr `nuevo-proyecto.ps1` punta a punta**: no hay PowerShell en el entorno de esta sesión (Linux). El overlay del humo usa el mismo `MANIFIESTO.json` que `sincronizar-nucleo.ps1`, así que el manifiesto está verificado; lo que falta comprobar en Windows es la creación de un proyecto nuevo con el archivo nuevo adentro.

**Lo que este trabajo NO resuelve, y queda escrito para no volver a descubrirlo:**
- **El agente sigue sin escribir nunca primero** (paso 8, seguimiento). Es la brecha que más plata mueve y la única que exige decisión de José antes de construir: que el agente le escriba a un cliente del cliente es comunicación saliente (🔴 causa 4) y necesita un proceso con reloj que puede tener costo (🔴 causa 1). El diseño ya está resuelto en sus partes difíciles —solo dentro de la ventana de 24 h de WhatsApp para no depender de plantillas aprobadas por Meta ni pagar por mensaje, uno solo por conversación, cortafuegos que falla cerrado, nunca después de un handoff ni contra quien pidió no ser contactado— pero no se escribió una línea de código.
- **Un audio sigue siendo silencio.** `whatsapp/webhook.js:93` descarta todo lo que no sea texto, y del otro lado eso se lee como "me dejaron en visto" — la peor atención posible, y además invisible: no hay turno, no hay error, no hay métrica. El paso 9a (responder *"todavía no puedo escuchar audios, ¿me lo escribes?"* y contarlo) son dos horas y no necesita permiso de nadie; no entró hoy para no mezclarlo con el contrato de forma.
- Sigue en pie que **la ruta de Supabase nunca se ha corrido contra un Supabase real**, y sigue sin haber **una sola conversación real medida**. Todo lo de hoy está verificado contra el doble del LLM: que el modelo *obedezca* el contrato de forma depende del proveedor y no se prueba con un mock.

**Semáforo**: 🟡. Cambia el comportamiento observable del agente (un bloque nuevo en el prompt, la respuesta sale limpia y partida en burbujas) y toma decisiones de arquitectura no triviales. Sin gate 🔴: no hay agentes en uso, no se gastó dinero, no se creó ninguna credencial, no se tocó nada entregado. El paso 8 sí es 🔴 y por eso quedó como diseño y no como código.

**Siguiente**: correr el sondeo de §3 contra PandaGol y volcar las cuatro filas que dicen "por sondear". Después, el primer cliente real: de su panel salen las decisiones que hoy están escritas como capacidades apagadas o como pasos con disparador.

