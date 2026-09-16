// El número de la corredora no es un cliente. Producto de Gesta.
//
// EL PROBLEMA QUE RESUELVE, y es el que nadie ve venir: para que la gente pueda
// escribirle al bot sin limitaciones, alguien de Gesta le manda un "hola" al
// número del agente cada mañana — así se abre la ventana de 24 horas de
// WhatsApp. Sin este guarda, ese "hola" entra por la puerta de siempre y Sofía
// le contesta a su propia corredora como si fuera un interesado: le ofrece
// botones, le pide dos fechas para una visita y termina derivándola a sí misma.
//
// Y HAY UNA SEGUNDA RAZÓN, más de fondo: la derivación es DEFINITIVA. Cuando
// una conversación pasa a una ejecutiva, el bot no vuelve a hablar en ese chat
// nunca más. Eso es correcto el día que pasa, y es un problema tres meses
// después, cuando esa misma persona escribe por otra propiedad y no le contesta
// nadie. `liberar` es la llave para devolverle ese chat al bot, y la tiene la
// corredora desde su teléfono, sin entrar a ninguna consola.
//
// La firma del webhook se valida IGUAL, reusando la del núcleo: un atajo que
// actúa sobre un mensaje sin verificar es un webhook abierto, aunque el atajo
// sea corto.

const webhook  = require('./webhook');
const { sendMessage } = require('./sender');
const handoff  = require('../agent/handoff');
const config   = require('../config');
const { db }   = require('../database/supabase');

const numeroCorredora = () => String(config.valor('handoff.inbox') || '').replace(/[^\d]/g, '');

const AYUDA = [
  '🤖 Sofía está activa.',
  '',
  'Comandos desde este número:',
  '· estado — cuántas propiedades hay publicadas',
  '· liberar 569XXXXXXXX — le devuelve ese chat al bot',
  '· atender 569XXXXXXXX — toma tú ese chat (el bot se calla)',
].join('\n');

/** Respuesta a un mensaje de la corredora. Devuelve el texto a enviarle. */
async function responderACorredora(texto) {
  const limpio = String(texto || '').trim();

  const liberar = limpio.match(/^liberar\s+\+?(\d{7,15})$/i);
  if (liberar) {
    await handoff.desactivar(liberar[1]);
    return `✅ Listo. Sofía vuelve a atender a +${liberar[1]}.`;
  }

  const atender = limpio.match(/^atender\s+\+?(\d{7,15})$/i);
  if (atender) {
    await handoff.activar(atender[1], 'tomado_por_ejecutiva');
    return `✅ Listo. Sofía no le responde más a +${atender[1]}: el chat es tuyo.`;
  }

  if (/^estado$/i.test(limpio)) {
    const activas = await db.propiedades.activas();
    const fuente = db.propiedades.estado();
    const requisitos = activas.filter((p) => String(p.requisitos || '').trim()).length;
    return [
      '📊 Estado de Sofía',
      `· ${activas.length} propiedades publicadas`,
      `· ${requisitos} con requisitos cargados`,
      `· Planilla: ${fuente.origen === 'google' ? 'leída en vivo' : `copia ${fuente.origen}`}`,
    ].join('\n');
  }

  // Cualquier otra cosa —el "hola" de la mañana— abre la ventana de 24 horas y
  // recibe el recordatorio de los comandos. Corto: se lee de pie.
  return AYUDA;
}

/**
 * Middleware de Express. Se monta ANTES del webhook del núcleo y solo se queda
 * con los mensajes que vienen del número de la corredora; todo lo demás sigue
 * de largo por el camino de siempre.
 */
function guardaCorredora(req, res, next) {
  const destino = numeroCorredora();
  if (!destino || req.method !== 'POST') return next();

  if (!webhook._verificarFirma(req)) return next(); // que la rechace el núcleo

  let mensaje;
  try {
    mensaje = webhook._extraerMensaje(req.body);
  } catch {
    return next();
  }
  if (!mensaje || mensaje.telefono !== destino) return next();

  // Es la corredora: se responde acá y NO se despierta al agente.
  res.sendStatus(200);
  responderACorredora(mensaje.texto)
    .then((respuesta) => sendMessage(destino, respuesta))
    .catch((error) => console.error('[Corredora] No pude responder:', error.message));
}

module.exports = { guardaCorredora, responderACorredora, numeroCorredora, AYUDA };
