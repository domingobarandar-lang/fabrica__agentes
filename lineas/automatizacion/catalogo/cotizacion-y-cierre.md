# Producto 2: Cotización y cierre — "la cotización que se persigue sola"

**Pieza que necesita**: base **+ reloj** (seguimiento por tiempo) + una maquinita que arma la propuesta desde plantilla. La **oreja** es opcional (si se quiere capturar la respuesta del cliente para mover el estado). El reloj se construye una vez y lo reusa el producto 3.

## Qué vende

Que ninguna cotización se pierda por olvido. Captura la solicitud, arma la propuesta desde plantilla, la envía, y **hace el seguimiento sola**. El dueño ve cuántas cotizaciones están sin respuesta y cuánta plata representan.

## Objeto y estados

- **Objeto**: la solicitud de cotización.
- **Estados**: `solicitada → visitada o calculada → enviada → en seguimiento → aceptada o perdida`.
- **Quién marca**: el negocio marca solicitada/calculada/enviada; el **reloj** dispara el seguimiento; el cliente (o el negocio) marca aceptada/perdida.

## Automatización

- Captura la solicitud y agenda la visita o calcula.
- Arma la propuesta desde una plantilla del rubro.
- **Reloj**: seguimiento automático a los **2 y a los 5 días** si no hay respuesta (a través del cortafuegos).
- El **dueño** ve las cotizaciones sin respuesta y el monto total en juego.

## Rubros

Mudanzas, banquetería, wedding planner, eventos, fotografía.

## Reemplaza

Cotizaciones en Word que salen tarde y que nadie vuelve a mirar.

## QA mínimo (cero efectos externos)

Flujo feliz hasta aceptada, seguimiento del reloj a los 2/5 días con emisor **simulado**, cotización sin respuesta que aparece en el panel con su monto, cotización marcada aceptada que **deja** de perseguirse, transición repetida que no reenvía dos veces.

## Extras (v2, no en v1)

Firma/aceptación por link, plantillas por tipo de evento, informe semanal de cierre (ver V3).
