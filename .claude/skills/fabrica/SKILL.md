---
name: fabrica
description: Pipeline maestro de la Fábrica de Agentes. Invocar cuando José entrega un pedido de cliente nuevo (/fabrica "<pedido>"), pide continuar o iterar un pedido existente en clientes/, o dice "nuevo cliente", "nuevo pedido", "el cliente quiere...". Ejecuta el ciclo completo: intake, spec, arquitectura, build sobre la base chaski, QA en mock, kit de entrega y documentación en Notion — de forma autónoma, sin pedir permiso fase a fase.
---

# /fabrica — pipeline maestro

Eres el orquestador. Recibes el pedido y entregas producto revisable SIN detenerte a preguntar entre fases. Solo interrumpes por las 5 causas de la constitución (dinero, credenciales, precio, contacto con cliente, borrar trabajo entregado). El detalle de cada fase y su DoD está en [docs/PIPELINE.md](../../../docs/PIPELINE.md) — léelo si no lo tienes fresco.

## Si el argumento es un pedido nuevo

1. **Intake** (tú): slug corto, `clientes/<slug>/BRIEF.md` desde `clientes/_plantilla/BRIEF.md`, alta en Notion (base "Pedidos de la Fábrica" bajo el hub 🏭) con estado `Intake`.
2. **Spec** (subagente `analista`): pásale el BRIEF y el archivo del vertical en `catalogo/`. Recibe `SPEC.md` con casos de uso numerados. Si el pedido es muy difuso, el analista igual propone la spec más razonable y lista los supuestos — NO se bloquea esperando respuestas.
3. **Arquitectura** (tú): base a clonar, canal, LLM runtime, datos. Registrar en `docs/DECISIONES.md`. Regla dura: proveedor LLM según `docs/ARQUITECTURA.md`, jamás Anthropic por defecto.
4. **Build** (subagente `desarrollador`): pásale SPEC.md, la decisión de arquitectura y `plantillas/base-agente/README.md`. Recibe el agente clonado y personalizado con `npm run telegram:mock` corriendo.
5. **QA** (subagente `qa`): escenarios del SPEC + adversariales, todo en MOCK. Si falla algo, vuelve al desarrollador con el reporte — máximo 3 ciclos build↔qa antes de escalar a José con diagnóstico.
6. **Kit de entrega** (subagente `marketing`): DEMO.md, ONE-PAGER.md, OPERACION.md en `clientes/<slug>/entrega/`. Sin precios.
7. **Documentación** (subagente `documentador`): Notion al día (estado `Listo para revisión`, decisiones y QA volcados), DECISIONES.md actualizado.
8. **Informe a José** (tú, mensaje final): qué se construyó, decisiones clave y por qué, cómo probarlo en 2 comandos, qué falta para producción, riesgos. Corto y sin jerga interna.

## Si el argumento refiere a un pedido existente

Ubicar `clientes/<slug>/`, leer BRIEF/SPEC/QA, aplicar el feedback en la fase que corresponda (feedback de comportamiento → SPEC primero, luego build; bug → qa/investigate) y re-correr las fases aguas abajo. Actualizar Notion.

## Reglas de despacho

- Subagentes en paralelo cuando no dependen entre sí (marketing puede correr junto a QA).
- Todo lo que gaste tokens de runtime → MOCK. Una pasada real solo con proveedor barato ya configurado y aprobado.
- gstack disponible: `/spec` (specs difusas), `/investigate` (bugs), `/qa` (apps web), `/ship` (release). Úsalo, no lo dupliques.
- Si un subagente falla o devuelve basura, corrígelo tú mismo — el pedido no se detiene por burocracia interna.
