# BRIEF — Sofía, agente de Gesta Inmobiliaria

**Pedido de**: José · **Fecha**: 2026-09-16 · **Línea**: conversacional · **Canal**: WhatsApp

## Lo que pidió el cliente, en sus términos

Un agente para la corredora **Gesta Inmobiliaria**, llamado **Sofía**, que atienda
por WhatsApp. Dos reglas de entrada, y son las que mandan:

1. **Nunca inventar** información que no esté en su base de datos o fuera de su alcance.
2. Si le falta información, o la pregunta se le sale de las manos, **deriva a una ejecutiva**.

## Cómo tiene que funcionar

- **Base de datos**: una planilla de Google Drive con las propiedades.
- **Modelo**: la API de Gemini.
- **Derivación**: al WhatsApp de la corredora, que es un **número distinto** al del bot.
- **Ventana de 24 h**: la corredora le escribe "hola" al bot cada mañana para abrirla.

### Camino 1 — llega por una propiedad publicada
El mensaje predeterminado del aviso es *"Hola, me interesó la propiedad en ..."* con la
dirección y el número. Sofía saluda y ofrece **tres botones**:

| Botón | Qué hace |
|---|---|
| Ver información de la propiedad | Entrega lo que dice la planilla, **y nada más** |
| Requisitos | **Solo si esa propiedad tiene requisitos cargados**; si no, el botón no aparece |
| Agendar una hora | Pide **dos** posibles fechas y avisa que la corredora se contactará |

Al terminar cualquiera de los tres caminos se ofrece **hablar con una ejecutiva**.
No aparece en el primer menú cuando hay requisitos: WhatsApp no acepta más de tres
botones por mensaje.

Después de agendar una visita, **Sofía no responde más** en ese chat.

### Camino 2 — es un propietario que quiere vender o arrendar con Gesta
Mensaje de entrada: *"Hola, estoy interesado en vender o arrendar mi propiedad con
ustedes. ¿Me podrías ayudar?"*. Sofía responde que sí, con cariño, y hace un
cuestionario:

1. **"¿Tu propiedad está en la Región Metropolitana?"** con botones **Sí** / **No**.
2. **No** → le dice cordialmente que su propiedad no está hábil para trabajar con Gesta.
3. **Sí** → le pide datos de la propiedad con ejemplos (metros cuadrados, dónde queda,
   qué tipo es, lo que le sirva a la corredora).
4. Al cerrar, avisa que la corredora se va a contactar.

### En los dos caminos
Al terminar, a la corredora le llega un **mini-informe** por WhatsApp: qué se habló, por
qué llegó ese cliente, su número, y un **botón "Escribirle"** que abre el chat con esa
persona desde el número de la corredora.

## Formato de la ficha
En el orden de la planilla: tipo, precio, metros, dormitorios, baños, y después la
sección de datos extra con el link pegado. Los requisitos van **aparte**, en su botón.

## Lo que se pidió de la entrega
Crear el agente y una demo. **Sin gastar API afuera**: probarlo con recursos locales,
sin Gemini, sin Supabase. Después informar si pasa los tests, probando con
*"hola, me gustó la propiedad"* + una propiedad que esté en la planilla.

## Lo que todavía NO se entregó
Las credenciales: API de Gemini, Supabase, token de WhatsApp Business y el número de
WhatsApp de la corredora. Nada de eso bloquea construir ni probar; sí bloquea el deploy.
