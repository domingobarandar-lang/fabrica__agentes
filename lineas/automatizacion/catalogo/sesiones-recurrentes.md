# Producto 3: Sesiones recurrentes y asistencia — "el ciclo que se renueva a tiempo"

**Pieza que necesita**: base **+ reloj** (recordatorio 24h antes) **+ oreja** (el cliente confirma por WhatsApp y eso mueve el estado). Es el producto más completo: usa las dos piezas. **La renovación es donde está la plata**, y es lo que hoy se pierde por olvido.

## Qué vende

Que un paquete de sesiones se confirme, se cumpla y **se renueve a tiempo**, sin que el dueño lleve la cuenta en la cabeza. Recordatorios automáticos, confirmación por respuesta del cliente, y alerta al dueño cuando un ciclo está por vencer.

## Objeto y estados

- **Objeto**: el ciclo de sesiones (un paquete de 10 clases, un plan de 3 meses).
- **Estados por sesión**: `agendada → confirmada → asistió o faltó → reagendada`.
- **Estados por ciclo**: `activo → por vencer → renovado o perdido`.
- **Quién marca**: el **reloj** dispara el recordatorio; la **oreja** captura la confirmación del cliente; el negocio marca asistió/faltó; el reloj marca "por vencer".

## Automatización

- **Reloj**: recordatorio **24h antes** de cada sesión (a través del cortafuegos).
- **Oreja**: el cliente responde "sí voy" y el sistema pasa la sesión a `confirmada`; si pide otra hora, la reagenda.
- Alerta al **dueño** cuando un ciclo entra en `por vencer`, para gatillar la renovación.

## Rubros

Nutrición, escuelas de idiomas, kinesiología, entrenamiento personal, psicología.

## Reemplaza

La agenda en papel, las inasistencias sin control, y las renovaciones que se caen solas por olvido.

## QA mínimo (cero efectos externos)

Recordatorio 24h con emisor **simulado**, confirmación por respuesta que mueve el estado (oreja), inasistencia registrada, ciclo que entra en `por vencer` y alerta al dueño, recordatorio repetido que no avisa dos veces, cliente que reagenda dos veces sin romper el estado.

## Extras (v2, no en v1)

Lista de espera para cupos liberados, reporte de asistencia por cliente, oferta de renovación automática al entrar en `por vencer`.
