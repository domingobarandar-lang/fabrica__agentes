# Manual de operación — el día a día del bot

Este documento explica cómo se administra el bot una vez entregado: dónde viven sus datos, cómo se piden cambios y cuánto cuesta tenerlo funcionando. Todo en simple — usted no necesita tocar nada técnico.

## Dónde viven las propiedades y cómo se actualizan

- **Hoy (demo)**: el bot trabaja con una cartera de muestra de 8 propiedades que cargamos nosotros para que lo vea funcionar. No son propiedades reales.
- **En producción**: se carga su cartera real — precios, gastos comunes, dormitorios, metros y estado de cada propiedad (disponible, arrendada, vendida, reservada). Cuando una propiedad se arrienda o se vende, se marca y el bot deja de ofrecerla al instante; si alguien pregunta por ella, avisa que ya no está y ofrece alternativas parecidas.
- **Extra contratable**: conectar el bot con la planilla de propiedades que su equipo ya usa, para que lo que ustedes actualizan se refleje solo, sin pedir el cambio.

## Cómo pedir cambios (servicio de mantención)

Todos los cambios se piden por un solo canal: **José** (jose.baranda.r@csi.cl). Usted escribe qué quiere cambiar, la fábrica lo aplica y le confirma. Cambios típicos:

| Qué se puede cambiar | Ejemplo |
|---|---|
| Horario de visitas | Pasar de lunes/miércoles/jueves 11:00–14:00 a los días y horas que a usted le acomoden |
| Propiedades | Agregar, sacar, cambiar precio o marcar como arrendada/vendida |
| Requisitos de arriendo | Ajustar el texto a la política exacta de su corredora |
| Comisiones | Poner las suyas (las de la demo son de referencia) |
| Textos y tono | Saludo, nombre de la corredora, cómo se presenta el bot |
| Horario de oficina | El que informa el bot cuando le preguntan |

Los cambios simples de datos y textos son rápidos; al pedirlos, José le confirma el plazo. Ninguno requiere que el bot "se apague": se aplican y sigue atendiendo.

## Cuánto cuesta tenerlo funcionando al mes

Aparte del servicio de mantención (ese valor lo conversa directamente con José), el bot tiene un costo de funcionamiento: el servicio de conversación que le permite entender y responder mensajes.

- **Hoy, en demo: $0.** Funciona sobre una capa gratuita, suficiente para probarlo y mostrarlo.
- **En producción**: se usa un proveedor económico donde cada conversación cuesta **fracciones de centavo de dólar**. Para el volumen típico de una corredora (algunos cientos hasta unos 3.000 chats al mes), el orden de magnitud es de **unos pocos miles de pesos chilenos al mes** — en general bajo los $10.000 CLP. Es un costo chico comparado con una sola comisión de arriendo.
- Estos valores son referenciales: los proveedores ajustan sus tarifas cada tanto, así que el número fino se confirma con José antes de partir producción, junto con la modalidad (incluido en la mensualidad o a costo directo).

## Qué hacer si el bot responde mal

1. **Guarde la evidencia**: pantallazo o copia de la conversación, con fecha y hora si la tiene.
2. **Avísele a José** por el canal de siempre — él es el soporte. Describa qué preguntó el cliente y qué respondió el bot.
3. La fábrica revisa, corrige y le confirma. Si el error viene de un dato desactualizado (una propiedad que ya no está, un precio viejo), la corrección es inmediata; si es de comportamiento, se ajusta y se vuelve a probar antes de dejarlo andando.

**Tranquilidad de base**: el bot está construido para no inventar. Precios, requisitos, comisiones y horas disponibles salen siempre de sus fichas; si le preguntan algo que no está ahí (por ejemplo "¿aceptan mascotas?"), responde que lo confirmará el corredor y deja la consulta anotada junto al interesado — nunca se lanza con una respuesta al voleo.

## Qué NO hace el bot (y a quién deriva)

Pagos, reservas con abono, tasaciones, redacción de contratos y negociación de precios: el bot los deriva en una línea al corredor humano y, si tiene el teléfono del interesado, deja la nota para que usted haga el seguimiento.
