# DEMO — Rondas QR (guion de 5 minutos)

Para mostrar al administrador del condominio. Antes de partir:

```bash
cd clientes/rondas-qr/app
npm install   # solo la primera vez
npm run demo
```

Queda en `http://localhost:3737`. Ya hay un informe de ejemplo cargado (una ronda incompleta de Pedro) para que el panel no parta vacío.

> 💡 Para el momento "wow" con el teléfono de verdad: conecta el teléfono al mismo wifi y entra a `http://<IP-del-notebook>:3737` (saca la IP con `ipconfig`). Si el navegador del teléfono no deja abrir la cámara por ser http, usa la entrada manual de códigos — o haz la demo completa en el notebook.

## Minuto 1 — El dolor (hablado)

"Hoy el guardia marca chapitas con una maquinita, y usted se entera de cómo estuvo la ronda cuando alguien conecta la maquinita al computador... si se acuerda. Esto lo reemplaza con QR pegados en los sectores y el teléfono del guardia. Y usted recibe el informe solo, al momento."

## Minuto 2 — El panel del administrador

1. Abrir `http://localhost:3737/admin.html` → entrar con `marta` / `1111`.
2. Pestaña **Informes**: mostrar el informe de ejemplo `INCOMPLETA 2/4` → clic en "Ver informe": detalle punto por punto, faltantes en rojo, imprimible.
3. Pestaña **Puntos** → link "🖨️ Imprimir hoja de QR": "esto se imprime una vez, se pega en cada sector, y si se rompe se reimprime gratis — no hay que comprar chapitas nuevas".

## Minuto 3-4 — La ronda del guardia

1. Abrir `http://localhost:3737` (idealmente en el teléfono) → entrar con `pedro` / `2222`.
2. Mostrar que las rondas ya están **descargadas en el teléfono**: "si se corta el internet a mitad de ronda, no pasa nada — sigue marcando y se sincroniza solo".
3. Iniciar **"Nocturna completa"** → botón **📷 Escanear QR** apuntando a la hoja de QR en la pantalla del notebook. Marcar 2-3 puntos (se ve el avance 3/8 y la lista poniéndose verde).
4. Mostrar el respaldo: **⌨️ Ingresar código a mano** con `PSC234` (Piscina) — "si el QR está rayado o la cámara falla, igual se marca".
5. **Terminar ronda** dejando puntos sin marcar → la app avisa que quedará incompleta.

## Minuto 5 — El cierre (la venta)

1. Volver al panel → **Informes**: apareció el informe nuevo al instante, `INCOMPLETA`, con los puntos saltados.
2. Pestaña **Avisos**: el mensaje "⚠️ ALERTA: ronda con puntos sin marcar" con el detalle completo. "Esto mismo le puede llegar por Telegram al momento, sin abrir el panel."
3. Frase de cierre: "Sin maquinita, sin chapitas, sin planillas: el guardia usa el teléfono que ya tiene, y usted sabe **al momento** si la ronda se hizo completa."

## Preguntas típicas

- **"¿Y si el guardia le saca foto al QR y marca desde la caseta?"** — Igual que hoy con las chapitas, el sistema registra hora exacta y orden; los saltos de orden y tiempos raros quedan en observaciones. La versión 2 puede sumar verificación por GPS.
- **"¿Sirve para varios condominios?"** — Sí, cada uno con sus guardias, puntos e informes, totalmente separados (está probado).
- **"¿Qué necesito para partir?"** — Lista de sectores, nómina de guardias y cómo son las rondas. El resto lo montamos nosotros.
