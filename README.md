# 🏭 Fábrica de Agentes

Fábrica de productos para pymes de servicio, en dos líneas de producción que no se mezclan:

- **Conversacional** — agentes que conversan: agendamiento (clínicas dentales, inmobiliarias, servicios), retail (petshops, abarrotes) y atención al cliente por WhatsApp/Telegram/web.
- **Automatización** — procesos internos del negocio: orden de trabajo, cotización y cierre, sesiones recurrentes. Un objeto avanza por estados, avisa solo en cada cambio, y el dueño ve un panel.

**Modelo de operación**: José entrega el pedido del cliente → Claude (COO de la fábrica) construye, testea y documenta de forma autónoma → José evalúa → se itera hasta entregar.

## Uso

Abrir Claude Code en esta carpeta y correr:

```
/fabrica "clínica dental San Martín necesita un bot de WhatsApp para agendar horas, 3 doctores, lunes a viernes"
```

La fábrica hace el resto: clasifica la línea, spec, arquitectura, build sobre la plantilla probada, QA con cero efectos externos, kit de entrega y documentación en Notion. El resultado queda en la carpeta externa del proyecto (una por cliente, fuera del repo) listo para revisar.

## Estructura

Este repo guarda **solo la maquinaria**. Los proyectos de clientes nacen **fuera**, en una carpeta por cliente (ver `CLAUDE.md`).

```
fabrica__agentes/
├── CLAUDE.md               # Constitución: rol, autonomía, reglas duras
├── nuevo-proyecto.ps1      # Crea la carpeta externa de un proyecto (git + .gitignore seguro)
├── .claude/
│   ├── skills/fabrica/     # La skill maestra (pipeline completo, clasifica la línea)
│   └── agents/             # Equipo: analista, desarrollador, qa, marketing, documentador
├── lineas/
│   ├── conversacional/     # Línea 1: agentes que conversan
│   │   ├── LINEA.md
│   │   ├── catalogo/       # Verticales listos para vender
│   │   └── plantillas/base-agente/   # Adapter LLM + guía de instanciación
│   └── automatizacion/     # Línea 2: procesos internos del negocio
│       ├── LINEA.md
│       ├── catalogo/       # orden-de-trabajo, cotizacion-y-cierre, sesiones-recurrentes
│       └── plantillas/base-proceso/  # Esqueleto (se construye con el 1er cliente)
├── docs/
│   ├── PIPELINE.md         # Fases (incluye fase 0 de clasificación) y DoD
│   ├── ARQUITECTURA.md     # Independencia LLM (conversacional) + stack y cortafuegos (automatización)
│   ├── FLUJO-COMERCIAL.md  # De prospecto a mensualidad + frontera de postventa
│   └── DECISIONES.md       # Registro de decisiones (espejo en Notion)
├── secrets/                # Pool de credenciales (ignorado por git)
└── clientes/
    └── _plantilla/         # Plantillas de BRIEF y BITÁCORA (el índice real vive en Notion)
                            # NINGÚN proyecto de cliente vive acá: todos nacen afuera
```

## Base tecnológica

Los agentes se clonan de `C:\Users\Adela\chaski-agentes\` (arquitectura probada: Express + WhatsApp Cloud API + Telegram + Supabase + loop agéntico con tools, deploy en Railway). El runtime de LLM es intercambiable por variable de entorno — ver `docs/ARQUITECTURA.md`.
