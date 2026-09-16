# SPEC — Sofía · Gesta Inmobiliaria

Estado: **construido y probado en mock**. Falta: credenciales y despliegue.
Núcleo conversacional **1.7.0**. Cada CU/ADV de acá tiene su escenario en
`agente/evals/escenarios.js` con el mismo nombre.

## Alcance

Sofía atiende por WhatsApp a dos tipos de persona: quien pregunta por una propiedad
publicada, y quien ofrece la suya para que Gesta la venda o la arriende. Todo lo demás
lo pasa a una ejecutiva.

**La fuente de verdad de las propiedades es la planilla de Google de la corredora.**
No hay una copia en base de datos: lo que dice la planilla es lo que dice Sofía, con
15 minutos de retraso como máximo.

## Reglas duras

| # | Regla | Cómo se hace cumplir |
|---|---|---|
| R1 | Sofía no afirma ningún dato que no haya devuelto una herramienta | Invariante `no_afirma_dato_sin_tool` del núcleo, en cada turno de cada escenario |
| R2 | Las fichas y los requisitos los **arma el código**, no el modelo | `agent/formato.js`; CU-2 verifica que el texto salga idéntico |
| R3 | Un dato ambiguo en la planilla **no se muestra** | `database/planilla.js` devuelve el monto sin moneda como nulo; ADV-4 |
| R4 | Una propiedad que no está publicada no se sustituye por una parecida | ADV-1 |
| R5 | Sofía no confirma día y hora: eso lo cierra la ejecutiva | CU-4 |
| R6 | Después de agendar o captar, Sofía no habla más en ese chat | Derivación definitiva del núcleo (`handoff.timeout_min: null`); CU-4 y CU-6 |
| R7 | Gesta trabaja solo en la Región Metropolitana | Validación dentro de `registrar_captacion`; CU-7 |

## Casos de uso

### CU-1 — Llega por el aviso de una propiedad
**Entrada**: "Hola, me interesó la propiedad en `<dirección>`".
Sofía identifica la propiedad y ofrece su menú. Si hay más de una candidata, pregunta
cuál (ADV-3). Si no hay ninguna, lo dice (ADV-1).
**Listo cuando**: el menú trae 3 botones y ninguno de los datos de la propiedad salió
del modelo.

### CU-2 — "Ver información"
Entrega la ficha completa, textual, con el link a las fotos.
**Listo cuando**: la respuesta contiene `formato.ficha(propiedad)` carácter por carácter.

### CU-3 — "Requisitos"
Entrega los requisitos **de esa propiedad**, tal como los escribió la corredora.
**Listo cuando**: no aparece ningún requisito de mercado que la planilla no traiga
(el clásico "renta 3 veces el arriendo" se verifica explícitamente).
**El botón solo existe si esa propiedad tiene la columna llena** (CU-5).

### CU-4 — "Agendar visita"
Pide **dos** opciones de día y hora. Con una sola, no agenda: pide la segunda.
Con las dos: registra la visita, le manda el informe a la ejecutiva y **se calla**.
**Listo cuando**: queda 1 visita con las dos preferencias, el canal queda en modo
humano con motivo `visita_agendada`, y el informe trae número, propiedad y fechas.

### CU-5 — Propiedad sin requisitos
El menú no ofrece "Requisitos" y usa ese tercer espacio para "Con una ejecutiva".
**Listo cuando**: son 3 botones y ninguno es de requisitos.

### CU-6 — Captación en la Región Metropolitana
Pregunta primero si está en la RM (botones Sí/No), después pide los datos con ejemplos
concretos, registra y deriva.
**Listo cuando**: queda 1 captación con `region_metropolitana = true` y el detalle que
contó la persona, y el canal queda en modo humano.

### CU-7 — Captación fuera de la Región Metropolitana
Lo dice con cariño, registra la consulta y **no deriva**: derivar sería hacerle perder
el tiempo a las dos partes.
**Listo cuando**: el canal NO queda en modo humano y no se promete ningún contacto.

### CU-8 — Saluda sin decir qué busca
Ofrece las tres puertas: Arrendar · Comprar · Vender/arrendar.

## Adversariales

| # | Escenario | Qué no puede pasar |
|---|---|---|
| ADV-1 | Propiedad que no está publicada | Ofrecer otra parecida como si fuera esa |
| ADV-2 | Preguntan comisión o crédito hipotecario | Inventar un porcentaje o una condición |
| ADV-3 | Dirección ambigua (dos en la misma calle) | Elegir una y soltar su precio |
| ADV-4 | Dato que la planilla dejó ambiguo | Adivinar la moneda de un gasto común |

## Fuera de alcance (v1)

- Buscar propiedades por presupuesto o por filtros combinados. Hoy Sofía resuelve la
  propiedad del aviso; una búsqueda abierta pasa a una ejecutiva.
- Confirmar visitas contra una agenda real (no hay calendario conectado).
- Responder comisiones, financiamiento, subsidios o tasaciones.
- Fotos dentro del chat: se manda el link de la publicación, que es lo que hay.

## Decisiones tomadas en el camino

| Decisión | Por qué |
|---|---|
| La planilla se lee como **CSV publicado**, sin credencial de Google | Usar la API habría significado una cuenta de servicio nueva (gate 🔴 del semáforo) para leer los mismos datos |
| El código de cada propiedad es **el número de su link** | Ya existe, es estable y la corredora lo reconoce |
| Un monto sin moneda **no se muestra** y se reporta en `npm run datos` | Mostrar "14" sin saber si son UF o pesos es exactamente lo que R1 prohíbe |
| El aviso a la ejecutiva cuelga del **handoff del núcleo**, no de cada tool | La derivación más común (pedir una persona) corta antes del modelo: desde una tool no se vería |
| El número de la corredora tiene su **propio guarda** | Su "hola" de la mañana abre la ventana de 24 h y no es un cliente que quiera arrendar |
| La corredora puede **devolverle un chat al bot** (`liberar <número>`) | La derivación es definitiva: sin esta llave, un cliente que agendó queda mudo para siempre |
