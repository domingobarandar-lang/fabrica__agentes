# Plantilla base — línea conversacional

Esta carpeta **es** la base oficial de todo agente conversacional de la fábrica. Ya no se clona desde una ruta externa: hasta el 2026-07-31 este README mandaba copiar desde `C:\Users\Adela\chaski-agentes\`, carpeta que no existe en la máquina de trabajo — la fábrica no podía ejecutar su propio paso 1 de Build. Eso quedó resuelto (ver `docs/DECISIONES.md`).

## Cómo está organizada

```
base-agente/
  nucleo/          Código COMPARTIDO. Se sincroniza a cada proyecto y no se edita allá.
  ejemplo/         SEMILLA. Doble rol: overlay de prueba, y punto de partida de un cliente.
  MANIFIESTO.json  Mapa origen→destino. Única fuente de verdad de qué viaja y adónde.
  VERSION          Versión del núcleo que se estampa en cada proyecto.
```

**La regla que ordena todo:** si un archivo está en `nucleo/`, se arregla **acá** y se re-sincroniza a todos. Si está en `ejemplo/`, es el punto de partida del producto de cada cliente y allá se reescribe libremente.

### Qué hay en `nucleo/`

| Archivo | Qué hace |
|---|---|
| `config.js` | Lee `agente.config.json`. **El esquema del contrato está definido acá, una sola vez** |
| `database/nucleo-db.js` | Conexión a Supabase o memoria + `sesiones`, `estado_canal`, `metricas`. Se niega a conectarse sin prefijo de tabla |
| `database/schema-nucleo.sql` | DDL de esas tres tablas, con `{{PREFIJO}}` que sustituye `npm run schema` |
| `agent/core.js` | Loop agéntico con tool use, cola serial por canal, timeout duro y reintentos. **Acá convergen todos los canales** |
| `agent/llm.js` | Adapter multi-proveedor (Gemini, Groq, DeepSeek, OpenRouter, Ollama, Anthropic) |
| `agent/memory.js` | Historial por canal con ventana deslizante |
| `agent/handoff.js` | Derivación a humano. **Definitiva por defecto** — ver advertencias |
| `agent/buffer.js` | Agrupa mensajes seguidos (6 s). Con lista de excepciones que **no** esperan |
| `agent/metricas.js` | Una fila por turno + hitos de negocio. Nunca puede romper una respuesta |
| `agent/conocimiento.js` | Lo que el negocio sabe, en archivos: **el índice va al prompt, el corpus no**. Inyecta y resuelve `cargar_conocimiento` |
| `agent/flujo.js` | Varios agentes especializados declarados en la config. **Viene apagado**. Inyecta y resuelve `cambiar_etapa` |
| `agent/lead.js` | Lo que ya se sabe de la persona: el bloque *"ya sabes / te falta"*, llenado con lo que reciben las tools |
| `lib/texto.js` | `dividirMensaje` compartido por todos los canales de envío |
| `evals/motor.js` | Arnés de pruebas: mock del LLM, runner y reporte. **Bloquea los efectos externos antes de cargar nada** |
| `evals/reglas.js` | Los 8 invariantes que se verifican solos en cada turno |
| `evals/perfiles.js` | Transformadores que derivan 8 conversaciones de una sola escrita a mano |
| `evals/perfiles/_base.json` | El catálogo de los 8 perfiles, como datos |
| `whatsapp/webhook.js` | Webhook de Meta con validación de firma HMAC-SHA256, fail-closed en producción |
| `whatsapp/sender.js` | Envío por WhatsApp Cloud API + guarda de silencio |
| `telegram/enviar.js` | Envío por Telegram + guarda de silencio |
| `scripts/validar-config.js` | `npm run validar`: esquema, `.env` que tapa, tokens, tools y `railway.toml` al día |
| `scripts/generar-railway.js` | `npm run railway`: escribe `railway.toml` según los canales activos |
| `scripts/schema-nucleo.js` | `npm run schema`: el DDL con el prefijo del cliente ya sustituido |
| `scripts/chat-local.js` | `npm run chat`: canal terminal. **MOCK por defecto**; gastar tokens exige `--real` |
| `scripts/panel-metricas.js` | `npm run metricas`: lee la tabla y contesta *¿esto está funcionando?*, con la escalera 50/75/90/100 contra el techo del plan |
| `scripts/listo-para-entrega.js` | `npm run entrega`: compuerta previa a la entrega. **La semilla se declara semilla y esto la caza** |
| `nixpacks.toml` | Build de Railway |
| `.gitignore` | Mantiene `.env` fuera del repo del cliente |
| `.env.example` | **Solo secretos y conexiones.** El comportamiento vive en `agente.config.json` |
| `package.json` | Dependencias del núcleo. Nombre **fijo**: un marcador en `name` rompe `npm install` |
| `package.json.tpl` | Plantilla del `package.json` del cliente, con marcadores que sustituye el script |
| `scripts/humo.js` | Prueba de humo: arma el overlay y verifica que el núcleo enciende |

`railway.toml` **no** está en el núcleo a propósito: su `startCommand` decide el canal (`telegram/bot.js` vs `index.js`) y eso es decisión de cada cliente. Lo genera `npm run railway` desde `canales.*.activo`.

### Qué hay en `ejemplo/`

`agente.config.json`, `agent/prompts.js`, `agent/tools.js` (una tool de juguete), `database/supabase.js` (el dominio del vertical), `index.js`, `telegram/bot.js`, `evals/` (`escenarios.js` + `correr.js`) y `conocimiento/` (índice + dos temas de ejemplo). Es lo mínimo para que el núcleo arranque, responda y se pruebe solo.

Existe por una razón concreta: los archivos del núcleo **no se pueden correr solos**. `agent/core.js` pide `./prompts` y `./tools`; `agent/memory.js` pide `../database/supabase`. Sin la semilla, "el núcleo funciona" sería una afirmación sin forma de comprobarla.

## Verificar el núcleo

```powershell
cd lineas\conversacional\plantillas\base-agente\nucleo
npm install
npm run humo
```

Arma núcleo + ejemplo en `.probar/` según `MANIFIESTO.json`, corre **125 verificaciones** y borra el temporal. **Cero tokens, sin credenciales, sin red**: el cliente LLM es un doble guionizado que se inyecta con `_setClienteParaTests`.

Qué cubre, por escenario:

| # | Verifica |
|---|---|
| 0 | Los **defaults que son decisiones de negocio**: derivación definitiva, ventana de 6 s, y el candado de que pedir un humano se salta el buffer aunque alguien vacíe la lista |
| 1 | El núcleo enciende, el prompt y las tools del ejemplo llegan al modelo, y se pasa un `AbortSignal` de verdad |
| 2 | El loop agéntico ejecuta la herramienta y su resultado llega a la respuesta |
| 3 | La memoria guarda el turno como texto plano |
| 4 | Derivación: **silencio real en los dos canales**, verificado en el envío y no por inspección, con ausencia explícita del mensaje de error |
| 5 | Cuatro mensajes seguidos son **un** turno; pedir un humano no espera la ventana |
| 6 | Timeout duro, reintentos, y un solo mensaje puente |
| 7 | Métricas por turno, distinguiendo derivación de silencio posterior |
| 8 | El arnés de evals: los 8 perfiles, los 6 invariantes uno por uno (que atrapen su fallo **y** dejen pasar lo sano) y la suite completa corriendo como la corre un cliente |
| 9 | La config: precedencia en sus tres capas, typos que son error, archivo corrupto y archivo ausente, el **fallo cerrado** del prefijo de tablas, que `.env.example` no tape la config, la identidad llegando al prompt, el `startCommand` según canales, el validador aprobando **y** rechazando, y el chat local de punta a punta |
| 10 | Conocimiento: el índice viaja en el prompt y **el corpus no**, la tool se inyecta y se ejecuta de verdad, una intención inventada devuelve la lista real, un archivo fuera de la carpeta se rechaza, el tope de palabras recorta y avisa, y con el índice roto el agente **sigue atendiendo** |
| 11 | El panel: agrupa por conversación (una derivación con dos silencios es **una**), los hitos del negocio, la aritmética del costo con números elegidos, el estado vacío explicando por qué, y que cada campo de métricas **tenga su columna** en el DDL |

Como usa el mismo mecanismo de armado que el script de sincronización, valida el manifiesto **antes** de que se use contra un proyecto real.

## Configurar un agente: `agente.config.json`

Un agente **no se configura tocando código**. Todo lo que decide cómo se comporta vive en un solo archivo, versionado en el git del cliente y validado antes de arrancar:

```json
{
  "cliente":   { "id": "petshop-lira", "nombre": "Petshop Lira", "vertical": "retail", "zona_horaria": "America/Santiago" },
  "identidad": { "nombre_agente": "Lira", "rol": "…", "tono": "…", "no_hacer": ["…"] },
  "canales":   { "telegram": { "activo": true, "token_env": "TELEGRAM_TOKEN" },
                 "whatsapp": { "activo": false }, "terminal": { "activo": true } },
  "handoff":   { "activo": true, "timeout_min": null, "max_fallos": 3, "inbox": "" },
  "limites":   { "historial_turnos": 30, "max_tokens_respuesta": 600, "timeout_modelo_ms": 25000,
                 "intentos_modelo": 3, "buffer_ms": 6000, "buffer_max_partes": 10,
                 "buffer_excepciones": ["handoff", "cancelacion", "adjunto"] },
  "datos":     { "prefijo": "petshop_lira" },
  "conocimiento": { "activo": true, "carpeta": "conocimiento", "tope_palabras": 800 },
  "metricas":  { "activas": true, "hitos": ["agendo", "sin_dato"],
                 "precio_usd_millon_entrada": 0, "precio_usd_millon_salida": 0 }
}
```

Hay dos bloques opcionales más, `flujo` y `lead`, que **no** aparecen acá porque un agente nace siendo uno solo: ver *Partir el agente en varios*, más abajo.

**La precedencia, y es deliberada:**

```
variable de entorno  >  agente.config.json  >  default del núcleo
```

El entorno gana porque es la **palanca de emergencia**: apagar el handoff desde Railway a las 3 AM sin redeploy. Pero un `.env` no se versiona ni se revisa, así que `npm run validar` **denuncia toda variable que esté tapando un valor declarado**, con el valor efectivo al lado. La palanca sigue; deja de ser silenciosa.

**Lo que NUNCA va en la config**: proveedor de LLM y credenciales. Eso vive en `.env` (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`) porque es secreto y es costo.

