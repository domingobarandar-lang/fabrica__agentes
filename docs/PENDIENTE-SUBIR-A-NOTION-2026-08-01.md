# 2026-08-01 — El molde ya sabe callarse, esperar y no dejar a nadie colgado

*(Entrada lista para subir a la bitácora de Notion. No se pudo subir en la sesión: el conector de Notion estaba caído.)*

## En una frase

El agente base de la fábrica aprendió cuatro comportamientos que antes no tenía —y que en un cliente real son la diferencia entre un bot que ayuda y uno que hace enojar— y todos quedaron escritos **en un solo lugar**, así que cualquier cliente nuevo nace con ellos puestos.

---

## Los cuatro comportamientos nuevos

**1. Cuando alguien pide hablar con una persona, el bot se calla. De verdad.**

Antes esto no funcionaba, y fallaba de la peor forma posible: el cliente escribía *"quiero hablar con alguien"* y recibía **"estoy teniendo problemas técnicos"**. O sea, justo cuando la persona ya estaba molesta, el bot le respondía la frase que más rabia da.

Ahora el bot manda una sola confirmación —*"te dejo con una persona del equipo"*— y después no vuelve a hablar. También se calla solo si la conversación se pone seria (aparece la palabra abogado, SERNAC, estafa, una emergencia) o si el bot lleva tres intentos seguidos sin poder responder. En ese punto seguir insistiendo no ayuda a nadie.

**Una decisión importante que conviene que revises**: cuando la conversación pasa a una persona, **el bot no vuelve nunca solo**. Se puede configurar para que vuelva después de un rato, pero no viene así de fábrica. El motivo: si el bot no vuelve, lo peor que pasa es que alguien lo reactive a mano. Si vuelve cuando no debía, el cliente se da cuenta de que la "persona" que le prometieron era un bot otra vez. Es más barato equivocarse por el lado del silencio.

**2. Cuatro mensajes seguidos ahora son una sola conversación, no cuatro.**

La gente escribe como habla: *"hola"* / *"quiero agendar"* / *"para el martes"* / *"a las 10 si se puede"*. Antes el bot contestaba cuatro veces, una por mensaje, y quedaba conversando consigo mismo. Ahora espera seis segundos de silencio, junta todo y responde una sola vez.

**Con una excepción que no es un detalle**: pedir hablar con una persona **no espera**. Se procesa al tiro. Esto lo aprendimos de tu propio agente de Gesta, y la regla que dejaste escrita ahí es la que adopté: *cuando se agrupan mensajes hay que preguntarse qué acción no puede esperar; casi siempre son las irreversibles — pedir un humano, cancelar, pagar*. Además dejé una prueba automática que **falla y no deja avanzar** si alguien alguna vez saca esa excepción.

**3. Si el modelo se cuelga, el cliente no se queda esperando.**

Cada consulta tiene ahora un límite de 25 segundos. Si se pasa, se corta y se reintenta —hasta tres veces en total. Y si el primer intento se demora, sale un *"dame un segundo, estoy revisando"* para que el silencio no se lea como abandono. Uno solo, no uno por intento.

**4. Cada conversación deja registro.**

Cuánto se demoró, si terminó bien, si se derivó a una persona, si falló. Es la base del panel que vas a querer cuando haya varios clientes andando. Está hecho de forma que **registrar nunca puede romper una respuesta**: si el registro falla, el cliente igual recibe su mensaje.

---

## Dos errores míos que aparecieron por probar, no por leer

Vale la pena dejarlos anotados porque los dos habrían sido invisibles hasta llegar a un cliente.

**El primero se comía mensajes.** En el código que agrupa los mensajes puse una optimización para que el programa no demorara en apagarse. El efecto real: si el bot no tenía nada más que hacer, el programa se cerraba **antes** de procesar los mensajes que estaba juntando. El cliente escribía y su mensaje desaparecía sin dejar rastro. Lo encontré porque la prueba se murió en silencio, sin error ni mensaje — que es exactamente cómo se habría visto en producción.

**El segundo hacía que las pruebas mintieran.** Dos verificaciones estaban dando verde por el motivo equivocado: el arnés de pruebas cambiaba una configuración y el código seguía usando la de fábrica. Pasaban, pero no probaban lo que decían probar. Corregido, y ahora la prueba comprueba el número exacto configurado para que este engaño no pueda repetirse.

Que los dos hayan aparecido al **correr** y no al revisar es el argumento a favor de tener una prueba que se ejecute sola.

---

## Cómo sé que funciona

- **La prueba automática pasó de 11 a 41 verificaciones, todas en verde.** Cero costo: no gasta ni un peso de API, no necesita claves, no toca internet.
- **Probé el silencio de verdad, no leyendo el código.** Le pedí al sistema que enviara la respuesta vacía por WhatsApp y por Telegram, y verifiqué que no salió absolutamente nada — en particular, que no salió el mensaje de error. Ese era el bug.
- **Creé un cliente nuevo de cero y arrancó.** Proyecto nuevo → instalación → **el bot responde**. Los seis archivos nuevos se instalaron solos, sin que yo tocara el instalador: lee el inventario y se entera.

---

## 🧒 Explicado como para un niño de 5 años

Imagínate que tenemos un robot que contesta el teléfono de una tienda.

**Antes**, si alguien le decía *"quiero hablar con una persona de verdad"*, el robot se confundía y contestaba *"estoy malito, no puedo"*. Eso hacía enojar mucho a la gente. Ahora el robot dice *"ya te llamo a alguien"* y después **se queda callado**, para no interrumpir cuando la persona de verdad llega a ayudar.

**Antes**, si le mandabas cuatro mensajitos rápido, el robot contestaba cuatro veces y se hacía un lío. Ahora **espera un poquito** a que termines de escribir, y contesta una sola vez. Pero si le pides una persona, no espera nada: eso es urgente.

Y **antes**, si el robot se quedaba pensando para siempre, tú te quedabas esperando para siempre. Ahora, si piensa mucho, dice *"espérame un segundito"*, y si igual no puede, avisa en vez de dejarte ahí parado.

También encontré dos errores míos jugando con el robot. Uno hacía que se **perdieran mensajes** —el robot se iba a dormir antes de leerlos—. Y el otro hacía que mis pruebas dijeran *"todo bien"* cuando en realidad no habían probado nada. Los dos aparecieron **jugando**, no mirando. Por eso hay que jugar con las cosas antes de entregarlas.

---

## Lo que hay que saber (y decidir)

1. **La derivación a una persona es definitiva por defecto.** Si algún cliente prefiere que el bot vuelva solo después de un rato, se activa — pero es una conversación con el cliente, no algo que decida yo.
2. **Queda una deuda de verificación declarada.** Hay una batería de 18 escenarios del agente viejo que nunca se corrió (esa ejecución quedó interrumpida en su momento). Lo construido está probado por su propia prueba; lo que falta es confirmar que aquellos 18 escenarios sigan en verde. Se cierra en el paso siguiente.
3. **El patrón de las guías externas ya son dos casos.** La directiva de arquitectura y la guía de fixes de Gesta: las dos daban por roto lo que funcionaba y por hecho lo que no existía. Quedó como regla de operación: ninguna guía externa se ejecuta sin revisarla antes contra el código real, punto por punto. En Gesta esa revisión tomó 20 minutos y evitó reintroducir el peor bug del proyecto.

**Siguiente paso**: generalizar la batería de pruebas para que cualquier agente nuevo nazca con escenarios de cliente difícil (el que se arrepiente, el que escribe con faltas, el que insiste, el que pide un humano) sin escribirlos de cero cada vez.
