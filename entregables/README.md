# `entregables/` — carpeta de tránsito, no de residencia

**Esto contradice una regla dura de la constitución, y es a propósito y por poco tiempo.**

La regla dice: *"Ningún proyecto de cliente nace dentro de `fabrica__agentes/`. Nace en su
carpeta propia fuera del repo, con su propio git."* Sigue siendo la regla. Esta carpeta
existe porque el trabajo se hizo en un contenedor remoto y efímero: no hay carpeta madre
de clientes, no hay PowerShell para correr `nuevo-proyecto.ps1`, y lo que no se empuja a
git se pierde cuando el contenedor se recicla.

Las dos opciones eran entregar el trabajo acá o no entregarlo.

## Qué hay adentro

| Carpeta | Qué es | Estado |
|---|---|---|
| `gesta-inmobiliaria/` | Sofía, el agente de WhatsApp de la corredora Gesta | Construido y probado en mock. Falta credenciales y deploy |

La estructura es exactamente la que produce `nuevo-proyecto.ps1`:

```
gesta-inmobiliaria/          ← carpeta del CLIENTE (acá va su git propio)
  .gitignore                 ← .env y node_modules fuera, desde el primer commit
  CLIENTE.md                 ← qué contrató, credenciales POR NOMBRE
  BITACORA.md                ← append-only, del cliente
  bot-sofia/                 ← carpeta del PROYECTO
    BRIEF.md  SPEC.md  QA.md
    entrega/                 ← el kit para el cliente + la demo navegable
    agente/                  ← el código
```

## Cómo sacarla de acá (lo hace José, en su máquina)

```powershell
# 1. Mover la carpeta del cliente a la carpeta madre, FUERA del repo
Move-Item .\entregables\gesta-inmobiliaria C:\ruta\a\clientes\

# 2. Darle su propio git
cd C:\ruta\a\clientes\gesta-inmobiliaria
git init ; git add . ; git commit -m "Sofía — agente de WhatsApp de Gesta Inmobiliaria"

# 3. Verificar que el núcleo quedó bien instalado
cd C:\ruta\al\repo\fabrica__agentes
.\scripts\sincronizar-nucleo.ps1 -Proyecto C:\ruta\a\clientes\gesta-inmobiliaria\bot-sofia\agente

# 4. Borrar esta carpeta del repo de la fábrica
git rm -r entregables\gesta-inmobiliaria ; git commit -m "Gesta sale de la fábrica a su carpeta propia"
```

Después de eso, `entregables/` queda con este README y nada más, y la regla vuelve a no
tener excepciones.

**Ojo con el paso 3**: `.env.example` va a aparecer como **FALTANTE** o distinto, y está
bien — desde la 1.7.0 ese archivo es de la semilla y no del núcleo, justamente porque este
proyecto necesita declarar su `PLANILLA_URL`.
