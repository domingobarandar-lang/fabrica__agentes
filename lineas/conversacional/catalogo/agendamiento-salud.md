# Vertical: Agendamiento salud (clínicas dentales, consultas, kine, estética)

**Base a clonar**: `chaski-agentes/agente-citas` (es exactamente este caso).

## Qué vende

Bot de WhatsApp/Telegram que agenda, confirma, reagenda y cancela horas 24/7. El dolor del cliente: la secretaria no da abasto, se pierden pacientes que escriben fuera de horario, hay horas muertas por inasistencias.

## Tools típicas

- `consultar_disponibilidad(profesional?, fecha?)` — horas libres
- `agendar_hora(paciente, telefono, profesional, fecha, hora, motivo)`
- `cancelar_hora(...)` / `reagendar_hora(...)`
- `info_clinica()` — dirección, horarios, previsiones/convenios, precios de consulta

## Datos

Tablas: profesionales (nombre, especialidad, horario), citas (paciente, teléfono, fecha/hora, estado), config del negocio. Semilla demo: 2-3 doctores con nombres chilenos, agenda lunes-viernes con algunos cupos ya tomados.

## Personalización clave (prompts.js)

- Tono cálido pero eficiente; tratar de "usted" por defecto en salud.
- NUNCA inventar disponibilidad: solo ofrecer lo que devuelve la tool.
- Pedir motivo de consulta (permite estimar duración) y confirmar todo antes de agendar.
- Urgencias/dolor agudo → derivar a llamada telefónica directa, no agendar a 2 semanas.

## QA mínimo

Agendar feliz, reagendar, cancelar, pedir hora inexistente, paciente confundido que cambia de fecha 2 veces, pregunta de precios/previsión.

## Extras vendibles (v2, no en v1)

Recordatorio 24h antes (reduce inasistencias — el argumento de venta más fuerte del rubro), confirmación post-cita, lista de espera para cupos liberados.
