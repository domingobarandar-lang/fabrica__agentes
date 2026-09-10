# Calidad conversacional — cómo se construye un agente que se siente humano

Pedido de José (2026-09-10): *"cómo se hacen los agentes que hacen en VambeAI, ya que son más fluidos y tienen mejor servicio al cliente"*, y en la misma sesión: *"conversa con agentes de Vambe y encuentra diferencias, como en respuestas, formatos, iconos, independencia"*.

Este documento responde en tres partes: **las diferencias concretas** (§3, con el sondeo para completar las que solo se ven conversando), **de dónde sale realmente esa sensación** (§4) y **qué le falta a esta fábrica para producirla en serie** (§5 y §6, con disparadores).

Es el hermano de `ARQUITECTURA.md` (que responde *cuánto cuesta correrlo*): este responde *cómo se siente usarlo*.

---

## 1. Qué se sabe de Vambe, y qué no

**Lo verificable** (prensa 2026 y la `DIRECTIVA` que entregó José, registrada en `DECISIONES.md` 2026-07-30):

- Startup chilena, 2023. Más de **2.300 empresas** en LatAm, ARR sobre **US$ 11M**, levantó **US$ 14M**. Base de clientes multiplicada por cuatro en 12 meses.
- Producto: IA conversacional sobre WhatsApp, Instagram, web y llamadas, **conectada al CRM/ERP** del cliente, con atribución de ingresos.
- La promesa no es "responder preguntas": es cubrir **el ciclo comercial completo** — lead → conversación → calificación → venta → CRM → seguimiento → postventa → recompra.
- En *Inside Vambe 2026* (agosto) reordenaron la plataforma con una frase que vale releer: que los agentes **dejen de responder preguntas y empiecen a ejecutar operaciones comerciales reales**. Más productos alrededor: *Vambe Ads* (atribuir conversiones a campañas) y *Vambe Connect* (integraciones).
- Arquitectura, según la directiva: **~8 agentes hiperespecializados por cliente**, conocimiento en carpetas cargadas just-in-time, y un **meta-agente de configuración** que arma el agente del cliente.

**Lo que no se sabe y no hay que fingir que se sabe**: sus prompts, sus modelos, sus tiempos de respuesta y cómo resuelven cada caso. `vambe.ai` está bloqueado por el proxy de esta sesión, así que nada de acá sale de leer su sitio. Todo lo que sigue es **ingeniería de por qué un chat se siente fluido**, contrastada con lo que la fábrica ya tiene en el disco.

## 2. El error de leer a Vambe al revés (y una segunda vez)

`DECISIONES.md` ya registró el EUREKA en julio: **los 8 agentes por cliente son consecuencia de tener 2.300 clientes, no la causa de haberlos conseguido.** Copiar la arquitectura antes de tener la escala multiplica el problema en vez de resolverlo.

Un año de evidencia después, el mismo error tiene una segunda forma, más cara: **confundir el catálogo de productos con la calidad del producto**. Vambe Ads, Connect y la atribución al CRM son lo que le venden a una empresa con 40 vendedores. No son lo que hace que un mensaje se sienta bien contestado. Un cliente de José con una recepcionista y 60 conversaciones al día no nota nada de eso; nota si el bot escribió como una persona y si le resolvió el problema.

**La conclusión que ordena este documento**: la fluidez y el buen servicio **no viven en la arquitectura**. Viven en siete palancas concretas, seis de ellas baratas, y ninguna requiere partir el agente en ocho.

## 3. Diferencias observables, una por una

Pedido de José: *"conversa con agentes de Vambe y encuentra diferencias, como en respuestas, formatos, iconos, independencia"*. **Conversar no se pudo**: desde la sesión de la fábrica no hay WhatsApp ni teléfono, y el proxy de egress corre en modo cerrado (`selective: false`) — `vambe.ai`, Capterra y las webs de reseñas están bloqueadas; solo pasa la búsqueda. Así que esta tabla trae **lo que sí es verificable por fuentes públicas**, y abajo está el sondeo para completar a mano lo que solo se ve conversando. Lo que no se pudo comprobar dice "por sondear" en vez de una suposición redactada como hecho.

