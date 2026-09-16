// El aviso a la ejecutiva de Gesta: el mini-informe que le llega por WhatsApp
// cada vez que una conversación pasa a manos de una persona.
//
// POR QUÉ ES UN SOLO CAMINO. Una conversación termina en la ejecutiva por cinco
// puertas distintas: la persona pidió hablar con alguien, apretó "Con una
// ejecutiva", agendó una visita, dejó su propiedad en captación, o el bot falló
// tres veces seguidas. Mandar el aviso desde cada tool habría dejado la puerta
// más común —la petición explícita, que el núcleo resuelve ANTES de llamar al
// modelo, o sea sin pasar por ninguna tool— sin aviso ninguno: la ejecutiva se
// enteraría de todo menos de la gente que la pidió.
//
// Así que el aviso cuelga de UN enganche del núcleo (`handoff.alDerivar`), que
// corre en las cinco puertas. Las tools solo ANOTAN contexto antes de derivar;
// el informe se arma y se manda una sola vez, acá.
//
// EL BOTÓN "ESCRIBIRLE" es el punto entero del informe. El número de la
// corredora y el del bot son distintos, así que la ejecutiva no puede seguir la
// conversación donde iba: tiene que abrir un chat nuevo con esa persona. Un
// `wa.me` en un botón hace eso en un toque, desde el teléfono, sin copiar y
// pegar un número a mano a las diez de la noche.

const handoff = require('../agent/handoff');
const config  = require('../config');
const { db }  = require('../database/supabase');
const { sendMessage } = require('../whatsapp/sender');
const formato = require('../agent/formato');

// Contexto que las tools dejan antes de derivar. Vive un ratito y por canal:
// el informe se arma en el mismo turno en que se deriva.
const anotado = new Map();

// Los últimos informes, en memoria. Existe para poder PROBAR el informe: es la
// salida de negocio más importante del agente (es lo único que ve la ejecutiva)
// y sin esto la suite solo podría comprobar que no reventó. Es un anillo corto
// a propósito: no es un registro, es una ventanita.
const ultimos = [];
const TOPE_ULTIMOS = 20;

const MOTIVOS = {
  peticion:            'La persona pidió hablar con alguien del equipo',
  riesgo:              '⚠️ Conversación delicada: pidió intervención humana',
  fallos_tecnicos:     '⚠️ El bot falló tres veces seguidas y derivó solo',
  visita_agendada:     '📅 Quiere coordinar una visita',
  captacion:           '💰 Quiere vender o arrendar su propiedad con Gesta',
  pidio_ejecutiva:     'Apretó el botón para hablar con una ejecutiva',
};

/** Una tool deja acá lo que la ejecutiva necesita saber, antes de derivar. */
function anotar(canalId, datos) {
  anotado.set(canalId, { ...(anotado.get(canalId) || {}), ...datos });
}

const leerAnotado = (canalId) => anotado.get(canalId) || {};
const olvidar = (canalId) => anotado.delete(canalId);

/** El número de la ejecutiva. Vacío = no hay a quién avisarle (y se dice). */
const numeroEjecutiva = () => String(config.valor('handoff.inbox') || '').replace(/[^\d]/g, '');

/**
 * Las últimas líneas de la conversación, para que la ejecutiva no llegue a
 * ciegas. Se recorta fuerte: el informe es para leerlo de pie, en el teléfono.
 */
async function resumenConversacion(canalId, tope = 6) {
  try {
    const sesion = await db.sesiones.get(canalId);
    const mensajes = (sesion?.messages || []).slice(-tope);
    if (!mensajes.length) return null;
    return mensajes
      .map((m) => {
        const quien = m.role === 'user' ? '👤' : '🤖';
        const texto = String(m.content || '').replace(/\s+/g, ' ').trim();
        return `${quien} ${texto.length > 110 ? texto.slice(0, 109) + '…' : texto}`;
      })
      .join('\n');
  } catch (error) {
    console.warn('[Aviso] No pude leer la conversación para el informe:', error.message);
    return null;
  }
}

