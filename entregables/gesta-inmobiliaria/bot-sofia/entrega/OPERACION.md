# Manual de operación — Sofía

## Todos los días

**Mándale un "hola" a Sofía desde el número de la corredora, en la mañana.**

WhatsApp solo deja que la gente le escriba libremente a un número durante 24 horas
después de que ese número tuvo actividad. Ese "hola" abre la ventana. Sofía responde
con un resumen y no te trata como cliente: reconoce tu número.

## Cambiar lo que Sofía dice

Todo está en **la planilla de propiedades**. Sofía la relee sola cada 15 minutos.

| Quiero... | Hago esto |
|---|---|
| Cambiar un precio | Lo edito en la columna `Precio`. Se escribe **con la moneda**: `5000 UF` o `320000 CLP` |
| Sacar una propiedad | Pongo `NO` en la columna `Activa`. Deja de mostrarse al toque |
| Cargar los requisitos de un arriendo | Los escribo en la columna de requisitos. Ahí aparece el botón "Requisitos" |
| Agregar una propiedad | Una fila nueva. Lo importante: `Link`, `Precio` con moneda, `Direccion`, `Comuna` y `Activa = SI` |

**Si no se entiende un dato, Sofía no lo muestra.** Un precio que dice solo `14`, sin UF
ni CLP, no se puede adivinar, así que esa propiedad sale sin precio. No es un error del
sistema: es la regla de no inventar.

Para ver qué celdas están así: `npm run datos` en la carpeta del agente. Sale la lista
con el número de fila.

## Comandos desde el número de la corredora

| Escribo | Pasa esto |
|---|---|
| `estado` | Cuántas propiedades hay publicadas y de dónde las está leyendo |
| `liberar 56912345678` | Sofía vuelve a atender a esa persona |
| `atender 56912345678` | Sofía deja de responderle a esa persona: el chat es tuyo |

**`liberar` es el importante.** Cuando alguien agenda una visita, o pide hablar con una
ejecutiva, Sofía **se calla para siempre** en ese chat — a propósito, para no hablar por
encima de ustedes. Si tres meses después esa misma persona escribe por otra propiedad,
Sofía no le va a contestar hasta que uses `liberar`.

## El informe de cada contacto

Cada vez que una conversación pasa a manos de una persona, al WhatsApp de la corredora
le llega un mensaje con:

- por qué escribió (una visita, una captación, o pidió hablar con alguien),
- su número de teléfono,
- de qué propiedad se trataba,
- las dos opciones de día que dio, si agendó,
- y las últimas líneas de lo que se habló.

Abajo hay un botón **Escribirle**: abre el chat de WhatsApp con esa persona, desde el
número de la corredora. Los dos números son distintos a propósito — el de Sofía atiende,
el de ustedes cierra.

## Cuando algo no anda

| Se ve así | Es esto |
|---|---|
| Sofía no contesta a nadie | Se cayó el servicio, o venció la ventana de 24 h: manda el "hola" |
| Sofía no contesta **a una persona** | Ese chat está derivado. `liberar <número>` |
| Una propiedad no aparece | `Activa` no dice `SI`, o la fila no tiene link |
| Sale sin precio o sin gastos comunes | La celda no trae la moneda. `npm run datos` dice cuál |
| No llegan los informes | Falta el WhatsApp de la corredora en la configuración (`handoff.inbox`) |

## Lo que Sofía no hace, y no es una falla

- No confirma día y hora de una visita: toma dos opciones y avisa. Confirma la ejecutiva.
- No habla de comisiones, créditos, subsidios ni tasaciones: deriva.
- No ofrece "una parecida" cuando la propiedad que preguntan no está publicada.
- No manda fotos dentro del chat: manda el link de la publicación.
