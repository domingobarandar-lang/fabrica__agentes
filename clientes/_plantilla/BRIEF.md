# Brief — <nombre del cliente>

**Fecha**: <YYYY-MM-DD>
**Estado**: Intake
**Ruta del proyecto**: <ruta absoluta externa, ej. C:\Users\Adela\clientes\taller-lucas\orden-trabajo>

## Pedido original (palabras de José/cliente)

> <copiar textual el pedido>

## Clasificación (fase 0)

- **Línea**: <conversacional | automatizacion | a-medida>
- **Ficha de catálogo**: <nombre de la ficha, o "a-medida (no calza)">
- **Presupuesto conocido**: <sí/no — monto si se sabe>

---

## Bloque conversacional (llenar solo si la línea es conversacional)

- **Vertical**: <agendamiento-salud | inmobiliaria | petshop-retail | atencion-cliente | nuevo>
- **Base a clonar**: <agente-citas | agente-retail | desde cero (justificar)>
- **Canal demo**: Telegram (default) / **producción**: <WhatsApp | Telegram | web>
- **Datos que maneja**: <doctores/horarios | propiedades | catálogo/stock | FAQ...>
- **Volumen** aprox. de mensajes/día: <número — define el LLM runtime>
- **LLM runtime propuesto**: <según ARQUITECTURA.md>

## Bloque automatización (llenar solo si la línea es automatizacion) — las 5 preguntas

1. **Objeto** que avanza: <un auto | unas prendas | una cotización | un ciclo de clases...>
2. **Estados** y su orden: <recibido → en proceso → listo → entregado ...>
3. **Quién marca** cada avance: <persona del negocio | reloj (tiempo) | cliente respondiendo>
4. **A quién se avisa** en cada cambio: <cliente final | dueño | ambos>
5. **Qué pasa si se atrasa**: <alerta al dueño a los N días | nada | ...>

- **Pieza extra que necesita**: <solo base | base + reloj | base + reloj + oreja>
- **Canal de avisos**: WhatsApp Cloud API (producción) — en QA el cortafuegos simula.

---

## Preguntas abiertas

<solo las que BLOQUEAN la spec; el resto se decide con criterio y se registra>

## Fuera de alcance v1

- <qué NO va a hacer esta versión>
