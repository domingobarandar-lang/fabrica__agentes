# Flujo comercial completo — de prospecto a cliente pagando mensualidad

El ciclo tiene 5 etapas. José hace la venta y la relación con el cliente; la fábrica hace todo lo demás. Regla de oro del modelo: **se vende la demo funcionando, no una promesa** — construir una demo cuesta $0 en runtime (mock/free tier), así que se puede regalar la demo y cobrar la producción.

## Etapa A — Venta (José, con material de la fábrica)

1. **Prospecto**: negocio que pierde plata contestando WhatsApp a mano (clínica, corredora, petshop, tienda). Señales: responden lento, no atienden fuera de horario, se les pierden pedidos/horas.
2. **Levantamiento de 5 datos** (conversación de 15 min, no reunión formal):
   - Rubro y nombre del negocio
   - Qué los tiene chatos (agendar / pedidos / preguntas repetidas)
   - Canal donde les escriben los clientes (casi siempre WhatsApp)
   - Volumen aproximado de mensajes al día
   - Qué datos manejan (doctores y horarios / propiedades / catálogo / las 15 preguntas de siempre)
3. **Compromiso chico**: no vender el contrato todavía. Vender: *"en 2 días te muestro TU bot funcionando con tus datos, gratis y sin compromiso"*.

## Etapa B — Construcción (fábrica, autónoma — costo $0 de runtime)

4. José entrega el pedido: `/fabrica "clínica dental San Martín, 3 doctores, agendar horas, lunes a viernes"`.
5. El pipeline corre solo (intake → spec → arquitectura → build → QA en mock → kit de entrega → Notion). Sale en `clientes/<slug>/`:
   - El agente funcionando (`npm run telegram:mock` para probarlo sin gastar nada)
   - `entrega/DEMO.md` — guion de demo de 5 minutos
   - `entrega/ONE-PAGER.md` — argumento de venta en lenguaje del dueño
   - `entrega/OPERACION.md` — costos de operación estimados (insumo para que José fije precio)
6. José lo prueba. Feedback → se itera. Aprobado → demo.

## Etapa C — Demo y cierre (José)

7. **Demo al cliente**, dos formatos:
   - **Rápida**: José comparte pantalla o el teléfono siguiendo `DEMO.md` contra el bot en Telegram real (token gratis de @BotFather + Gemini free tier = demo viva con costo ~$0).
   - **Potente**: darle el link del bot de Telegram al cliente y que lo pruebe él mismo esa semana. Un dueño que agendó una hora "solo" a las 11 PM se vende solo.
8. **Cierre y precio** (100% José — la fábrica no fija precios). Estructura recomendada:
   - **Pago único de implementación** (cubre personalización + instalación en producción)
   - **Mensualidad** (cubre runtime + hosting + soporte + cambios menores). `OPERACION.md` trae el costo real estimado (hosting ~USD 5/mes + LLM centavos) para calcular margen. Todo lo que cobres sobre eso es margen.
   - Referencia de mercado chileno para bots a medida: implementación en cientos de miles de CLP y mensualidades en decenas de miles — José ajusta según cliente y vertical.

## Etapa D — Instalación en producción (fábrica + credenciales, con OK de José)

Lo único que separa la demo de producción son credenciales reales. Checklist por cliente:

9. **Del cliente se necesita**:
   - Número de teléfono para el bot (uno nuevo o uno NO registrado en la app normal de WhatsApp)
   - Cuenta Meta Business (idealmente verificada — este es el trámite más lento del proceso)
   - Sus datos reales: horarios, doctores/propiedades/catálogo, textos, políticas
10. **Infraestructura por cliente** (la fábrica la deja lista, José aprueba los gastos):
    - **Supabase**: proyecto nuevo, correr `database/schema.sql`, cargar datos reales, key `service_role`
    - **Meta for Developers**: app + producto WhatsApp Cloud API, webhook al servidor, verify token, número conectado
    - **Railway**: servicio nuevo (root directory = carpeta del agente), variables de entorno: `WHATSAPP_*`, `SUPABASE_*`, `LLM_*`
    - **LLM runtime**: key del proveedor barato elegido (DeepSeek/Gemini/Groq). Del cliente o nuestra vía LiteLLM (modelo reventa) — decisión de José por cliente
11. **Marcha blanca (1 semana)**: el bot corre en paralelo con la atención humana del cliente. Ajustes de prompts/datos según conversaciones reales. QA final con tráfico real.

**Tiempos realistas**: demo en 1-2 días; producción en 3-7 días — el cuello de botella casi siempre es la verificación del negocio en Meta, no la fábrica.

## Etapa E — Entrega y operación recurrente

12. **Entrega formal**: capacitación de 30 min al dueño con `OPERACION.md` (qué hace el bot, qué no, cómo pedir cambios, a quién escribirle si algo falla = José).
13. **Operación mensual** (esto ES el negocio recurrente):
    - Cambios de horarios/precios/textos: el cliente le pide a José → José a la fábrica → cambio + QA en mock + redeploy (minutos)
    - Todo cambio a agente entregado se registra con `/bitacora-chaski`
    - Monitoreo: logs de Railway + costos de LLM (con LiteLLM, por cliente)
14. **Cobro de mensualidad** y venta de extras del catálogo (recordatorios de citas, reportes mensuales, lista de espera) — cada extra es un upsell ya especificado en `catalogo/`.

## Costos de operación reales por cliente (para calcular margen)

| Ítem | Costo aprox. mensual |
|---|---|
| Railway (1 servicio) | ~USD 5 |
| Supabase | $0 (free tier alcanza de sobra para un bot) |
| LLM runtime (DeepSeek/Gemini, bot de citas típico) | centavos a pocos USD |
| WhatsApp Cloud API | conversaciones iniciadas por el cliente: gratis; plantillas salientes (ej. recordatorios): costo pequeño por mensaje |
| **Total típico** | **< USD 10/mes por cliente** |

Verificar precios vigentes antes de cotizar — cambian cada pocos meses. La conclusión estructural no cambia: el costo de operar un bot es marginal frente a cualquier mensualidad razonable.

## Divisón de roles en una línea

**José**: prospectar, demo, precio, cierre, relación con el cliente, aprobar gastos. **Fábrica**: todo lo demás — construir, testear, instalar, documentar, mantener.