**Un typo no se ignora en silencio.** Escribir `"limits"` por `"limites"` es un **error**, no un aviso: la configuración entera no se aplicaría y el agente seguiría andando con los defaults, que es exactamente el modo de falla que este archivo vino a matar. Config inválida = no arranca.

**El prefijo de tablas no es cosmético.** El proyecto Supabase está **compartido entre agentes**: una tabla `estado_canal` sin prefijo la comparten todos los bots, y derivar a una persona en un negocio deja mudo al bot de otro si coinciden los `canal_id`. Con `datos.prefijo` basta — los tres nombres se derivan solos —, y si hay credenciales de Supabase sin prefijo resuelto, `database/nucleo-db.js` **se niega a conectarse**.

Comandos:

```powershell
npm run validar   # esquema, .env que tapa, tokens, tools, railway al día
npm run railway   # regenera railway.toml desde canales.*.activo
npm run schema    # DDL de las tablas del núcleo con el prefijo ya puesto
npm run chat      # canal terminal, en MOCK. `npm run chat -- --real` gasta tokens
npm run metricas  # panel: volumen, derivaciones, velocidad, hitos y costo
```

Desde la fábrica, para todos los clientes de una vez:

```powershell
.\scripts\validar-config.ps1 -Todos -RaizClientes C:\clientes
```

