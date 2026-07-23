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
