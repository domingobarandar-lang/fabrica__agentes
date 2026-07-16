# Brief — Clínica Dental San Martín

**Fecha**: 2026-07-13
**Estado**: Intake

## Pedido original (palabras de José/cliente)

> "clínica dental San Martín necesita un bot de WhatsApp para agendar horas, 3 doctores, lunes a viernes"

## Lectura de la fábrica

- **Vertical del catálogo**: agendamiento-salud
- **Base a clonar**: agente-citas (calza exacto: reservas de horas para dentista)
- **Canal demo**: Telegram / **Canal producción**: WhatsApp
- **Datos que maneja**: 3 doctores con agenda lunes a viernes, citas de pacientes
- **Presupuesto conocido**: no informado
- **LLM runtime propuesto**: Gemini free tier (key del pool de la fábrica) — $0 para demo

## Preguntas abiertas

Ninguna bloqueante. Supuestos tomados (a validar con el cliente en la demo):
- Especialidades: se asume general + endodoncia + odontopediatría (mix típico de clínica chica).
- Horario: L-V 9:00–18:00 con colación 13:00–14:00, citas de 30 min.
- Sin previsión/convenios en v1 (solo informativo).

## Fuera de alcance v1

- Recordatorios automáticos 24h antes (upsell v2)
- Pagos / reserva con abono
- Integración con software dental existente
