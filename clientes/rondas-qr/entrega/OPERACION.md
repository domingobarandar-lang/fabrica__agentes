# OPERACIÓN — Rondas QR

Guía de administración y operación. Público: José (soporte) y el administrador del condominio (uso diario).

## Uso diario del administrador (panel web)

Todo se hace en `https://<servidor>/admin.html` con su usuario y PIN:

- **Informes**: cada ronda cerrada aparece al instante con su estado. "Ver informe" abre el detalle imprimible. Si un guardia dejó una ronda abierta (se le olvidó cerrar), el botón **Cerrar** la cierra y evalúa con lo marcado hasta ese momento.
- **Puntos**: agregar/renombrar/eliminar sectores. Tras cualquier cambio, reimprimir la **hoja de QR** y pegar la lámina nueva. El código de 6 letras bajo cada QR es el respaldo para entrada manual.
- **Verificación GPS de cada punto**: desde un teléfono, parado junto al punto, tocar **"📍 Fijar aquí"**. Desde ese momento toda marca en ese punto se compara por distancia: a más de 75 m (+ margen por precisión del GPS) el informe la acusa como **"⚠️ a X m del punto"**, y las marcas sin GPS quedan observadas. "Quitar 📍" desactiva la verificación. Recomendación: fijar la ubicación de todos los puntos el día de la instalación.
- **Guardias**: crear usuario + PIN (4-8 dígitos). "Nuevo PIN" si se le olvidó. Eliminar corta el acceso de inmediato.
- **Rondas**: armar la secuencia tocando los puntos en orden. "El orden importa" hace que marcar desordenado quede como observación. La duración máxima genera observación si se excede. Los guardias ven los cambios al tocar "Actualizar rondas".
- **Avisos**: historial de notificaciones enviadas.

## Guardias: instalación en el teléfono

1. Abrir `https://<servidor>/` en Chrome (Android) → menú → **"Agregar a pantalla de inicio"**. Queda como app.
2. Entrar con usuario y PIN **con conexión** (wifi de portería basta). Después la ronda funciona sin señal.
3. La cámara requiere **HTTPS** (o localhost). En producción el servidor ya va con HTTPS; si algún teléfono no da permiso de cámara, siempre está la entrada manual.

## Activar avisos por Telegram (opcional, 5 minutos)

1. En el servidor: editar `.env` → `MOCK=false` (el token del bot ya viene configurado). Reiniciar.
2. El administrador le escribe `/start` al bot del condominio en Telegram.
3. Obtener su `chat_id` (visitar `https://api.telegram.org/bot<TOKEN>/getUpdates` tras el /start y copiar `message.chat.id`).
4. Pegarlo en el panel → pestaña **Avisos** → guardar. Desde ahí, cada informe llega al Telegram del administrador.

Mientras `MOCK=true`, los avisos quedan solo en el panel — útil para demos y para operar sin Telegram.

## Deploy a producción (cuando José apruebe)

- **Railway** (o VPS): `npm install && npm start`, variable `PORT` la pone la plataforma. Railway da HTTPS solo — necesario para la cámara. Costo estimado: plan chico (~US$5/mes). **Runtime sin LLM: el uso diario cuesta $0 en APIs.**
- Un servidor sirve a **varios condominios** a la vez (aislados entre sí). Los condominios y sus administradores se crean hoy por seed/soporte (no hay superadmin web en la v1 — decisión de alcance).
- **Respaldo**: copiar `data/db.json` (todo el estado vive ahí). Basta un respaldo diario.
- **Escala**: con más de ~3 condominios activos o mucho historial, migrar `lib/store.js` a SQLite/Postgres (es el único módulo que toca disco; el resto del código no cambia).

## Limitaciones conocidas de la v1 (transparencia con el cliente)

- **QR fotografiado**: un guardia podría escanear una foto del QR sin ir al punto. Mitigación desde la v1.1: **verificación de presencia por GPS** — con la ubicación del punto fijada, una marca lejana o sin GPS queda acusada en el informe. Además horas, orden y duración delatan patrones raros. El GPS del teléfono puede falsearse con apps especiales (root); si un condominio lo exige, la v2 contempla NFC físico.
- **Hora offline**: las marcas sin señal usan el reloj del teléfono y quedan etiquetadas "(offline)" en el informe.
- El login inicial del guardia requiere conexión; después la ronda es 100 % offline.

## Solución de problemas rápidos

| Síntoma | Causa probable | Solución |
|---|---|---|
| "La cámara no abre" | Sin permiso o sin HTTPS | Dar permiso en Chrome; usar entrada manual mientras |
| "Ese código no corresponde…" | QR de otro condominio o punto fuera de la ronda | Verificar que la lámina pegada sea la del sector correcto |
| Guardia sin acceso | PIN olvidado | Panel → Guardias → "Nuevo PIN" |
| No llegan avisos a Telegram | `MOCK=true`, chat_id vacío o token inválido | Revisar los 4 pasos de activación; el error exacto queda en Avisos |
| Ronda quedó "En curso" | Guardia no cerró | Panel → Informes → "Cerrar" |
