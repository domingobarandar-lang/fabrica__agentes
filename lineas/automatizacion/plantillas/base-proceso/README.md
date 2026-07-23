# base-proceso — esqueleto de automatización (AÚN NO CONSTRUIDO)

Este es el hogar del esqueleto compartido de la línea de automatización: **máquina de estados + emisor de avisos con cortafuegos + panel del dueño**. Está **vacío a propósito**.

## Por qué no está construido

Se levanta **con el primer cliente real de automatización**, no antes. Fijar la forma de la máquina de estados con un cliente inventado es el error que `docs/DECISIONES.md` ya descartó (plataforma genérica antes del primer peso). La decisión de stack (cómo se sirve el panel: dominio, autenticación) se toma con ese cliente en mano.

## Qué llevará cuando se construya

- **Máquina de estados** del objeto (Express + Supabase), configurable por producto (orden de trabajo / cotización / sesiones).
- **Emisor único de avisos con cortafuegos** que falla cerrado. Contrato completo en `docs/ARQUITECTURA.md` → "Cortafuegos de envío": allowlist estricta (`MODO_ENVIO=produccion`), anuncio en el arranque, anti-duplicado por `(objeto, estado)`, garantía acotada a QA.
- **Pieza reloj** (cron de Railway) para avisos por tiempo.
- **Pieza oreja** (webhook) para respuestas del cliente que mueven el estado.
- **Panel del dueño** (PWA) con lo pendiente y lo atrasado.
- **Target de QA**: afirmar emisor simulado + cero llamadas externas (ver `.claude/agents/qa.md`).

## Mientras tanto

Un pedido de automatización se **clasifica** y se **cotiza** leyendo su ficha en `../../catalogo/`, pero el build es **camino manual**: el orquestador avisa a José que ese pedido requiere construir `base-proceso` primero. `/fabrica` no habilita ruteo automático de build a esta línea hasta que este esqueleto exista.
