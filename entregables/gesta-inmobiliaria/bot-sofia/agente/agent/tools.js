// Las acciones de Sofía. Esto es el producto.
//
// LA REGLA QUE ORDENA TODO EL ARCHIVO, y es la que puso José: Sofía no inventa
// nada. Acá eso no es una frase del prompt, es la arquitectura:
//
//   · Los textos que llevan datos (la ficha, los requisitos) los ARMA EL CÓDIGO
//     y el modelo los reenvía tal cual. Un modelo que redacta una ficha es un
//     modelo que puede redondear un precio.
//   · Lo que la planilla no dice, no existe. Sin dirección no hay línea de
//     dirección; sin moneda clara no hay precio; una propiedad que no está o
//     está en "NO" devuelve `no_encontrada` y no un parecido.
//   · Toda validación de negocio vive DENTRO de la tool: que falte la segunda
//     fecha, que la propiedad no tenga requisitos, que la región no sea la
//     Metropolitana. El prompt pide; la tool decide.
//
// LOS BOTONES SE PROPONEN ACÁ. Cada tool declara con qué botones sigue la
// conversación (`botones.proponer`), el canal los adjunta al enviar y el
// resultado los devuelve también al modelo — para que sepa que ya están puestos
// y no los escriba otra vez como lista numerada.

const { db } = require('../database/supabase');
const metricas = require('./metricas');
const botones  = require('./botones');
const handoff  = require('./handoff');
const formato  = require('./formato');
const ejecutiva = require('../avisos/ejecutiva');

const TOPE_RESULTADOS = 3;

