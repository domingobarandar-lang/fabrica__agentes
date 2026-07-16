// Herramientas del agente inmobiliario: definiciones (para el LLM) + ejecución.
// Alcance LIMITADO por diseño: buscar propiedades, ver fichas, agendar/cancelar
// visitas, registrar leads y responder la FAQ de la corredora. Todo dato de
// negocio (precios, requisitos, disponibilidad) sale de aquí — nunca del LLM.

const { db } = require('../database/supabase');

// Visitas de 30 minutos (6 slots por día de visita: 11:00 a 13:30)
const SLOT_MINUTOS = Number(process.env.SLOT_MINUTOS) || 30;

// UF referencial FIJA para conversiones aproximadas en la demo (supuesto 6 del
// SPEC: constante configurable, sin API de indicadores).
const UF_CLP = Number(process.env.UF_CLP) || 39500;

const TOOL_DEFINITIONS = [
  {
    name: 'buscar_propiedades',
    description: 'Busca propiedades DISPONIBLES del catálogo de la corredora. Úsala siempre que el cliente busque algo ("depto en arriendo en Ñuñoa"); nunca inventes propiedades. Si no hay match exacto, retorna alternativas cercanas en "cercanas".',
    input_schema: {
      type: 'object',
      properties: {
        operacion:      { type: 'string', enum: ['venta', 'arriendo'], description: 'Tipo de operación que busca el cliente' },
        comuna:         { type: 'string', description: 'Comuna deseada (ej: "Ñuñoa"). Opcional.' },
        presupuesto_max: { type: 'number', description: 'Presupuesto máximo: CLP para arriendo, UF para venta. Opcional.' },
        dormitorios:    { type: 'integer', description: 'Mínimo de dormitorios. Opcional.' },
      },
      required: ['operacion'],
    },
  },
  {
    name: 'detalle_propiedad',
    description: 'Ficha completa de una propiedad por su id (P1, P2...): precio, gastos comunes, dormitorios/baños, m², dirección referencial, estado y descripción. Úsala antes de dar cualquier dato de una propiedad. Si el estado no es "disponible" hay que decírselo al cliente.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID de la propiedad (ej: "P2")' },
      },
      required: ['id'],
    },
  },
  {
    name: 'consultar_disponibilidad',
    description: 'Slots libres para visitas en una fecha. Las visitas son SOLO lunes, miércoles y jueves de 11:00 a 14:00 (bloques de 30 min); si la fecha no es día de visita, retorna el próximo día válido con sus slots. Úsala SIEMPRE antes de agendar.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
      },
      required: ['fecha'],
    },
  },
  {
    name: 'agendar_visita',
    description: 'Agenda una visita a una propiedad. Llamar solo cuando tengas nombre, teléfono, propiedad, fecha y hora confirmados por el cliente. Si el día/hora es inválido u ocupado, retorna el slot válido más cercano en "slot_sugerido". Al agendar, el lead pasa a caliente automáticamente.',
    input_schema: {
      type: 'object',
      properties: {
        propiedad_id: { type: 'string', description: 'ID de la propiedad a visitar (ej: "P2")' },
        nombre:       { type: 'string', description: 'Nombre del cliente' },
        telefono:     { type: 'string', description: 'Teléfono del cliente (ej: "+56 9 1234 5678")' },
        fecha:        { type: 'string', description: 'Fecha en formato YYYY-MM-DD (solo lunes, miércoles o jueves)' },
        hora:         { type: 'string', description: 'Hora en formato HH:MM, entre 11:00 y 13:30 en bloques de 30 min' },
      },
      required: ['propiedad_id', 'nombre', 'telefono', 'fecha', 'hora'],
    },
  },
  {
    name: 'mis_visitas',
    description: 'Lista las visitas vigentes de un cliente por su teléfono (propiedad, fecha y hora). Úsala cuando pregunte por sus visitas agendadas y ANTES de cancelar o cambiar una.',
    input_schema: {
      type: 'object',
      properties: {
        telefono: { type: 'string', description: 'Teléfono del cliente' },
      },
      required: ['telefono'],
    },
  },
  {
    name: 'cancelar_visita',
    description: 'Cancela una visita vigente del cliente. Sin visita_id cancela su única visita; si tiene varias, la herramienta pide seleccionar y debes volver a llamarla con el visita_id correcto (lo entrega mis_visitas). Para cambiar una visita: verificar disponibilidad, cancelar y agendar de nuevo.',
    input_schema: {
      type: 'object',
      properties: {
        telefono:  { type: 'string', description: 'Teléfono del cliente' },
        visita_id: { type: 'integer', description: 'ID de la visita a cancelar cuando el cliente tiene más de una (viene de mis_visitas)' },
      },
      required: ['telefono'],
    },
  },
  {
    name: 'registrar_lead',
    description: 'Registra o actualiza el lead del cliente (upsert por teléfono) y calcula su score frío/tibio/caliente con reglas fijas. Úsala en cuanto tengas nombre y teléfono, y cada vez que el cliente entregue un dato nuevo (operación, comuna, presupuesto, urgencia) o quede algo pendiente para el corredor (campo nota). TODA conversación con teléfono capturado debe terminar registrada.',
    input_schema: {
      type: 'object',
      properties: {
        nombre:            { type: 'string', description: 'Nombre del cliente' },
        telefono:          { type: 'string', description: 'Teléfono del cliente' },
        operacion:         { type: 'string', enum: ['venta', 'arriendo'], description: 'Operación que busca. Opcional.' },
        comuna:            { type: 'string', description: 'Comuna de interés. Opcional.' },
        presupuesto:       { type: 'number', description: 'Presupuesto: CLP para arriendo, UF para venta. Opcional.' },
        urgencia:          { type: 'string', enum: ['inmediata', 'media', 'baja'], description: 'inmediata: se cambia en ≤1 mes; media: 1-3 meses; baja: >3 meses o "solo mirando". Omitir si no la declaró.' },
        propiedad_interes: { type: 'string', description: 'ID de la propiedad que le interesa (ej: "P2"). Opcional.' },
        nota:              { type: 'string', description: 'Pendiente para el corredor (ej: "confirmar si aceptan mascotas en P3"). Opcional.' },
      },
      required: ['nombre', 'telefono'],
    },
  },
  {
    name: 'info_corredora',
    description: 'FAQ oficial de la corredora. Temas: requisitos_arriendo, comisiones, horarios, proceso_visita. Sin tema entrega el resumen general. Úsala SIEMPRE para requisitos, comisiones u horarios — nunca los respondas de memoria.',
    input_schema: {
      type: 'object',
      properties: {
        tema: { type: 'string', enum: ['requisitos_arriendo', 'comisiones', 'horarios', 'proceso_visita'] },
      },
    },
  },
];

