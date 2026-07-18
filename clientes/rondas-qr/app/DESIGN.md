# DESIGN.md — sistema de diseño de Rondas QR

Dos superficies, un sistema. Los tokens viven duplicados (a propósito, sin build step) en `public/estilos.css` (guardia) y `public/admin.css` (admin + informe + hoja QR): **mismos nombres, valores mapeados al tema**. Si agregas un color o radio, agrégalo en ambos.

## Principios

1. **El guardia opera de noche, apurado y con una mano**: fondo oscuro, un botón protagonista por pantalla (`btn-gigante`), touch targets ≥ 44 px, feedback inmediato (vibración + aviso). Nada de menús.
2. **El administrador lee veredictos, no dashboards**: el estado de una ronda se entiende por el chip (verde/ámbar/rojo) sin leer nada más. Números con `tabular-nums` para comparar columnas.
3. **Todo imprime bien**: informe y hoja QR son documentos; `@media print` quita interfaz y sombras.
4. **Movimiento discreto**: transiciones de 150 ms, `:active` con scale 0.98, y respeto a `prefers-reduced-motion`.

## Tokens

| Token | Guardia (oscuro) | Admin (claro) | Uso |
|---|---|---|---|
| `--marca` | `#22c55e` | `#22c55e` | Acentos, foco, progreso |
| `--marca-fuerte` | `#15803d` | `#15803d` | Botón principal, links admin |
| `--marca-suave` | `rgba(34,197,94,.14)` | igual | Fondos de énfasis, ring de foco |
| `--fondo` | `#0f172a` | `#f8fafc` | Fondo de página |
| `--panel` | `#1e293b` | `#ffffff` | Tarjetas, tablas, diálogos |
| `--borde` | `#334155` | `#e2e8f0` | Bordes y divisores |
| `--texto` / `--texto-suave` | `#e2e8f0` / `#94a3b8` | `#0f172a` / `#64748b` | Jerarquía de texto (AA en ambos temas) |
| `--peligro` (+`-suave`) | `#ef4444` | `#dc2626` / `#fee2e2` | Incompleto, eliminar, errores |
| `--alerta` (+`-suave`/`-texto`) | `#f59e0b` | `#b45309` / `#fef3c7` | Observaciones, offline |
| `--exito` (+`-suave`) | — (usa marca) | `#166534` / `#dcfce7` | Chip "Completa" |
| `--info-*` | azul `#60a5fa` | — | Tarjeta de sincronización |
| `--radio-s / -m / -pill` | 10 / 14 / 999 px | igual | Inputs y cajas / tarjetas y diálogos / chips |
| `--esp-1..6` | 4/8/12/16/20/24 px | igual | Escala de espaciado (base 4) |
| `--texto-xs..2xl` | 12→24 px | 12→15 px | El guardia lee más grande que el admin |
| `--sombra-1 / -2` | — (bordes, no sombras) | suaves | Elevación solo en tema claro |
| `--t` | 150ms ease | igual | Única duración de transición |

## Componentes

- **Botón**: variantes `btn-principal` (una por pantalla), `btn-borde`, `btn-peligro` (siempre borde, nunca relleno rojo — el rojo relleno se reserva para avisos de error), tamaños `btn-chico` / `btn-gigante`. Estados: hover (solo admin/desktop), `:active` scale, `:focus-visible` ring de marca.
- **Chip de estado**: `chip-verde` Completa · `chip-ambar` Con observaciones · `chip-roja` INCOMPLETA · neutro En curso. Es el elemento de mayor jerarquía informativa del panel — nunca usar estos colores de fondo para otra cosa.
- **Fila de punto** (guardia): número en círculo → check con `--marca-suave` al completarse. El avance grande (`.progreso`) es la métrica emocional del guardia: siempre visible.
- **Tarjeta QR** (hoja imprimible): borde punteado = línea de recorte; nombre grande + código corto espaciado para tipear de noche.
- **Aviso flotante**: entra con `aviso-entra` (180 ms), un solo aviso a la vez, 3 s en pantalla.

## Reglas rápidas (do / don't)

- ✅ Colores solo vía tokens. ❌ Ningún hex suelto en reglas nuevas.
- ✅ Un `btn-principal` por vista. ❌ Dos acciones primarias compitiendo.
- ✅ Mensajes de error en texto claro y accionable ("Usuario o PIN incorrectos."). ❌ Códigos o jerga.
- ✅ `tabular-nums` en horas, códigos y conteos. ❌ Números que "bailan" al actualizarse.
- ✅ Nuevos estados de ronda → agregar chip aquí y en `CHIPS` de `admin.js` + `informe.html`. ❌ Estados sin color semántico.
