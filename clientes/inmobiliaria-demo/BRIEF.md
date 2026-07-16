# Brief — Inmobiliaria (producto demo, cliente sin nombre aún)

**Fecha**: 2026-07-14
**Estado**: Intake

## Pedido original (palabras de José/cliente)

> "una inmobiliaria necesita un chatbot, para agendar horas solo lunes, miercoles y jueves de 11 a 2. ademas necesita calificar leads, y atencion al cliente en general, tu diseña el producto"

Instrucción operativa de José para esta entrega: **no** registrar el agente como subagente en `.claude/agents` — solo construirlo y dejarlo conversable **por terminal**.

## Lectura de la fábrica

- **Vertical del catálogo**: inmobiliaria
- **Base a clonar**: agente-citas (visitas = citas) + tools de catálogo de propiedades según `catalogo/inmobiliaria.md`
- **Canal demo**: **terminal** (`npm run chat`, pedido explícito de José) / **Canal producción**: WhatsApp (o Telegram, a definir con el cliente)
- **Datos que maneja**: propiedades (semilla demo 6–8), visitas (solo lunes, miércoles y jueves 11:00–14:00), leads con calificación (frío/tibio/caliente)
- **Presupuesto conocido**: no informado
- **LLM runtime propuesto**: Gemini 2.0 Flash free tier (key del pool de la fábrica) vía adapter — $0 para demo

## Preguntas abiertas

Ninguna bloqueante. Supuestos tomados (a validar con el cliente en la demo):

- "de 11 a 2" = 11:00 a 14:00 (uso chileno habitual).
- Visitas de 30 minutos por slot (6 slots por día hábil de visita).
- Corredora genérica "demo" con mix de venta y arriendo en comunas de Santiago; requisitos de arriendo chilenos estándar (renta 3x, contrato vigente, aval opcional).
- Calificación de leads: capturar nombre y teléfono temprano + operación, comuna, presupuesto y urgencia; score frío/tibio/caliente para el corredor.

## Fuera de alcance v1

- Canal WhatsApp/Telegram real (la demo es por terminal; producción se decide con el cliente).
- Integración con planilla o CRM real de la corredora.
- Aviso automático al corredor por lead caliente y resumen semanal (extras vendibles v2).
- Pagos, reservas con abono, firma de documentos.