/**
 * Ejecuta una herramienta y retorna un objeto serializable para el tool_result.
 * @param {string} nombre
 * @param {Object} input
 * @param {string} _sesion - Identidad de la sesión (chat/teléfono del canal).
 *   NO se usa como teléfono del cliente: en la demo por terminal la sesión es
 *   un id ficticio, por eso las tools reciben el teléfono capturado en la
 *   conversación como parámetro explícito (firma del SPEC).
 */
async function ejecutarHerramienta(nombre, input, _sesion) {
  switch (nombre) {
    case 'buscar_propiedades':       return buscarPropiedades(input);
    case 'detalle_propiedad':        return detallePropiedad(input);
    case 'consultar_disponibilidad': return consultarDisponibilidad(input);
    case 'agendar_visita':           return agendarVisita(input);
    case 'mis_visitas':              return misVisitas(input);
    case 'cancelar_visita':          return cancelarVisita(input);
    case 'registrar_lead':           return registrarLead(input);
    case 'info_corredora':           return infoCorredora(input);
    default: return { error: `Herramienta desconocida: ${nombre}` };
  }
}

// ─── Helpers de formato y normalización ──────────────────────────────────────

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

const horaChile = () => new Date().toLocaleTimeString('en-GB', {
  timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit',
});

function addDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const diaSemanaDe = (fecha) => new Date(`${fecha}T12:00:00`).getDay();

