# Guion de demo — Sofía

Dura 4 minutos. Abre `demo-sofia.html` en el teléfono o en el computador: es un solo
archivo, no necesita internet ni instalar nada. Las fichas y los botones que se ven
son los que manda el agente de verdad, generados desde la planilla.

## 1. El que llega por un aviso (90 s)

Elige en la lista de abajo **"Departamento en arriendo · Sebastopol 631"**.

> Así llega la mayoría: aprietan el botón del aviso y el mensaje viene escrito.

Aparecen tres botones. Señala que **"Requisitos" solo está porque esa propiedad los
tiene cargados en la planilla**. Aprieta **Ver información**.

> Este mensaje no lo escribe la inteligencia artificial: lo arma el sistema leyendo la
> planilla. Por eso el precio, los metros y el link son exactamente lo que ustedes
> cargaron. No hay forma de que se equivoque en un número.

Aprieta **Requisitos**.

> Y estos son los requisitos de **esta** propiedad, los que ustedes escribieron. Si otra
> propiedad tiene otros, dirá los otros. Si una no tiene ninguno, el botón no aparece y
> Sofía dice que no los tiene cargados, en vez de inventar los tres de siempre.

## 2. La visita, y el papelito que les llega (60 s)

Aprieta **Agendar visita** y después el botón de abajo con la frase de ejemplo.

> Pide **dos** opciones a propósito: así la ejecutiva elige la que le sirve, en vez de
> llamar para cambiar la hora. Y fíjate que Sofía **no confirma** el día: eso lo cierra
> una persona.

Apunta al recuadro verde.

> Esto es lo que les llega al WhatsApp de la corredora: quién es, por qué escribió, qué
> propiedad, cuándo puede, y lo que se habló. El botón **Escribirle** abre el chat con
> esa persona desde el número de ustedes. Un toque.

Y la nota del final:

> Desde ahí Sofía **no habla más** en ese chat. Nunca le va a escribir por encima a una
> ejecutiva que ya está atendiendo.

## 3. El propietario (60 s)

Empieza de nuevo y elige **"Quiere vender con Gesta"**. Aprieta **No** en la pregunta
de la Región Metropolitana.

> Si la propiedad está fuera de la Región Metropolitana lo dice de buena manera y no
> le hace perder el tiempo a nadie. Queda anotado igual, para que ustedes sepan cuánta
> demanda están recibiendo de afuera.

Empieza de nuevo, elige lo mismo y aprieta **Sí**.

> Acá le pide los datos con ejemplos, y cuando termina les llega el mismo papelito, con
> lo que contó de su propiedad.

## 4. El cierre: lo que NO hace (30 s)

Empieza de nuevo y elige **"Pregunta por una que no existe"**.

> Esta es la parte importante. No tiene esa propiedad, y lo dice. No ofrece una parecida,
> no se la inventa, no adivina un precio. Cuando no sabe, pasa a una persona. Esa es la
> regla número uno de Sofía y está probada 96 veces, una por cada forma de conversar
> que se nos ocurrió.

## Si preguntan

**"¿Cómo cambio un precio?"** → En la planilla, como siempre. Sofía la relee sola cada
15 minutos; no hay que avisarle a nadie.

**"¿Y si cargo mal un dato?"** → Si Sofía no lo entiende, no lo muestra. Corriendo
`npm run datos` sale la lista de qué celdas arreglar, con el número de fila.

**"¿Habla como robot?"** → Las frases las arma un modelo de lenguaje, así que varían.
Lo que nunca varía son los datos: esos salen de la planilla, tal cual.
