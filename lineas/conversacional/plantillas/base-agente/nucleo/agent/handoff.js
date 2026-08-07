// Derivación a un humano (handoff). Vive en el NÚCLEO porque es una regla de
// negocio que ningún cliente debería reescribir.
//
// LA REGLA CENTRAL, Y NO ES TÉCNICA: la derivación es DEFINITIVA por defecto.
// La directiva original proponía "30 min sin actividad → vuelve el bot en
// silencio". El agente de Gesta evaluó exactamente esa propuesta y la rechazó
// como regresión grave: revivir al bot en un chat ya derivado contradice la
// promesa que se le hizo al cliente. Default del núcleo: HANDOFF_TIMEOUT_MIN
// vacío = nunca vuelve solo. Un cliente que quiera el retorno automático lo
// enciende a propósito.
//
// Es más seguro equivocarse por el lado del silencio: si el bot no vuelve, el
// peor caso es que alguien lo reactive a mano; si vuelve cuando no debía, el
// cliente descubre que la "persona" que le prometieron era un bot otra vez.

const { db } = require('../database/supabase');
const config = require('../config');

// La config se lee en cada llamada, no al cargar el módulo: el arnés necesita
// probar varias combinaciones en una sola corrida. `config.valor` resuelve la
// precedencia .env > agente.config.json > default del núcleo.
const activo = () => config.valor('handoff.activo');

// null = derivación definitiva (default). Un número = minutos de inactividad
// tras los cuales el bot vuelve a tomar el control.
const timeoutMin = () => config.valor('handoff.timeout_min');

// Fallos técnicos consecutivos tras los cuales se deriva sin que el cliente lo
// pida. 0 lo desactiva.
const maxFallos = () => config.valor('handoff.max_fallos');

// Petición explícita. Deliberadamente amplio: un falso positivo cuesta que una
// persona conteste un chat que el bot podía atender; un falso negativo cuesta
// que alguien pida ayuda y nadie llegue.
//
// TOLERANCIA A ERRORES DE TIPEO (2026-08-06, paso 3): la gente escribe desde el
// teléfono y "kiero ablar con alguien" es tan real como la forma correcta.
// Cuando el perfil `ortografia` del arnés de evals mandó esa frase, el núcleo
// NO derivó — el peor falso negativo posible, y el que este mismo archivo
// declara inaceptable dos comentarios más arriba. Por eso `h?abl?ar`,
// `(qu|k)iero` y `alguien` a secas. Si agregas un trigger nuevo, escríbelo ya
// tolerante: el arnés lo va a probar mal escrito.
// El \b importa: sin él, `abar` casa dentro de "acabar" y "acabar con alguien"
// derivaría por error.
const V_HABLAR  = '\\bh?abl?ar';                    // hablar / ablar
const V_QUERER  = '\\b(?:qu|k)iero';                // quiero / kiero
const QUIEN     =
  '(?:persona|humano|ser humano|alguien|ejecutiv[oa]|asesor[a]?|vendedor[a]?|encargad[oa]|superviso\\w*)';

const TRIGGERS_PETICION = [
  new RegExp(`${V_HABLAR} (?:con|contigo)?\\s*(?:una|un)?\\s*${QUIEN}`, 'i'),
  new RegExp(
    `(?:${V_QUERER}|necesito|puedo|me pasas|p[aá]same|derivar|deriva|comunicar|comun[ií]ca\\w*)` +
    `\\w*\\s+(?:con\\s+)?(?:una|un)?\\s*${QUIEN}`,
    'i'
  ),
  /\b(atenci[oó]n|atienda|atiende)\s+(humana|de una persona|un humano)/i,
  /\bno\s+(quiero|kiero|más|mas)\s+(h?abl?ar\s+con\s+)?(un\s+)?(bot|robot|m[aá]quina)\b/i,
  /\b(eres|sos|es)\s+un\s+(bot|robot)\b.*\?/i,
];

// Palabras de riesgo: la conversación deja de ser comercial. Acá no se optimiza
// conversión, se pasa a una persona.
const PALABRAS_RIESGO = [
  /\b(abogad[oa]|demanda|demandar|sernac|denuncia|denunciar|estafa|fraude|juicio|notaria|notarial)\b/i,
  /\b(suicid|me quiero morir|matarme|hacerme daño)\w*/i,
  /\b(emergencia|urgencia m[eé]dica|ambulancia|accidente grave)\b/i,
];