/** '9:00' | '09:00:00' → '09:00' */
function normalizarHora(hora) {
  const [h = '0', m = '00'] = String(hora || '').split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

// Minúsculas y sin tildes ("Ñuñoa" → "nunoa"), para comparar con tolerancia
const normalizarTexto = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// Teléfono a solo dígitos: es la CLAVE del lead y de las visitas, así que
// "+56 9 8765 4321" y "56987654321" deben ser el mismo cliente.
function normalizarTelefono(telefono) {
  const digitos = String(telefono || '').replace(/\D/g, '');
  return digitos.length >= 8 ? digitos : null;
}

function normalizarOperacion(valor) {
  const v = normalizarTexto(valor);
  if (/venta|vender|comprar|compra/.test(v)) return 'venta';
  if (/arriendo|arrendar|alquil|rentar/.test(v)) return 'arriendo';
  return null;
}

// Urgencia normalizada (regla 4 del SPEC). El LLM debería mandar el enum, pero
// se aceptan frases típicas por robustez; lo irreconocible queda null.
function normalizarUrgencia(valor) {
  if (valor == null) return null;
  const v = normalizarTexto(valor);
  if (['inmediata', 'media', 'baja'].includes(v)) return v;
  if (/(este mes|ya\b|ahora|urgente|inmediat|un mes|1 mes)/.test(v)) return 'inmediata';
  if (/(dos meses|2 meses|tres meses|3 meses|par de meses)/.test(v)) return 'media';
  if (/(mirando|sin apuro|mas adelante|todavia no|fin de ano|proximo ano)/.test(v)) return 'baja';
  return null;
}

const fmtMiles = (n) => Number(n).toLocaleString('es-CL');
const precioTexto = (p) => (p.moneda === 'UF' ? `UF ${fmtMiles(p.precio)}` : `$${fmtMiles(p.precio)}`);
const gastosComunesTexto = (p) => (p.gastos_comunes != null ? `$${fmtMiles(p.gastos_comunes)}` : 'sin gastos comunes');

const resumenPropiedad = (p) => ({
  id: p.id,
  operacion: p.operacion,
  tipo: p.tipo,
  comuna: p.comuna,
  precio: precioTexto(p),
  gastos_comunes: gastosComunesTexto(p),
  dormitorios: p.dormitorios,
  banos: p.banos,
  m2: p.m2,
});

// ─── buscar_propiedades ──────────────────────────────────────────────────────

// Vecindades de comunas de Santiago para la regla de "lo más cercano" (regla 5
// del SPEC). Solo las relevantes para el catálogo demo; claves normalizadas.
const COMUNAS_VECINAS = {
  'santiago centro':  ['providencia', 'nunoa', 'san miguel', 'estacion central', 'recoleta', 'independencia'],
  'nunoa':            ['providencia', 'santiago centro', 'macul', 'la reina', 'penalolen', 'san joaquin'],
  'providencia':      ['santiago centro', 'nunoa', 'las condes', 'recoleta', 'la reina', 'vitacura'],
  'las condes':       ['vitacura', 'providencia', 'la reina', 'lo barnechea'],
  'vitacura':         ['las condes', 'lo barnechea', 'providencia'],
  'maipu':            ['cerrillos', 'pudahuel', 'estacion central', 'padre hurtado'],
  'san miguel':       ['santiago centro', 'san joaquin', 'la cisterna', 'pedro aguirre cerda'],
  'la florida':       ['puente alto', 'macul', 'penalolen', 'la granja'],
  'macul':            ['nunoa', 'penalolen', 'la florida', 'san joaquin'],
  'la reina':         ['nunoa', 'las condes', 'penalolen', 'providencia'],
  'estacion central': ['santiago centro', 'maipu', 'cerrillos', 'pudahuel'],
};

function sonVecinas(comunaA, comunaB) {
  const a = normalizarTexto(comunaA);
  const b = normalizarTexto(comunaB);
  return (COMUNAS_VECINAS[a] || []).includes(b) || (COMUNAS_VECINAS[b] || []).includes(a);
}

async function buscarPropiedades({ operacion, comuna, presupuesto_max, dormitorios } = {}) {
  const op = normalizarOperacion(operacion);
  if (!op) return { error: 'operacion debe ser "venta" o "arriendo": pregúntale al cliente qué busca.' };

  const todas = await db.propiedades.listar();
  // Las no disponibles JAMÁS aparecen en resultados de búsqueda (regla del SPEC)
  const disponibles = todas.filter((p) => p.estado === 'disponible' && p.operacion === op);

  // Presupuesto: arriendo se compara en CLP y venta en UF. Si para venta llega
  // un monto grande (> 100.000) asumimos que el cliente lo dio en pesos y se
  // convierte con la UF referencial (ninguna propiedad supera las 100.000 UF).
  let presupuesto = presupuesto_max != null ? Number(presupuesto_max) : null;
  let notaConversion = null;
  if (presupuesto != null && op === 'venta' && presupuesto > 100000) {
    presupuesto = Math.round(presupuesto / UF_CLP);
    notaConversion = `Presupuesto interpretado como CLP y convertido a ~UF ${fmtMiles(presupuesto)} (UF referencial $${fmtMiles(UF_CLP)}, aproximado).`;
  }

  const minDorm = dormitorios != null ? Number(dormitorios) : null;
  const calza = (p) =>
    (!comuna || normalizarTexto(p.comuna) === normalizarTexto(comuna)) &&
    (presupuesto == null || p.precio <= presupuesto) &&
    (minDorm == null || p.dormitorios >= minDorm);

  const exactas = disponibles.filter(calza);
  if (exactas.length) {
    const out = { resultados: exactas.length, propiedades: exactas.map(resumenPropiedad) };
    if (notaConversion) out.nota = notaConversion;
    return out;
  }

  // Sin match exacto: ofrecer lo MÁS CERCANO igual (misma operación, comuna
  // vecina o hasta +15% de presupuesto) y que el LLM registre el lead.
  const puntaje = (p) => {
    let pts = 0;
    if (comuna) {
      if (normalizarTexto(p.comuna) === normalizarTexto(comuna)) pts += 3;
      else if (sonVecinas(p.comuna, comuna)) pts += 2;
    }
    if (presupuesto != null) {
      if (p.precio <= presupuesto) pts += 2;
      else if (p.precio <= presupuesto * 1.15) pts += 1;
    }
    if (minDorm != null && p.dormitorios >= minDorm) pts += 1;
    return pts;
  };
  const cercanas = [...disponibles]
    .sort((a, b) => (puntaje(b) - puntaje(a)) ||
      (presupuesto != null
        ? Math.abs(a.precio - presupuesto) - Math.abs(b.precio - presupuesto)
        : a.precio - b.precio))
    .slice(0, 3);

  return {
    resultados: 0,
    mensaje: 'No hay propiedades disponibles que calcen exactamente con esa búsqueda.',
    cercanas: cercanas.map(resumenPropiedad),
    instruccion: 'Dile honestamente que no hay match exacto, ofrece estas alternativas cercanas y registra la búsqueda del cliente con registrar_lead (el lead queda aunque no le guste nada).',
    ...(notaConversion ? { nota: notaConversion } : {}),
  };
}

// ─── detalle_propiedad ───────────────────────────────────────────────────────

async function detallePropiedad({ id } = {}) {
  const p = await db.propiedades.get(id);
  if (!p) {
    return {
      existe: false,
      error: `La propiedad "${id}" no existe en el catálogo.`,
      instruccion: 'No inventes una ficha: dile al cliente que no la encuentras y ofrécele buscar con buscar_propiedades.',
    };
  }
  const ficha = {
    existe: true,
    id: p.id,
    operacion: p.operacion,
    tipo: p.tipo,
    comuna: p.comuna,
    direccion_referencial: p.direccion_referencial,
    precio: precioTexto(p),
    gastos_comunes: gastosComunesTexto(p),
    dormitorios: p.dormitorios,
    banos: p.banos,
    m2: p.m2,
    estado: p.estado,
    disponible: p.estado === 'disponible',
    descripcion: p.descripcion,
  };
  // Conversión UF→CLP solo referencial: el LLM la entrega ÚNICAMENTE si el
  // cliente la pide, siempre marcada como aproximada.
  if (p.moneda === 'UF') {
    ficha.conversion_aproximada = {
      uf_referencial_clp: UF_CLP,
      precio_clp_aprox: p.precio * UF_CLP,
      nota: 'Conversión APROXIMADA con UF referencial fija — entregarla solo si la piden y siempre como "aproximado".',
    };
  }
  if (p.estado !== 'disponible') {
    ficha.aviso = `Esta propiedad ya NO está disponible (${p.estado}). Infórmalo explícito, ofrece alternativas similares con buscar_propiedades y registra el interés del cliente con registrar_lead.`;
  }
  ficha.nota_ficha = 'Si preguntan por un dato que NO está en esta ficha (mascotas, orientación, estacionamiento...), no lo inventes: responde que lo confirmarás con el corredor y déjalo anotado con registrar_lead (campo nota).';
  return ficha;
}

// ─── Disponibilidad y agenda de visitas ──────────────────────────────────────
// Ventana DURA del negocio: lunes, miércoles y jueves 11:00–14:00, slots de 30
// minutos. El slot es global por fecha/hora (un solo corredor hace las visitas).

const VENTANA_TEXTO = 'Las visitas son solo lunes, miércoles y jueves, de 11:00 a 14:00 (bloques de 30 minutos).';

// Todos los slots de la ventana del día (sin descontar ocupados); null si el
// día no es de visitas.
async function slotsDeVentana(fecha) {
  const horario = await db.horariosVisita.get(diaSemanaDe(fecha));
  if (!horario) return null;
  const slots = [];
  let [h, m] = horario.abre.split(':').map(Number);
  const [hc, mc] = horario.cierra.split(':').map(Number);
  while (h * 60 + m + SLOT_MINUTOS <= hc * 60 + mc) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    m += SLOT_MINUTOS;
    h += Math.floor(m / 60);
    m %= 60;
  }
  return slots;
}

