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
| `agent/core.js` | Loop agéntico con tool use, cola serial por canal, timeout duro y reintentos. **Acá convergen todos los canales** |
| `agent/llm.js` | Adapter multi-proveedor (Gemini, Groq, DeepSeek, OpenRouter, Ollama, Anthropic) |
| `agent/memory.js` | Historial por canal con ventana deslizante |
| `agent/handoff.js` | Derivación a humano. **Definitiva por defecto** — ver advertencias |
| `agent/buffer.js` | Agrupa mensajes seguidos (6 s). Con lista de excepciones que **no** esperan |
| `agent/metricas.js` | Una fila por turno. Nunca puede romper una respuesta |
| `lib/texto.js` | `dividirMensaje` compartido por todos los canales de envío |
| `whatsapp/webhook.js` | Webhook de Meta con validación de firma HMAC-SHA256, fail-closed en producción |
| `whatsapp/sender.js` | Envío por WhatsApp Cloud API + guarda de silencio |
| `telegram/enviar.js` | Envío por Telegram + guarda de silencio |
| `nixpacks.toml` | Build de Railway |
| `.gitignore` | Mantiene `.env` fuera del repo del cliente |
| `.env.example` | Variables del núcleo. `LLM_*` desde el día uno, nunca `ANTHROPIC_*` por defecto |
| `package.json` | Dependencias del núcleo. Nombre **fijo**: un marcador en `name` rompe `npm install` |
| `package.json.tpl` | Plantilla del `package.json` del cliente, con marcadores que sustituye el script |
| `scripts/humo.js` | Prueba de humo: arma el overlay y verifica que el núcleo enciende |

`railway.toml` **no** está en el núcleo a propósito: su `startCommand` decide el canal (`telegram/bot.js` vs `index.js`) y eso es decisión de cada cliente. Se genera desde `agente.config.json`.

### Qué hay en `ejemplo/`

`agent/prompts.js`, `agent/tools.js` (una tool de juguete), `database/supabase.js` (solo memoria), `index.js` y `telegram/bot.js`. Es lo mínimo para que el núcleo arranque y responda.

Existe por una razón concreta: los archivos del núcleo **no se pueden correr solos**. `agent/core.js` pide `./prompts` y `./tools`; `agent/memory.js` pide `../database/supabase`. Sin la semilla, "el núcleo funciona" sería una afirmación sin forma de comprobarla.

## Verificar el núcleo

```powershell
cd lineas\conversacional\plantillas\base-agente\nucleo
npm install
npm run humo
```

Arma núcleo + ejemplo en `.probar/` según `MANIFIESTO.json`, corre **41 verificaciones** y borra el temporal. **Cero tokens, sin credenciales, sin red**: el cliente LLM es un doble guionizado que se inyecta con `_setClienteParaTests`.

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

Como usa el mismo mecanismo de armado que el script de sincronización, valida el manifiesto **antes** de que se use contra un proyecto real.

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
3. **Escribir el producto** — acá va el tiempo:
   - `agent/prompts.js` — identidad, alcance y reglas del rubro.
   - `agent/tools.js` — las acciones del vertical. Validación de negocio **dentro** de la tool, nunca confiada al modelo. Tope duro de resultados.
   - `database/schema.sql` + el bloque de dominio de `database/supabase.js` — las tablas del rubro.
   - `scripts/test-chat.js` — los escenarios. CU-* del SPEC y ADV-* adversariales.
4. **Verificar en mock** — `npm test`. **Siempre 0 tokens, sin excepción.** El arnés no debe tener ninguna variable de entorno capaz de saltar a modelo real: ese bug ya existió una vez y viola la regla dura de cero efectos externos en QA.
5. **Deploy** (solo con aprobación de José): Railway, servicio propio, root directory = la carpeta del agente.

## Advertencias aprendidas (que costaron caro)

- **Para NO responder no basta con devolver `null`.** `whatsapp/sender.js` convertía un texto vacío en un POST fallido, y el `.catch` del webhook terminaba mandándole al cliente el mensaje de error genérico — justo cuando pidió hablar con una persona. Ya está resuelto en el núcleo con dos capas: el guarda en el **envío** (`sendMessage` y `enviarTelegram` cortan con `null`) y `lib/texto.js` devolviendo `[]` en vez de `['']`. Aplica a handoff humano, rate limit y ventana de 24h de WhatsApp.
- **Un buffer sin lista de excepciones es un bug esperando.** Cuando se agrupan mensajes hay que preguntarse **qué acción NO puede esperar**; la respuesta casi siempre incluye las acciones irreversibles: pedir un humano, cancelar, pagar. Si el cliente pide una persona y el proceso se reinicia durante la ventana, pidió ayuda y nadie se enteró. Por eso `handoff` está forzado en código como excepción y hay una verificación en el humo que falla si alguien lo saca.
- **La derivación a un humano es definitiva.** El default es `HANDOFF_TIMEOUT_MIN` vacío: el bot no vuelve solo. Reactivarlo tras 30 min de silencio suena razonable y es una regresión grave — el cliente descubre que la "persona" que le prometieron era un bot otra vez. Que vuelva es decisión del cliente, y hay que conversarla.
- **Nada de `unref()` en el timer del buffer.** La primera versión lo tenía "para no retrasar el apagado" y la prueba de humo murió en silencio: Node se va cuando solo quedan timers con `unref`, así que el grupo pendiente nunca se procesa. En producción eso es un mensaje de un cliente que se pierde sin dejar rastro.
- **La config del núcleo se lee en cada llamada, no al cargar el módulo.** Cuando eran `const` de arriba, el arnés cambiaba la variable, el núcleo seguía con el default, y dos verificaciones pasaron por el motivo equivocado. Si agregas una variable nueva, ponla como función.
- **Toda tabla nueva va prefijada por agente.** El proyecto Supabase se comparte entre agentes: una tabla sin prefijo cruza datos entre negocios distintos.
- **La lógica transversal va en `processMessage` de `core.js`, no en un canal.** Todos los canales convergen ahí. Anclarla en el webhook de WhatsApp cuando el agente despliega Telegram significa que no se ejecuta nunca.
- Dos bots de Telegram no pueden compartir token (conflicto 409): un bot de @BotFather por agente.
- Supabase: usar la key `service_role`; la `anon` da *permission denied* con RLS.
- Sin Supabase la base es en memoria y cada redeploy la borra. Para demo sirve; para producción no.
- La calidad del tool-calling varía entre proveedores: al cambiar `LLM_PROVIDER`, correr mock + una conversación real antes de dar por bueno el cambio.