## Lo que el negocio sabe: la carpeta `conocimiento/`

Todo lo que un negocio "sabe" —formas de pago, cómo llegar, política de cambios, qué incluye cada plan— termina, si nadie lo impide, pegado dentro del prompt de sistema. Eso se paga **en cada turno aunque nadie pregunte**, empuja las reglas duras hacia el fondo del prompt hasta que el modelo deja de respetarlas, y obliga a editar código cada vez que cambia un dato.

Acá vive en archivos de texto, y el agente recibe **solo el índice**:

```
conocimiento/
  _indice.json          intención → archivo + descripción + keywords
  formas-de-pago.md
  como-llegar.md
```

```json
{ "temas": [
  { "intencion": "formas_de_pago", "archivo": "formas-de-pago.md",
    "descripcion": "medios de pago aceptados, cuotas, boleta y factura",
    "keywords": ["pago", "tarjeta", "transferencia", "cuotas"] }
]}
```

El núcleo agrega al prompt una línea por tema e **inyecta la herramienta `cargar_conocimiento`** — no hay que declararla en `agent/tools.js`, y la resuelve `agent/core.js`. El contenido llega solo cuando el modelo la llama.

- **Tope duro: 800 palabras por archivo.** Es un tope de *calidad*, no de espacio: un tema más largo se lleva el turno entero y devuelve una respuesta peor. Cuando no cabe, se parte en dos intenciones. En ejecución el texto se **recorta y lo anuncia**; `npm run validar` lo marca como **error** antes de que llegue a producción.
- **La intención es una lista cerrada**, declarada como `enum` en el esquema de la tool y verificada al ejecutar. El modelo nunca elige un nombre de archivo: un índice que apunte fuera de la carpeta se rechaza al leerlo.
- **Falla abierto**, al revés que `agente.config.json`. Un índice ilegible **no tumba al agente**: se grita en el log, la herramienta no se ofrece y el bot sigue atendiendo todo lo demás. Quedarse sin conocimiento es atender menos; caerse entero es no atender a nadie.
- **La carpeta es producto del cliente** (está en `nunca_tocar` como `conocimiento/`, la carpeta completa): editar un archivo cambia lo que el bot sabe sin tocar una línea de código.
- **Nunca copiar el corpus al prompt.** Hay un invariante del arnés (`conocimiento_fuera_del_prompt`) que pone la suite en rojo si alguien lo hace: es una regresión que no se ve en ninguna respuesta, solo en la factura.