| Eje | Vambe (fuente pública) | Nuestra fábrica hoy | Qué hacemos con eso |
|---|---|---|---|
| **Se nota que es un bot** | Clientes suyos en Capterra: *"los clientes quedan muy contentos con la atención, incluso varios de ellos no se percatan que es un agente de IA"* | Era criterio de quien escribiera el prompt ese día | **Cerrado hoy**: el contrato de forma sube al núcleo (P1) |
| **Formato del mensaje** (largo, Markdown, viñetas) | Por sondear | 600 caracteres, sin Markdown, hasta 3 burbujas — declarado y verificado por 5 invariantes | Ya es config (`estilo.*`); el sondeo dice si hay que mover los números |
| **Iconos / emojis** | Por sondear | Tope de 1 por mensaje, `0` legítimo en rubros serios | Igual que arriba: es un número en la config, no una reescritura |
| **Audios y notas de voz** | **Sí**: *"messages, AI voice calls, and audio transcription"* | **Silencio**: `whatsapp/webhook.js:93` descarta todo lo que no sea texto | Es la brecha más fea que tenemos → paso 9 |
| **Canales** | WhatsApp, Instagram, Messenger, TikTok, email, webchat y **llamadas de voz** | WhatsApp, Telegram, terminal | No se persigue: cada canal nuevo es superficie que mantener sin cliente que la pida |
| **Idiomas** | PandaGol *"identifica el idioma del usuario"* y opera en español, inglés y portugués | Solo español | No se persigue hasta que un cliente de turismo o export lo pida |
| **Seguimiento proactivo** | Parte central del pitch: *lead → … → seguimiento → postventa → recompra* | Cero: el agente nunca escribe primero | → paso 8, con las decisiones 🔴 que exige |
| **Quién puede cambiar el agente** ("independencia") | El propio cliente, en una interfaz, **sin escribir código**: *"ajustar flujos, editar bloques de conversación y modificar asistentes sin salir de la interfaz, ejecutando los cambios al instante"*. Tienen academia y tutoriales | El cliente cambia **texto** (`conocimiento/`) y **números** (`agente.config.json`); el comportamiento lo cambiamos nosotros, con git y redeploy | **Diferencia real y no la vamos a cerrar**: construir una UI de configuración es un producto entero. Lo que sí se hace es que cada vez más cosas sean archivo de texto y no código — ya pasó con el conocimiento, la config, el flujo y ahora la forma |
| **De quién es el agente** (la otra "independencia") | SaaS: el cliente **arrienda**. Precio por paquetes de conversaciones al mes, con cobro extra al pasarse | El cliente **es dueño**: su repo, su `.env`, su key de LLM, su Supabase. Se puede llevar todo y correrlo sin nosotros | **Es nuestra ventaja comercial y hoy no está escrita en ninguna parte.** Va al kit de entrega (`ONE-PAGER.md`) |
| **Arranque** | Reseña de Capterra: *"partir con vambe es un proceso un poco engorroso, cuesta entender cómo funciona si no sabes del tema"*, y *"cambios en la plataforma constante"* | El cliente no configura nada: recibe el agente andando | Ventaja nuestra mientras seamos pocos clientes. Se pierde el día que haya que atender a 50 |
| **Certificaciones** | SOC 2, ISO 27001, SLA 99,95% | Ninguna | No se persigue: es lo que se le exige a un proveedor de una empresa grande, no de un petshop |
| **Escala** | +2.300 empresas; iteran con esa evidencia | 0 clientes con tráfico medido | Es *el* problema real, y no se arregla con arquitectura → fase 9 del pipeline |

**La conclusión que ordena el resto del documento**: de doce ejes, en dos estamos peor de verdad (audios, seguimiento), en tres empatamos por decisión (canales, idiomas, certificaciones: no los perseguimos), en uno estamos mejor y no lo estábamos contando (el cliente es dueño de su agente), y el resto acaba de cerrarse hoy o es un número en un archivo de configuración.

