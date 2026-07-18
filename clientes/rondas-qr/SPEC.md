# SPEC — Rondas QR (control de rondas de guardias)

**Fecha**: 2026-07-16 · **Estado**: aprobada por el orquestador (supuestos al final)

## Qué es

Sistema de control de rondas de seguridad para condominios que reemplaza chapitas físicas (iButton) + lectora por QR impresos + el teléfono del guardia.

Tres piezas, una sola app Node:

1. **PWA del guardia** (teléfono): login, ronda descargada, escaneo de QR, funciona sin señal.
2. **Panel del administrador** (navegador): configura puntos/guardias/rondas, imprime la hoja de QR, ve los informes.
3. **API + motor de rondas** (servidor Node): valida escaneos, cierra rondas, genera informes, envía alertas.

## Actores

- **Guardia**: usuario con PIN; ejecuta rondas escaneando QR.
- **Administrador**: usuario con PIN; configura su condominio y recibe informes.
- Cada usuario pertenece a **un** condominio. Una instalación sirve a varios condominios sin mezclarlos.

## Casos de uso (verificables)

- **CU-01 Login**: `usuario + PIN` correctos → sesión iniciada con rol y condominio. PIN incorrecto → error claro y sin sesión.
- **CU-02 Ronda descargada**: el guardia autenticado obtiene las rondas de su condominio con la lista ordenada de puntos; el paquete queda guardado en el teléfono y la ronda puede ejecutarse aunque se caiga la conexión.
- **CU-03 Iniciar ronda**: el guardia inicia una ejecución → queda registrado quién, qué ronda y a qué hora.
- **CU-04 Escaneo válido**: QR de un punto de la ronda en curso → se registra con timestamp, el punto se marca hecho y se ve el avance (n/total).
- **CU-05 Escaneo inválido**: QR de otro condominio, de un punto inexistente o texto arbitrario → rechazado con mensaje claro; no se registra nada.
- **CU-06 Escaneo duplicado**: mismo punto dos veces en la misma ejecución → se conserva el primer registro y se avisa al guardia; no se duplica.
- **CU-07 Offline**: sin conexión, los escaneos quedan en cola local con su timestamp original; al volver la conexión se sincronizan tal cual (marcados `offline` en el informe).
- **CU-08 Cierre y evaluación**: al cerrar la ronda (guardia, o el admin desde el panel si quedó abierta), el servidor evalúa: puntos faltantes, orden violado (si la ronda es estricta) y duración vs máximo permitido.
- **CU-09 Informe**: cada cierre genera un informe con condominio, ronda, guardia, inicio/fin/duración, detalle por punto (hora de marca o **FALTANTE**) y estado global: `Completa`, `Completa con observaciones` o `Incompleta`.
- **CU-10 Alerta de punto saltado**: si faltan puntos, el informe queda `Incompleta` y el administrador recibe una notificación (Telegram real si está configurado; registro en mock por defecto) con los puntos faltantes.
- **CU-11 Panel admin**: alta/edición de puntos, guardias y rondas del condominio; listado de informes con estado visible de un vistazo.
- **CU-12 Hoja de QR**: el admin genera una hoja imprimible con el QR de cada punto (+ código corto al pie) para pegar en los sectores.
- **CU-13 Entrada manual de respaldo**: si la cámara falla o el QR está dañado, el guardia tipea el código corto de 6 caracteres impreso bajo el QR — misma validación que el escaneo.
- **CU-14 Aislamiento multi-condominio**: usuarios, puntos, rondas e informes de un condominio jamás se ven ni se validan desde otro.
- **CU-15 GPS en cada marca** *(v1.1)*: al marcar un punto, la app adjunta la ubicación GPS del teléfono (lat/lon/precisión) si está disponible. **El GPS nunca bloquea la marca**: sin señal GPS la marca vale igual y queda etiquetada "sin ubicación".
- **CU-16 Verificación de presencia** *(v1.1)*: el administrador puede fijar la ubicación real de cada punto (desde su teléfono parado en el lugar, o quitarla). Si un punto tiene ubicación y la marca llegó con GPS, el servidor calcula la distancia: a más de 75 m (+ margen por precisión del GPS, tope 50 m) la marca queda **"lejos del punto"** — observación destacada en el informe y en el aviso al administrador. Marcas sin GPS sobre puntos georreferenciados también quedan observadas.

## Reglas de negocio

- **QR = punto**: payload `RQR:<condominioId>:<puntoId>:<codigoCorto>`. El código corto (6 caracteres, sin ambiguos 0/O/1/I) va impreso bajo el QR y sirve para la entrada manual.
- **Ronda estricta**: el orden importa; marcar fuera de orden genera *observación* en el informe (el punto igual cuenta como hecho).
- **Duración máxima**: excederla genera *observación*; no invalida la ronda.
- **Duplicados**: gana el primer escaneo.
- **Timestamps offline**: son los del teléfono; el informe los distingue con la marca `offline`.
- **Estados del informe**: `Incompleta` si falta ≥1 punto; `Completa con observaciones` si no falta nada pero hubo orden violado o exceso de duración; `Completa` si todo limpio.

## Datos

- `condominios`: id, nombre, adminTelegramChatId (opcional).
- `usuarios`: id, condominioId, usuario, pinHash, rol (`guardia`|`admin`), nombre.
- `puntos`: id, condominioId, nombre, codigoCorto.
- `rondas` (plantillas): id, condominioId, nombre, puntoIds (ordenados), ordenEstricto, duracionMaxMin.
- `ejecuciones`: id, rondaId, condominioId, guardiaId, inicio, fin, estado, escaneos [{puntoId, ts, offline}], evaluacion {faltantes, fueraDeOrden, duracionMin, observaciones}.
- Persistencia v1: archivo JSON con escritura atómica (cero dependencias nativas). Migración a SQLite/Postgres documentada para producción de volumen.

## Datos semilla (demo)

- Condominio **Los Aromos**: admin `marta` (PIN 1111); guardias `pedro` (PIN 2222) y `luis` (PIN 3333); 8 puntos (Portería, Estacionamiento A, Quincho, Piscina, Bodega, Sala de bombas, Acceso trasero, Sede social); ronda **Nocturna completa** (los 8 puntos, estricta, 45 min) y ronda **Perimetral express** (4 puntos, no estricta, 20 min).
- Condominio **Mirador del Valle**: admin `carmen` (PIN 4444), guardia `jorge` (PIN 5555), 3 puntos, 1 ronda — existe para verificar CU-14.

## Fuera de alcance v1

App nativa, GPS/NFC anti-fraude (QR fotografiado), fotos de incidencias, WhatsApp, facturación SaaS. Registrado en BRIEF.md.

## Supuestos (no bloquean; se validan con José)

1. Guardias con Android + Chrome (mayoría en Chile); la PWA se instala desde el navegador.
2. El login se hace con conexión (wifi de portería); después la ronda corre offline.
3. El administrador usa navegador de escritorio.
4. Hora local del servidor = hora de Chile.
5. Los datos reales (nombre del condominio, puntos, nómina) los carga José/el cliente en el panel; la demo trae datos semilla.