## Medir: `npm run metricas`

El núcleo escribe una fila por turno desde la 1.1.0. El panel la lee y contesta *¿esto está funcionando?*: volumen, derivaciones **por conversación**, errores, velocidad (primer contacto, mediana, p95), herramientas más usadas, tokens y costo.

**Los hitos son del negocio, no del núcleo.** El núcleo no puede saber qué es "calificar" en una dental o en una corredora, así que da un solo mecanismo: la tool que consigue el hecho lo marca, y el panel lo reporta.

```js
// dentro de agent/tools.js, cuando la acción se consigue de verdad
metricas.marcarHito(canalId, 'agendo');
```

```json
"metricas": { "hitos": ["agendo", "sin_dato"] }
```

Con eso salen tasa de conversión, turnos hasta el hito y tasa de "no sé" sin que el núcleo sepa de qué habla el negocio. **Un hito declarado que nunca ocurre igual se lista con 0%**: esa es la señal, y si no aparece no se ve. `npm run validar` avisa si un hito declarado no lo marca nadie.

El costo en dólares solo aparece si se declara el precio del proveedor (`metricas.precio_usd_millon_*`): una tabla de precios escrita en el núcleo envejece sola y mentiría sobre plata. Sin precio, muestra tokens.

**Sin Supabase el panel no ve nada**, y lo dice: las métricas viven en el proceso del bot y se pierden al reiniciar. Para medir de verdad: `SUPABASE_URL` + `npm run schema` + aplicar el DDL.

## Partir el agente en varios: el bloque `flujo`

**Esto viene apagado, y esa es la parte importante.** Sin `flujo.agentes` en `agente.config.json`, el núcleo toma exactamente el mismo camino que tomaba antes de que existiera `agent/flujo.js`: mismo prompt, mismas herramientas, ni una llamada de más a la base. Un agente que no lo usa no paga nada por que exista.

**Cuándo partirlo.** Cuando el panel de un cliente que ya conversa muestre que el agente único mezcla etapas, se salta reglas que están al final de un prompt largo, o promete cosas que le tocan a otra parte del negocio. **No al crear el proyecto.** La arquitectura de muchos agentes por cliente es *consecuencia* de tener mucha escala, no la causa de haberla conseguido: partirlo antes de tener la evidencia deja varios prompts que mantener en vez de uno, sin haber arreglado nada.

**Qué es un "agente" acá.** No es un archivo de código: es una declaración. Por eso el mismo `agent/prompts.js`, el mismo `agent/tools.js` y los mismos escenarios corren con uno o con cuatro, y lo único que cambia es un JSON.

```json
"flujo": {
  "inicial": "recepcion",
  "max_saltos_turno": 2,
  "agentes": [
    { "id": "recepcion", "titulo": "Recepción",
      "rol": "Saludas, entiendes qué necesita la persona y le pasas la conversación a quien corresponde.",
      "herramientas": [], "entrega_a": ["agendamiento", "postventa"] },
    { "id": "agendamiento", "titulo": "Agendamiento de horas",
      "rol": "Tomas la hora. Confirmas siempre disponibilidad con la herramienta antes de prometer nada.",
      "herramientas": ["ver_disponibilidad", "agendar"], "conocimiento": [], "entrega_a": ["recepcion"] }
  ]
}
```

- **`herramientas` es obligatorio y `[]` significa "ninguna"**, no "todas" (para todas: `["*"]`). Repartirlas es el motivo entero de partir el agente, así que olvidarlo tiene que verse en la primera prueba y no producir un flujo que en realidad no separa nada. El reparto se aplica **al ejecutar**, no solo al declarar: si el modelo pide una herramienta que este agente no tiene, el núcleo no la ejecuta.
- **`conocimiento` sí tiene default abierto** (`["*"]`). La asimetría es por el modo de falla: el conocimiento ya se carga solo cuando hace falta, así que restringirlo casi no ahorra nada, y olvidarlo se vería como *"el bot dice que no tiene el dato"* — indistinguible de un negocio que de verdad no lo tiene.
- **El cambio lo decide el agente que ya está conversando**, con la herramienta `cambiar_etapa` que inyecta el núcleo y una lista **cerrada** de destinos. No hay router: un router es una llamada extra al LLM por turno, y este bloque existe justamente para bajar el costo por turno. El cambio surte efecto **dentro del mismo turno**: el especialista contesta de inmediato en vez de obligar a la persona a escribir otra vez.
- **Nunca se le anuncia a la persona.** "Te paso con un especialista" es una promesa que nadie va a cumplir: sigue siendo el mismo bot. Está prohibido en el prompt, en la descripción de la herramienta, y hay un invariante (`cambio_de_agente_no_finge_humano`) que pone la suite en rojo si igual ocurre.
- **`npm run validar` revisa el grafo**: entregas a agentes que no existen, agentes a los que no se llega nunca, herramientas mal escritas, herramientas que ningún agente reparte, y roles de más de 40 líneas (un rol así de largo es el prompt monolítico otra vez).
- **`FLUJO_ACTIVO=false`** vuelve al agente único desde Railway, sin redeploy, si un flujo nuevo sale mal.