### El sondeo — 12 mensajes para completar la tabla (20 minutos, lo corre José)

Lo que falta no se investiga leyendo: se ve escribiendo. Y hay un blanco perfecto para hacerlo **sin meterse en la línea comercial de nadie**: **PandaGol**, el agente gratuito y público que Vambe lanzó para el Mundial 2026, en WhatsApp al **+52 56 2395 9831**. Es de acceso abierto, corre sobre el stack de Vambe y responde en español.

Dos advertencias: no le escribas datos del negocio ni de un cliente (la conversación queda del lado de Vambe), y ten presente que es un agente de **información al público**, no de venta — lo que se mide acá es la **forma**, no el guion comercial.

**Cómo se corre.** Mandar estos 12 mensajes, en este orden, y anotar la respuesta. Después mandar **los mismos 12** a nuestro agente (`npm run chat` en la carpeta del proyecto) y comparar en dos columnas.

| # | Qué mandar | Qué se está midiendo | Qué decisión cambia |
|---|---|---|---|
| 1 | `hola` | Largo del saludo, emojis, si abre con menú o con una pregunta | `estilo.max_caracteres`, `estilo.max_emojis` |
| 2 | `cuando juega chile` | Formato de una respuesta con datos: ¿viñetas? ¿negritas? ¿un mensaje o varios? | `estilo.max_burbujas`, invariante de Markdown |
| 3 | (tres mensajes seguidos, rápido) `oye` / `una consulta` / `donde juegan` | Si agrupa o contesta tres veces | `limites.buffer_ms` (el nuestro son 6 s) |
| 4 | `mi nombre es José` … 4 mensajes después: `como me llamo?` | Memoria dentro de la conversación | `lead.campos` |
| 5 | *(nota de voz de 10 segundos)* | **El eje más importante**: ¿transcribe, avisa que no puede, o queda en silencio? | Paso 9 completo (9a vs 9b) |
| 6 | *(una foto cualquiera)* | Igual que 5, con imágenes | Paso 9 |
| 7 | `kiero saber komo yego al estadio` | Tolerancia a las faltas de ortografía | Nuestro perfil `ortografia` ya lo cubre; confirma el listón |
| 8 | `quiero hablar con una persona` | Si deriva, cómo lo dice, y si después se calla | Contrastar con nuestro handoff definitivo |
| 9 | `no, mejor no` (arrepentirse a mitad) | Si pierde el hilo o retoma | Nuestro perfil `cambia_opinion` |
| 10 | `cuanto sale un pasaje a marte` (fuera de tema) | Si inventa o reconoce que no es suyo | Invariante `no_afirma_dato_sin_tool` |
| 11 | **Dejar la conversación botada 30-60 min** | **¿Escribe solo?** ¿Cuánto tarda, qué dice, cuántas veces? | Paso 8 (seguimiento): el dato que hoy no tenemos |
| 12 | `do you speak english?` | Si cambia de idioma solo | Si algún día vale la pena el multilenguaje |

**Lo que hay que anotar además de la respuesta**: **cuánto se demoró** (cronómetro, del envío al primer mensaje) y **cuántos mensajes** mandó por cada uno. Esas dos columnas son la mitad de la sensación de fluidez y no se ven en ninguna captura.

**Qué se hace con el resultado**: cada fila de arriba termina en un número de `agente.config.json`, en un invariante nuevo del arnés, o en un paso del plan de §6. Ninguna termina en "hay que rehacer la arquitectura" — para eso está el EUREKA de §2.

## 4. Las siete palancas, por orden de impacto

Ordenadas por *cuánto cambia la sensación del cliente final por peso invertido*.

### P1 · La forma del mensaje — **cómo se ve lo que llega**

Lo primero que delata a un bot no es lo que dice: es cómo se ve. Un muro de texto con **negritas** que WhatsApp muestra como asteriscos, una lista de seis viñetas, tres preguntas juntas, un "¡Hola! ¿En qué puedo ayudarte?" en el mensaje ocho. Nada de eso es un error de contenido —la respuesta puede ser perfectamente correcta— y por eso **ninguna prueba funcional lo detecta**.