/** Arma el texto del informe. Separado del envío para poder probarlo. */
async function armarInforme({ canalId, motivo }) {
  const datos = leerAnotado(canalId);
  const L = [];

  L.push('🔔 NUEVO CONTACTO — Sofía');
  L.push('━━━━━━━━━━━━━━━━━━━━');
  L.push(`📌 ${MOTIVOS[datos.motivo || motivo] || 'La conversación pasó a una persona'}`);
  L.push(`📱 +${canalId}`);
  if (datos.nombre) L.push(`🙋 ${datos.nombre}`);

  if (datos.propiedad) {
    L.push('');
    L.push(`🏠 ${formato.titulo(datos.propiedad)}`);
    if (datos.propiedad.link) L.push(`🔗 ${datos.propiedad.link}`);
  }

  if (datos.preferencias?.length) {
    L.push('');
    L.push('📅 Prefiere:');
    datos.preferencias.forEach((f, i) => L.push(`   ${i + 1}. ${f}`));
  }

  if (datos.captacion) {
    const c = datos.captacion;
    L.push('');
    L.push('🏷️ Su propiedad:');
    if (c.operacion) L.push(`   · Quiere: ${c.operacion}`);
    if (c.comuna)    L.push(`   · Comuna: ${c.comuna}`);
    if (c.tipo)      L.push(`   · Tipo: ${c.tipo}`);
    if (c.detalle)   L.push(`   · ${c.detalle}`);
  }

  const conversacion = await resumenConversacion(canalId);
  if (conversacion) {
    L.push('');
    L.push('💬 Lo que se habló:');
    L.push(conversacion);
  }

  return L.join('\n');
}

/**
 * Manda el informe. Nunca lanza: si esto falla, la derivación ya ocurrió y lo
 * que corresponde es gritar en el log, no romper el turno de la persona.
 */
async function avisar({ canalId, motivo }) {
  const destino = numeroEjecutiva();
  const informe = await armarInforme({ canalId, motivo });

  if (!destino) {
    // Sin número no hay a quién avisarle. Se dice fuerte y se deja el informe
    // en el log: es lo único que queda, y es mejor que perderlo.
    console.warn(
      '[Aviso] No hay número de ejecutiva configurado (handoff.inbox en agente.config.json). ' +
      'El informe NO se envió:\n' + informe
    );
    ultimos.push({ canalId, informe, enviado: false, en: new Date().toISOString() });
    if (ultimos.length > TOPE_ULTIMOS) ultimos.shift();
    olvidar(canalId);
    return { enviado: false, informe };
  }

  // El botón va SOLO (la API no mezcla un cta_url con botones de respuesta) y
  // es todo lo que la ejecutiva necesita: un toque y está escribiéndole.
  await sendMessage(destino, informe, {
    botones: [{ tipo: 'url', titulo: '💬 Escribirle', url: `https://wa.me/${canalId}` }],
  });
  ultimos.push({ canalId, informe, enviado: true, en: new Date().toISOString() });
  if (ultimos.length > TOPE_ULTIMOS) ultimos.shift();
  olvidar(canalId);
  return { enviado: true, informe, destino };
}

/**
 * Engancha el aviso al handoff del núcleo. Se llama desde agent/tools.js —que
 * agent/core.js carga siempre— y no desde index.js: con el enganche en el
 * servidor, el canal terminal y la suite de evals derivarían sin avisarle a
 * nadie, y el camino que más deriva jamás se probaría.
 */
function engancharHandoff() {
  handoff.alDerivar((aviso) => avisar(aviso));
}

/** Para los evals y la demo: qué informes se armaron, y con qué contexto. */
const _anotado = leerAnotado;
const _ultimos = () => ultimos.map((u) => ({ ...u }));
const _limpiar = () => { ultimos.length = 0; anotado.clear(); };

module.exports = {
  anotar, avisar, armarInforme, engancharHandoff, numeroEjecutiva,
  _anotado, _ultimos, _limpiar, MOTIVOS,
};
