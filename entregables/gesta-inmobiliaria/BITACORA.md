# Bitácora — Gesta Inmobiliaria

Append-only. Lo más reciente arriba. Semáforo: 🟢 rutina · 🟡 cambia el comportamiento
(queda POR LEER para José) · 🔴 se preguntó antes de hacerlo.

---

## 2026-09-16 · [🟡 POR LEER] Sofía conversó por primera vez con un modelo de verdad

**Qué se hizo.** José entregó la API key de Gemini y se corrieron **siete conversaciones
reales** por consola (`npm run chat -- --real`), que es lo único que el modo mock no puede
probar: si el modelo de verdad entiende y usa bien las herramientas.

**Las siete pasaron**: la propiedad del aviso, la ficha completa, agendar con dos fechas
(pidiendo la segunda cuando le dieron una sola), el bloqueo posterior, la captación en
Maipú, el rechazo cordial fuera de la Región Metropolitana, la dirección ambigua de
Holanda, una propiedad que no existe, y la pregunta por comisión y crédito hipotecario.
En ninguna inventó un dato.

**Modelo: `gemini-3.5-flash`.** Ojo con esto: **`gemini-2.0-flash` ya no existe** — es el
que la fábrica traía por defecto en todos sus ejemplos. La API responde 404 y el agente
no arranca. Antes de desplegar hay que confirmar que el modelo elegido siga publicado.

**Tres cosas que solo aparecieron conversando de verdad:**

1. **Gemini 3.x exige que le devuelvan una firma.** Manda una `thought_signature` con cada
   llamada a herramienta y la exige de vuelta. El adapter la descartaba, así que **todo
   turno con herramienta fallaba en su segunda llamada** y al cliente le llegaba "estoy
   teniendo problemas técnicos". No se veía en las pruebas: el modelo simulado no manda
   firmas. Arreglado en el núcleo.
2. **La pregunta de la Región Metropolitana salía sin botones.** Ninguna herramienta los
   proponía, así que el modelo la escribía a mano — y funcionaba, hasta que alguien
   contesta "sipo" o "queda en maipu". Ahora sale siempre con sus botones **Sí** y **No**,
   como pediste.
3. **Un botón se cortaba feo**: "Luis Thayer Ojeda 1…". WhatsApp topea los títulos en 20
   caracteres. Ahora se sueltan las palabras genéricas de adelante y queda
   "Thayer Ojeda 180", que sí se entiende en un teléfono.

**🧒 Explicado como para un niño de 5 años.** Hasta ahora Sofía había practicado con un
amigo imaginario que decía siempre lo mismo. Hoy habló con una persona de verdad por
primera vez, y se le notaron tres cosas que con el amigo imaginario no se veían: se
trababa al buscar en el cuaderno, se le olvidaba mostrar los dos botones, y uno de los
botones tenía el nombre tan largo que no se leía. Las tres quedaron arregladas.

**Aprendizajes reutilizables:** una suite en verde no reemplaza una conversación real —
el modelo simulado nunca manda lo que el proveedor de verdad exige de vuelta; y el nombre
de un modelo caduca, así que fijarlo sin revisarlo es dejar una bomba de tiempo.

---

## 2026-09-16 · [🟡 POR LEER] Nace Sofía: el agente de WhatsApp de Gesta

**Qué se hizo.** Se construyó el agente completo sobre el núcleo conversacional 1.7.0:
los dos caminos de entrada (consulta por una propiedad publicada y propietario que
quiere vender o arrendar con Gesta), los botones de WhatsApp, la ficha armada por
código, los requisitos por propiedad, el agendamiento con dos opciones de día, y el
informe que le llega a la corredora con el botón para escribirle al cliente.

**Lo que pasa las pruebas.** 96/96 corridas de QA (12 escenarios × 8 perfiles de
cliente difícil) y 1164 verificaciones de invariantes, todo en mock: 0 tokens, sin
credenciales, sin red.

**Decisiones que conviene saber:**

1. **La planilla se lee sin credencial de Google.** Se lee la hoja publicada como CSV.
   Usar la API de Google habría significado pedir una cuenta de servicio nueva para
   leer exactamente los mismos datos. La hoja tiene que estar compartida como
   "cualquiera con el enlace puede ver".
2. **Un dato ambiguo no se muestra.** La celda de gastos comunes de Buenos Aires 650
   dice `14`, sin decir si son UF o pesos. Sofía la omite de la ficha y `npm run datos`
   la lista para que la corredora la arregle. Mostrar cualquiera de las dos habría sido
   inventar.
3. **El número de la corredora tiene su propio guarda.** Su "hola" de cada mañana abre
   la ventana de 24 h de WhatsApp; sin el guarda, Sofía le habría contestado como si
   fuera un cliente interesado en arrendar.
4. **La corredora puede devolverle un chat al bot.** Escribiendo `liberar 569XXXXXXXX`
   desde su número. Sin esa llave, un cliente que agendó una visita quedaba mudo para
   siempre, porque la derivación es definitiva.
5. **"Hablar con una ejecutiva" no aparece en el primer menú cuando hay requisitos.**
   WhatsApp no acepta más de tres botones. Entre requisitos y ejecutiva, los requisitos
   resuelven la duda ahora; la ejecutiva se ofrece igual al terminar cualquiera de los
   tres caminos.

**Lo que falta para que funcione de verdad:** el WhatsApp de la corredora
(`handoff.inbox`), el link de la planilla (`PLANILLA_URL`), la API key de Gemini, el
token de WhatsApp Business y Supabase. Ninguno bloqueó construir ni probar.

**🧒 Explicado como para un niño de 5 años.** Sofía es una vendedora que solo sabe leer
un cuaderno: el cuaderno de las propiedades. Si la respuesta está en el cuaderno, la
dice tal cual. Si no está, no se la inventa: llama a una señora de verdad para que
conteste ella, y le deja un papelito con lo que hablaron y el teléfono de la persona.

**Aprendizajes reutilizables:** un dato que no se entiende se calla y se reporta, nunca
se adivina; el número del propio negocio siempre necesita un guarda, porque escribe al
bot como cualquiera; y toda derivación definitiva necesita una llave para deshacerla,
o el cliente queda mudo para siempre.
