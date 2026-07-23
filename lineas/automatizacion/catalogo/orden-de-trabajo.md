# Producto 1: Orden de trabajo — "¿ya está listo lo mío?"

**Pieza que necesita**: solo la **base pelada** (una persona del negocio marca el avance). Sin reloj, sin oreja. Es el producto más barato y la **cuña más angosta** de la fábrica: si esto solo no se vende, los otros dos tampoco.

## Qué vende

Que el cliente final deje de llamar para preguntar "¿ya está listo?". El negocio marca el avance del trabajo; el cliente recibe un WhatsApp en cada cambio de estado, sin que nadie levante el teléfono. El dueño ve un tablero con lo pendiente y lo atrasado.

## Objeto y estados

- **Objeto**: la orden (un auto, unas prendas, unos lentes, una sesión de fotos, una visita de fumigación).
- **Estados**: `recibido → en proceso → listo → entregado`.
- **Quién marca**: una persona del negocio, a mano, desde el panel.

## Automatización

- Cada cambio de estado dispara un aviso al **cliente final** por WhatsApp (a través del cortafuegos).
- El **dueño** ve un panel con las órdenes por estado, y cuáles llevan mucho tiempo sin avanzar (atrasadas).

## Rubros

Taller automotriz, lavandería, óptica, fotografía, control de plagas, reparaciones en general.

## Reemplaza

El cuaderno, la planilla y el teléfono sonando todo el día.

## QA mínimo (cero efectos externos)

Avance feliz `recibido→...→entregado` con su aviso en cada paso (emisor **simulado**), transición imposible (saltar de recibido a entregado), orden sin teléfono de cliente, transición repetida que **no** debe avisar dos veces, orden atrasada que aparece marcada en el panel.

## Extras (v2, no en v1)

Aviso de "pasa a retirar" con horario, encuesta de satisfacción post-entrega, informe semanal al dueño (ver V3).