Una persona escribe corto, manda dos mensajes seguidos en vez de un párrafo, pregunta una cosa a la vez y saluda una sola vez.

### P2 · No volver a preguntar lo que ya le dijeron

El segundo delator. La persona dio su nombre en el mensaje tres y el agente se lo vuelve a pedir en el nueve. Se siente peor que un error: se siente que no la están escuchando.

### P3 · Volver a escribir — el seguimiento

**Acá está la mayor parte de lo que Vambe vende como "mejor servicio", y es la palanca que más plata mueve.** Una conversación que se corta a medias —la persona preguntó el precio, el bot respondió, silencio— hoy está perdida para siempre en cualquier agente de esta fábrica. En un negocio real, esa persona es la mitad de los leads.

Un agente que a los 30 minutos escribe *"¿te quedó alguna duda con lo del jueves?"* recupera una parte de esas conversaciones. Es también la palanca más delicada: es la única de las siete que **le escribe primero a una persona**.

### P4 · Oír lo que llega — audios e imágenes

En LatAm una parte enorme de WhatsApp son notas de voz y fotos. Vambe transcribe audio (§3). **Hoy `whatsapp/webhook.js:93` descarta todo lo que no sea texto**: llega un audio y el agente responde **silencio**. Del otro lado eso no se lee como "no entiendo audios", se lee como *"me dejaron en visto"*, que es la peor atención posible y encima es invisible en las métricas (no hay turno, no hay error, no hay nada).

### P5 · Saber cuándo callarse y pasar a una persona

Ya resuelto y bien resuelto (derivación definitiva por defecto, guarda de silencio en el envío, derivación tras fallos repetidos). Lo que falta es detectar la **frustración** además del pedido explícito: alguien que repite la misma pregunta tres veces ya pidió un humano, aunque no haya escrito "quiero hablar con alguien".

### P6 · Estar calibrado con conversaciones reales de ESE negocio

La palanca más grande del tiempo de construcción, y sale gratis. Un agente escrito desde un SPEC imaginado habla como el SPEC. Un agente escrito leyendo **200 conversaciones reales** del WhatsApp del cliente habla como ese negocio: usa sus palabras, conoce las 15 preguntas que de verdad le hacen y sabe en qué se traba la gente.

Esto es, casi con seguridad, lo que hace el "meta-agente de configuración" de Vambe: convertir el material del cliente en la configuración del agente. Nosotros no necesitamos el meta-agente — tenemos a Claude Code leyendo los archivos. Lo que nos falta es **pedir el material**.

### P7 · Mirar el panel y corregir

Vambe itera con 2.300 clientes de evidencia. Nosotros tenemos `npm run metricas` desde la 1.4.0 y **nadie lo ha mirado nunca**, porque no hay todavía un cliente con tráfico real. En el minuto en que lo haya, la diferencia entre un agente bueno y uno mediocre es si alguien mira dónde se cae la gente y lo arregla.

## 5. Dónde está parada la fábrica, palanca por palanca

| Palanca | Antes de hoy | Después de hoy (núcleo 1.7.0) |
|---|---|---|
| **P1** Forma del mensaje | Reglas escritas en el bloque `FORMATO` de `agent/prompts.js` — **el archivo que se reescribe entero en cada cliente**. Cero verificación | `agent/estilo.js` en el núcleo: bloque de prompt + limpieza en el envío + **5 invariantes** en el arnés. Configurable en `estilo.*` |
| **P2** No re-preguntar | `lead.campos` existe (1.6.0) pero **nace vacío**: sin campos declarados no recuerda nada | Igual — pero el pipeline ahora obliga a declararlos en la fase Spec |
| **P3** Seguimiento | **Cero.** El agente nunca escribe primero | **Cero.** Diseñado abajo como paso 8; no construido |
| **P4** Audios e imágenes | **Silencio** ante todo lo que no sea texto | Igual. Paso 9 |
| **P5** Handoff | Bueno. Solo detecta el pedido explícito | Igual |
| **P6** Calibración real | No se pide material del cliente en ninguna fase | El BRIEF y la fase Spec ahora piden conversaciones reales |
| **P7** Panel | Existe, nadie lo mira (no hay tráfico) | Fase 9 del pipeline: el ritual queda escrito para cuando lo haya |

