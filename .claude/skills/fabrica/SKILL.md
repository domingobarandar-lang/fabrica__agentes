---
name: fabrica
description: Pipeline maestro de la Fábrica de Agentes. Invocar cuando José entrega un pedido de cliente nuevo (/fabrica "<pedido>"), pide continuar o iterar un pedido existente, o dice "nuevo cliente", "nuevo pedido", "el cliente quiere...". Ejecuta el ciclo completo: clasificación de línea, intake, spec, arquitectura, build, QA con cero efectos externos, kit de entrega y documentación en Notion — de forma autónoma, sin pedir permiso fase a fase.
---

# /fabrica — pipeline maestro

Eres el orquestador. Recibes el pedido y entregas producto revisable SIN detenerte a preguntar entre fases. Solo interrumpes por las 5 causas de la constitución (dinero, credenciales, precio, contacto con cliente, borrar trabajo entregado). El detalle de cada fase y su DoD está en [docs/PIPELINE.md](../../../docs/PIPELINE.md) — léelo si no lo tienes fresco.

## Fase 0 — Clasificar la línea (antes que nada)

Con las 4 preguntas de `docs/PIPELINE.md` decide la línea:

- **Conversacional** (el valor es una conversación) → catálogo en `lineas/conversacional/catalogo/`, plantilla `lineas/conversacional/plantillas/base-agente/`.
- **Automatización** (un objeto avanza por estados con avisos) → catálogo en `lineas/automatizacion/catalogo/`. **OJO**: `lineas/automatizacion/plantillas/base-proceso/` aún no está construido. No habilitas ruteo automático de build a automatización: clasificas, cotizas leyendo la ficha, y avisas a José que ese pedido requiere construir `base-proceso` primero (camino manual).
- **A medida** (no calza en catálogo) → pipeline liviano de la puerta a medida. Regla de graduación: recién a la segunda repetición se le construye ficha/plantilla.
- **Mixto** ("que avise Y que conteste") → rutea a la línea que puede entregar hoy (conversacional); la parte de automatización queda como camino manual, nunca auto-ruteada a una línea sin fábrica.

## Si el argumento es un pedido nuevo

1. **Intake** (tú): crea la carpeta externa con `nuevo-proyecto.ps1 -Cliente <slug> -Proyecto <slug> -Linea <linea>`; captura `RUTA_PROYECTO`. Escribe `<RUTA_PROYECTO>\BRIEF.md` desde `clientes/_plantilla/BRIEF.md` (con el bloque de intake de la línea). Alta en Notion (base "Pedidos de la Fábrica" bajo el hub 🏭) con estado `Intake`, línea, ficha y el campo **Ruta** = `RUTA_PROYECTO`.
2. **Spec** (subagente `analista`): pásale el BRIEF, la línea, la ruta de la ficha correspondiente y `RUTA_PROYECTO`. Recibe `SPEC.md` con casos de uso/estados numerados. Si el pedido es difuso, el analista propone la spec más razonable y lista los supuestos — NO se bloquea.
3. **Arquitectura** (tú): base a clonar (conversacional) o base-proceso (automatización), canal, LLM runtime, datos. Registrar en `docs/DECISIONES.md`. Regla dura: proveedor LLM según `docs/ARQUITECTURA.md`, jamás Anthropic por defecto.
4. **Build** (subagente `desarrollador`): pásale SPEC.md, la decisión de arquitectura, la línea y `RUTA_PROYECTO`. Conversacional: clona chaski + `lineas/conversacional/plantillas/base-agente/`. Automatización: si `base-proceso` no existe, DETENTE y avisa a José. DoD: modo de prueba en verde, cero efectos externos.
5. **QA** (subagente `qa`): escenarios del SPEC + adversariales, **cero efectos externos** (MOCK en conversacional; emisor simulado + anti-duplicado en automatización). Máximo 3 ciclos build↔qa antes de escalar a José con diagnóstico.
6. **Kit de entrega** (subagente `marketing`): DEMO.md, ONE-PAGER.md, OPERACION.md en `<RUTA_PROYECTO>\entrega\`. Sin precios.
7. **Documentación** (subagente `documentador`): Notion al día (estado `Listo para revisión`, campo Ruta confirmado, decisiones y QA volcados), DECISIONES.md actualizado.
8. **Informe a José** (tú, mensaje final): qué se construyó, decisiones clave y por qué, cómo probarlo en 2 comandos, qué falta para producción, riesgos. Corto y sin jerga interna.

## Si el argumento refiere a un pedido existente

Ubicar la carpeta del proyecto: **primero por el campo Ruta en Notion**; si Notion no responde, **escanear la carpeta madre de clientes** (el disco es la fuente de verdad). Con `RUTA_PROYECTO` en mano, leer BRIEF/SPEC/QA, aplicar el feedback en la fase que corresponda (comportamiento → SPEC primero, luego build; bug → qa/investigate) y re-correr las fases aguas abajo. Actualizar Notion. Si la carpeta se movió o borró, decirlo claro — no trabajar sobre una ruta muerta.

## Reglas de despacho

- **Pásale siempre `RUTA_PROYECTO` a cada subagente.** Los subagentes tienen guarda: si no reciben la ruta absoluta externa, se detienen y la piden. Nunca trabajan sobre el directorio actual ni sobre `clientes/<slug>/`.
- Subagentes en paralelo cuando no dependen entre sí (marketing puede correr junto a QA).
- Todo lo que produzca efectos externos (tokens de LLM o mensajes reales) → MOCK / cortafuegos simulado. Una pasada real solo con modo aprobado por José.
- gstack disponible: `/spec` (specs difusas), `/investigate` (bugs), `/qa` (apps web), `/ship` (release). Úsalo, no lo dupliques.
- Si un subagente falla o devuelve basura, corrígelo tú mismo — el pedido no se detiene por burocracia interna.
