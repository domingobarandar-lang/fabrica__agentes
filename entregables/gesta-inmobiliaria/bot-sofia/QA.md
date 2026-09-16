# QA — Sofía · Gesta Inmobiliaria

**Modo**: MOCK incondicional. **0 tokens, sin credenciales, sin red.**
El motor de evals borra las credenciales del entorno antes de cargar nada, y
`evals/correr.js` borra además `PLANILLA_URL`: la suite corre contra la copia del
repo (`agente/datos/propiedades.csv`, las 16 propiedades reales de la planilla), así
que dos personas obtienen el mismo resultado y nadie sale a Google.

## Resultado

```
RESUMEN: 96/96 corridas OK   ·   1164 verificaciones automáticas de invariantes
12 escenarios × 8 perfiles de cliente difícil
```

`npm run validar` → configuración válida.
`npm run humo` (núcleo 1.7.0) → **211/211**.
`npm run entrega` → nada bloquea.

## Qué se probó

12 escenarios escritos a mano (los CU-* y ADV-* del SPEC), cada uno corrido 8 veces
por el motor con el mismo cliente portándose distinto: ordenado, escribiendo en
cuatro mensajes seguidos, sin tildes y con faltas, dando los datos al revés,
repitiendo el último mensaje, pidiendo hablar con una persona, yéndose por las ramas
y arrepintiéndose a mitad de camino.

En cada turno de cada corrida corren además los 8 invariantes del núcleo: no
re-preguntar un dato ya capturado, no afirmar datos que ninguna herramienta devolvió,
respetar el tope de resultados, responder dentro del largo máximo, derivar cuando
piden una persona (sin gastar un token), no filtrar el prompt ni el nombre de una
herramienta, no llevar el corpus de conocimiento dentro del prompt, y no anunciar un
cambio de agente como si pasaran la conversación a un humano.

## Los bugs que encontró la QA mientras se construía

| Qué | Cómo se vio | Arreglo |
|---|---|---|
| Dos propiedades de la planilla salían **sin precio** | `6200UF` y `320.000CLP` vienen pegados, y la moneda se buscaba con `\b`: entre un dígito y una letra no hay borde de palabra | Se busca sobre las letras sueltas, no con `\b` |
| El validador **ejecutaba las tools de verdad** | `npm run validar` derivaba un canal y armaba un informe para la ejecutiva | El sondeo corre con las credenciales de salida apagadas (arreglo en el núcleo) |
| El perfil `pide_humano` daba rojo en todo camino que **termina** en una persona | Después de agendar, pedir una ejecutiva no produce mensaje: el bot ya se calló | El motor acepta el silencio cuando el canal ya está en modo humano (arreglo en el núcleo) |
| Los botones podían **sobrevivir al turno** | Un turno que propone botones y deriva los dejaba pegados al mensaje siguiente | `core.js` los limpia al empezar cada turno |

## Conversación real contra Gemini (2026-09-16)

Siete conversaciones por consola con **`gemini-3.5-flash`**, que es lo único que el mock
no puede probar. **Las siete pasaron**, y encontraron tres fallas que la suite en verde no
podía ver:

| Qué falló | Por qué el mock no lo veía | Arreglo |
|---|---|---|
| `gemini-2.0-flash` ya no existe | El mock no llama a ningún proveedor | Modelo actualizado en los 4 lugares donde estaba escrito |
| Gemini 3.x exige que le devuelvan la `thought_signature` de cada tool call | El doble del LLM no manda firmas, y la primera llamada del turno sí funciona | El adapter la guarda opaca y la repone (arreglo en el núcleo) |
| La pregunta de la Región Metropolitana salía sin botones Sí/No | Ninguna tool los proponía; el modelo la escribía a mano y "funcionaba" | Tool `preguntar_region`, verificada en CU-6 |
| Un título de botón se recortaba: "Luis Thayer Ojeda 1…" | Los escenarios usaban direcciones cortas | `formato.tituloBoton`, verificado sobre **todas** las propiedades en ADV-3 |

Lo que confirmaron con el modelo real: identifica la propiedad del aviso, manda la ficha
literal, se niega a agendar con una sola fecha, se calla después de agendar, toma la
captación, rechaza con cariño lo que está fuera de la Región Metropolitana **sin prometer
que alguien llamará**, pregunta cuál cuando hay dos en la misma calle, dice que no tiene
una propiedad que no está publicada **sin ofrecer una parecida**, y ante comisión y
crédito hipotecario deriva en vez de inventar.

## Lo que estas pruebas NO miden

El modelo es un doble guionizado: los perfiles prueban el **núcleo** y los invariantes
frente a entradas desordenadas, no la comprensión del lenguaje de Gemini. Eso se confirma
conversando (`npm run chat -- --real`, ver la sección de arriba), y **hay que rehacerlo si
se cambia de proveedor o de modelo**: las tres fallas de arriba eran invisibles para una
suite 96/96 en verde.

Tampoco se probó contra la WhatsApp Cloud API real: el envío con botones está
verificado en la prueba de humo del núcleo (payload, topes y guarda del silencio), pero
el primer mensaje de verdad se manda cuando haya token.

## Cómo reproducirlo

```bash
cd agente
npm install
npm test                      # los 12 escenarios × 8 perfiles
npm test -- --verboso         # imprime todas las conversaciones
npm test -- --escenario=CU-4  # uno solo
npm run validar               # la configuración
npm run datos                 # qué le falta a la planilla
npm run demo                  # regenera la demo desde la planilla
```