El panel agrega una sección **"en qué parte de la conversación"** con turnos, conversaciones que pasaron y —la que importa— **cuántas se quedaron ahí**: si una parte concentra las que se detienen, el problema está en esa parte, no en la anterior.

**Activar un flujo estricto pone la QA en rojo, y está bien.** Un escenario describe una conversación, y repartir las herramientas cambia la conversación: si el agente inicial ya no tiene `ver_horario`, el guión del mock tiene que pasar primero por `cambiar_etapa`. El arnés lo dice con el escenario y el perfil exactos, así que la corrección es mecánica:

```js
modelo: [
  { tools: [{ name: 'cambiar_etapa', input: { etapa: 'horarios' } }] },   // ← agregar
  { tools: [{ name: 'ver_horario',   input: { dia: 'lunes' } }] },
  { text: (c) => `El lunes atendemos de ${c.lastResult('ver_horario').horario.abre}…` },
]
```

En `expect` hay dos ayudas nuevas: `await ctx.agente()` (en qué agente quedó la conversación) y `await ctx.lead()` (lo que el núcleo recordó de la persona).

## Lo que ya se sabe de la persona: el bloque `lead`

Sirve con un agente solo, pero con varios es **obligatorio**: la forma clásica de fallar de un flujo multi-agente es que el especialista salude de nuevo y vuelva a pedir el teléfono que la recepción ya había tomado.

```json
"lead": { "activo": true, "campos": [
  { "campo": "nombre", "etiqueta": "su nombre", "claves": ["nombre", "nombre_cliente"] },
  { "campo": "telefono", "etiqueta": "su teléfono", "claves": ["telefono", "celular"] }
] }
```

El núcleo mira los `input` que el modelo le pasa a las herramientas, guarda lo que reconoce por conversación y lo devuelve al prompt como *"lo que ya sabes / lo que te falta"*. **No hay que tocar `agent/tools.js`.** El precio de eso es que solo se entera de un dato cuando alguna tool lo recibe: lo que la persona dijo y ninguna herramienta usó, no se guarda. `npm run validar` avisa si un campo declarado no coincide con ningún parámetro de ninguna tool — nunca se llenaría, y el agente lo pediría en cada turno.

Los valores entran al prompt y vienen, en última instancia, de lo que escribió un desconocido: se recortan a 80 caracteres y se les quitan los saltos de línea.

## Probar un agente: `npm test`

```powershell
npm test                          # todo
npm test -- --perfil=pide_humano  # un solo perfil
npm test -- --escenario=CU-2      # un solo escenario
npm test -- --verboso             # imprime todas las conversaciones
```

**El reparto:** el motor, los perfiles y los invariantes son del núcleo e iguales para todos. Los **escenarios** (`evals/escenarios.js`) y la config del rubro (`evals/correr.js`) son del cliente: describen su negocio y nadie más los puede escribir. Los dos están en `nunca_tocar`, así que sincronizar el núcleo jamás los pisa.

**Los 8 perfiles de cliente difícil.** El cliente escribe UN camino feliz por caso de uso; el arnés lo vuelve a correr ocho veces con el mismo cliente portándose distinto:

| Perfil | Qué le hace a la conversación | Qué caza |
|---|---|---|
| `feliz` | nada | la línea base; si falla, los otros siete no dicen nada |
| `mensajes_partidos` | parte cada mensaje en varios | que el buffer agrupe: N mensajes son **un** turno |
| `ortografia` | quita tildes y mete faltas | que el núcleo no dependa de escribir bien |
| `desordenado` | invierte los datos dentro del mensaje | que no dependa del orden de captura |
| `insistente` | repite el último mensaje | idempotencia: que no queden dos reservas |
| `pide_humano` | agrega "prefiero hablar con una persona" | que derive sin gastar un token y después **se calle** |
| `fuera_de_tema` | mete una pregunta que no es del rubro | que no invente ni pierda el hilo |
| `cambia_opinion` | se arrepiente antes de confirmar | que no queden registros fantasma |

