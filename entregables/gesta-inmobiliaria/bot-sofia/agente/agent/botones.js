// Botones de respuesta rápida. Vive en el NÚCLEO porque es una capacidad del
// CANAL, no de un rubro: "ver información / requisitos / agendar" en una
// corredora es la misma mecánica que "confirmar / cambiar hora / cancelar" en
// una dental.
//
// POR QUÉ NO ES UN PEDAZO DE TEXTO. Un bot que escribe "responde 1, 2 o 3"
// recibe de vuelta "el 2", "la segunda", "requisitos" y "🙂", y cada variante
// es un turno más de modelo para adivinar qué quiso decir. Un botón devuelve un
// id exacto y cuesta cero tokens de interpretación. Ese es todo el negocio de
// este archivo.
//
// EL CONTRATO NO CAMBIA. processMessage sigue devolviendo `string | null` y
// ningún canal tuvo que aprender una forma nueva: la tool PROPONE los botones
// del turno, el envío los CONSUME. Un turno que termina en silencio (`null`)
// no manda nada, botones incluidos — la guarda del silencio sigue siendo la
// primera línea de whatsapp/sender.js y esto no la puede saltar.
//
// LO QUE SE PROPONE DURA UN TURNO Y NADA MÁS. agent/core.js limpia lo pendiente
// al empezar cada turno: sin eso, unos botones que el modelo propuso y no se
// enviaron (porque el turno derivó a un humano, o porque el buffer fusionó el
// mensaje) se pegarían al mensaje siguiente, que es de otra conversación
// lógica. Se limpia en core.js, donde convergen todos los canales, y no en cada
// canal: un guarda por canal es un guarda que alguien olvida.

// Topes de la WhatsApp Cloud API. No son sugerencias: pasarse devuelve 400 y el
// mensaje NO se envía — o sea, el cliente se queda esperando. Por eso acá se
// recorta y se avisa, en vez de lanzar: un botón feo llega, una excepción no.
const MAX_BOTONES      = 3;    // reply buttons por mensaje
const MAX_TITULO       = 20;   // caracteres visibles del botón
const MAX_ID           = 256;
const MAX_CUERPO       = 1024; // body de un mensaje interactivo

// Pendientes por canal. Un Map y no un campo del estado en base a propósito:
// esto vive un turno, no una conversación, y escribirlo en Supabase sería una
// consulta más por turno para un dato que se descarta enseguida.
const pendientes = new Map();

/**
 * Deja listos los botones que acompañarán a la respuesta de ESTE turno.
 * La llama una tool del cliente cuando ya sabe qué opciones ofrecer.
 *
 * Reemplaza lo propuesto antes en el mismo turno: si dos tools proponen, manda
 * la última. Sumarlas daría seis botones y WhatsApp rechazaría el mensaje
 * entero.
 *
 * @param {string} canalId
 * @param {Array<{id?: string, titulo: string, tipo?: 'respuesta'|'url', url?: string}>} lista
 * @returns {Array} la lista ya normalizada (la misma que se enviará)
 */
function proponer(canalId, lista) {
  const normalizada = normalizar(lista);
  if (!normalizada.length) {
    pendientes.delete(canalId);
    return [];
  }
  pendientes.set(canalId, normalizada);
  return normalizada;
}

/** Lo propuesto para este canal, SIN consumirlo. Para inspección y tests. */
function ver(canalId) {
  return pendientes.get(canalId) || [];
}

/** Lo propuesto para este canal, consumiéndolo. Lo llama el envío. */
function tomar(canalId) {
  const lista = pendientes.get(canalId) || [];
  pendientes.delete(canalId);
  return lista;
}

/** Borra lo pendiente de un canal (o de todos). Lo llama core.js al empezar. */
function limpiar(canalId) {
  if (canalId == null) pendientes.clear();
  else pendientes.delete(canalId);
}

/**
 * Recorta a lo que la API acepta y avisa de cada recorte.
 *
 * Nunca lanza: esto corre entre la respuesta ya calculada y el envío, y una
 * excepción acá dejaría al cliente sin respuesta por un título largo.
 */
