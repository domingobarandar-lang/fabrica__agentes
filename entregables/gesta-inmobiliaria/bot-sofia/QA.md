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

## Lo que estas pruebas NO miden

El modelo es un doble guionizado: los perfiles prueban el **núcleo** y los invariantes
frente a entradas desordenadas, no la comprensión del lenguaje de Gemini. Si Sofía va
a entender *"oye y esa de holanda cuánto sale"* se confirma conversando
(`npm run chat -- --real`), y hay que rehacerlo si se cambia de proveedor.

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
