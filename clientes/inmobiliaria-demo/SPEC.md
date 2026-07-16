# SPEC — Bot inmobiliario: leads + visitas + atención general (demo)

Base: `agente-citas` (visitas = citas) extendida con tools de catálogo de propiedades según `catalogo/inmobiliaria.md`. **Canal demo: terminal** (`npm run chat`) — todo texto plano conversacional, sin botones ni mensajes interactivos. NO se registra como subagente en `.claude/agents` (instrucción de José).

## Supuestos (a validar por José en la demo)

Heredados del BRIEF:
1. "de 11 a 2" = 11:00 a 14:00. Visitas de 30 min → 6 slots por día (11:00, 11:30, 12:00, 12:30, 13:00, 13:30), solo lunes, miércoles y jueves.
2. Corredora genérica demo, mix venta/arriendo en Santiago; requisitos de arriendo chilenos estándar.
3. Lead = nombre + teléfono temprano + operación, comuna, presupuesto, urgencia; score frío/tibio/caliente.

Nuevos de esta spec:
4. Nombre placeholder: **Corredora Andes Propiedades** (el cliente lo reemplaza).
5. Comisiones estándar de mercado (placeholder): arriendo 50% del primer mes de renta + IVA; venta 2% del precio + IVA.
6. Valor UF referencial fijo para conversión aproximada en demo: **UF ≈ $39.500 CLP** (constante configurable, no API).
7. Horario de atención de oficina (distinto del de visitas): L–V 09:30–18:30, sábado 10:00–13:00.
8. Leads y visitas se identifican por teléfono (clave natural; un lead por teléfono, upsert).
9. El **score lo calcula la tool `registrar_lead`** con reglas determinísticas (tabla más abajo), no el LLM — así es testeable en mock.
10. Si el usuario se niega a dar teléfono, el bot insiste UNA vez y sigue atendiendo igual (no bloquea la conversación); sin teléfono no hay lead registrado.

## Datos del negocio (demo — el cliente valida/reemplaza)

- **Visitas a propiedades**: SOLO lunes, miércoles y jueves, 11:00–14:00, slots de 30 min. Regla dura: jamás se agenda fuera de esa ventana; ante día/hora inválida se ofrece el slot válido más cercano.
- **Oficina**: L–V 09:30–18:30, sábado 10:00–13:00 (solo informativo, no agenda).
- **Requisitos de arriendo** (FAQ, sin inventar): renta líquida ≥ 3x el valor del arriendo (acreditada con 3 últimas liquidaciones), contrato de trabajo vigente, informe de deudas (Dicom) limpio, aval con requisitos equivalentes si no se cumple la renta. Al firmar: mes de garantía + primer mes anticipado + comisión.

## Reglas de negocio

1. **Captura temprana de contacto**: a más tardar después de la primera búsqueda o consulta por una propiedad, el bot pide nombre y teléfono ("para enviarte la ficha / coordinar"). El lead es el producto; la visita es el bonus.
2. **El lead queda capturado aunque no agende**: toda conversación con teléfono capturado termina en `registrar_lead`, con los campos que se hayan obtenido (los demás quedan null).
3. **Score del lead** (calculado por `registrar_lead`):

| Score | Condición (en orden; gana la primera que calza) |
|---|---|
| **caliente** | agendó visita, O (urgencia inmediata ≤1 mes Y presupuesto informado) |
| **tibio** | sin visita, pero operación + comuna + presupuesto informados, con urgencia media (1–3 meses) o sin urgencia declarada |
| **frío** | el resto: sin presupuesto, urgencia >3 meses, o "solo mirando" |

   `agendar_visita` actualiza el lead existente a **caliente** automáticamente.
4. **Urgencia**: se normaliza a `inmediata` (≤1 mes / "ya" / "este mes"), `media` (1–3 meses), `baja` (>3 meses / "solo mirando"), `null` (no declarada).
5. **Búsqueda sin match exacto**: ofrecer lo más cercano (misma operación, comuna vecina o hasta +15% de presupuesto) y registrar la búsqueda del lead igual.
6. **Precios**: venta en UF, arriendo en CLP. Conversión UF→CLP solo si la piden, marcada como "aproximado" con la UF referencial.
7. **Nunca inventar**: precios, gastos comunes, requisitos, comisiones y disponibilidad salen SIEMPRE de las tools. Dato que no está en la ficha (ej. "¿aceptan mascotas?") → "lo confirmo con el corredor" + queda anotado en el lead.

## Tools