## 6. El plan

### Paso 7 — El contrato de forma ✅ **hecho** (núcleo 1.7.0, 2026-09-10)

`agent/estilo.js`. Detalle en `lineas/conversacional/plantillas/base-agente/README.md` y en la entrada de `DECISIONES.md`. Lo esencial: **lo que vale para todos los clientes no puede vivir en un archivo que cada cliente reescribe**, y el limpiador corre en el **envío** y no en `core.js` para que QA siga viendo el texto crudo y pueda ponerse roja.

### Paso 8 — El seguimiento (P3) · 🔴 **requiere decisión de José antes de construir**

**Qué es**: si una conversación queda a medias, el agente escribe una vez más, solo, pasado un rato.

**El diseño, ya resuelto en sus partes difíciles:**

1. **Solo dentro de la ventana de 24 horas de WhatsApp.** Fuera de esa ventana Meta exige plantillas pre-aprobadas, y eso son días de trámite y **costo por mensaje** (desde el 1 de octubre de 2026 hasta las plantillas de utilidad dentro de la ventana se facturan). Dentro de la ventana es texto libre y no hay aprobación de nadie. Es además donde está el valor: la persona que dejó de escribir hace 40 minutos, no la de hace tres semanas.
2. **Un solo seguimiento por conversación**, declarado en config (`seguimiento.*`), apagado por defecto. Dos ya es insistir; tres es spam y el cliente bloquea el número.
3. **Cortafuegos que falla cerrado**, el mismo contrato que la línea de automatización (`ARQUITECTURA.md`): sin `MODO_ENVIO=produccion` exacto, **simula y lo dice al arrancar**. QA no puede mandarle un mensaje a nadie.
4. **Nunca después de un handoff** (hay una persona a cargo), **nunca si pidió no ser contactado** (regla dura, y en varios países también es ley), **nunca dos veces por lo mismo** (idempotencia por conversación).
5. **El disparador es el reloj, no el modelo**: una conversación sin respuesta del cliente después de N minutos, con un hito pendiente. Preguntarle al modelo "¿debería escribirle?" en cada turno es pagar tokens para decidir algo que un `where` resuelve.

**Lo que hay que decidir antes de escribir código** (causas 🔴 nº 4 y nº 1 del semáforo): que el agente **le escriba primero a un cliente del cliente** es comunicación saliente, y el que la autoriza no es la fábrica. Además necesita un proceso corriendo con reloj (Railway cron) y eso puede tener costo.

**Disparador natural**: el primer cliente con tráfico real y un panel que muestre dónde se cae la gente.

### Paso 9 — Oír audios e imágenes (P4) · 🟡 en dos mitades

- **9a, hoy y sin costo**: que un audio deje de ser silencio. `whatsapp/webhook.js` responde *"todavía no puedo escuchar audios, ¿me lo escribes?"* y lo registra en métricas como `entrada_no_soportada`. Dos horas de trabajo y elimina el peor modo de falla que tiene el producto. La métrica además dice **cuántos audios llegan**, que es exactamente el dato para decidir 9b.
- **9b, cuando el dato lo pida**: transcripción. El pool de credenciales ya tiene claves de Gemini free tier y Gemini transcribe audio — **sin credencial nueva y sin plata**, así que no es 🔴 por sí solo. Se decide con el número que entregue 9a, no antes.

### Paso 10 — Calibración con conversaciones reales (P6) · 🟢 **hecho hoy en el pipeline**

No es código: es pedirle al cliente lo que ya tiene. Queda escrito en `PIPELINE.md` (fases 1, 2 y 5) y en `lineas/conversacional/LINEA.md`. De un export de WhatsApp salen tres cosas que hoy inventamos: **las preguntas reales** (→ `conocimiento/`), **las palabras del negocio** (→ `identidad.tono` y el prompt) y **los escenarios de QA** (→ `evals/escenarios.js`, que dejan de ser imaginados).

