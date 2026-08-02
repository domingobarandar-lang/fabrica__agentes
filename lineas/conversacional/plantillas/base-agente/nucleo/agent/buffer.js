// Agrupación de mensajes seguidos ("el cliente escribe como habla").
//
// Cuatro mensajes en seis segundos son UN turno, no cuatro: se juntan y el
// modelo los ve completos. Se monta ENCIMA de la cola serial de core.js, no la
// reemplaza.
//
// ⚠️ LA LISTA DE EXCEPCIONES NO ES UN ADORNO. Viene de evidencia de campo: el
// agente WhatsApp de Gesta implementó este mismo buffer y la lección que dejó
// es dura — PEDIR UN HUMANO NO PUEDE ESPERAR. Si el cliente pide una persona y
// el contenedor se reinicia durante la ventana de agrupación, el cliente pidió
// ayuda y nadie se enteró.
//
// La regla general, que vale para cualquier buffer que se escriba después:
//   cuando un buffer agrupa mensajes, hay que preguntarse qué acción NO puede
//   esperar. La respuesta casi siempre incluye las acciones irreversibles:
//   pedir un humano, cancelar, pagar.
//
// Ventana: 6 s. Es el número que Gesta corre en producción; el 8 s que traía la
// directiva no tenía tráfico real detrás.

const { esPeticionDeHumano } = require('./handoff');

// La config se lee en cada llamada, no al cargar el módulo: así el arnés puede
// probar varias ventanas en una corrida sin recargar Node, y un cambio de
// variable en Railway toma efecto sin redeploy.
const ventanaMs = () => Number(process.env.BUFFER_MS ?? 6000);

// Tope de seguridad: si alguien manda 30 mensajes seguidos, se procesa igual.
const maxPartes = () => Number(process.env.BUFFER_MAX_PARTES ?? 10);

// Excepciones configurables por entorno. `handoff` NO se puede sacar: se fuerza
// abajo. Sacarla es exactamente el bug que Gesta encontró en producción, y hay
// una verificación en la prueba de humo que falla si alguien lo intenta.
const EXCEPCIONES_OBLIGATORIAS = ['handoff'];
const excepciones = () => {
  const crudo = process.env.BUFFER_EXCEPCIONES;
  const pedidas = crudo == null
    ? ['handoff', 'cancelacion', 'adjunto']
    : crudo.split(',').map((s) => s.trim()).filter(Boolean);
  return new Set([...pedidas, ...EXCEPCIONES_OBLIGATORIAS]);
};

const RE_CANCELACION = /\b(cancel|anul|no vengo|no voy a ir|no podr[eé] ir|dar de baja|devoluci[oó]n|reembols)\w*/i;

/**
 * ¿Este mensaje se salta la ventana de agrupación?
 * Exportada para que el arnés pueda verificarlo sin montar todo el núcleo.
 */
function esExcepcion(mensaje, opciones = {}) {
  const activas = excepciones();
  // handoff: siempre, aunque BUFFER_EXCEPCIONES venga vacío.
  if (esPeticionDeHumano(mensaje)) return 'handoff';
  if (activas.has('cancelacion') && RE_CANCELACION.test(mensaje || '')) return 'cancelacion';
  // Una foto no se concatena con texto: se procesa por su cuenta.
  if (activas.has('adjunto') && opciones.adjunto) return 'adjunto';
  return null;
}

// canalId -> { partes: [], esperas: [{resolve, reject}], reloj }
const grupos = new Map();

/**
 * Agrupa `mensaje` con los que lleguen dentro de la ventana y llama a
 * `procesar(canalId, textoUnido)` UNA sola vez por grupo.
 *
 * Contrato de retorno: el ÚLTIMO mensaje del grupo recibe la respuesta; los
 * anteriores reciben `null` (= no envíes nada). Es el mismo `null` que usa el
 * handoff, y lo entienden los mismos guardas de envío.
 *
 * @param {string} canalId
 * @param {string} mensaje
 * @param {(canalId: string, texto: string) => Promise<string|null>} procesar
 * @param {{ adjunto?: boolean }} [opciones]
 * @returns {Promise<string|null>}
 */
function agrupar(canalId, mensaje, procesar, opciones = {}) {
  const ventana = ventanaMs();
  if (!(ventana > 0)) return procesar(canalId, mensaje);

  const grupo = grupos.get(canalId) || { partes: [], esperas: [], reloj: null };
  grupos.set(canalId, grupo);
  grupo.partes.push(mensaje);

  const motivo = esExcepcion(mensaje, opciones);

  return new Promise((resolve, reject) => {
    grupo.esperas.push({ resolve, reject });

    if (motivo) {
      console.log(`[Buffer] ${canalId}: excepción "${motivo}" — no espera la ventana.`);
      return disparar(canalId, procesar);
    }
    if (grupo.partes.length >= maxPartes()) return disparar(canalId, procesar);

    // Cada mensaje nuevo reinicia la cuenta: la ventana mide el silencio, no
    // el tiempo desde el primer mensaje.
    if (grupo.reloj) clearTimeout(grupo.reloj);
    // OJO: nada de unref() acá. La primera versión lo tenía "para no retrasar
    // el apagado" y la prueba de humo se murió en silencio: Node se va cuando
    // solo quedan timers unref'd, así que el grupo pendiente NUNCA se procesa.
    // Traducido a producción: el cliente escribió, el proceso se quedó sin otra
    // cosa que hacer, y su mensaje se perdió sin dejar rastro.
    grupo.reloj = setTimeout(() => disparar(canalId, procesar), ventana);
  });
}

function disparar(canalId, procesar) {
  const grupo = grupos.get(canalId);
  if (!grupo) return;
  grupos.delete(canalId);
  if (grupo.reloj) clearTimeout(grupo.reloj);

  const texto   = grupo.partes.join('\n');
  const esperas = grupo.esperas;
  const ultima  = esperas[esperas.length - 1];

  // Los que no son el último no reciben respuesta: su turno se fusionó.
  for (const espera of esperas.slice(0, -1)) espera.resolve(null);

  Promise.resolve()
    .then(() => procesar(canalId, texto))
    .then(ultima.resolve, ultima.reject);
}

/** Para los tests: vacía cualquier grupo pendiente sin procesarlo. */
function _limpiar() {
  for (const [, grupo] of grupos) {
    if (grupo.reloj) clearTimeout(grupo.reloj);
    for (const espera of grupo.esperas) espera.resolve(null);
  }
  grupos.clear();
}

module.exports = { agrupar, esExcepcion, _limpiar, ventanaMs, excepciones };
