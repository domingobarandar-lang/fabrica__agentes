# Brief — Rondas QR (control de rondas de guardias en condominios)

**Fecha**: 2026-07-16
**Estado**: Intake

## Pedido original (palabras de José/cliente)

> Para los guardias de un condominio, que hoy usan un sistema para que el administrador vea si están haciendo las rondas de seguridad. Hoy: en cada sector del condominio hay una chapita (botón físico tipo iButton), el guardia la marca con una maquinita, y el administrador después conecta la maquinita al computador para ver cuántas chapitas marcó. Quiero una app que, en vez de chapitas, use QR, y en vez de maquinita, el teléfono. Que la app tenga la ronda descargada de cada condominio, usuarios de los guardias, y que ahí vayan marcando los QR. Y que genere un informe a cada administrador después de cada ronda, y que avise si se saltó algún punto.

## Lectura de la fábrica

- **Vertical del catálogo**: nueva — `rondas-seguridad` (creada en `catalogo/rondas-seguridad.md`). Ninguna existente calza.
- **Base a clonar**: desde cero. No es un agente conversacional: es una app operativa (PWA para el guardia + API + panel del administrador). La base chaski (Telegram + LLM) no aplica; se reusan las convenciones (mock primero, español, `.env`, npm test).
- **Canal demo**: web — PWA en el teléfono del guardia + panel web del administrador. Aviso al administrador: informe web + notificación Telegram opcional (mock por defecto).
- **Datos que maneja**: condominios, puntos de control (QR por sector), guardias (usuarios con PIN), rondas plantilla (secuencia de puntos + reglas), ejecuciones de ronda (escaneos con hora), informes y alertas.
- **Presupuesto conocido**: no.
- **LLM runtime propuesto**: **ninguno**. El flujo es 100 % determinista (escanear → comparar contra la ronda esperada → informe). Principio 5 de ARQUITECTURA.md: el LLM es el último recurso. Costo de runtime por mensaje: $0.

## Preguntas abiertas

Ninguna que bloquee la spec. Supuestos registrados en SPEC.md (nombre del condominio real, cantidad de puntos y horarios se cargan en el panel cuando José tenga los datos del cliente).

## Fuera de alcance v1

- App nativa (Android/iOS): la v1 es PWA instalable — cubre el caso y no requiere tiendas.
- Verificación de presencia por GPS/NFC (mitiga QR fotografiado): roadmap v2.
- Fotos/incidencias adjuntas a un punto de la ronda.
- Multi-tenant SaaS con facturación por condominio (la v1 soporta varios condominios en una instalación).
- Integración WhatsApp para los informes (v1: panel web + Telegram opcional).
