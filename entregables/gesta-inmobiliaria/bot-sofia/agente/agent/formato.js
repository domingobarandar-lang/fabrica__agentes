// Cómo se ve una propiedad en el chat. Producto del cliente, no del núcleo.
//
// LA FICHA LA ARMA EL CÓDIGO, NO EL MODELO. Es la decisión de diseño más
// importante de este agente y viene directo de la regla que puso José: Sofía no
// inventa nada. Si el modelo redactara la ficha, cada envío sería una
// oportunidad de redondear un precio, castellanizar una comuna o "mejorar" una
// amenidad. Acá el modelo decide CUÁNDO mandar la ficha; QUÉ dice la ficha sale
// de la planilla, carácter por carácter.
//
// EL FORMATO ES EL QUE YA USA GESTA. El encabezado, los emojis y el orden salen
// del mensaje que la corredora manda hoy: la gente que le escribe ya lo
// reconoce, y cambiarlo por gusto sería romper algo que funciona.
//
// LO QUE NO ESTÁ EN LA PLANILLA NO APARECE. Una celda vacía no produce una
// línea vacía ni un "no especificado": produce nada. Un 0 en dormitorios es un
// terreno, no un departamento sin piezas.

const MONEDAS = { UF: 'UF', CLP: '$', USD: 'US$' };

