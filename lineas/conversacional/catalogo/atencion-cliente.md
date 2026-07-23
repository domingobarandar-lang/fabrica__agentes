# Vertical: Atención al cliente digital (FAQ + derivación, cualquier rubro)

**Base a clonar**: `chaski-agentes/agente-citas` recortado (mismo loop, tools de consulta + derivación; sin agenda) — o `agente-retail` si además hay catálogo.

## Qué vende

Primera línea de atención 24/7 en WhatsApp/Telegram/web: responde lo repetitivo (horarios, precios, estado de un trámite/pedido, políticas) y deriva a humano lo que no puede resolver, con el contexto ya recopilado. Dolor: el 80% de los mensajes son las mismas 15 preguntas.

## Tools típicas

- `buscar_respuesta(tema)` — sobre base de conocimiento del negocio (tabla FAQ)
- `estado_solicitud(numero_o_rut)` — si el negocio tiene algo consultable
- `derivar_a_humano(resumen, urgencia)` — registra ticket con el contexto de la conversación
- `dejar_recado(nombre, telefono, mensaje)`

## Datos

Tablas: faq (tema, pregunta, respuesta), tickets/derivaciones, config. La semilla ES el producto acá: levantar las 15-20 preguntas reales del negocio con sus respuestas exactas (pedírselas al cliente en el intake).

## Personalización clave

- Regla de oro: si la respuesta no está en la base de conocimiento, NO se inventa — se deriva con gracia.
- Umbral de derivación explícito: cliente enojado, palabra "reclamo", 2 intentos fallidos de entender → humano.
- El resumen de derivación es el valor: el humano llega con nombre, tema e historial, no parte de cero.
- Horario de humanos configurado: fuera de horario, tomar recado y decir cuándo contestarán.

## QA mínimo

FAQ directa, pregunta fuera de la base (debe derivar, no inventar), cliente enojado (derivación inmediata), recado fuera de horario, dos preguntas encadenadas.

## Extras vendibles

Reporte mensual de preguntas sin respuesta (para ampliar la base), encuesta de satisfacción de 1 pregunta, widget web además de WhatsApp.