async function slotsLibres(fecha) {
  const slots = await slotsDeVentana(fecha);
  if (!slots) return null;
  const ocupadas = new Set((await db.visitas.listarPorFecha(fecha)).map((v) => normalizarHora(v.hora)));
  // Si consultan por HOY, las horas que ya pasaron no se ofrecen
  const horaMinima = fecha === hoyChile() ? horaChile() : null;
  return slots.filter((s) => !ocupadas.has(s) && (!horaMinima || s > horaMinima));
}

// Próximo día de visita con slots libres, partiendo desde `desde` INCLUSIVE.
async function proximoDiaValido(desde) {
  let f = desde;
  for (let i = 0; i < 21; i++) {
    const libres = await slotsLibres(f);
    if (libres && libres.length) {
      return { fecha: f, dia: DIAS_SEMANA[diaSemanaDe(f)], slots_disponibles: libres };
    }
    f = addDias(f, 1);
  }
  return null; // 3 semanas sin cupo: que el LLM derive al corredor
}

const minutosDe = (hora) => {
  const [h, m] = normalizarHora(hora).split(':').map(Number);
  return h * 60 + m;
};

// Slot libre más cercano en minutos a la hora pedida (para reencauzar en errores)
function slotMasCercano(hora, libres) {
  if (!libres?.length) return null;
  const objetivo = minutosDe(hora);
  return [...libres].sort((a, b) => Math.abs(minutosDe(a) - objetivo) - Math.abs(minutosDe(b) - objetivo))[0];
}

