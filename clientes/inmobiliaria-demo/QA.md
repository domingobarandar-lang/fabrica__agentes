# QA — inmobiliaria-demo

**Fecha**: 2026-07-15
**Modo**: 100% MOCK (0 tokens, sin credenciales de LLM invocadas)

## Cobertura

`npm test` (`scripts/test-chat.js`) implementa los 12 casos de uso + 6 escenarios adversariales del SPEC, uno a uno, contra la base en memoria (reseteada a las semillas antes de cada escenario):

| # | Escenario | Resultado |
|---|---|---|
| 1 | CU-1 Saludo y atención general | ✅ PASA |
| 2 | CU-3 + CU-2 Búsqueda con resultados y captura temprana de contacto | ✅ PASA |
| 3 | CU-4 Búsqueda sin resultados (captura lead igual) | ✅ PASA |
| 4 | CU-5 Detalle de propiedad + conversión UF→CLP aproximada | ✅ PASA |
| 5 | CU-6 Agendar visita en día válido → lead caliente | ✅ PASA |
| 6 | CU-7 Día/hora inválido → reencauza sin agendar | ✅ PASA |
| 7 | CU-8 Ver y cancelar visita | ✅ PASA |
| 8 | CU-9 Requisitos de arriendo y comisiones (FAQ, sin inventar) | ✅ PASA |
| 9 | CU-10 Propiedad ya arrendada → alternativas + lead | ✅ PASA |
| 10 | CU-11 Score determinístico caliente/tibio/frío | ✅ PASA |
| 11 | CU-11b Upsert por teléfono (lead semilla no se duplica) | ✅ PASA |
| 12 | CU-12 Fuera de alcance (tasación) → deriva al corredor | ✅ PASA |
| 13 | ADV-1 Visita en fecha pasada → rechazo + próximo día válido | ✅ PASA |
| 14 | ADV-2 Doble "confirmo" → no duplica | ✅ PASA (tras fix, ver Bugs) |
| 15 | ADV-3 Propiedad inexistente → no inventa ficha | ✅ PASA |
| 16 | ADV-4 Slot ocupado por semilla → ofrece siguiente libre | ✅ PASA |
| 17 | ADV-5 Dato fuera de ficha (mascotas) → no inventa + nota en lead | ✅ PASA |
| 18 | ADV-6 Cambios de propiedad/fecha repetidos → sin visitas fantasma | ✅ PASA |

**Resultado final `npm test`**: 18/18 escenarios OK.

**`npm run telegram:mock`**: 4/4 conversaciones de demostración OK (búsqueda + captura de contacto, agendar con reencauce de slot ocupado, consultar visita, FAQ de requisitos).

## Bugs encontrados y corregidos

**ADV-2 (doble confirmo) — idempotencia muerta por orden de checks.** En `agent/tools.js`, `agendarVisita` verificaba "¿está el slot libre?" antes de verificar "¿esta visita ya es del mismo cliente?". Como la primera confirmación ya había ocupado el slot, la segunda confirmación del mismo cliente caía en la rama de "slot ocupado" (técnicamente cierto, ocupado por él mismo) en vez de reconocer que era la misma visita repetida — el mensaje al cliente decía "ya está tomado" en vez de "ya quedó listo". Se corrigió moviendo el chequeo de idempotencia (duplicado por teléfono+propiedad+fecha+hora) antes del chequeo de disponibilidad. Verificado: `npm test` pasó de 17/18 a 18/18 con el fix.

No se encontraron otros bugs. Un solo ciclo build→QA (no fue necesario escalar a José).

## Validación pendiente (fuera de este QA)

La validación con modelo real (Gemini 2.0 Flash, key del pool) queda para que José converse por `npm run chat` en `clientes/inmobiliaria-demo/agente/` — el mock prueba las tools y reglas de negocio de forma determinista, pero la calidad del tool-calling real del modelo se confirma en esa conversación (política de la fábrica, `plantillas/base-agente/README.md`).