const MENSAJE_DERIVACION =
  'Entiendo. Te dejo con una persona del equipo — le paso la conversación ahora y te responde en cuanto pueda. 🙌';

/** ¿Este texto es una petición explícita de hablar con un humano? */
function esPeticionDeHumano(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return false;
  return TRIGGERS_PETICION.some((re) => re.test(texto));
}

/**
 * Clasifica el mensaje entrante.
 * @returns {{ motivo: 'peticion'|'riesgo' } | null}
 */
function detectar(texto) {
  if (!activo()) return null;
  if (esPeticionDeHumano(texto)) return { motivo: 'peticion' };
  if (typeof texto === 'string' && PALABRAS_RIESGO.some((re) => re.test(texto))) {
    return { motivo: 'riesgo' };
  }
  return null;
}

/**
 * ¿Hay una persona a cargo de este canal ahora mismo?
 * Si el cliente configuró timeout y ya venció, lo devuelve al bot y avisa.
 */
async function enModoHumano(canalId) {
  if (!activo()) return false;
  let estado;
  try {
    estado = await db.estadoCanal.get(canalId);
  } catch (error) {
    // FALLA CERRADO: si no puedo leer el estado, asumo que hay un humano.
    // Peor caso: el bot se queda callado un rato. La alternativa es hablarle
    // encima a una ejecutiva que ya está atendiendo.
    console.warn('[Handoff] No pude leer el estado del canal, asumo modo humano:', error.message);
    return true;
  }
  if (!estado?.modo_humano) return false;

  const tope = timeoutMin();
  if (tope != null && estado.humano_desde) {
    const minutos = (Date.now() - new Date(estado.humano_desde).getTime()) / 60000;
    if (minutos >= tope) {
      console.log(`[Handoff] ${canalId}: venció el timeout de ${tope} min, el bot retoma.`);
      await desactivar(canalId);
      return false;
    }
  }
  return true;
}

/** Marca el canal como atendido por una persona. */
async function activar(canalId, motivo) {
  const estado = {
    modo_humano: true,
    humano_desde: new Date().toISOString(),
    motivo,
    fallos_seguidos: 0,
  };
  await db.estadoCanal.set(canalId, estado);

  const inbox = config.valor('handoff.inbox');
  console.log(
    `[Handoff] ${canalId}: derivado a humano (motivo: ${motivo})` +
    (inbox ? ` — avisar a ${inbox}` : ' — sin "handoff.inbox" configurado')
  );
  return estado;
}

/** Devuelve el canal al bot. Manual, o por timeout si el cliente lo configuró. */
async function desactivar(canalId) {
  await db.estadoCanal.set(canalId, {
    modo_humano: false,
    humano_desde: null,
    motivo: null,
    fallos_seguidos: 0,
  });
}

/**
 * Suma un fallo técnico. Al llegar a MAX_FALLOS deriva: si el bot lleva tres
 * turnos sin poder responder, seguir intentando es hacerle perder el tiempo
 * a alguien que ya está molesto.
 * @returns {Promise<boolean>} true si esta llamada disparó la derivación
 */
async function registrarFallo(canalId) {
  const tope = maxFallos();
  if (!activo() || tope <= 0) return false;
  try {
    const estado = (await db.estadoCanal.get(canalId)) || {};
    const fallos = (estado.fallos_seguidos || 0) + 1;
    if (fallos >= tope) {
      await activar(canalId, 'fallos_tecnicos');
      return true;
    }
    await db.estadoCanal.set(canalId, { ...estado, fallos_seguidos: fallos });
    return false;
  } catch (error) {
    console.warn('[Handoff] No pude registrar el fallo:', error.message);
    return false;
  }
}

/** Un turno que salió bien borra la racha de fallos. */
async function limpiarFallos(canalId) {
  if (!activo() || maxFallos() <= 0) return;
  try {
    const estado = await db.estadoCanal.get(canalId);
    if (estado?.fallos_seguidos) {
      await db.estadoCanal.set(canalId, { ...estado, fallos_seguidos: 0 });
    }
  } catch {
    // no crítico
  }
}

module.exports = {
  activo,
  timeoutMin,
  maxFallos,
  MENSAJE_DERIVACION,
  esPeticionDeHumano,
  detectar,
  enModoHumano,
  activar,
  desactivar,
  registrarFallo,
  limpiarFallos,
};