async function consultarDisponibilidad({ fecha } = {}) {
  if (!RE_FECHA.test(fecha || '')) {
    return { error: 'Fecha inválida: usar formato YYYY-MM-DD' };
  }
  const hoy = hoyChile();
  if (fecha < hoy) {
    return {
      fecha,
      error: `La fecha ${fecha} ya pasó (hoy es ${hoy}): solo se agendan visitas de hoy en adelante.`,
      proximo_dia_valido: await proximoDiaValido(hoy),
    };
  }
  const dia = DIAS_SEMANA[diaSemanaDe(fecha)];
  const libres = await slotsLibres(fecha);
  if (libres === null) {
    // El "próximo día válido" se busca DESPUÉS de la fecha pedida (CU-7: ante
    // un martes se ofrece el miércoles siguiente, no un lunes anterior).
    const desde = addDias(fecha, 1) > hoy ? addDias(fecha, 1) : hoy;
    return {
      fecha,
      dia,
      es_dia_de_visita: false,
      slots_disponibles: [],
      mensaje: VENTANA_TEXTO,
      proximo_dia_valido: await proximoDiaValido(desde),
    };
  }
  const out = { fecha, dia, es_dia_de_visita: true, ventana: '11:00 a 14:00', slots_disponibles: libres };
  if (!libres.length) {
    out.mensaje = 'Ese día no quedan slots libres.';
    out.proximo_dia_valido = await proximoDiaValido(addDias(fecha, 1));
  }
  return out;
}

