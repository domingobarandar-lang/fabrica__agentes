# Gesta Inmobiliaria

Corredora de propiedades. Región Metropolitana.

## Proyectos

| Proyecto | Qué es | Estado |
|---|---|---|
| `bot-sofia` | Sofía, agente conversacional de WhatsApp | Construido y probado en mock. Falta credenciales y deploy |

## Contactos

| Rol | Nombre | Contacto |
|---|---|---|
| Socio de la fábrica | José | jose.baranda.r@csi.cl |
| Ejecutiva que recibe los avisos | _por definir_ | WhatsApp _pendiente_ |

**La key de Gemini no se anotó en el pool** (`secrets/`): no salió de ahí, la entregó José directo para este cliente. Vive únicamente en `entregables/gesta-inmobiliaria/bot-sofia/agente/.env`, que el `.gitignore` excluye. Al mover el proyecto a su carpeta definitiva, el `.env` se mueve con él y no se versiona.

## Credenciales asignadas

**Solo nombres. Ningún valor vive en este archivo ni en este repo.**

| Para qué | Variable | Estado |
|---|---|---|
| Modelo de lenguaje | `LLM_API_KEY` (Gemini) | ✅ **asignada por José el 2026-09-16**. Vive solo en el `.env` del proyecto. Modelo: `gemini-3.5-flash` (probado conversando) |
| WhatsApp Business | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | ⏳ pendiente |
| Firma del webhook | `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | ⏳ pendiente |
| Base de datos | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | ⏳ pendiente (sin esto todo queda en memoria) |
| Planilla de propiedades | `PLANILLA_URL` | ⏳ pendiente — el id de la hoja de Google, compartida "con el enlace" |
| WhatsApp de la corredora | `handoff.inbox` en `agente.config.json` | ⏳ pendiente — **sin esto los informes no se envían** |

## Qué contrató

Un agente de WhatsApp que atiende dos entradas: consultas por propiedades publicadas
(ficha, requisitos y agendamiento de visita) y propietarios que quieren vender o
arrendar con Gesta. Cada conversación termina con un informe al WhatsApp de la
corredora, con un botón para escribirle a la persona.

Las propiedades salen de la planilla de Google que la corredora ya mantiene: se edita
la planilla y Sofía cambia lo que dice, sin tocar código.
