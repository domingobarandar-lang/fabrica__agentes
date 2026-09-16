// Utilidades de texto compartidas por TODOS los canales de envío.
//
// POR QUÉ EXISTE: `dividirMensaje` estaba copiado en whatsapp/sender.js y en el
// bot.js de cada cliente — mismo algoritmo, mismo 4096, distinto nombre de
// constante. Al subir telegram/enviar.js al núcleo habría sido la cuarta copia:
// el módulo que existe para des-duplicar no puede empezar duplicando.

// WhatsApp y Telegram comparten el mismo tope por mensaje de texto.
const MAX_CHARS = 4096;

/**
 * Parte un texto largo en trozos enviables, cortando en el último salto de
 * línea que quepa (así no se corta una frase por la mitad).
 *
 * DEVUELVE ARRAY VACÍO SI NO HAY NADA QUE ENVIAR. Esto no es un detalle:
 * la versión anterior devolvía [''] ante `null`, y eso hacía que el envío
 * posteara un cuerpo vacío → 400 del proveedor → el .catch del canal le
 * mandaba al cliente el mensaje de error genérico, justo cuando había pedido
 * hablar con una persona. Con [] no sale ningún mensaje aunque el guarda de
 * arriba falle: es la segunda línea de defensa del silencio.
 *
 * @param {string|null|undefined} texto
 * @returns {string[]}
 */
function dividirMensaje(texto) {
  if (texto == null) return [];
  const limpio = String(texto);
  if (limpio.trim() === '') return [];
  if (limpio.length <= MAX_CHARS) return [limpio];

  const partes = [];
  let resto = limpio;
  while (resto.length > MAX_CHARS) {
    // Cortar en el último salto de línea dentro del límite, si queda razonable
    let corte = resto.lastIndexOf('\n', MAX_CHARS);
    if (corte < MAX_CHARS * 0.5) corte = MAX_CHARS;
    partes.push(resto.slice(0, corte));
    resto = resto.slice(corte);
  }
  if (resto.length) partes.push(resto);
  return partes;
}

module.exports = { dividirMensaje, MAX_CHARS };
