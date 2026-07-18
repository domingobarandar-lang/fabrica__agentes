# Rondas QR

Control de rondas de seguridad para condominios: QR impresos en cada sector + el teléfono del guardia, en reemplazo de las chapitas físicas (iButton) y su lectora.

## Probar en 2 comandos

```bash
npm install
npm run demo
```

Luego abrir:

- **App del guardia** (simula el teléfono): http://localhost:3737 — entrar con `pedro` / `2222`.
- **Panel del administrador**: http://localhost:3737/admin.html — entrar con `marta` / `1111`.

La demo trae 2 condominios: Los Aromos (admin `marta`/1111, guardias `pedro`/2222 y `luis`/3333) y Mirador del Valle (admin `carmen`/4444, guardia `jorge`/5555).

Flujo de demo sugerido: en el panel, pestaña **Puntos** → "Imprimir hoja de QR" (ahí están los QR reales); en el teléfono, iniciar la ronda "Nocturna completa" y escanear los QR desde la pantalla (o usar "Ingresar código a mano" con los códigos de 6 letras, p. ej. `PRT234`). Al terminar, el informe aparece en la pestaña **Informes** del panel y el aviso en **Avisos**.

## Qué hace

- **PWA del guardia**: la ronda queda descargada en el teléfono; funciona sin señal (los escaneos se encolan y se sincronizan solos al volver la conexión). Escáner con la cámara (jsQR + BarcodeDetector) y entrada manual de respaldo con el código impreso bajo cada QR.
- **Motor de rondas**: valida cada marca (condominio, ronda, duplicados), y al cierre evalúa puntos faltantes, orden (rondas estrictas) y duración máxima.
- **Verificación de presencia por GPS** *(v1.1)*: cada marca lleva la ubicación del teléfono. Si el administrador fijó la ubicación real del punto (botón "📍 Fijar aquí" en el panel, parado en el lugar), el informe acusa las marcas hechas a más de 75 m ("⚠️ a X m del punto") y las marcas sin GPS. El GPS nunca bloquea una marca.
- **Informe automático**: al cerrar cada ronda se genera el informe (Completa / Con observaciones / INCOMPLETA) y se avisa al administrador — en el panel siempre, y por Telegram si está configurado.
- **Panel del administrador**: informes, puntos de control (con hoja de QR imprimible), guardias, rondas y registro de avisos. Multi-condominio con aislamiento total.

## Tests

```bash
npm test
```

Cubre los 14 casos de uso del SPEC y los adversariales (permisos cruzados entre condominios y guardias, reenvío offline idempotente, cierres repetidos). Todo corre en MOCK: no llama a ningún servicio externo.

## Configuración (.env)

| Variable | Default | Qué hace |
|---|---|---|
| `PORT` | `3737` | Puerto del servidor |
| `MOCK` | `true` | En `true`, los avisos al admin quedan solo en el panel/consola. En `false`, salen por Telegram |
| `TELEGRAM_BOT_TOKEN` | — | Token del bot que envía los informes (necesario solo con `MOCK=false`) |

Para activar Telegram: `MOCK=false`, token en `.env`, y en el panel (pestaña Avisos) guardar el `chat_id` del administrador (se obtiene cuando el admin le escribe `/start` al bot).

## Estructura

```
server.js        API + estáticos (Express)
seed.js          datos de demo
lib/store.js     persistencia JSON atómica (migrable a SQLite/Postgres)
lib/rondas.js    motor: iniciar / escanear / cerrar / evaluar
lib/informes.js  informe en datos y en texto
lib/notificar.js aviso al admin (mock | Telegram)
lib/auth.js      PIN scrypt + sesiones Bearer
public/          PWA guardia (index) + panel admin (admin.html) + hoja QR + informe
test/            suite node --test (mock, $0)
```

## Producción (resumen — detalle en ../entrega/OPERACION.md)

- Deploy: Railway/VPS con `npm start` (requiere HTTPS para que la cámara funcione fuera de localhost).
- La persistencia JSON es para pilotos; con más de ~3 condominios activos o meses de historial, migrar `lib/store.js` a SQLite/Postgres.
- Limitación conocida v1 (documentada): un QR fotografiado se puede escanear a distancia — la v2 contempla verificación de presencia (GPS/NFC).