async function agendarVisita({ propiedad_id, nombre, telefono, fecha, hora } = {}) {
  const faltantes = [
    !propiedad_id && 'propiedad_id', !nombre && 'nombre', !telefono && 'telefono',
    !fecha && 'fecha', !hora && 'hora',
  ].filter(Boolean);
  if (faltantes.length) {
    return { agendada: false, motivo: `Faltan datos para agendar: ${faltantes.join(', ')}. Pídelos al cliente primero.` };
  }
  const telNorm = normalizarTelefono(telefono);
  if (!telNorm) {
    return { agendada: false, motivo: 'El teléfono no parece válido: pídele al cliente su número (ej: +56 9 1234 5678).' };
  }

  // La propiedad debe existir y estar disponible (no se visitan fantasmas)
  const p = await db.propiedades.get(propiedad_id);
  if (!p) {
    return { agendada: false, motivo: `La propiedad "${propiedad_id}" no existe en el catálogo.`, instruccion: 'Ofrece buscar alternativas con buscar_propiedades.' };
  }
  if (p.estado !== 'disponible') {
    return {
      agendada: false,
      motivo: `La propiedad ${p.id} ya no está disponible (${p.estado}).`,
      instruccion: 'Informa al cliente, ofrece alternativas con buscar_propiedades y registra su interés con registrar_lead.',
    };
  }

  if (!RE_FECHA.test(fecha)) return { agendada: false, motivo: 'Fecha inválida: usar formato YYYY-MM-DD' };
  const hoy = hoyChile();
  if (fecha < hoy) {
    const proximo = await proximoDiaValido(hoy);
    return {
      agendada: false,
      motivo: `La fecha ${fecha} ya pasó (hoy es ${hoy}): no se agenda en el pasado.`,
      slot_sugerido: proximo && { fecha: proximo.fecha, dia: proximo.dia, hora: proximo.slots_disponibles[0] },
    };
  }

  const ventana = await slotsDeVentana(fecha);
  if (!ventana) {
    // Día inválido (ej: martes o fin de semana) → reencauzar al día de visita
    // que sigue a la fecha pedida (CU-7: martes → miércoles 11:00)
    const proximo = await proximoDiaValido(addDias(fecha, 1) > hoy ? addDias(fecha, 1) : hoy);
    return {
      agendada: false,
      motivo: `El ${DIAS_SEMANA[diaSemanaDe(fecha)]} no hay visitas. ${VENTANA_TEXTO}`,
      slot_sugerido: proximo && { fecha: proximo.fecha, dia: proximo.dia, hora: proximo.slots_disponibles[0] },
    };
  }

  const horaNorm = normalizarHora(hora);
  const libres = await slotsLibres(fecha);
  if (!ventana.includes(horaNorm)) {
    // Hora fuera de 11:00–14:00 o fuera de la grilla de 30 min
    const sugeridoDia = slotMasCercano(horaNorm, libres);
    const proximo = sugeridoDia ? null : await proximoDiaValido(addDias(fecha, 1));
    return {
      agendada: false,
      motivo: `Las ${horaNorm} está fuera de la ventana de visitas. ${VENTANA_TEXTO}`,
      slot_sugerido: sugeridoDia
        ? { fecha, dia: DIAS_SEMANA[diaSemanaDe(fecha)], hora: sugeridoDia }
        : proximo && { fecha: proximo.fecha, dia: proximo.dia, hora: proximo.slots_disponibles[0] },
    };
  }

  // Idempotencia (ADV-2): un "confirmo" repetido NO duplica la visita. Debe
  // ir ANTES del chequeo de "slot ocupado": si el propio cliente ya tiene
  // esa visita, el slot aparecerá ocupado por ÉL MISMO y esa rama nunca se
  // alcanzaría.
  const previas = await db.visitas.proximasPorTelefono(telNorm, hoy);
  const duplicada = previas.find((v) =>
    v.propiedad_id === p.id && v.fecha === fecha && normalizarHora(v.hora) === horaNorm);
  if (duplicada) {
    return {
      agendada: true,
      ya_estaba_agendada: true,
      visita: { id: duplicada.id, propiedad: `${p.tipo} en ${p.comuna} (${p.id})`, fecha, hora: horaNorm },
      aviso: 'Esta visita YA estaba agendada: no se duplicó. Confírmale al cliente que está todo listo.',
    };
  }

  if (!libres.includes(horaNorm)) {
    // Slot de la ventana pero ocupado por OTRO cliente (u hora ya pasada si es hoy)
    const sugeridoDia = slotMasCercano(horaNorm, libres);
    const proximo = sugeridoDia ? null : await proximoDiaValido(addDias(fecha, 1));
    return {
      agendada: false,
      motivo: `El slot de las ${horaNorm} del ${fecha} ya está tomado.`,
      slots_disponibles: libres,
      slot_sugerido: sugeridoDia
        ? { fecha, dia: DIAS_SEMANA[diaSemanaDe(fecha)], hora: sugeridoDia }
        : proximo && { fecha: proximo.fecha, dia: proximo.dia, hora: proximo.slots_disponibles[0] },
    };
  }

  const visita = await db.visitas.crear({ propiedad_id: p.id, nombre, telefono: telNorm, fecha, hora: horaNorm });

  // Regla 3 del SPEC: agendar visita deja el lead en caliente automáticamente
  // (upsert conserva lo que ya se sabía del lead; solo pisa nombre e interés).
  const lead = await upsertLeadConScore({ nombre, telefono: telNorm, propiedad_interes: p.id });

  return {
    agendada: true,
    visita: {
      id: visita.id,
      propiedad: `${p.tipo} en ${p.comuna} (${p.id})`,
      direccion_referencial: p.direccion_referencial,
      fecha,
      hora: horaNorm,
    },
    lead_score: lead.lead.score,
  };
}

