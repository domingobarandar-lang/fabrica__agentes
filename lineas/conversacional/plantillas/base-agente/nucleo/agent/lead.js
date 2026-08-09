// Lo que el agente YA SABE de la persona. (A-05 del plan, cerrado en el paso 6)
//
// EL PROBLEMA: el agente re-deriva del historial, en cada turno, datos que ya le
// dieron. Pregunta el nombre, la persona lo dice, y cuatro mensajes después
// vuelve a preguntarlo. El arnés ya tenía un invariante que lo DETECTA
// (`no_repregunta_dato_capturado`); esto es lo que lo EVITA: el núcleo mira qué
// datos recibieron las herramientas, los guarda por conversación y se los
// recuerda al modelo en un bloque corto del prompt.
//
// POR QUÉ ENTRA JUNTO CON EL FLUJO, Y NO DESPUÉS. Con un agente solo esto es una
// mejora; con varios es un requisito. La forma clásica de fallar de un flujo
// multi-agente es que el especialista salude de nuevo y vuelva a pedir el
// teléfono que la recepción ya había tomado — la persona siente que la pasaron
// con alguien que no leyó nada, que es peor atención que la del agente único.
// Repartir el trabajo sin repartir lo que ya se sabe empeora el producto.
//
// DE DÓNDE SALEN LOS DATOS: de los `input` que el modelo le pasa a las
// herramientas del cliente. Es la misma señal que usa el invariante y tiene la
// propiedad que hace falta acá — funciona SIN tocar agent/tools.js, así que
// activar esto no obliga a reescribir el código de ningún cliente. El precio es
// que solo se entera de un dato cuando alguna herramienta lo recibe: un dato que
// la persona dijo y que ninguna tool usó, no se guarda. Es el intercambio
// correcto para la v1 — la alternativa era que cada cliente escribiera llamadas
// de anotación a mano, que es justo lo que nadie mantiene.

const config = require('../config');

// Tope por valor. El contenido viene, en última instancia, de lo que escribió
// la persona: entra al prompt de sistema, así que se trata como entrada no
// confiable. Se recorta y se le sacan los saltos de línea para que nadie pueda
// pegar instrucciones nuevas dentro de un campo llamado "nombre".
const TOPE_VALOR = 80;

const campos = () => config.valor('lead.campos');

/** ¿Este agente recuerda datos? Sin campos declarados, no hay nada que recordar. */
function activo() {
  return config.valor('lead.activo') && campos().length > 0;
}

const clavesDe = (campo) => (campo.claves.length ? campo.claves : [campo.campo])
  .map((c) => String(c).toLowerCase());

function limpiar(valor) {
  const texto = String(valor).replace(/\s+/g, ' ').trim();
  return texto.length > TOPE_VALOR ? `${texto.slice(0, TOPE_VALOR)}…` : texto;
}

/** Los datos ya conocidos de esta conversación, desde la fila de estado_canal. */
function leer(estadoPrevio) {
  const guardado = estadoPrevio?.lead;
  if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) return {};
  // Solo lo que sigue estando declarado: si el cliente sacó un campo del
  // contrato, dejar de recordarlo es lo correcto.
  const declarados = new Set(campos().map((c) => c.campo));
  return Object.fromEntries(
    Object.entries(guardado).filter(([k, v]) => declarados.has(k) && v != null && v !== '')
  );
}

/**
 * Mira el input de una herramienta y devuelve los datos nuevos que trae.
 * No muta ni persiste: agent/core.js junta lo del turno y escribe una sola vez.
 *
 * @param {object} datos lo que ya se sabía
 * @param {object} input lo que el modelo le pasó a una tool
 * @returns {object} solo los campos NUEVOS (vacío si no hubo ninguno)
 */
function observar(datos, input) {
  if (!activo() || !input || typeof input !== 'object') return {};

  const entradas = Object.entries(input)
    .filter(([, v]) => v != null && String(v).trim() !== '');
  if (!entradas.length) return {};

  const nuevos = {};
  for (const campo of campos()) {
    if (datos[campo.campo]) continue;            // el primero gana: no se pisa
    const claves = clavesDe(campo);
    const hallado = entradas.find(([k]) => claves.includes(String(k).toLowerCase()));
    if (hallado) nuevos[campo.campo] = limpiar(hallado[1]);
  }
  return nuevos;
}

/** Campos requeridos que todavía no se saben. */
function faltantes(datos = {}) {
  return campos().filter((c) => c.requerido && !datos[c.campo]);
}

const etiqueta = (campo) => campo.etiqueta || campo.campo.replace(/_/g, ' ');

/**
 * El bloque del prompt. Corto a propósito: es información de estado, no
 * instrucciones, y compite por la atención del modelo con las reglas duras.
 */
function bloque(datos = {}) {
  if (!activo()) return '';

  const sabidos = campos().filter((c) => datos[c.campo]);
  const pendientes = faltantes(datos);
  if (!sabidos.length && !pendientes.length) return '';

  const lineas = [''];
  if (sabidos.length) {
    lineas.push('LO QUE YA SABES DE ESTA PERSONA (no se lo vuelvas a preguntar)');
    for (const c of sabidos) lineas.push(`- ${etiqueta(c)}: ${datos[c.campo]}`);
  }
  if (pendientes.length) {
    lineas.push(
      sabidos.length ? '' : 'AÚN NO SABES NADA DE ESTA PERSONA.',
      `TE FALTA, y lo necesitas para completar: ${pendientes.map(etiqueta).join(', ')}.`,
      'Pídelo de a uno y solo cuando venga al caso, nunca como formulario.'
    );
  }
  return lineas.join('\n');
}

/** Prompt + lo que ya se sabe. Sin campos declarados, lo devuelve tal cual. */
function anexar(prompt, datos) {
  const b = bloque(datos);
  return b ? `${prompt}\n${b}` : prompt;
}

module.exports = {
  TOPE_VALOR,
  activo,
  campos,
  leer,
  observar,
  faltantes,
  bloque,
  anexar,
};
