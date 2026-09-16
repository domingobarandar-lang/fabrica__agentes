// Encontrar de qué propiedad está hablando la persona.
//
// EL MENSAJE QUE MÁS LLEGA es el predeterminado del aviso: "Hola, me interesó
// la propiedad en Los Ilianes 86". Viene con la dirección tal como la escribió
// quien publicó el anuncio, o como la copió alguien desde el teléfono: con
// faltas, sin tildes, con "depto", con la comuna pegada o sin ella. Acá se
// resuelve eso con reglas, ANTES de gastar un turno de modelo preguntando
// "¿cuál de estas dos?".
//
// PUNTAJE Y NO "EL PRIMERO QUE CALZA": hay dos propiedades en Holanda
// (Providencia) y dos en Buenos Aires (Recoleta) con números distintos. Un
// match por nombre de calle a secas entregaría la ficha equivocada, que en este
// agente es peor que no entregar ninguna: la persona se va con un precio que no
// es. Cuando el puntaje no despega, se devuelven los candidatos y pregunta.

const sinTilde = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase();

// Palabras que no distinguen una propiedad de otra. Sin esta lista, "la
// propiedad" hacía match con cualquier fila que tuviera "propiedad" cerca.
const VACIAS = new Set([
  'hola', 'buenas', 'me', 'interesa', 'intereso', 'interesó', 'la', 'el', 'los', 'las',
  'propiedad', 'depto', 'departamento', 'casa', 'oficina', 'local', 'terreno', 'parcela',
  'en', 'de', 'del', 'por', 'para', 'con', 'que', 'esta', 'este', 'un', 'una', 'y',
  'av', 'avda', 'avenida', 'calle', 'pasaje', 'psje', 'nro', 'numero', 'ref',
  'quiero', 'saber', 'mas', 'info', 'informacion', 'sobre', 'arriendo', 'arrendar',
  'venta', 'vender', 'comprar', 'precio', 'valor', 'disponible',
]);

const tokens = (texto) => sinTilde(texto)
  .replace(/[^a-z0-9áéíóúñ\s]/gi, ' ')
  .split(/\s+/)
  .filter((t) => t && !VACIAS.has(t));

/** El id que viaja en un botón: "Ver información [ref:167972]". */
function refEnTexto(texto) {
  const m = String(texto || '').match(/\[ref:\s*([^\]]+)\]/i);
  return m ? m[1].trim() : null;
}

/**
 * Puntaje de una propiedad frente a lo que escribió la persona.
 *
 * El número de la casa vale más que el nombre de la calle a propósito: "Holanda
 * 480" y "Holanda 2354" son dos departamentos distintos a nueve millones de
 * pesos de diferencia, y el nombre de la calle no los separa.
 */
function puntaje(propiedad, palabras) {
  const dir     = sinTilde(propiedad.direccion);
  const comuna  = sinTilde(propiedad.comuna);
  const dirTok  = new Set(tokens(propiedad.direccion));
  const numeros = new Set([...dirTok].filter((t) => /^\d+$/.test(t)));

  let puntos = 0;
  for (const palabra of palabras) {
    if (/^\d+$/.test(palabra)) {
      if (numeros.has(palabra)) puntos += 5;
      else if (propiedad.id === palabra) puntos += 10;
      // Un número que no calza con esta dirección es evidencia EN CONTRA: la
      // persona dijo "86" y esta propiedad es el 480.
      else if (numeros.size) puntos -= 3;
      continue;
    }
    if (dirTok.has(palabra)) { puntos += 3; continue; }
    if (dir.includes(palabra) && palabra.length >= 4) { puntos += 2; continue; }
    if (comuna && sinTilde(comuna).includes(palabra) && palabra.length >= 4) puntos += 2;
  }
  return puntos;
}

/**
 * Busca la propiedad de la que habla un texto libre.
 *
 * @param {Array} propiedades  las ACTIVAS de la planilla
 * @param {string} texto       lo que escribió la persona
 * @param {number} [tope=3]    cuántos candidatos devolver como máximo
 * @returns {{ exacta: object|null, candidatas: object[] }}
 */
function porTexto(propiedades, texto, tope = 3) {
  const ref = refEnTexto(texto);
  if (ref) {
    const exacta = propiedades.find((p) => p.id === ref);
    if (exacta) return { exacta, candidatas: [exacta] };
  }

  const palabras = tokens(texto);
  if (!palabras.length) return { exacta: null, candidatas: [] };

  const conPuntaje = propiedades
    .map((p) => ({ p, n: puntaje(p, palabras) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  if (!conPuntaje.length) return { exacta: null, candidatas: [] };

  // Una sola gana cuando le saca ventaja clara a la segunda. Si van empatadas,
  // preguntar cuesta un turno; entregar la equivocada cuesta el lead.
  //
  // Y gana también cuando es LA ÚNICA que calza, aunque el puntaje sea flojo:
  // quien escribe "me gustó la propiedad en Av. Inglaterra", sin número, está
  // hablando de la única de Av. Inglaterra que hay publicada. Preguntarle "¿cuál
  // de las …?" con una sola opción en pantalla es un turno regalado y se lee
  // como que el bot no entendió.
  const mejor = conPuntaje[0];
  const segunda = conPuntaje[1];
  const despega = (mejor.n >= 5 && (!segunda || mejor.n >= segunda.n + 3))
    || (conPuntaje.length === 1 && mejor.n >= 3);

  return {
    exacta: despega ? mejor.p : null,
    candidatas: conPuntaje.slice(0, tope).map((x) => x.p),
  };
}

/** Filtro simple para "busco algo para arrendar en Ñuñoa". */
function porFiltros(propiedades, { operacion, comuna, tipo } = {}, tope = 3) {
  const coincide = (valor, buscado) => !buscado || sinTilde(valor).includes(sinTilde(buscado));
  const encontradas = propiedades.filter((p) =>
    coincide(p.operacion, operacion) && coincide(p.comuna, comuna) && coincide(p.tipo, tipo));
  return { encontradas: encontradas.slice(0, tope), total: encontradas.length };
}

module.exports = { porTexto, porFiltros, refEnTexto, tokens, puntaje };
