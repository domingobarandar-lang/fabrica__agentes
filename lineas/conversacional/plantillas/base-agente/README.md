# Plantilla base — cómo instanciar un agente nuevo

La base de todo agente es `C:\Users\Adela\chaski-agentes\` (probada: 13/13 y 24/24 escenarios en verde). Nunca se edita esa carpeta directamente — se clona.

## Pasos (fase Build del pipeline)

1. **Clonar la base** según vertical (`<RUTA_PROYECTO>` = la carpeta externa del proyecto que te pasó el orquestador; nunca dentro del repo de la fábrica):
   ```powershell
   # agendamiento (dental, inmobiliaria, servicios):
   robocopy C:\Users\Adela\chaski-agentes\agente-citas <RUTA_PROYECTO>\agente /E /XD node_modules /XF .env
   # catálogo/pedidos (petshop, abarrotes, retail):
   robocopy C:\Users\Adela\chaski-agentes\agente-retail <RUTA_PROYECTO>\agente /E /XD node_modules /XF .env
   ```

2. **Independizar el LLM**: copiar `lineas/conversacional/plantillas/base-agente/llm.js` sobre `agente/agent/llm.js` y agregar a `.env.example`:
   ```
   LLM_PROVIDER=gemini          # anthropic | groq | deepseek | gemini | openrouter | ollama | openai-compat
   LLM_API_KEY=
   LLM_MODEL=gemini-2.0-flash
   # LLM_BASE_URL=              # solo para openai-compat
   ```
   El adapter es drop-in: `core.js` no se toca, y sin `LLM_PROVIDER` se comporta igual que antes (Anthropic).

3. **Personalizar** (esto ES el producto — dedicarle el tiempo aquí):
   - `agent/prompts.js` — nombre del negocio, personalidad, horarios, reglas del rubro.
   - `agent/tools.js` — acciones del vertical (ver catálogo/ para las típicas de cada rubro).
   - `database/schema.sql` — tablas + datos semilla de demo con datos verosímiles del cliente.
   - `telegram/bot.js` y `whatsapp/sender.js` — textos de bienvenida/error si aplica.

4. **Verificar en mock** (0 tokens): `npm install` y `npm run telegram:mock`. Después `npm test`.

5. **Deploy** (solo tras aprobación de José): Railway, servicio independiente, root directory = la carpeta del agente. Variables según README de chaski + las `LLM_*` de arriba.

## Advertencias aprendidas (de chaski)

- Dos bots de Telegram no pueden compartir token (conflicto 409) — un bot de @BotFather por agente.
- Supabase: usar la key `service_role`, la `anon` da *permission denied* con RLS.
- Sin Supabase la base es en memoria: cada redeploy borra citas/pedidos. Para demo está bien; para producción no.
- La calidad del tool-calling varía entre proveedores: al cambiar `LLM_PROVIDER`, correr mock + 1 conversación real antes de dar por bueno el cambio.