**Los 8 invariantes** corren solos en **cada turno de cada escenario**, sin que el cliente escriba nada: no re-preguntar un dato ya capturado · no afirmar datos que ninguna herramienta devolvió · respetar el tope de resultados · responder en ≤600 caracteres · derivar cuando piden una persona · no filtrar el prompt de sistema ni el nombre de una tool · no llevar el corpus de conocimiento dentro del prompt · no anunciar un cambio de agente como si pasaran la conversación a una persona. Todos deterministas. Un invariante que no se puede evaluar con la config que dio el cliente se marca **OMITIDA**, nunca aprobada: un check que no corrió no cuenta como verde.

**Sin juez LLM, a propósito.** Un evaluador con modelo real gastaría tokens en QA, que es regla dura de la fábrica y roza la causa 🔴 nº1 del semáforo. Si algún día entra, va detrás de un proveedor gratuito declarado y de una puerta explícita.

**Lo que estas pruebas NO miden.** El modelo es un doble guionizado: los perfiles prueban el **núcleo** y los invariantes frente a entradas desordenadas, no la comprensión del lenguaje del LLM. La calidad del tool-calling real se confirma conversando (`npm run chat`), y hay que rehacerlo al cambiar `LLM_PROVIDER`.

## Instalar el núcleo en un proyecto

```powershell
# Verificar (modo por defecto: no escribe nada)
.\scripts\sincronizar-nucleo.ps1 -Proyecto C:\clientes\petshop-lira\bot\agente

# Aplicar
.\scripts\sincronizar-nucleo.ps1 -Proyecto C:\clientes\petshop-lira\bot\agente -Aplicar

# Proyecto nuevo: agrega la semilla para que arranque y responda
.\scripts\sincronizar-nucleo.ps1 -Proyecto <ruta> -Aplicar -Semilla

# Inventario: quién está al día y quién no
.\scripts\sincronizar-nucleo.ps1 -Todos -RaizClientes C:\clientes
```

Estados que reporta:

- **AL_DIA** — el archivo del proyecto es idéntico al del núcleo.
- **ATRASADO** — quedó atrás, pero nadie lo tocó (coincide con lo estampado en su `NUCLEO.md`).
- **DIVERGIDO** — alguien lo editó en el proyecto. **Aplicar aborta.** Con `-Forzar` se pisa igual, pero deja respaldo con marca de tiempo.
- **FALTANTE** — no existe todavía.

Nunca toca `prompts.js`, `tools.js`, `schema.sql`, `.env`, `agente.config.json`, `BITACORA.md` ni `railway.toml`.

Por qué es un script y no un paquete npm: GitHub Packages exigiría un PAT en cada repo de cliente y en Railway, y eso es credencial nueva (gate 🔴 del semáforo). Un submódulo git obligaría a cada repo de cliente a tener acceso al repo privado de la fábrica para deployar. Esto es copia **con contabilidad**, que da lo que importa hoy sin tocar ningún gate. **Disparador para migrar a npm privado: el cuarto cliente.**

## Personalizar un cliente (fase Build del pipeline)

1. **Crear el proyecto** con `nuevo-proyecto.ps1` — nace fuera del repo de la fábrica, con git propio, y ya trae núcleo + semilla.
2. **Independizar el LLM** — ya viene: `agent/llm.js` es el adapter. Solo hay que llenar el `.env`:
   ```
   LLM_PROVIDER=gemini          # anthropic | groq | deepseek | gemini | openrouter | ollama | openai-compat
   LLM_API_KEY=
   LLM_MODEL=gemini-2.0-flash
   # LLM_BASE_URL=              # solo para openai-compat
   ```
   **Nunca asumir Anthropic por defecto**: es regla dura de `CLAUDE.md`, y ya nos mordió una vez (un agente quedó con `ANTHROPIC_*` en su `.env.example` y sin las `LLM_*`).