/** 5000 → "5.000". Formato chileno, sin decimales salvo que el dato los traiga. */
function miles(valor) {
  const decimales = Number.isInteger(valor) ? 0 : 2;
  return valor.toLocaleString('es-CL', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/**
 * "5.000 UF" · "$131.000.000".
 * Un monto que la planilla no dejó claro devuelve null: mostrar "14" sin saber
 * si son pesos o UF es exactamente la clase de dato inventado que este agente
 * tiene prohibido. Queda en `npm run datos` para que la corredora lo arregle.
 */
function monto(m) {
  if (!m || m.valor == null || !m.moneda) return null;
  return m.moneda === 'UF' ? `${miles(m.valor)} UF` : `${MONEDAS[m.moneda] || ''}${miles(m.valor)}`;
}

const operacionEnTexto = (op) => (/arriendo/i.test(op) ? 'en arriendo' : /venta/i.test(op) ? 'en venta' : '');

/** "Departamento en venta - Las Condes (Los Ilianes 86)" */
function titulo(p) {
  const partes = [p.tipo || 'Propiedad', operacionEnTexto(p.operacion)].filter(Boolean).join(' ');
  const lugar = [p.comuna, p.direccion ? `(${p.direccion})` : ''].filter(Boolean).join(' ');
  return lugar ? `${partes} - ${lugar}` : partes;
}

/**
 * El nombre de una propiedad dentro de un botón: 20 caracteres, ni uno más.
 *
 * El núcleo recorta lo que se pase, pero recortar por la fuerza produce
 * "Luis Thayer Ojeda 1…", que en un teléfono no dice nada. Acá se recorta con
 * criterio: se sueltan las palabras de adelante, que son las genéricas
 * ("Avenida", "Condominio", "Los"), y se conserva el final, que es lo que
 * identifica — el nombre corto de la calle y su número.
 */
function tituloBoton(p) {
  const base = String(p.direccion || p.comuna || p.tipo || '').trim();
  if (base.length <= 20) return base;

  const palabras = base.split(/\s+/);
  let corto = palabras[palabras.length - 1];
  for (let i = palabras.length - 2; i >= 0; i--) {
    const intento = `${palabras[i]} ${corto}`;
    if (intento.length > 20) break;
    corto = intento;
  }
  // Una sola palabra de más de 20 caracteres: no queda otra que cortarla.
  return corto.length <= 20 ? corto : corto.slice(0, 19) + '…';
}

/** Una línea corta para listar varias propiedades sin vomitar el catálogo. */
function linea(p) {
  const precio = monto(p.precio);
  const donde = [p.direccion, p.comuna].filter(Boolean).join(', ') || 'sin dirección cargada';
  return `${p.tipo || 'Propiedad'} ${operacionEnTexto(p.operacion)} · ${donde}${precio ? ` · ${precio}` : ''}`;
}

/**
 * La ficha completa, lista para enviar tal cual.
 * @param {object} p propiedad normalizada por database/planilla.js
 * @returns {string}
 */
function ficha(p) {
  const L = [];
  L.push('🏠 FICHA DE PROPIEDAD');
  L.push('━━━━━━━━━━━━━━━━━━━━');
  L.push(`📌 ${titulo(p)}`);

  const donde = [p.direccion, p.comuna].filter(Boolean).join(', ');
  if (donde) L.push(`📍 ${donde}`);

  const precio = monto(p.precio);
  const etiquetaOperacion = p.operacion ? ` | 🏷️ ${p.operacion}` : '';
  if (precio) L.push(`💰 ${precio}${etiquetaOperacion}`);
  else if (p.operacion) L.push(`🏷️ ${p.operacion}`);

  const gastos = monto(p.gastos);
  if (gastos) L.push(`🧾 Gastos comunes: ${gastos}`);

  if (p.tipo) L.push(`🏗️ Tipo: ${p.tipo}`);

  // Un terreno no tiene dormitorios y un local no tiene por qué tenerlos: los
  // ceros de la planilla son "no aplica", no "cero piezas".
  const caracteristicas = [];
  if (p.dormitorios) caracteristicas.push(`🛏️ ${p.dormitorios} ${p.dormitorios === 1 ? 'dorm' : 'dorms'}`);
  if (p.banos)       caracteristicas.push(`🚿 ${p.banos} ${p.banos === 1 ? 'baño' : 'baños'}`);
  if (p.m2)          caracteristicas.push(`📐 ${miles(p.m2)} m²`);
  if (caracteristicas.length) {
    L.push('');
    L.push('CARACTERÍSTICAS:');
    L.push(caracteristicas.join('  '));
  }

  if (p.extra) L.push(`📋 ${p.extra}`);
  if (p.link)  L.push(`🔗 Ver fotos: ${p.link}`);

  return L.join('\n');
}

/** El texto de los requisitos, tal como los escribió la corredora. */
function requisitos(p) {
  const crudo = String(p.requisitos || '').trim();
  if (!crudo) return null;
  // La planilla ya suele traer la palabra "Requisitos:" adelante; no se repite.
  const cuerpo = crudo.replace(/^requisitos?\s*:?\s*/i, '').trim();
  return `📋 REQUISITOS PARA ARRENDAR\n━━━━━━━━━━━━━━━━━━━━\n${cuerpo}`;
}

const tieneRequisitos = (p) => Boolean(String(p?.requisitos || '').trim());

// ─── Botones ─────────────────────────────────────────────────────────────────
// WhatsApp acepta TRES por mensaje y los títulos se cortan a los 20 caracteres.
// Ese tope es la razón de que el menú de una propiedad con requisitos NO lleve
// "hablar con una ejecutiva": entre requisitos y una ejecutiva, los requisitos
// resuelven la duda que trae la persona y la ejecutiva se ofrece igual al
// terminar cualquiera de los tres caminos. Perder el botón que sí puede
// responder ahora, para ofrecer uno que responde mañana, sería al revés.

const BTN = {
  ficha:      (id) => ({ id: `ficha:${id}`,      titulo: '📄 Ver información' }),
  requisitos: (id) => ({ id: `requisitos:${id}`, titulo: '📋 Requisitos' }),
  agendar:    (id) => ({ id: `agendar:${id}`,    titulo: '📅 Agendar visita' }),
  ejecutiva:  ()   => ({ id: 'ejecutiva',        titulo: '💬 Con una ejecutiva' }),
  arrendar:   ()   => ({ id: 'buscar:arriendo',  titulo: '🔑 Arrendar' }),
  comprar:    ()   => ({ id: 'buscar:venta',     titulo: '🏠 Comprar' }),
  captar:     ()   => ({ id: 'captacion',        titulo: '💰 Vender/arrendar' }),
  si:         ()   => ({ id: 'rm_si',            titulo: '✅ Sí' }),
  no:         ()   => ({ id: 'rm_no',            titulo: '❌ No' }),
};

/** El menú que se ofrece al reconocer la propiedad por la que preguntan. */
function menuPropiedad(p) {
  const con = [BTN.ficha(p.id)];
  if (tieneRequisitos(p)) con.push(BTN.requisitos(p.id));
  con.push(BTN.agendar(p.id));
  // Sin requisitos sobra un espacio de los tres: ahí sí entra la ejecutiva.
  if (!tieneRequisitos(p)) con.push(BTN.ejecutiva());
  return con;
}

/** Lo que se ofrece después de resolver una consulta: seguir, o una persona. */
function menuDespues(p) {
  const con = [];
  if (p) con.push(BTN.agendar(p.id));
  con.push(BTN.ejecutiva());
  return con;
}

const menuBienvenida = () => [BTN.arrendar(), BTN.comprar(), BTN.captar()];
const menuSiNo       = () => [BTN.si(), BTN.no()];

module.exports = {
  ficha, requisitos, tieneRequisitos, titulo, linea, monto, miles, tituloBoton,
  menuPropiedad, menuDespues, menuBienvenida, menuSiNo, BTN,
};
