# Línea conversacional — agentes que conversan

La línea original de la fábrica. Bots que conversan con el cliente final por WhatsApp/Telegram/web: agendan, responden catálogo, contestan preguntas repetidas. Es la línea **con clientes pagando hoy**.

## Qué vende

Un bot que atiende 24/7 el canal donde le escriben al negocio. Reemplaza a la secretaria que no da abasto y a los mensajes perdidos fuera de horario. Verticales en `catalogo/`.

## Cuándo entra un pedido acá (fase 0)

Cuando el valor central es **una conversación**: contestar, agendar hablando, responder por catálogo. Si además hay un objeto que avanza por estados con avisos, probablemente es automatización (ver `../automatizacion/LINEA.md`); si el pedido quiere las dos, el bot es el canal y la automatización el motor, pero se rutea a la línea que puede entregar hoy (ver `docs/PIPELINE.md` → desempate).

## Campos de intake propios (además del núcleo del BRIEF)

- **Vertical del catálogo** más cercano (o "nuevo" → puerta a medida).
- **Canal**: dónde le escriben los clientes hoy (casi siempre WhatsApp).
- **Volumen** aproximado de mensajes al día (define el proveedor LLM).
- **Datos que maneja**: doctores/horarios, propiedades, catálogo/stock, o las 15 preguntas de siempre.
- **Conversaciones reales**: ¿puede exportar el WhatsApp del negocio? Con 200 conversaciones alcanza. **Es el campo de intake que más sube la calidad del agente y no cuesta nada** — de ahí salen las preguntas que de verdad le hacen, las palabras del negocio y los escenarios de QA (ver `docs/CALIDAD-CONVERSACIONAL.md`, P6). Si no las tiene, el pedido sigue igual, pero queda anotado que el SPEC es inventado y no observado.
- **Cómo escribe hoy quien atiende**: ¿tutea o trata de usted? ¿manda audios? ¿usa emojis? Va a `identidad.tono`; la forma (largo, sin Markdown, una pregunta por mensaje) la pone el núcleo y no se negocia por cliente.
- **Qué datos necesita juntar** de cada persona (nombre, teléfono, qué busca) → `lead.campos`.

## Plantillas

- `plantillas/base-agente/` — **es la base, no un puntero a otra parte**: `nucleo/` (loop agéntico, adapter LLM multi-proveedor, memoria, handoff, buffer, métricas, configuración, conocimiento, flujo multi-agente, contrato de forma y arnés de evals) + `ejemplo/` (semilla que arranca y responde). Se instancia con `nuevo-proyecto.ps1` y se verifica sola con `npm run humo`. La ruta `C:\Users\Adela\chaski-agentes\` que figuraba acá **no existe desde el 2026-07-31** (ver `docs/DECISIONES.md`).

## Pipeline y DoD

Sigue el pipeline común de `docs/PIPELINE.md`. DoD de build: `npm test` en verde con los escenarios del vertical y `npm run entrega` sin bloqueos, cero efectos externos. DoD de QA: escenarios del SPEC + adversariales en verde, con los 13 invariantes del núcleo corriendo (los 5 de forma incluidos).

## Calidad conversacional

Qué hace que un agente se sienta fluido y atienda bien —y qué le falta a esta línea para llegar al nivel de las plataformas grandes— está en [docs/CALIDAD-CONVERSACIONAL.md](../../docs/CALIDAD-CONVERSACIONAL.md): siete palancas, el plan por pasos y lo que se decidió NO copiar.