2b. **Llenar `agente.config.json`** — nombre, identidad, canales, prefijo de tablas. Es lo primero que hay que dejar bien: de ahí salen el prompt, el `railway.toml` y los nombres de las tablas. `npm run validar` antes de seguir.
3. **Escribir el producto** — acá va el tiempo:
   - `agent/prompts.js` — alcance y reglas del rubro (la identidad ya viene de la config).
   - `agent/tools.js` — las acciones del vertical. Validación de negocio **dentro** de la tool, nunca confiada al modelo. Tope duro de resultados.
   - `database/schema.sql` + el bloque de dominio de `database/supabase.js` — las tablas del rubro. Las tres del núcleo (`sesiones`, `estado_canal`, `metricas`) ya vienen: `npm run schema`.
   - `evals/escenarios.js` — los escenarios. CU-* del SPEC y ADV-* adversariales. Solo el camino feliz de cada uno: los ocho perfiles los deriva el motor.
   - `evals/correr.js` — qué significa "inventar un dato" y "lista demasiado larga" en este rubro.
   - `conocimiento/` — lo que el negocio sabe y no es una acción: pagos, ubicación, políticas. Un archivo por tema, ≤800 palabras, declarado en `_indice.json`. **Nada de esto va al prompt.**
   - `metricas.hitos` + `marcarHito` — qué cuenta como negocio conseguido en este rubro. Sin eso, el panel mide turnos y no resultados.
4. **Verificar en mock** — `npm test`. **Siempre 0 tokens, sin excepción.** Ya no hay que confiar en que cada proyecto lo respete: `evals/motor.js` borra las credenciales del entorno antes de cargar nada, así que no existe la variable capaz de encender el modo real. Ese bug existió (`MOCK === 'true' || !ANTHROPIC_API_KEY`: bastaba una key en el `.env` para que `npm test` saliera a la API) y por eso el bloqueo está en el núcleo.
5. **Deploy** (solo con aprobación de José): Railway, servicio propio, root directory = la carpeta del agente.

## Advertencias aprendidas (que costaron caro)