const TOOL_DEFINITIONS = [
  {
    name: 'buscar_propiedad',
    description:
      'Identifica de qué propiedad publicada habla la persona. Úsala SIEMPRE en el primer mensaje de alguien que menciona una dirección, una comuna o un código, y cada vez que aprieta un botón que trae [ref:...]. Nunca supongas cuál es: esta herramienta es la única que sabe qué hay publicado.',
    input_schema: {
      type: 'object',
      properties: {
        texto:     { type: 'string', description: 'El mensaje de la persona, tal cual lo escribió (incluye el [ref:...] si vino de un botón).' },
        comuna:    { type: 'string', description: 'Comuna, si la dijo aparte.' },
        operacion: { type: 'string', description: 'arriendo o venta, si lo dijo.' },
        tipo:      { type: 'string', description: 'departamento, casa, oficina, local o terreno, si lo dijo.' },
      },
      required: ['texto'],
    },
  },
  {
    name: 'ver_ficha',
    description:
      'Devuelve la ficha completa de una propiedad, ya redactada. Envíala TAL CUAL, sin resumirla, sin reordenarla y sin agregarle datos. Es lo que responde el botón "Ver información".',
    input_schema: {
      type: 'object',
      properties: { propiedad_id: { type: 'string', description: 'El id que devolvió buscar_propiedad.' } },
      required: ['propiedad_id'],
    },
  },
  {
    name: 'ver_requisitos',
    description:
      'Devuelve los requisitos de arriendo de una propiedad, tal como los escribió la corredora. Solo algunas propiedades tienen; si esta no tiene, la herramienta lo dice y no hay que inventarlos.',
    input_schema: {
      type: 'object',
      properties: { propiedad_id: { type: 'string' } },
      required: ['propiedad_id'],
    },
  },
  {
    name: 'agendar_visita',
    description:
      'Deja anotada la visita y le avisa a la ejecutiva. Llámala SOLO cuando tengas DOS opciones de día y hora que haya propuesto la persona. Después de esto la conversación queda en manos de la ejecutiva.',
    input_schema: {
      type: 'object',
      properties: {
        propiedad_id: { type: 'string' },
        fecha_1: { type: 'string', description: 'Primera opción de día y hora, tal como la dijo la persona.' },
        fecha_2: { type: 'string', description: 'Segunda opción de día y hora.' },
        nombre:  { type: 'string', description: 'Nombre de la persona, si lo dio.' },
      },
      required: ['propiedad_id', 'fecha_1', 'fecha_2'],
    },
  },
  {
    name: 'registrar_captacion',
    description:
      'Registra a un propietario que quiere vender o arrendar SU propiedad con Gesta, y le avisa a la ejecutiva. Antes de llamarla hay que saber si la propiedad está en la Región Metropolitana: Gesta solo trabaja ahí.',
    input_schema: {
      type: 'object',
      properties: {
        en_region_metropolitana: { type: 'boolean', description: 'true si la propiedad está en la Región Metropolitana.' },
        operacion: { type: 'string', enum: ['vender', 'arrendar'], description: 'Qué quiere hacer con su propiedad.' },
        comuna:    { type: 'string' },
        tipo:      { type: 'string', description: 'departamento, casa, oficina, local o terreno.' },
        detalle:   { type: 'string', description: 'Todo lo que contó de la propiedad, junto y tal como lo dijo: metros, dormitorios, estado, lo que sea.' },
        nombre:    { type: 'string' },
      },
      required: ['en_region_metropolitana'],
    },
  },
  {
    name: 'hablar_con_ejecutiva',
    description:
      'Pasa la conversación a una ejecutiva de Gesta con un informe de lo hablado. Úsala cuando la persona lo pida, cuando aprieten el botón, o cuando te pregunten algo que no puedes responder con lo que hay en la planilla.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'En una línea, por qué pasa a una persona.' },
        propiedad_id: { type: 'string', description: 'La propiedad de la que venían hablando, si había una.' },
        nombre: { type: 'string' },
      },
      required: ['motivo'],
    },
  },
  {
    name: 'preguntar_region',
    description:
      'Pone los botones Sí / No para preguntarle a un propietario si su propiedad está en la Región Metropolitana. Úsala apenas alguien diga que quiere vender o arrendar SU propiedad con Gesta: es la primera pregunta, antes de pedirle ningún dato.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'menu_bienvenida',
    description:
      'Muestra las tres opciones de entrada (arrendar, comprar, o vender/arrendar su propiedad con Gesta). Úsala cuando alguien saluda sin decir qué busca ni mencionar una propiedad.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

async function ejecutarHerramienta(nombre, input, canalId) {
  const args = input || {};
  switch (nombre) {
    case 'buscar_propiedad':    return buscarPropiedad(args, canalId);
    case 'ver_ficha':           return verFicha(args, canalId);
    case 'ver_requisitos':      return verRequisitos(args, canalId);
    case 'agendar_visita':      return agendarVisita(args, canalId);
    case 'registrar_captacion': return registrarCaptacion(args, canalId);
    case 'hablar_con_ejecutiva':return hablarConEjecutiva(args, canalId);
    case 'preguntar_region':    return preguntarRegion(args, canalId);
    case 'menu_bienvenida':     return menuBienvenida(args, canalId);
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

// ─── Encontrar la propiedad ──────────────────────────────────────────────────

async function buscarPropiedad({ texto, comuna, operacion, tipo }, canalId) {
  const consulta = [texto, comuna, operacion, tipo].filter(Boolean).join(' ');
  const { exacta, candidatas } = await db.propiedades.buscarEnTexto(consulta, TOPE_RESULTADOS);

  if (exacta) {
    const menu = botones.proponer(canalId, formato.menuPropiedad(exacta));
    return {
      encontrada: true,
      propiedad: resumen(exacta),
      tiene_requisitos: formato.tieneRequisitos(exacta),
      botones_puestos: menu.map((b) => b.titulo),
      instruccion: 'Saluda, confirma en una línea de qué propiedad se trata y ofrécele estas opciones. Los botones YA están puestos: no los escribas como lista.',
    };
  }

  if (candidatas.length) {
    const menu = botones.proponer(
      canalId,
      candidatas.map((p) => ({ id: `prop:${p.id}`, titulo: formato.tituloBoton(p) })),
    );
    return {
      encontrada: false,
      varias: true,
      candidatas: candidatas.map(resumen),
      botones_puestos: menu.map((b) => b.titulo),
      instruccion: 'Hay más de una que calza. Pregunta cuál es, sin dar precios todavía. Los botones YA están puestos.',
    };
  }

  // No está publicada, o está en "NO" en la planilla. Decirlo es el trabajo.
  metricas.marcarHito(canalId, 'sin_dato');
  const menu = botones.proponer(canalId, [formato.BTN.ejecutiva()]);
  return {
    encontrada: false,
    varias: false,
    mensaje: 'No hay ninguna propiedad publicada que calce con eso.',
    botones_puestos: menu.map((b) => b.titulo),
    instruccion: 'Dile que esa no la tienes publicada, sin inventar ninguna parecida, y ofrécele hablar con una ejecutiva.',
  };
}

// La forma en que una propiedad viaja al modelo: lo justo para que hable de
// ella sin tener que redactar la ficha. Los montos van FORMATEADOS para que, si
// el modelo menciona el precio de pasada, diga exactamente el mismo número.
function resumen(p) {
  return {
    id: p.id,
    tipo: p.tipo,
    operacion: p.operacion,
    direccion: p.direccion || null,
    comuna: p.comuna || null,
    precio: formato.monto(p.precio),
    titulo: formato.titulo(p),
  };
}

// ─── Ficha y requisitos ──────────────────────────────────────────────────────

async function verFicha({ propiedad_id }, canalId) {
  const p = await db.propiedades.porId(propiedad_id);
  if (!p) return noEncontrada(canalId);

  metricas.marcarHito(canalId, 'ficha_entregada');
  const siguientes = [];
  if (formato.tieneRequisitos(p)) siguientes.push(formato.BTN.requisitos(p.id));
  siguientes.push(formato.BTN.agendar(p.id), formato.BTN.ejecutiva());
  const menu = botones.proponer(canalId, siguientes);

  return {
    ficha: formato.ficha(p),
    botones_puestos: menu.map((b) => b.titulo),
    instruccion: 'Envía el texto de "ficha" EXACTAMENTE como viene, sin cambiar ni un número, y cierra preguntando si quiere que una ejecutiva coordine una visita.',
  };
}

async function verRequisitos({ propiedad_id }, canalId) {
  const p = await db.propiedades.porId(propiedad_id);
  if (!p) return noEncontrada(canalId);

  const texto = formato.requisitos(p);
  if (!texto) {
    // No tener requisitos cargados no es lo mismo que no tener requisitos: lo
    // primero lo sabe la planilla, lo segundo lo sabe la corredora.
    metricas.marcarHito(canalId, 'sin_dato');
    const menu = botones.proponer(canalId, formato.menuDespues(p));
    return {
      tiene_requisitos: false,
      mensaje: 'Esta propiedad no tiene requisitos cargados en la planilla.',
      botones_puestos: menu.map((b) => b.titulo),
      instruccion: 'Dile que esa propiedad no tiene requisitos publicados y que una ejecutiva se los puede confirmar. NO inventes requisitos típicos de arriendo.',
    };
  }

  metricas.marcarHito(canalId, 'requisitos_entregados');
  const menu = botones.proponer(canalId, formato.menuDespues(p));
  return {
    tiene_requisitos: true,
    requisitos: texto,
    botones_puestos: menu.map((b) => b.titulo),
    instruccion: 'Envía el texto de "requisitos" tal cual y ofrécele agendar o hablar con una ejecutiva.',
  };
}

function noEncontrada(canalId) {
  metricas.marcarHito(canalId, 'sin_dato');
  botones.proponer(canalId, [formato.BTN.ejecutiva()]);
  return {
    error: 'Esa propiedad ya no está publicada.',
    instruccion: 'Dile que esa propiedad ya no aparece publicada y ofrécele hablar con una ejecutiva. No la describas de memoria.',
  };
}

// ─── Agendar ─────────────────────────────────────────────────────────────────

async function agendarVisita({ propiedad_id, fecha_1, fecha_2, nombre }, canalId) {
  const p = await db.propiedades.porId(propiedad_id);
  if (!p) return noEncontrada(canalId);

  // La validación vive acá y no en el prompt: un modelo apurado agenda con una
  // sola opción, y la corredora termina llamando para pedir la segunda.
  const opciones = [fecha_1, fecha_2].map((f) => String(f || '').trim()).filter(Boolean);
  if (opciones.length < 2) {
    return {
      falta: 'segunda_opcion',
      instruccion: 'Todavía no agendes. Pídele DOS opciones de día y hora para que la ejecutiva elija la que le sirva.',
    };
  }

  await db.visitas.registrar({
    canal_id: canalId,
    propiedad_id: p.id,
    propiedad_texto: formato.titulo(p),
    nombre: nombre || null,
    preferencia_1: opciones[0],
    preferencia_2: opciones[1],
    notas: null,
  });

  metricas.marcarHito(canalId, 'visita_agendada');

  // El informe se arma con esto y sale por el enganche del handoff, una sola
  // vez, junto con el botón para escribirle.
  ejecutiva.anotar(canalId, {
    motivo: 'visita_agendada',
    propiedad: p,
    preferencias: opciones,
    nombre: nombre || null,
  });
  await handoff.activar(canalId, 'visita_agendada');

  return {
    agendado: true,
    propiedad: formato.titulo(p),
    preferencias: opciones,
    instruccion:
      'Confirma que quedó anotado con las dos opciones, dile que una ejecutiva de Gesta lo contacta para cerrar el día, y despídete. Es tu último mensaje en esta conversación.',
  };
}

// ─── Captación: propietarios que quieren vender o arrendar con Gesta ─────────

async function registrarCaptacion(
  { en_region_metropolitana, operacion, comuna, tipo, detalle, nombre }, canalId,
) {
  if (en_region_metropolitana === false) {
    // Fuera de la Región Metropolitana Gesta no trabaja. Se dice de buena
    // manera y no se deriva: derivar sería hacerle perder el tiempo a las dos
    // partes. Queda medido, que es como se sabe cuánta demanda hay afuera.
    metricas.marcarHito(canalId, 'fuera_de_rm');
    await db.captaciones.registrar({
      canal_id: canalId,
      operacion: operacion || null,
      region_metropolitana: false,
      comuna: comuna || null,
      tipo: tipo || null,
      detalle: detalle || null,
      nombre: nombre || null,
    });
    return {
      fuera_de_cobertura: true,
      instruccion:
        'Agradécele el interés y dile con cariño que Gesta por ahora trabaja solo con propiedades de la Región Metropolitana, así que no podrían tomarla. No le ofrezcas una ejecutiva ni le prometas que alguien lo va a llamar.',
    };
  }

  // Sin datos de la propiedad no hay nada que pasarle a la ejecutiva todavía.
  if (!String(detalle || '').trim() && !comuna && !tipo) {
    return {
      falta: 'datos_de_la_propiedad',
      instruccion:
        'Todavía no registres. Pídele los datos de su propiedad con ejemplos concretos: en qué comuna queda, qué tipo de propiedad es, cuántos metros cuadrados, cuántos dormitorios y baños, y cualquier detalle que sirva.',
    };
  }

  await db.captaciones.registrar({
    canal_id: canalId,
    operacion: operacion || null,
    region_metropolitana: true,
    comuna: comuna || null,
    tipo: tipo || null,
    detalle: detalle || null,
    nombre: nombre || null,
  });

  metricas.marcarHito(canalId, 'captacion_registrada');
  ejecutiva.anotar(canalId, {
    motivo: 'captacion',
    nombre: nombre || null,
    captacion: { operacion, comuna, tipo, detalle },
  });
  await handoff.activar(canalId, 'captacion');

  return {
    registrado: true,
    instruccion:
      'Dile que tomaste todos los datos y que una ejecutiva de Gesta lo contacta para ver su propiedad. Despídete: es tu último mensaje en esta conversación.',
  };
}

// ─── Derivar ─────────────────────────────────────────────────────────────────

async function hablarConEjecutiva({ motivo, propiedad_id, nombre }, canalId) {
  const p = propiedad_id ? await db.propiedades.porId(propiedad_id) : null;

  metricas.marcarHito(canalId, 'derivada_ejecutiva');
  ejecutiva.anotar(canalId, {
    motivo: 'pidio_ejecutiva',
    propiedad: p || undefined,
    nombre: nombre || null,
    nota: motivo || null,
  });
  await handoff.activar(canalId, 'pidio_ejecutiva');

  return {
    derivado: true,
    instruccion:
      'Dile que una ejecutiva de Gesta le escribe a este mismo número, y despídete. Es tu último mensaje en esta conversación.',
  };
}

// ─── Captación: la primera pregunta ──────────────────────────────────────────

// Existe para PONER LOS BOTONES, y eso basta para justificarla. Sin ella el
// modelo hace la misma pregunta en texto y funciona igual de bien… hasta que la
// persona contesta "en la rm", "sipo", "creo que sí" o "queda en maipu", y hay
// que gastar un turno en desambiguar lo que dos botones resuelven en cero. Es la
// pregunta que decide si Gesta puede tomar la propiedad: conviene que la
// respuesta sea un dato y no una interpretación.
async function preguntarRegion(_args, canalId) {
  const menu = botones.proponer(canalId, formato.menuSiNo());
  return {
    botones_puestos: menu.map((b) => b.titulo),
    instruccion:
      'Responde con cariño que sí pueden ayudarlo y pregúntale si su propiedad está en la Región Metropolitana. Los botones Sí y No YA están puestos: no los escribas.',
  };
}

// ─── Entrada sin propiedad ───────────────────────────────────────────────────

async function menuBienvenida(_args, canalId) {
  const menu = botones.proponer(canalId, formato.menuBienvenida());
  return {
    botones_puestos: menu.map((b) => b.titulo),
    instruccion:
      'Preséntate como Sofía de Gesta en una línea y pregúntale qué le interesa. Los botones YA están puestos: no los escribas como lista numerada.',
  };
}

// El aviso a la ejecutiva cuelga del handoff del núcleo. Se engancha acá y no
// en index.js porque agent/core.js carga SIEMPRE este archivo: con el enganche
// en el servidor, el canal terminal y la suite de evals derivarían sin avisarle
// a nadie — y el camino que más deriva (pedir una persona) corta antes del
// modelo, así que ninguna tool se enteraría.
ejecutiva.engancharHandoff();

module.exports = { TOOL_DEFINITIONS, ejecutarHerramienta, TOPE_RESULTADOS };