// ─── mis_visitas / cancelar_visita ───────────────────────────────────────────

async function resumenVisita(v) {
  const p = await db.propiedades.get(v.propiedad_id);
  return {
    id: v.id,
    propiedad_id: v.propiedad_id,
    propiedad: p ? `${p.tipo} en ${p.comuna} — ${p.direccion_referencial}` : v.propiedad_id,
    fecha: v.fecha,
    hora: normalizarHora(v.hora),
  };
}

async function misVisitas({ telefono } = {}) {
  const telNorm = normalizarTelefono(telefono);
  if (!telNorm) return { error: 'Falta el teléfono del cliente: pídeselo para buscar sus visitas.' };
  const visitas = await db.visitas.proximasPorTelefono(telNorm, hoyChile());
  if (!visitas.length) return { visitas: [], mensaje: 'El cliente no tiene visitas vigentes con ese teléfono.' };
  return { visitas: await Promise.all(visitas.map(resumenVisita)) };
}

async function cancelarVisita({ telefono, visita_id } = {}) {
  const telNorm = normalizarTelefono(telefono);
  if (!telNorm) return { cancelada: false, motivo: 'Falta el teléfono del cliente: pídeselo para ubicar su visita.' };
  const proximas = await db.visitas.proximasPorTelefono(telNorm, hoyChile());
  if (!proximas.length) return { cancelada: false, motivo: 'El cliente no tiene visitas vigentes.' };

  let visita;
  if (visita_id != null) {
    visita = proximas.find((v) => v.id === Number(visita_id));
    if (!visita) {
      return {
        cancelada: false,
        motivo: `No hay una visita vigente con id ${visita_id}.`,
        visitas: await Promise.all(proximas.map(resumenVisita)),
      };
    }
  } else if (proximas.length > 1) {
    // Con varias visitas NO se cancela a ciegas: hay que preguntar cuál
    return {
      cancelada: false,
      requiere_seleccion: true,
      visitas: await Promise.all(proximas.map(resumenVisita)),
      mensaje: 'El cliente tiene varias visitas vigentes: pregúntale cuál quiere cancelar y vuelve a llamar con su visita_id.',
    };
  } else {
    visita = proximas[0];
  }

  await db.visitas.cancelar(visita.id);
  return { cancelada: true, visita: await resumenVisita(visita) };
}

// ─── registrar_lead (score determinístico) ───────────────────────────────────

// Score del SPEC — lo calcula el CÓDIGO, no el LLM (así es testeable en mock).
// Gana la primera regla que calza:
//   caliente: agendó visita, o urgencia inmediata + presupuesto informado
//   tibio:    sin visita, pero operación + comuna + presupuesto, con urgencia
//             media o sin urgencia declarada
//   frío:     el resto (sin presupuesto, urgencia baja, "solo mirando")
async function calcularScore(telefono, { operacion, comuna, presupuesto, urgencia }) {
  const visitas = await db.visitas.proximasPorTelefono(telefono, '2000-01-01');
  if (visitas.length) return 'caliente';
  if (urgencia === 'inmediata' && presupuesto != null) return 'caliente';
  if (operacion && comuna && presupuesto != null && (urgencia === 'media' || urgencia == null)) return 'tibio';
  return 'frío';
}