- **Para NO responder no basta con devolver `null`.** `whatsapp/sender.js` convertía un texto vacío en un POST fallido, y el `.catch` del webhook terminaba mandándole al cliente el mensaje de error genérico — justo cuando pidió hablar con una persona. Ya está resuelto en el núcleo con dos capas: el guarda en el **envío** (`sendMessage` y `enviarTelegram` cortan con `null`) y `lib/texto.js` devolviendo `[]` en vez de `['']`. Aplica a handoff humano, rate limit y ventana de 24h de WhatsApp.
- **Un buffer sin lista de excepciones es un bug esperando.** Cuando se agrupan mensajes hay que preguntarse **qué acción NO puede esperar**; la respuesta casi siempre incluye las acciones irreversibles: pedir un humano, cancelar, pagar. Si el cliente pide una persona y el proceso se reinicia durante la ventana, pidió ayuda y nadie se enteró. Por eso `handoff` está forzado en código como excepción y hay una verificación en el humo que falla si alguien lo saca.
- **La derivación a un humano es definitiva.** El default es `HANDOFF_TIMEOUT_MIN` vacío: el bot no vuelve solo. Reactivarlo tras 30 min de silencio suena razonable y es una regresión grave — el cliente descubre que la "persona" que le prometieron era un bot otra vez. Que vuelva es decisión del cliente, y hay que conversarla.
- **Nada de `unref()` en el timer del buffer.** La primera versión lo tenía "para no retrasar el apagado" y la prueba de humo murió en silencio: Node se va cuando solo quedan timers con `unref`, así que el grupo pendiente nunca se procesa. En producción eso es un mensaje de un cliente que se pierde sin dejar rastro.
- **La config del núcleo se lee en cada llamada, no al cargar el módulo.** Cuando eran `const` de arriba, el arnés cambiaba la variable, el núcleo seguía con el default, y dos verificaciones pasaron por el motivo equivocado. Si agregas una clave nueva, léela con `config.valor(...)` dentro de una función.
- **Un archivo de configuración corrupto tiene que romper SIEMPRE, no según qué clave se lea primero.** `config.valor()` miraba el entorno antes que el archivo: con `BUFFER_MS` puesto en Railway, un `agente.config.json` roto no rompía al arrancar y reventaba mucho después, en la primera clave que nadie estuviera pisando. Ahora el archivo se lee y valida primero, aunque para esa clave gane el entorno.
- **La QA prueba la config que se ENTREGA, no el `.env` de quien la corre.** Con un `.env` que traía `HANDOFF_ACTIVO=false`, la suite pasó de 32/32 a 28/32. Rojo es la dirección segura, pero el problema es que dos personas con el mismo repo obtenían resultados distintos y lo que se probó no quedaba registrado en ninguna parte. `evals/motor.js` borra todos los overrides del contrato antes de cargar nada, igual que las credenciales.
- **`.env.example` no puede traer variables de comportamiento descomentadas.** Copiarlo a `.env` —que es lo que dice este README— taparía la configuración entera y el archivo declarativo no serviría de nada. Hay una verificación estructural en el humo que falla si alguien descomenta una.
- **Un aviso que reporta mal el valor efectivo es peor que no avisar.** El validador decía "`HANDOFF_ACTIVO` pisa `handoff.activo` (queda en true)" con el `.env` diciendo `false`, porque no cargaba `dotenv`. Detectaba el problema y mentía sobre su consecuencia.
- **Los `.ps1` de la fábrica van con BOM UTF-8.** PowerShell 5.1 lee un script sin BOM como ANSI y los acentos salen rotos. Le pasaba al hook anti-amnesia desde que existe.
- **Los triggers de handoff tienen que tolerar faltas de ortografía.** Las regex exigían `hablar` y `quiero` literales, así que "kiero ablar con alguien" **no derivaba** — el falso negativo que el propio archivo declara inaceptable, y lo destapó el perfil `ortografia` la primera vez que corrió. Si agregas un trigger, escríbelo ya tolerante: el arnés lo va a probar mal escrito. Y ponle `\b`: sin él, `abar` casa dentro de "acabar".
- **Para verificar que un buffer agrupa, cuenta TURNOS, no llamadas al modelo.** Un turno que usa una herramienta llama al modelo dos veces por diseño (pedirla y responder con su resultado). Contar llamadas da rojo en cualquier escenario con tools — o sea, en los que importan.
- **Un invariante que no se puede evaluar se marca OMITIDA, no verde.** Si el cliente no declaró `patronId`, la regla del tope de resultados no corrió: contarla como aprobada es inflar la cobertura con checks que nunca se ejecutaron.
- **Toda tabla nueva va prefijada por agente.** El proyecto Supabase se comparte entre agentes: una tabla sin prefijo cruza datos entre negocios distintos.
- **Una métrica nueva sin su columna se pierde en silencio.** El `INSERT` se hace con la fila tal cual: una clave que no es columna hace fallar el insert entero, y como los errores de métricas se tragan a propósito (nunca romper una respuesta), la fila desaparece sin rastro hasta que alguien mira una tabla vacía. Por eso la fila se filtra contra `CAMPOS` de `agent/metricas.js` y el humo compara esa lista con `database/schema-nucleo.sql`. Si agregas un campo, tócalos **los dos**.
- **El corpus de conocimiento nunca se pega en el prompt**, ni siquiera "un ratito para que no falle". No se nota en ninguna respuesta: se nota en la factura, en cada turno, aunque nadie pregunte por el tema. Hay un invariante que lo atrapa.
- **Los archivos de conocimiento no son un almacén**, son fichas: 800 palabras es el tope y partir un tema en dos es la respuesta correcta, no subir el tope.
- **Una columna nueva en `estado_canal` es más peligrosa que una en métricas.** Ahí el upsert falla **entero** en vez de tragarse el error, y ese es el camino por el que se marca `modo_humano`: un cliente con el DDL viejo y el núcleo nuevo se quedaría sin poder derivar a una persona, y el bot hablaría encima de una ejecutiva. Por eso la fila se filtra contra `CAMPOS_ESTADO` de `database/nucleo-db.js`, el humo la compara con el DDL, y el DDL trae los `alter table ... add column if not exists` — `create table if not exists` no agrega columnas a una tabla que ya existe.
- **Repartir herramientas entre agentes hay que hacerlo cumplir al EJECUTAR, no solo al declarar.** La lista de `tools` que se le manda al modelo es una indicación: el despachador del cliente conoce todas sus herramientas y ejecutaría igual la que el modelo pida de más. Sin el guarda en `core.js`, un flujo multi-agente parece separar y no separa nada.
- **Cambiar de agente no se le anuncia a la persona.** "Te paso con un especialista" es indistinguible, del otro lado, de una derivación a un humano de verdad: la persona se queda esperando a alguien que no existe y deja de escribir. El bot sigue ahí y responde perfecto, así que **ninguna prueba funcional lo ve** — la respuesta es correcta, lo que está roto es la promesa. Hay un invariante para eso.
- **Si el agente cambia a mitad de turno, el prompt hay que rearmarlo en esa misma ronda.** Armarlo una vez por turno deja al especialista contestando con las instrucciones y las herramientas del anterior, que es peor que no haber cambiado.
- **La lógica transversal va en `processMessage` de `core.js`, no en un canal.** Todos los canales convergen ahí. Anclarla en el webhook de WhatsApp cuando el agente despliega Telegram significa que no se ejecuta nunca.
- Dos bots de Telegram no pueden compartir token (conflicto 409): un bot de @BotFather por agente.
- Supabase: usar la key `service_role`; la `anon` da *permission denied* con RLS.
- Sin Supabase la base es en memoria y cada redeploy la borra. Para demo sirve; para producción no.
- La calidad del tool-calling varía entre proveedores: al cambiar `LLM_PROVIDER`, correr mock + una conversación real antes de dar por bueno el cambio.
