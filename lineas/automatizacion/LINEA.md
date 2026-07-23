# Línea automatización — procesos internos del negocio

La línea nueva. No vende un bot: vende que un **proceso** del negocio deje de vivir en la cabeza del dueño. Un objeto avanza por estados, el sistema avisa solo en cada cambio, y el dueño ve un panel con lo pendiente y lo atrasado.

## Qué vende

En los rubros objetivo el dueño **ES** el sistema: la orden vive en un cuaderno, el estado lo sabe solo quien lo hace, el cliente llama para preguntar "¿ya está listo?". El argumento que mueve la venta no es "te ahorro horas", es **"tu negocio puede funcionar un día sin ti"**.

## El esqueleto compartido + las piezas

Los tres productos son **la misma base con piezas que se agregan** (premisa 3, revisada 2026-07-22):

- **Base pelada** (pelotita + campanita + pantallita): un objeto con estados, un aviso en cada cambio, un panel para el dueño. Una **persona del negocio** empuja el estado a mano.
- **Pieza "reloj"**: avisos disparados por **tiempo**, no porque alguien apriete (seguimiento a los 2/5 días, recordatorio 24h antes). Es un cron.
- **Pieza "oreja"**: el **cliente responde** y esa respuesta mueve el estado (confirma por WhatsApp). Es un webhook que entiende la respuesta.

El reloj y la oreja se construyen **una vez** y los reusan los productos que los necesitan. Por eso se parte por el **producto 1** (base pelada, el más barato y la cuña más angosta).

| Producto | Base | Reloj | Oreja |
|---|---|---|---|
| 1 · Orden de trabajo | ✅ | — | — |
| 2 · Cotización y cierre | ✅ | ✅ | (opcional) |
| 3 · Sesiones recurrentes | ✅ | ✅ | ✅ |

## Campos de intake propios (además del núcleo del BRIEF)

Las 5 preguntas que definen el producto:

1. **¿Cuál es el objeto** que avanza? (un auto, unas prendas, una cotización, un ciclo de clases)
2. **¿Cuáles son sus estados** y en qué orden?
3. **¿Quién marca cada avance**: una persona del negocio, el reloj, o el cliente respondiendo?
4. **¿A quién se avisa** en cada cambio? (al cliente final, al dueño, a ambos)
5. **¿Qué pasa si se atrasa?** (¿alerta al dueño? ¿a los cuántos días?)

## Plantillas

- `plantillas/base-proceso/` — **aún no construido**. Se levanta con el primer cliente real de automatización (decisión de stack con el cliente en mano, ver `docs/ARQUITECTURA.md`). Hasta entonces, un pedido de automatización se clasifica y cotiza leyendo su ficha, pero el build es **camino manual** (el orquestador avisa a José).

## Pipeline y DoD

Sigue el pipeline común de `docs/PIPELINE.md`. Reglas propias de la línea:

- Todo aviso sale por el **cortafuegos de envío** (falla cerrado): sin `MODO_ENVIO=produccion` explícito, simula y lo anuncia. Contrato en `docs/ARQUITECTURA.md`.
- DoD de QA: un escenario por transición + sus avisos, **afirmando que el emisor simuló y hubo cero llamadas externas**, y que una transición repetida no avisa dos veces (anti-duplicado).
