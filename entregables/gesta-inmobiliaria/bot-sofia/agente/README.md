# Sofía — cómo la corro

Agente de WhatsApp de Gesta Inmobiliaria. Núcleo conversacional **1.7.0**.
Este README es para quien la desarrolla. El manual de la corredora es
`../entrega/OPERACION.md`.

## Arrancar de cero (Windows / PowerShell)

Necesitas **Node 22 o superior** (`node -v` para comprobar).

```powershell
# 1. Ubicarte en la carpeta del agente
cd <ruta>\gesta-inmobiliaria\bot-sofia\agente

# 2. Instalar dependencias (una sola vez)
npm install

# 3. Crear el .env — NO viene en git, y ese es el punto
#    Reemplaza la key por la tuya. El archivo queda fuera del repo.
@"
LLM_PROVIDER=gemini
LLM_API_KEY=PEGA-ACA-TU-KEY-DE-GEMINI
LLM_MODEL=gemini-3.5-flash
"@ | Out-File -FilePath .env -Encoding utf8

# 4. Conversar
npm run chat -- --real
```

En Mac o Linux el paso 3 es:

```bash
cat > .env <<'EOF'
LLM_PROVIDER=gemini
LLM_API_KEY=PEGA-ACA-TU-KEY-DE-GEMINI
LLM_MODEL=gemini-3.5-flash
EOF
```

**El `.env` es el paso que se olvida.** Está en `.gitignore` a propósito: las
credenciales no se versionan. Sin él, `npm run chat -- --real` no arranca y
`npm run chat` (sin `--real`) contesta con un texto fijo de mock.

## Conversar

```powershell
npm run chat -- --real    # modelo real. GASTA free tier de Gemini
npm run chat              # MOCK: 0 tokens, sin red. Para probar el núcleo
```

Los **botones se aprietan escribiendo su número**: `1`, `2`, `3`. `salir` termina.

También se le puede pasar una conversación entera de una vez, que es como se
guioniza una demo:

```powershell
"hola, me gusto la propiedad en Los Ilianes 86`n1`nsalir" | npm run chat -- --real
```

Qué probar, si quieres ver si de verdad no inventa:

| Escribe esto | Tiene que pasar |
|---|---|
| `hola, me gusto la propiedad en Los Ilianes 86` | La reconoce y pone los 3 botones |
| `hola me interesó la propiedad en Pedro de Valdivia 1234` | Dice que no la tiene. **No** ofrece una parecida |
| `y cuanta comision cobran?` | Deriva a una ejecutiva. **No** inventa un porcentaje |
| `hola me gusto la propiedad en holanda` | Pregunta cuál de las dos, sin dar precios |
| `me intereso Buenos Aires 650, cuanto son los gastos comunes?` | La ficha sale **sin** gastos comunes: la planilla dice `14`, sin moneda |

## Los otros comandos

```powershell
npm test                  # 96 corridas de QA en mock. 0 tokens, sin red
npm test -- --verboso     # imprime todas las conversaciones
npm test -- --escenario=CU-4
npm run validar           # revisa agente.config.json
npm run datos             # qué le falta a la planilla, con el número de fila
npm run demo              # regenera ../entrega/demo-sofia.html
npm run entrega           # compuerta previa a mostrarle esto al cliente
npm run metricas          # panel (necesita Supabase para ver algo)
npm run schema            # el SQL de las tablas, con el prefijo ya puesto
npm start                 # el servidor de WhatsApp (necesita token)
```

## Lo que falta para producción

| Qué | Dónde va |
|---|---|
| WhatsApp de la corredora | `handoff.inbox` en `agente.config.json`. **Sin esto los informes no se envían** |
| Link de la planilla de Google | `PLANILLA_URL` en `.env`. Sin esto usa la copia local `datos/propiedades.csv` |
| Token de WhatsApp Business | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. Sin esto las visitas se pierden al reiniciar |

**El nombre del modelo caduca.** `gemini-2.0-flash` dejó de existir y la API
responde 404. Antes de desplegar:

```powershell
curl "https://generativelanguage.googleapis.com/v1beta/models?key=TU-KEY"
```

## Dónde está cada cosa

| Archivo | Qué es |
|---|---|
| `agente.config.json` | Todo lo que decide cómo se comporta. **No se toca código para configurarla** |
| `agent/prompts.js` | Lo que Sofía sabe de sí misma y sus reglas duras |
| `agent/tools.js` | Sus acciones. La validación de negocio vive **dentro** de cada tool |
| `agent/formato.js` | La ficha y los botones. **El código arma la ficha, no el modelo** |
| `database/planilla.js` | Lee la planilla de Google como CSV, con caché de 15 min |
| `database/buscar.js` | De qué propiedad habla la persona |
| `avisos/ejecutiva.js` | El informe que le llega a la corredora |
| `whatsapp/corredora.js` | El guarda del número de la corredora (`hola`, `estado`, `liberar`) |
| `conocimiento/` | Lo que Gesta sabe y no es una propiedad. Se edita y cambia lo que responde |
| `evals/escenarios.js` | Los casos de uso probados |
| `agent/`, `evals/motor.js`, `whatsapp/`, `scripts/` | **Núcleo: no se edita acá.** Se arregla en la fábrica y se re-sincroniza |
