# Vertical: Inmobiliaria / corretaje

**Base a clonar**: la plantilla oficial (`lineas/conversacional/plantillas/base-agente/`).

**Implementación de referencia: Sofía, de Gesta Inmobiliaria** (2026-09-16, núcleo 1.7.0). Es el primer agente real de esta línea y resolvió las tres cosas que este vertical siempre pide. Mirarla antes de escribir una desde cero:

- **El catálogo vive en la planilla del cliente, no en una tabla.** Se lee la hoja de Google publicada como CSV, sin credencial (usar la API exigiría una cuenta de servicio nueva: gate 🔴). Caché de 15 min, última copia buena si Google no responde, y un CSV en el repo como piso. La corredora edita una celda y el bot cambia lo que dice.
- **La ficha la arma el código, no el modelo.** Un modelo que redacta una ficha es un modelo que puede redondear un precio. El modelo decide cuándo mandarla; qué dice sale de la planilla carácter por carácter.
- **Un dato ambiguo no se muestra, y se reporta.** Un precio escrito sin moneda no se puede adivinar: se omite y `npm run datos` lista la fila para arreglarla.

Referencia viva además: los agentes y skills de Gesta Propiedades ya existentes (gesta-anuncios, gesta-campanas-meta).

## Qué vende

Bot que califica leads y agenda visitas: responde consultas por propiedades publicadas, filtra por presupuesto/comuna/dormitorios, y convierte al interesado en visita agendada con el corredor. Dolor: los leads de portales/Meta Ads llegan a toda hora y se enfrían en minutos.

## Tools típicas

- `buscar_propiedades(operacion, comuna?, presupuesto_max?, dormitorios?)`
- `detalle_propiedad(id)` — precio, gastos comunes, m², fotos (link)
- `agendar_visita(propiedad, nombre, telefono, fecha, hora)`
- `registrar_lead(nombre, telefono, interes)` — aunque no agende, el lead queda capturado
- `info_corredora()` — comisiones, requisitos de arriendo (renta 3x, aval, etc.)

**Ojo con los requisitos de arriendo**: la tentación es escribir los del mercado chileno en el prompt ("renta 3 veces el arriendo, aval, DICOM limpio"). En Sofía son **de cada propiedad** y los escribe la corredora en una columna: el botón "Requisitos" solo aparece si esa fila los trae, y si no los trae el bot lo dice en vez de recitar los de siempre. Hay un escenario adversarial dedicado a que no los invente.

## Datos

Tablas: propiedades (operación, comuna, precio UF/CLP, dormitorios, estado), visitas, leads. Semilla demo: 6-8 propiedades verosímiles de distintas comunas y rangos.

## Personalización clave

- SIEMPRE capturar nombre y teléfono temprano (el lead es el producto, la visita es el bonus).
- Requisitos de arriendo chilenos correctos (renta 3x, contrato, aval) — configurables por corredora.
- Si nada calza con el presupuesto, ofrecer lo más cercano + registrar la búsqueda del lead.
- Precios en UF cuando corresponde, con conversión aproximada a CLP si la piden.

## QA mínimo

Búsqueda con resultados, búsqueda sin resultados (captura lead igual), agendar visita, pregunta de requisitos de arriendo, lead que pregunta por propiedad ya arrendada.

## Extras vendibles

Aviso automático al corredor por lead caliente, resumen semanal de leads, integración con la planilla de propiedades que ya usa la corredora (como la de Gesta).
