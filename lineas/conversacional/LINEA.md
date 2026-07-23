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
- **Base a clonar**: `agente-citas` (agendar) o `agente-retail` (catálogo/pedidos).

## Plantillas

- `plantillas/base-agente/` — adapter LLM multi-proveedor + guía de instanciación. Se clona desde `C:\Users\Adela\chaski-agentes\`.

## Pipeline y DoD

Sigue el pipeline común de `docs/PIPELINE.md`. DoD de build: `npm run telegram:mock` corre en verde con conversaciones del vertical, cero efectos externos. DoD de QA: escenarios del SPEC + adversariales en verde, en modo MOCK.