### Paso 11 — El ritual del panel (P7) · 🟢 **hecho hoy en el pipeline**

Fase 9 de `PIPELINE.md`. Sin cliente con tráfico no se puede ejecutar; queda escrito para que exista el día que lo haya, que es cuando nadie se acuerda de inventarlo.

## 7. Lo que NO vamos a copiar, y por qué

- **Los ~8 agentes por cliente.** Ya está construido y **apagado** (`flujo.agentes`, 1.6.0). Se enciende mirando el panel de un cliente que ya conversa, nunca al crear el proyecto. Encenderlo antes deja cuatro prompts que mantener en vez de uno, sin evidencia de que sirva.
- **El meta-agente de configuración.** Nuestro meta-agente es Claude Code leyendo la carpeta del cliente. Construir un agente que configure agentes, con dos clientes, es maquinaria para un problema que no tenemos.
- **Ads / atribución / CRM.** Se le vende a una empresa con equipo comercial. Nuestros clientes tienen una recepcionista.
- **El juez LLM en QA.** Sigue fuera: gasta tokens, y es regla dura de la fábrica que QA no gaste. Los 13 invariantes son deterministas por esa razón, y atrapan más de lo que parece.

## 8. Cómo se sabe si esto sirvió

Sin cliente con tráfico, todo lo de arriba es una apuesta razonada. Las tres preguntas que hay que poder contestar con el panel del primer cliente real, y que ordenan todo lo demás:

1. **¿En qué parte de la conversación se detiene la gente?** (ya lo reporta `npm run metricas`) → dice si hay que partir el agente, cambiar el prompt o agregar una tool.
2. **¿Cuántas conversaciones quedaron a medias?** → dice cuánto vale el paso 8.
3. **¿Cuántos audios llegaron y murieron en silencio?** → dice cuánto vale el paso 9b. El paso 9a existe para producir este número.

## Fuentes

Prensa (agosto 2026) sobre Vambe y su evento anual, y reglas de WhatsApp Business API:

- [Inside Vambe 2026: la IA entra en una nueva etapa y comienza a operar los negocios](https://televitos.com/inside-vambe-2026-la-ia-entra-en-una-nueva-etapa-y-comienza-a-operar-los-negocios/)
- [Vambe levanta US$14M y apuesta por agentes de IA autónomos](https://ecosistemastartup.com/vambe-levanta-us14m-y-apuesta-por-agentes-de-ia-autonomos/)
- [Vambe AI: IA conversacional en un motor autónomo de ventas](https://www.zoomtecnologico.com/2026/08/20/vambe-ai-ia-conversacional/)
- [Vambe lanza PandaGol: IA en WhatsApp para el Mundial 2026](https://ecosistemastartup.com/vambe-lanza-pandagol-ia-en-whatsapp-para-el-mundial-2026/) · [La IA llega al Mundial: chatbot gratuito (Diario Financiero)](https://www.df.cl/mundial-de-futbol/la-ia-llega-al-mundial-startup-chilena-vambe-lanza-chatbot-gratuito-para) — de acá salen el número público y el multilenguaje del sondeo
- [Vambe en Capterra](https://www.capterra.com/p/10035520/Vambe/) y [Vambe en ComparaSoftware](https://www.comparasoftware.com/vambe) — reseñas de clientes y modelo de precios por paquetes de conversaciones
- [Vambe Platform Core](https://www.vambe.ai/platform/core) (canales, transcripción de audio, certificaciones) y [Vambe AI Docs / Academy](https://academy.vambe.ai/) — vía resultados de búsqueda; los dominios están bloqueados por el proxy
- [WhatsApp 24h rule explained](https://voltade.com/learn/whatsapp/whatsapp-24hr-rule) · [WhatsApp Business API pricing 2026](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)
- La `DIRECTIVA-ARQUITECTURA-FABRICA-AGENTES.md` que entregó José, auditada en `DECISIONES.md` (2026-07-30).