function normalizar(lista) {
  if (!Array.isArray(lista)) return [];

  const vistos = new Set();
  const salida = [];

  for (const crudo of lista) {
    if (!crudo) continue;
    const titulo = String(crudo.titulo ?? crudo.title ?? '').trim();
    if (!titulo) continue;

    const tipo = crudo.tipo === 'url' ? 'url' : 'respuesta';

    if (tipo === 'url') {
      const url = String(crudo.url || '').trim();
      // Sin URL no hay botón que mandar, y WhatsApp rechaza el mensaje entero
      // por él. Se descarta este y el resto del mensaje sale igual.
      if (!/^https?:\/\//i.test(url)) {
        console.warn(`[Botones] "${titulo}" es de tipo url y no trae una URL válida — se descarta`);
        continue;
      }
      // Un cta_url va SOLO: la API no lo mezcla con reply buttons.
      return [{ tipo: 'url', titulo: recortarTitulo(titulo), url }];
    }

    const id = String(crudo.id || titulo).trim().slice(0, MAX_ID);
    // Dos botones con el mismo id: la API rechaza el mensaje entero, así que
    // el modo de falla es "el cliente no recibe nada". Se descarta el repetido.
    if (vistos.has(id)) {
      console.warn(`[Botones] id repetido "${id}" — se descarta el segundo`);
      continue;
    }
    vistos.add(id);
    salida.push({ tipo: 'respuesta', id, titulo: recortarTitulo(titulo) });
  }

  if (salida.length > MAX_BOTONES) {
    console.warn(
      `[Botones] ${salida.length} botones propuestos y el tope de WhatsApp es ${MAX_BOTONES}: ` +
      `se envían los ${MAX_BOTONES} primeros y se pierden "${salida.slice(MAX_BOTONES).map((b) => b.titulo).join('", "')}". ` +
      'Decidir cuáles tres importan es del diseño de la conversación, no del canal.'
    );
  }
  return salida.slice(0, MAX_BOTONES);
}

function recortarTitulo(titulo) {
  if (titulo.length <= MAX_TITULO) return titulo;
  console.warn(
    `[Botones] "${titulo}" tiene ${titulo.length} caracteres y el tope es ${MAX_TITULO}: se recorta. ` +
    'Un título recortado se lee mal en el teléfono — mejor acortarlo en el código.'
  );
  return titulo.slice(0, MAX_TITULO - 1).trimEnd() + '…';
}

/**
 * Convierte un botón APRETADO en el texto que verá el modelo.
 *
 * El id puede llevar carga útil (`ficha:167972`): sin ella, "Ver información"
 * obliga al modelo a deducir de qué propiedad hablamos, y deducir es
 * exactamente lo que un botón vino a evitar. La carga se anexa como referencia
 * legible, que es lo que el modelo lee y lo que queda en el historial.
 *
 * La persona NO ve esto: en su teléfono queda el título del botón que apretó.
 *
 * @param {{id?: string, titulo?: string}} boton
 * @returns {string}
 */
function textoDeRespuesta(boton = {}) {
  const titulo = String(boton.titulo || '').trim();
  const id     = String(boton.id || '').trim();
  const carga  = id.includes(':') ? id.slice(id.indexOf(':') + 1).trim() : '';
  const base   = titulo || id || '';
  return carga ? `${base} [ref:${carga}]` : base;
}

/**
 * El cuerpo de un mensaje interactivo tiene tope propio (1024), más chico que
 * el de un mensaje de texto (4096). Parte el texto en [previas, cuerpo]: las
 * previas van como texto normal y los botones viajan con el último trozo, que
 * es donde la persona los va a buscar.
 *
 * @returns {{ previas: string[], cuerpo: string }}
 */
function partirParaInteractivo(texto) {
  const limpio = String(texto ?? '');
  if (limpio.length <= MAX_CUERPO) return { previas: [], cuerpo: limpio };

  const previas = [];
  let resto = limpio;
  while (resto.length > MAX_CUERPO) {
    let corte = resto.lastIndexOf('\n', MAX_CUERPO);
    if (corte < MAX_CUERPO * 0.5) corte = MAX_CUERPO;
    previas.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte);
  }
  return { previas: previas.filter(Boolean), cuerpo: resto.trim() };
}

/** Payload de la WhatsApp Cloud API para un mensaje con botones. */
function payloadWhatsApp(telefono, cuerpo, lista) {
  const url = lista.find((b) => b.tipo === 'url');
  const interactive = url
    ? {
        type: 'cta_url',
        body: { text: cuerpo },
        action: { name: 'cta_url', parameters: { display_text: url.titulo, url: url.url } },
      }
    : {
        type: 'button',
        body: { text: cuerpo },
        action: {
          buttons: lista
            .filter((b) => b.tipo === 'respuesta')
            .map((b) => ({ type: 'reply', reply: { id: b.id, title: b.titulo } })),
        },
      };

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: telefono,
    type: 'interactive',
    interactive,
  };
}

/** Teclado en línea de Telegram, para que el canal de hoy no quede atrás. */
function tecladoTelegram(lista) {
  const fila = lista.map((b) =>
    b.tipo === 'url'
      ? { text: b.titulo, url: b.url }
      : { text: b.titulo, callback_data: String(b.id).slice(0, 64) }
  );
  return { inline_keyboard: fila.map((b) => [b]) };
}

module.exports = {
  proponer,
  ver,
  tomar,
  limpiar,
  normalizar,
  textoDeRespuesta,
  partirParaInteractivo,
  payloadWhatsApp,
  tecladoTelegram,
  MAX_BOTONES,
  MAX_TITULO,
  MAX_CUERPO,
};
