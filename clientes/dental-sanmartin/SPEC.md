# SPEC — Bot de agendamiento, Clínica Dental San Martín

Base: `agente-citas` extendida con **agenda por profesional** (la base calcula disponibilidad global; el pedido exige 3 doctores con agendas independientes).

## Datos del negocio (demo — el cliente valida/reemplaza)

- **Doctores** (supuesto, placeholder): Dra. Carolina Soto (odontología general), Dr. Andrés Miranda (endodoncia), Dra. Javiera Paz (odontopediatría).
- **Horario**: lunes a viernes 09:00–18:00, colación 13:00–14:00 (sin atención). Citas cada 30 min.
- **Servicios** (precios estándar de mercado, placeholder): Consulta general $25.000 (30m), Limpieza dental $45.000 (60m según servicio, el slot es de 30m), Blanqueamiento $120.000, Urgencia dental $35.000, Control $15.000.

## Casos de uso

- **CU-1 Catálogo**: "¿qué servicios tienen?" → lista servicios con precios desde `ver_catalogo`. Nunca inventa precios.
- **CU-2 Doctores**: "¿qué doctores atienden?" → lista los 3 con especialidad desde `ver_profesionales`.
- **CU-3 Disponibilidad general**: "¿tienen hora el martes?" → horas libres de LOS TRES doctores para esa fecha (el cliente elige).
- **CU-4 Disponibilidad por doctor**: "¿cuándo puede la Dra. Soto?" → horas libres solo de ella.
- **CU-5 Agendar**: con nombre + servicio + doctor + fecha + hora confirmados → `agendar_cita` y confirmación. Si falta el doctor, el bot lo pregunta (u ofrece el que tenga hora). Doble "confirmo" NO duplica la cita.
- **CU-6 Mis horas**: "¿cuándo era mi hora?" → `mis_citas` con doctor incluido.
- **CU-7 Cancelar**: cancela la cita correcta; con varias citas pide elegir cuál.
- **CU-8 Reagendar**: verifica la hora nueva ANTES de cancelar la actual.
- **CU-9 Horarios**: "¿a qué hora abren?" → L-V 09:00–18:00 (colación 13–14), fin de semana cerrado.
- **CU-10 Fuera de alcance**: pagos, presupuestos por WhatsApp, conversación general → redirige en una línea. Dolor agudo/urgencia → derivar a llamar a la clínica de inmediato, no agendar a semanas.

## Adversariales (QA obligatorio)

- **ADV-1**: pedir hora en fecha pasada o día cerrado (domingo) → rechazo claro, ofrece alternativa.
- **ADV-2**: cliente confundido que cambia de fecha/doctor 2 veces → no se crean citas fantasma; queda solo la última confirmada.
- **ADV-3**: doctor inexistente ("con el Dr. Pérez") → informa doctores reales, no inventa.
- **ADV-4**: hora ocupada del Dr. X pero libre del Dr. Y → no agenda con X; ofrece la alternativa real.

## Cambios técnicos respecto de la base

1. Tabla/seed `profesionales` (+ columna `profesional` en `citas`) — memoria y schema.sql.
2. `consultar_disponibilidad(fecha, profesional?)`: por doctor; sin doctor → mapa de los 3. Excluye colación 13:00–14:00.
3. `agendar_cita` exige `profesional` (resolución tolerante por nombre o especialidad, como `resolverServicio`).
4. Tool nueva `ver_profesionales`. `mis_citas`/`cancelar_cita` muestran doctor.
5. `agent/llm.js` → adapter multi-proveedor de la fábrica. Runtime: Gemini free tier (pool).
6. `telegram/bot.js`: guard de arranque acepta `LLM_PROVIDER` + `LLM_API_KEY` (no solo `ANTHROPIC_API_KEY`); saludo con nombre de la clínica.
7. `SLOT_MINUTOS=30`. Sin sábado en horarios.

## Fuera de alcance v1

Recordatorios automáticos, pagos, previsiones/convenios (solo informativo), integración con software dental, multi-sucursal.

## Política de tests

`npm test` y `npm run telegram:mock` corren SIEMPRE en mock (sin `ANTHROPIC_API_KEY` en .env nunca gastan). La validación con modelo real la hace José conversando por Telegram (`npm run telegram`), que usa Gemini free tier — costo $0.
