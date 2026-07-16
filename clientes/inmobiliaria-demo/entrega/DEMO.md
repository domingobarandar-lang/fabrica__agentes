# Guion de demo — Bot de la corredora (5 minutos)

**Para José.** Demo en vivo por consola, frente al cliente. Todo lo que aparece aquí está probado — no improvisar flujos fuera de este guion.

## Antes de la reunión (5 min, a solas)

1. Abrir una consola en `C:\Users\Adela\Fabrica_Agentes\clientes\inmobiliaria-demo\agente\`
2. Ejecutar `npm run chat`
3. Hacer una pasada completa del guion como ensayo. Para salir se escribe `salir`.
4. Para la demo real, cerrar y volver a partir con `npm run chat` — así la conversación arranca limpia.

**Ojo**: el bot redacta sus respuestas con sus propias palabras, así que el texto exacto varía un poco entre corridas. Lo que NO varía: los datos de las propiedades, los requisitos, el horario de visitas y las reglas. Si una respuesta demora unos segundos, es normal — esperar, no repetir el mensaje.

---

## Minuto 0–1 · Saludo

**Escribir:**
> hola

**El bot debería:** presentarse como asistente de Corredora Andes Propiedades y ofrecer las tres cosas que sabe hacer: buscar propiedades, agendar visitas y responder dudas (requisitos, comisiones, horarios). Respuesta corta, sin muros de texto.

**Destacar al cliente:** "Este saludo, el nombre y el tono se personalizan con los datos de su corredora. Y contesta así a cualquier hora, también un domingo a las 11 de la noche."

## Minuto 1–2 · Atención general (requisitos de arriendo)

**Escribir:**
> ¿qué piden para arrendar?

**El bot debería:** entregar los requisitos completos: renta líquida de al menos 3 veces el arriendo (con las 3 últimas liquidaciones), contrato de trabajo vigente, informe de deudas limpio, aval si no se cumple la renta, y al firmar: mes de garantía + mes anticipado + comisión.

**Destacar:** "Fíjese que no inventa nada — estos requisitos salen de una ficha que cargamos nosotros. En producción van los requisitos exactos de su corredora, y esta es la pregunta que a su equipo le hacen diez veces al día."

## Minuto 2–3 · Búsqueda + captura del interesado

**Escribir:**
> busco depto en arriendo en Ñuñoa, hasta 600 mil

**El bot debería:** ofrecer el depto de Ñuñoa: $560.000, gastos comunes $80.000, 2 dormitorios / 1 baño, 58 m². Y en la misma respuesta (o la siguiente) **pedir nombre y teléfono** para enviar la ficha o coordinar.

**Destacar:** "Ahí está lo importante: pidió el contacto solito. Aunque la persona después no agende nada, el dato queda guardado — hoy ese interesado que escribe a las 10 de la noche se pierde."

**Escribir:**
> me llamo Pablo Rojas, mi teléfono es +56 9 5555 1234. Me cambio este mes, mi presupuesto son 600 mil

**El bot debería:** confirmar que quedó registrado y seguir la conversación.

**Destacar (esto lo narra José):** "Con esos datos el sistema ya lo clasificó como **lead caliente**: quiere cambiarse dentro del mes y dio presupuesto. La clasificación es con reglas fijas, no al ojo: caliente si agenda visita o tiene urgencia inmediata con presupuesto; tibio si dio operación, comuna y presupuesto pero sin apuro; frío si anda solo mirando. Usted abre su lista y sabe a quién llamar primero."

## Minuto 3–4 · Intento de visita en día inválido (la regla dura)

**Escribir:**
> ¿puedo visitarla el martes a las 4 de la tarde?

**El bot debería:** **NO** agendar. Explica que las visitas son solo lunes, miércoles y jueves entre 11:00 y 14:00, y ofrece la hora válida más próxima (típicamente el miércoles a las 11:00).

**Destacar:** "Esta es la regla que nos pidieron: por más que el cliente insista, jamás agenda fuera de su horario de visitas. Y no lo deja botado — le ofrece al tiro la hora más próxima que sí sirve."

## Minuto 4–5 · Agendar de verdad y cerrar

**Escribir:**
> ya, el miércoles a las 11:30 entonces

**El bot debería:** confirmar la visita con propiedad, fecha y hora (depto de Ñuñoa, miércoles 11:30).

**Escribir:**
> ¿cuándo quedó mi visita?

**El bot debería:** mostrar la visita agendada con todos sus datos.

**Destacar:** "Visita confirmada sin que nadie de su oficina moviera un dedo. Y ese interesado quedó marcado caliente con nombre, teléfono, lo que busca y su visita agendada."

**Escribir para terminar:**
> salir

---

## Si sobra tiempo (extras probados)

- **Hora ocupada:** pedir "el miércoles a las 12:00" en el mismo depto de Ñuñoa — esa hora ya está tomada por otra visita; el bot no agenda encima y ofrece la siguiente hora libre real. Destacar: "no hay dobles reservas".
- **Dato que no está en la ficha:** "¿aceptan mascotas en la casa de Maipú?" — el bot no inventa: responde que lo confirma con el corredor y deja la consulta anotada junto al interesado.
- **Comisiones:** "¿cuánto cobran de comisión?" — responde con las comisiones cargadas (de referencia en la demo; en producción van las suyas).

## Preguntas gancho para el cierre

1. "¿Cuántas consultas les llegan hoy de noche o el fin de semana, y quién las está contestando?"
2. "¿Le calza esta ventana de visitas de lunes, miércoles y jueves de 11 a 14, o se la ajustamos a su agenda real?"
3. "Si la próxima semana cargamos sus propiedades reales y su número de WhatsApp, ¿con qué cartera partimos?"

## Qué NO prometer en la demo

- La demo corre en este computador; el paso a WhatsApp es la etapa de producción y se acuerda con el cliente (canal y fecha).
- Nada de pagos, reservas con abono, tasaciones ni contratos — eso lo deriva al corredor humano.
- La conexión con su planilla de propiedades y los avisos automáticos por lead caliente son extras contratables, no parte de esta versión.
