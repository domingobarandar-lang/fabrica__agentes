# LANZAMIENTO — cómo se distribuye Rondas QR

Pregunta de José: ¿App Store, Play Store, o descarga desde el navegador, considerando que es para una empresa específica y no abierta a todo público?

## Recomendación: navegador (PWA), sin tiendas ⭐

Para este producto y este cliente, las tiendas son puro costo y cero beneficio. La app ya está construida como PWA precisamente por esto.

**Por qué el navegador gana aquí:**

1. **Es un producto B2B cerrado**: los usuarios son ~5 guardias y 1 administrador por condominio, reclutados en persona. No hay descubrimiento en tienda que valga — nadie busca "rondas" en Play Store y nos encuentra: nos instala José en la capacitación de 15 minutos.
2. **Instalación en 30 segundos**: el guardia abre `https://rondas.<dominio>.cl` en Chrome → "Agregar a pantalla de inicio" → queda con ícono, pantalla completa y funcionamiento offline, indistinguible de una app nativa. Sin cuenta de Google, sin permisos de tienda, sin espacio ocupado relevante.
3. **Actualizaciones al instante**: un deploy y todos los teléfonos quedan al día en la próxima carga. En Play Store cada fix espera revisión (horas a días) y depende de que el guardia actualice.
4. **Cero costos y trámites de tienda**: Play exige cuenta de developer (US$25), datos de privacidad, revisiones; App Store US$99/año + revisión más dura — y en iOS igual tendríamos limitaciones (sin Web NFC, peor PWA). Los guardias en Chile son ~90 % Android: iOS no es requisito del segmento.
5. **Todo lo que la app necesita funciona en PWA**: cámara (QR), GPS, offline (service worker), pantalla de inicio. Lo único que pediría app nativa es NFC en iPhone — irrelevante para este cliente (y en Android, Web NFC funciona en Chrome).

**Requisito único**: HTTPS con dominio propio (la cámara y el GPS lo exigen fuera de localhost). Railway lo da automático; un dominio `.cl` cuesta ~CLP 10.000/año.

## Plan de lanzamiento en 3 fases

**Fase 0 — Piloto (semana 1-2)**
- Deploy en Railway con HTTPS + dominio (única decisión con costo: ~US$5/mes, la aprueba José).
- Cargar datos reales del condominio piloto: puntos, guardias, rondas. Fijar ubicación GPS de cada punto el día de instalación (OPERACION.md).
- Imprimir y plastificar la hoja de QR. Capacitación de 15 min a los guardias en la caseta, instalando la PWA teléfono por teléfono.
- José observa la primera ronda real completa (la "tarea" de SEGURIDAD.md).

**Fase 1 — Operación pagada (mes 1)**
- 2 semanas de rondas reales → revisar informes con el administrador: ¿confía en lo que ve? ¿qué le falta?
- Activar Telegram para el administrador (5 min, OPERACION.md).
- Fijar precio con el dato de COMPETENCIA.md (cotizaciones incógnito) — decisión de José.

**Fase 2 — Cartera (mes 2+)**
- Mismo servidor, más condominios (multi-condominio ya probado). Un subdominio por cliente si se quiere imagen dedicada.
- Migrar persistencia a SQLite/Postgres al pasar de ~3 condominios activos (OPERACION.md).
- Vender el upgrade NFC (SEGURIDAD.md, Capa 2) a los que pidan más blindaje.

## ¿Cuándo SÍ convendría una tienda?

Solo si el negocio cambia de forma: producto masivo autoservicio (cualquier administrador se registra solo) o exigencia corporativa de "app oficial" en licitaciones. Incluso entonces, el camino barato es **TWA (Trusted Web Activity)**: empaquetar esta misma PWA como app de Play Store sin reescribir nada, o distribuirla por **Google Play administrado** (apps privadas para una empresa, sin publicarla al público). iOS solo si aparece un cliente que lo pague.

**Resumen para José**: navegador ahora y probablemente para siempre en este segmento; la puerta a Play queda abierta con TWA sin reescribir ni una línea.
