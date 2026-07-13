# 🏭 Fábrica de Agentes

Fábrica de agentes conversacionales para pymes: agendamiento (clínicas dentales, inmobiliarias, servicios), retail (petshops, abarrotes) y atención al cliente en canales digitales (WhatsApp, Telegram, web).

**Modelo de operación**: José entrega el pedido del cliente → Claude (COO de la fábrica) construye, testea y documenta de forma autónoma → José evalúa → se itera hasta entregar.

## Uso

Abrir Claude Code en esta carpeta y correr:

```
/fabrica "clínica dental San Martín necesita un bot de WhatsApp para agendar horas, 3 doctores, lunes a viernes"
```

La fábrica hace el resto: spec, arquitectura, build sobre la plantilla probada, QA en modo mock, kit de entrega y documentación en Notion. El resultado queda en `clientes/<slug>/` listo para revisar.

## Estructura

```
Fabrica_Agentes/
├── CLAUDE.md               # Constitución: rol, autonomía, reglas
├── .claude/
│   ├── skills/fabrica/     # La skill maestra (pipeline completo)
│   └── agents/             # Equipo: analista, desarrollador, qa, marketing, documentador
├── docs/
│   ├── PIPELINE.md         # Fases y definición de "terminado"
│   ├── ARQUITECTURA.md     # Independencia del proveedor de LLM + control de costos
│   └── DECISIONES.md       # Registro de decisiones (espejo en Notion)
├── plantillas/
│   └── base-agente/        # Adapter LLM multi-proveedor + guía de instanciación
├── catalogo/               # Verticales listos para vender
└── clientes/               # Un folder por pedido
```

## Base tecnológica

Los agentes se clonan de `C:\Users\Adela\chaski-agentes\` (arquitectura probada: Express + WhatsApp Cloud API + Telegram + Supabase + loop agéntico con tools, deploy en Railway). El runtime de LLM es intercambiable por variable de entorno — ver `docs/ARQUITECTURA.md`.
