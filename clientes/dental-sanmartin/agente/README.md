# Agente de Citas — WhatsApp (demo/MVP)

Chatbot de WhatsApp **genérico** para negocios que agendan horas: dentistas, restaurantes, peluquerías, consultas, etc. Basado en la estructura del contestador de Gesta, simplificado como producto de prueba.

**Alcance limitado por diseño** (no habla en nombre de ninguna empresa):

1. Mostrar el catálogo de servicios
2. Consultar horas disponibles
3. Agendar una hora
4. Cancelar una hora

Cualquier otra petición la rechaza amablemente.

## Stack

- **Node.js + Express** — webhook de Meta WhatsApp Cloud API
- **Claude (claude-haiku-4-5-20251001) vía la API de Anthropic** (`agent/llm.js`, cliente sobre el SDK oficial `@anthropic-ai/sdk`)
- **Supabase** — historial, catálogo, horarios y citas (`database/schema.sql`)

## Estructura

```
agente-citas/
├── index.js               # Servidor Express + salud + arranque
├── whatsapp/
│   ├── webhook.js         # GET verify + POST mensajes (firma de Meta validada)
│   └── sender.js          # Envío vía Graph API (o consola en modo demo)
├── telegram/
│   └── bot.js             # Bot de Telegram (polling) — o modo mock sin token
├── agent/
│   ├── core.js            # Loop agéntico: historial → Claude → tools → respuesta
│   ├── prompts.js         # System prompt genérico (sin marca)
│   ├── tools.js           # ver_catalogo / consultar_disponibilidad / agendar_cita / cancelar_cita
│   └── memory.js          # Historial por teléfono (ventana de 30 mensajes)
├── database/
│   ├── supabase.js        # CRUD + fallback en memoria si no hay credenciales
│   └── schema.sql         # Tablas + datos de ejemplo
└── scripts/chat-local.js  # Chat por consola sin WhatsApp
```

## Probar en 2 minutos (sin WhatsApp ni Supabase)

```bash
cd agente-citas
npm install
copy .env.example .env      # y pegar tu ANTHROPIC_API_KEY
npm run chat
```

Sin credenciales de Supabase el agente usa una base **en memoria** con un catálogo demo (servicios dentales + mesas de restaurante) y horario L-V 09:00-19:00, sábado 10:00-14:00.

Ejemplos para probar:

- "Hola, ¿qué servicios tienen?"
- "Quiero una hora para limpieza dental mañana"
- "¿Qué horas tienen el viernes?"
- "Cancela mi hora"

## Conectar Supabase

1. Crear un proyecto en Supabase.
2. Ejecutar `database/schema.sql` en el **SQL Editor** (crea tablas + datos demo).
3. En `.env`: `SUPABASE_URL` y `SUPABASE_KEY` con la clave **service_role** (⚠️ la clave `anon` da *permission denied*).
4. Editar el catálogo y los horarios directamente en las tablas `catalogo` y `horarios` según el negocio.

## Conectar Telegram (gratis — ideal para demos)

Telegram no exige cuenta de empresa ni verificación de Meta: el bot se crea en 1 minuto y es gratis.

1. En Telegram, abrir un chat con **@BotFather** (el bot oficial, con check azul).
2. Enviar `/newbot`; te pedirá un nombre visible (ej: *Agente de Citas Demo*) y un username terminado en `bot` (ej: `agente_citas_demo_bot`).
3. BotFather responde con el **token** (formato `123456789:AAF...`). Copiarlo a `.env`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:AAF...
   ```
4. Arrancar el bot (usa *polling*, no necesita webhook ni dominio público):
   ```bash
   npm run telegram
   ```
5. Buscar el bot por su username en Telegram, apretar **Start** y conversar.

Notas:

- Requiere `ANTHROPIC_API_KEY` en `.env` (el agente es el mismo que en WhatsApp; solo cambia el canal).
- El formato `*negrita*` que ya usa el agente funciona igual en Telegram.
- **Modo mock** (sin token de Telegram y sin API de Anthropic): `npm run telegram:mock` simula 3 conversaciones de demostración por consola — útil para verificar el flujo completo sin ninguna credencial.

## Conectar WhatsApp (cuando toque, no ahora)

1. App en [Meta for Developers](https://developers.facebook.com) con producto WhatsApp.
2. En `.env`: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN` (lo inventas tú), `WHATSAPP_APP_SECRET`.
3. Desplegar (Railway u otro) y configurar el webhook en Meta: URL `https://tu-dominio/webhook`, verify token igual al del `.env`, suscrito al campo `messages`.

Mientras `WHATSAPP_TOKEN` esté vacío, los mensajes salientes se imprimen por consola (modo demo).

## Adaptarlo a un rubro

- **Catálogo y horarios**: tablas `catalogo` y `horarios` (o el seed en `database/supabase.js` para el modo memoria).
- **Duración de bloques**: `SLOT_MINUTOS` en `.env` (default 60).
- **Tono/reglas**: `agent/prompts.js`.