| Tool | Parámetros | Retorna |
|---|---|---|
| `buscar_propiedades` | `operacion` (venta/arriendo), `comuna?`, `presupuesto_max?`, `dormitorios?` | Lista de propiedades **disponibles** que calzan (id, tipo, comuna, precio, dorm, m²). Si no hay match exacto: lista vacía + `cercanas[]` con las alternativas más próximas |
| `detalle_propiedad` | `id` | Ficha completa: precio, gastos comunes, dorm/baños, m², dirección referencial, estado, descripción. Si estado ≠ disponible, lo dice explícito |
| `consultar_disponibilidad` | `fecha` | Slots libres de esa fecha si es día de visita (Lu/Mi/Ju); si no lo es, `[]` + el próximo día válido con sus slots (base agente-citas, adaptada a la ventana Lu/Mi/Ju 11–14) |
| `agendar_visita` | `propiedad_id`, `nombre`, `telefono`, `fecha`, `hora` | Confirmación con id de visita. Error si: día/hora fuera de ventana (retorna slot válido más cercano), slot ocupado, propiedad no disponible o fecha pasada. Actualiza lead a caliente |
| `mis_visitas` | `telefono` | Visitas agendadas (propiedad, fecha, hora) — de la base (mis_citas) |
| `cancelar_visita` | `telefono`, `visita_id?` | Cancela; con varias visitas y sin id, retorna la lista para elegir — de la base (cancelar_cita) |
| `registrar_lead` | `nombre`, `telefono`, `operacion?`, `comuna?`, `presupuesto?`, `urgencia?`, `propiedad_interes?`, `nota?` | Upsert por teléfono; calcula y retorna `score` según la tabla de reglas |
| `info_corredora` | `tema?` (requisitos_arriendo / comisiones / horarios / proceso_visita) | Texto de la FAQ correspondiente; sin tema, resumen general |

## Datos

### Tabla `propiedades`
`id, operacion (venta|arriendo), tipo (casa|depto), comuna, direccion_referencial, precio, moneda (UF|CLP), gastos_comunes (CLP|null), dormitorios, banos, m2, estado (disponible|arrendada|vendida|reservada), descripcion`

Semilla demo (8):

| ID | Op | Tipo | Comuna | Precio | GC | D/B | m² | Estado |
|---|---|---|---|---|---|---|---|---|
| P1 | arriendo | depto | Santiago Centro | $420.000 | $65.000 | 1D/1B | 45 | disponible |
| P2 | arriendo | depto | Ñuñoa | $560.000 | $80.000 | 2D/1B | 58 | disponible |
| P3 | arriendo | casa | Maipú | $650.000 | — | 3D/2B | 90 | disponible |
| P4 | arriendo | depto | Providencia | $480.000 | $70.000 | 1D/1B | 40 | **arrendada** |
| P5 | venta | depto | Ñuñoa | UF 3.400 | $75.000 | 2D/2B | 62 | disponible |
| P6 | venta | depto | San Miguel | UF 4.200 | $60.000 | 3D/2B | 78 | disponible |
| P7 | venta | casa | La Florida | UF 6.500 | — | 4D/3B | 120 | disponible |
| P8 | venta | depto | Las Condes | UF 5.900 | $110.000 | 2D/2B | 70 | disponible |

Direcciones referenciales verosímiles en seed (ej. P2: "Av. Irarrázaval alt. 3400, Ñuñoa").

### Tabla `visitas`
`id, propiedad_id, nombre, telefono, fecha, hora, estado (agendada|cancelada), creado_en`

Semilla: 1 visita pre-agendada para probar colisión de slot — P2, "Marcela Fuentes", +56 9 8765 4321, próximo miércoles 12:00.

### Tabla `leads`
`id, nombre, telefono (único), operacion, comuna, presupuesto, urgencia, propiedad_interes, score, nota, actualizado_en`

Semilla: 1 lead existente para probar upsert — "Marcela Fuentes", +56 9 8765 4321, arriendo, Ñuñoa, $600.000, inmediata, P2, caliente.

## Casos de uso

