# Bitácora — Gesta Inmobiliaria

Append-only. Lo más reciente arriba. Semáforo: 🟢 rutina · 🟡 cambia el comportamiento
(queda POR LEER para José) · 🔴 se preguntó antes de hacerlo.

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
