# Vertical: Inmobiliaria / corretaje

**Base a clonar**: `chaski-agentes/agente-citas` (visitas = citas) con tools extra de catálogo de propiedades. Referencia viva: los agentes y skills de Gesta Propiedades ya existentes (gesta-anuncios, gesta-campanas-meta).

## Qué vende

Bot que califica leads y agenda visitas: responde consultas por propiedades publicadas, filtra por presupuesto/comuna/dormitorios, y convierte al interesado en visita agendada con el corredor. Dolor: los leads de portales/Meta Ads llegan a toda hora y se enfrían en minutos.

## Tools típicas

- `buscar_propiedades(operacion, comuna?, presupuesto_max?, dormitorios?)`
- `detalle_propiedad(id)` — precio, gastos comunes, m², fotos (link)
- `agendar_visita(propiedad, nombre, telefono, fecha, hora)`
- `registrar_lead(nombre, telefono, interes)` — aunque no agende, el lead queda capturado
- `info_corredora()` — comisiones, requisitos de arriendo (renta 3x, aval, etc.)

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