// Upsert por teléfono: los campos nuevos no-nulos pisan; lo que no venga se
// conserva del lead existente (la calificación se construye por turnos).
async function upsertLeadConScore(input) {
  const existente = await db.leads.getPorTelefono(input.telefono);

  const operacion = normalizarOperacion(input.operacion) ?? existente?.operacion ?? null;
  const comuna = input.comuna ?? existente?.comuna ?? null;
  const presupuesto = input.presupuesto != null ? Number(input.presupuesto) : existente?.presupuesto ?? null;
  const urgencia = normalizarUrgencia(input.urgencia) ?? existente?.urgencia ?? null;
  const propiedad_interes = input.propiedad_interes
    ? String(input.propiedad_interes).toUpperCase()
    : existente?.propiedad_interes ?? null;

  // La nota se ACUMULA: los pendientes para el corredor no se pisan entre turnos
  let nota = existente?.nota ?? null;
  if (input.nota && input.nota !== nota) nota = nota ? `${nota} | ${input.nota}` : input.nota;

  const lead = await db.leads.upsert({
    nombre: input.nombre || existente?.nombre || null,
    telefono: input.telefono,
    operacion,
    comuna,
    presupuesto,
    urgencia,
    propiedad_interes,
    nota,
    score: await calcularScore(input.telefono, { operacion, comuna, presupuesto, urgencia }),
  });

  return { registrado: true, actualizado: !!existente, lead };
}

async function registrarLead(input = {}) {
  if (!input.nombre || !input.telefono) {
    return {
      registrado: false,
      motivo: 'Para registrar el lead se necesitan nombre y teléfono.',
      instruccion: 'Pídelos con naturalidad ("para enviarte la ficha / coordinar"). Si el cliente se niega, insiste UNA sola vez y sigue atendiendo igual.',
    };
  }
  const telNorm = normalizarTelefono(input.telefono);
  if (!telNorm) {
    return { registrado: false, motivo: 'El teléfono no parece válido: pídele al cliente su número (ej: +56 9 1234 5678).' };
  }
  return upsertLeadConScore({ ...input, telefono: telNorm });
}

// ─── info_corredora (FAQ oficial — nada se responde de memoria) ──────────────

const FAQ = {
  requisitos_arriendo:
    'Requisitos para arrendar: (1) renta líquida igual o superior a 3 veces el valor del arriendo, acreditada con las 3 últimas liquidaciones de sueldo; ' +
    '(2) contrato de trabajo vigente; (3) informe de deudas (Dicom) limpio; (4) si no se cumple la renta, se acepta un aval con requisitos equivalentes. ' +
    'Al firmar: mes de garantía + primer mes anticipado + comisión de corretaje.',
  comisiones:
    'Comisiones de corretaje: arriendo, 50% del primer mes de renta + IVA; venta, 2% del precio de venta + IVA.',
  horarios:
    'Oficina: lunes a viernes de 09:30 a 18:30 y sábado de 10:00 a 13:00 (la oficina NO agenda visitas, solo atiende consultas). ' +
    'Visitas a propiedades: solo lunes, miércoles y jueves entre 11:00 y 14:00, en bloques de 30 minutos, agendadas por este chat.',
  proceso_visita:
    'Las visitas se agendan por este chat con nombre y teléfono: solo lunes, miércoles y jueves entre 11:00 y 14:00, en bloques de 30 minutos. ' +
    'Un corredor te acompaña en la propiedad (la dirección exacta se confirma al coordinar). Para cambiar o cancelar, escríbenos por aquí mismo.',
};

async function infoCorredora({ tema } = {}) {
  if (!tema) {
    return {
      corredora: 'Corredora Andes Propiedades',
      resumen: 'Corredora de propiedades en Santiago: venta y arriendo de casas y deptos.',
      temas: FAQ,
    };
  }
  const clave = normalizarTexto(tema).replace(/\s+/g, '_');
  if (!FAQ[clave]) {
    return { error: `Tema desconocido: "${tema}"`, temas_validos: Object.keys(FAQ) };
  }
  return { tema: clave, respuesta: FAQ[clave] };
}

module.exports = { TOOL_DEFINITIONS, ejecutarHerramienta };