- **CU-1 Saludo y atención general**: "hola" → se presenta como asistente de Corredora Andes Propiedades y ofrece: buscar propiedades, agendar visita, responder dudas (requisitos, comisiones, horarios). Sin muros de texto.
- **CU-2 Captura temprana de contacto**: cliente muestra interés concreto ("busco depto en arriendo") → el bot responde Y pide nombre + teléfono a más tardar tras la primera búsqueda. Si se niega, insiste UNA vez y sigue atendiendo (regla 1 y supuesto 10).
- **CU-3 Búsqueda con resultados**: "busco depto en arriendo en Ñuñoa, máximo 600 mil" → `buscar_propiedades(arriendo, Ñuñoa, 600000)` → ofrece P2 con precio, GC, dorm y m² reales. No lista propiedades no disponibles (P4 jamás aparece en resultados).
- **CU-4 Búsqueda sin resultados (captura lead igual)**: "arriendo en Vitacura por 300 mil" → sin match exacto → lo dice honestamente, ofrece lo más cercano (ej. P1 Santiago Centro $420.000) y hace `registrar_lead` con la búsqueda. El lead queda registrado aunque no le guste nada.
- **CU-5 Detalle de propiedad**: "cuéntame más de la de Ñuñoa" → `detalle_propiedad(P2)` → GC, m², dirección referencial. Si pide "¿y en pesos?" una de venta → conversión aproximada con UF referencial, marcada como aproximada.
- **CU-6 Agendar visita en día válido**: "quiero visitarla el miércoles a las 11:30" (con nombre y teléfono ya capturados) → `agendar_visita(P2, ...)` → confirmación con propiedad, fecha y hora; lead pasa a caliente. Si faltan nombre/teléfono, los pide antes de agendar.
- **CU-7 Día/hora inválido (reencauzar)**: "¿puedo ir el martes a las 16:00?" → NO agenda; explica que las visitas son lunes, miércoles y jueves de 11:00 a 14:00 y ofrece el slot válido más cercano (miércoles 11:00). Aplica igual para sábado, domingo o Lu/Mi/Ju fuera de 11–14.
- **CU-8 Ver/cancelar visita**: "¿cuándo quedó mi visita?" → `mis_visitas(telefono)` con propiedad, fecha y hora. "cancélala" → `cancelar_visita` de la correcta; con varias visitas pide elegir cuál.
- **CU-9 Requisitos de arriendo**: "¿qué piden para arrendar?" → `info_corredora(requisitos_arriendo)`: renta 3x, liquidaciones, contrato vigente, Dicom, aval, garantía + mes anticipado. Nunca inventa ni omite el 3x. Ídem "¿cuánto cobran de comisión?" → tema comisiones.
- **CU-10 Propiedad ya no disponible**: "vi un depto en Providencia en 480" → `detalle_propiedad(P4)` estado arrendada → informa que ya se arrendó, ofrece alternativas similares (P1, P2) y registra el lead con su interés.
- **CU-11 Calificación completa con score**: conversación donde el cliente entrega nombre, teléfono, operación (arriendo), comuna (Ñuñoa), presupuesto ($600.000) y urgencia ("me cambio este mes") → `registrar_lead` retorna **caliente** (urgencia inmediata + presupuesto). Variantes verificables: mismo flujo con "en unos 2 meses" → **tibio**; "solo estoy mirando" sin presupuesto → **frío**.
- **CU-12 Fuera de alcance**: pagos, reservas con abono, tasaciones, redacción de contrato, negociación de precio → redirige en una línea al corredor humano (deja nota en el lead si hay teléfono).

## Adversariales (QA obligatorio)

- **ADV-1**: pedir visita en fecha pasada → rechazo claro + próximo día válido.
- **ADV-2**: doble "confirmo" o cliente que repite la confirmación → NO duplica la visita; queda una sola.
- **ADV-3**: propiedad inexistente ("la P20", "la casa de Vitacura") → informa que no existe en el catálogo, ofrece búsqueda; no inventa fichas.
- **ADV-4**: slot ocupado (próximo miércoles 12:00 en P2, ocupado por seed) → no agenda encima; ofrece el siguiente slot libre real de ese día.
- **ADV-5**: pregunta por dato que no está en la ficha ("¿aceptan mascotas en P3?") → no inventa; "lo confirmo con el corredor" + `registrar_lead` con nota.
- **ADV-6**: cliente cambia de propiedad/fecha 2 veces antes de confirmar → no se crean visitas fantasma; queda solo la última confirmada.

## Cambios técnicos respecto de la base

1. Clonar `agente-citas`; renombrar dominio citas→visitas en prompts y textos (código puede conservar nombres internos de la base).
2. Ventana de agenda: `DIAS_VISITA=[lun,mié,jue]`, 11:00–14:00, `SLOT_MINUTOS=30`. `consultar_disponibilidad` retorna próximo día válido cuando la fecha pedida no lo es; `agendar_visita` retorna el slot válido más cercano en el error.
3. Tablas/seed nuevas: `propiedades`, `leads` (+ `visitas` adaptada de `citas` con `propiedad_id`) — schema.sql y seed según sección Datos.
4. Tools nuevas: `buscar_propiedades`, `detalle_propiedad`, `registrar_lead` (con cálculo de score determinístico), `info_corredora`. Adaptar `mis_citas`/`cancelar_cita` → `mis_visitas`/`cancelar_visita` mostrando propiedad.
5. `agent/llm.js` → adapter multi-proveedor de la fábrica (`plantillas/base-agente/llm.js`). Runtime: Gemini 2.0 Flash free tier (key del pool, marcar como usada en `secrets/README.md`).
6. Canal demo: **`npm run chat` por terminal** — sin Telegram en v1, sin botones, texto plano. No registrar como subagente.
7. System prompt: captura temprana de contacto (regla 1), ventana de visitas dura, precios UF/CLP, tono cercano chileno, nunca inventar datos de fichas ni FAQ.

## Fuera de alcance v1 (del BRIEF)

- Canal WhatsApp/Telegram real (la demo es por terminal; producción se decide con el cliente).
- Integración con planilla o CRM real de la corredora.
- Aviso automático al corredor por lead caliente y resumen semanal (extras vendibles v2).
- Pagos, reservas con abono, firma de documentos.

## Política de tests

`npm test` corre SIEMPRE en mock — 0 tokens. Cada CU y ADV de arriba se convierte en escenario de test verificable (score de leads y ventana de visitas se testean determinísticamente contra las tools, sin LLM). La validación con modelo real la hace José por terminal (`npm run chat`) con Gemini free tier — costo $0.
