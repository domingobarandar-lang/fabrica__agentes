// Herramientas del agente de la Clínica Dental San Martín.
// Extiende la base de agente-citas con agenda POR DOCTOR: la disponibilidad,
// el agendamiento y las citas llevan siempre el profesional. Durante la
// colación (13:00-14:00) no se ofrecen slots.

const { db } = require('../database/supabase');

const SLOT_MINUTOS = Number(process.env.SLOT_MINUTOS) || 30;
// Colación de la clínica: entre estas horas no se agenda
const COLACION_DESDE = '13:00';
const COLACION_HASTA = '14:00';

const TOOL_DEFINITIONS = [
  {
    name: 'ver_catalogo',
    description: 'Lista los tratamientos de la clínica, con precio y duración. Úsala cuando el paciente pregunte qué hacen, precios o "cuánto sale".',
    input_schema: {
      type: 'object',
      properties: {
        categoria: { type: 'string', description: 'Filtro opcional por categoría (ej: "higiene", "estética", "urgencia")' },
      },
    },
  },
  {
    name: 'ver_profesionales',
    description: 'Lista los doctores de la clínica con su especialidad. Úsala cuando pregunten quiénes atienden, o para ofrecer opciones cuando el paciente no ha elegido doctor.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'consultar_disponibilidad',
    description: 'Devuelve las horas libres para una fecha. Con "profesional" entrega solo las de ese doctor; sin él, las de todos los doctores (para que el paciente elija). Úsala SIEMPRE antes de agendar.',
    input_schema: {
      type: 'object',
      properties: {
        fecha:       { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        profesional: { type: 'string', description: 'Nombre (o parte del nombre/especialidad) del doctor. Opcional.' },
      },
      required: ['fecha'],
    },
  },
  {
    name: 'agendar_cita',
    description: 'Agenda una hora. Llamar solo cuando el paciente ya confirmó nombre, tratamiento, doctor, fecha y hora.',
    input_schema: {
      type: 'object',
      properties: {
        nombre:      { type: 'string', description: 'Nombre del paciente' },
        servicio:    { type: 'string', description: 'Tratamiento del catálogo que necesita' },
        profesional: { type: 'string', description: 'Doctor con el que se atiende (de ver_profesionales)' },
        fecha:       { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
        hora:        { type: 'string', description: 'Hora en formato HH:MM (24h)' },
        notas:       { type: 'string', description: 'Comentario opcional del paciente' },
      },
      required: ['nombre', 'servicio', 'profesional', 'fecha', 'hora'],
    },
  },
  {
    name: 'mis_citas',
    description: 'Lista las horas vigentes del paciente (se identifica por su teléfono). Úsala cuando pregunte por sus horas agendadas y ANTES de cancelar o cambiar una.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'cancelar_cita',
    description: 'Cancela una hora vigente del paciente. Sin cita_id cancela su única cita; si tiene varias, la herramienta pide seleccionar y debes volver a llamarla con el cita_id correcto (lo entrega mis_citas). Para cambiar una hora: cancelar y luego agendar de nuevo.',
    input_schema: {
      type: 'object',
      properties: {
        cita_id: { type: 'integer', description: 'ID de la cita a cancelar cuando el paciente tiene más de una (viene de mis_citas)' },
      },
    },
  },
  {
    name: 'ver_horarios',
    description: 'Muestra los horarios de atención de la clínica por día de la semana (incluye la colación sin atención). Úsala cuando pregunten a qué hora abren/cierran o qué días atienden.',
    input_schema: { type: 'object', properties: {} },
  },
];

/**
 * Ejecuta una herramienta y retorna un objeto serializable para el tool_result.
 * @param {string} nombre
 * @param {Object} input
 * @param {string} telefono - Teléfono del paciente (identidad de la sesión)
 */
async function ejecutarHerramienta(nombre, input, telefono) {
  switch (nombre) {
    case 'ver_catalogo':             return verCatalogo(input);
    case 'ver_profesionales':        return verProfesionales();
    case 'consultar_disponibilidad': return consultarDisponibilidad(input);
    case 'agendar_cita':             return agendarCita(input, telefono);
    case 'mis_citas':                return misCitas(telefono);
    case 'cancelar_cita':            return cancelarCita(input, telefono);
    case 'ver_horarios':             return verHorarios();
    default: return { error: `Herramienta desconocida: ${nombre}` };
  }
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const hoyChile = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

const horaChile = () => new Date().toLocaleTimeString('en-GB', {
  timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit',
});

async function verCatalogo({ categoria } = {}) {
  const items = await db.catalogo.listar(categoria);
  if (!items.length) return { resultados: 0, mensaje: 'No hay tratamientos cargados para ese filtro.' };
  return {
    resultados: items.length,
    servicios: items.map((s) => ({
      nombre: s.nombre,
      descripcion: s.descripcion,
      categoria: s.categoria,
      precio: s.precio,
      duracion_minutos: s.duracion_minutos,
    })),
  };
}

const formatoProf = (p) => ({ nombre: p.nombre, especialidad: p.especialidad });

async function verProfesionales() {
  const items = await db.profesionales.listar();
  if (!items.length) return { profesionales: [], mensaje: 'No hay doctores cargados en el sistema.' };
  return { profesionales: items.map(formatoProf) };
}

// Minúsculas y sin tildes, para comparar nombres con tolerancia
const normalizarTexto = (s) => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Resuelve el nombre que dio el cliente a UN servicio del catálogo.
 * @returns {{servicio: Object} | {noExiste: true} | {ambiguo: Object[]}}
 */
async function resolverServicio(nombre) {
  const items = await db.catalogo.listar();
  const q = normalizarTexto(nombre);
  const exacto = items.find((s) => normalizarTexto(s.nombre) === q);
  if (exacto) return { servicio: exacto };
  const parciales = items.filter((s) => {
    const n = normalizarTexto(s.nombre);
    return n.includes(q) || q.includes(n);
  });
  if (parciales.length === 1) return { servicio: parciales[0] };
  if (parciales.length > 1) return { ambiguo: parciales };
  return { noExiste: true };
}

// Palabras que no identifican a un doctor ("dr" queda fuera por largo < 3)
const PALABRAS_IGNORADAS = new Set(['dra', 'doctor', 'doctora', 'don', 'sra', 'srta', 'con', 'las', 'los']);

/**
 * Resuelve el texto que dio el paciente a UN doctor. Tolerante: acepta nombre
 * parcial ("dra soto"), nombre de pila ("carolina") o especialidad ("pediatra"
 * calza con "Odontopediatría").
 * @returns {{profesional: Object} | {noExiste: true} | {ambiguo: Object[]}}
 */
async function resolverProfesional(texto) {
  const items = await db.profesionales.listar();
  const exacto = items.find((p) => normalizarTexto(p.nombre) === normalizarTexto(texto));
  if (exacto) return { profesional: exacto };

  const tokens = normalizarTexto(texto).replace(/\./g, ' ').split(/\s+/)
    .filter((t) => t.length >= 3 && !PALABRAS_IGNORADAS.has(t));
  if (!tokens.length) return { noExiste: true };

  const heapDe = (p) => normalizarTexto(`${p.nombre} ${p.especialidad || ''}`);
  // Estricto: todos los tokens presentes. Laxo: alguno, solo si identifica a uno.
  const estrictos = items.filter((p) => tokens.every((t) => heapDe(p).includes(t)));
  if (estrictos.length === 1) return { profesional: estrictos[0] };
  if (estrictos.length > 1) return { ambiguo: estrictos };
  const laxos = items.filter((p) => tokens.some((t) => heapDe(p).includes(t)));
  if (laxos.length === 1) return { profesional: laxos[0] };
  if (laxos.length > 1) return { ambiguo: laxos };
  return { noExiste: true };
}

async function consultarDisponibilidad({ fecha, profesional } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) {
    return { error: 'Fecha inválida: usar formato YYYY-MM-DD' };
  }
  const hoy = hoyChile();
  if (fecha < hoy) {
    return { fecha, disponible: false, error: `La fecha ${fecha} ya pasó (hoy es ${hoy}): solo se agenda de hoy en adelante.` };
  }
  const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
  const horario = await db.horarios.get(diaSemana);
  if (!horario) return { fecha, disponible: false, mensaje: 'Ese día la clínica está cerrada (atendemos de lunes a viernes).' };

  const citasDia = await db.citas.listarPorFecha(fecha);
  // Si consultan por HOY, las horas que ya pasaron no se ofrecen
  const horaMinima = fecha === hoy ? horaChile() : null;

  const libresDe = (nombreDoctor) => {
    const ocupadas = new Set(
      citasDia.filter((c) => c.profesional === nombreDoctor).map((c) => normalizarHora(c.hora))
    );
    const libres = [];
    let [h, m] = horario.abre.split(':').map(Number);
    const [hc, mc] = horario.cierra.split(':').map(Number);
    while (h * 60 + m + SLOT_MINUTOS <= hc * 60 + mc) {
      const slot = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const enColacion = slot >= COLACION_DESDE && slot < COLACION_HASTA;
      if (!enColacion && !ocupadas.has(slot) && (!horaMinima || slot > horaMinima)) libres.push(slot);
      m += SLOT_MINUTOS;
      h += Math.floor(m / 60);
      m %= 60;
    }
    return libres;
  };

  const horarioTexto = `${horario.abre} a ${horario.cierra} (colación ${COLACION_DESDE}-${COLACION_HASTA} sin atención)`;

  if (profesional) {
    const res = await resolverProfesional(profesional);
    if (res.noExiste) {
      const todos = await db.profesionales.listar();
      return { error: `"${profesional}" no es un doctor de la clínica.`, profesionales: todos.map(formatoProf) };
    }
    if (res.ambiguo) {
      return { error: `"${profesional}" coincide con varios doctores: pregunta al paciente cuál.`, profesionales: res.ambiguo.map(formatoProf) };
    }
    const p = res.profesional;
    return {
      fecha,
      profesional: p.nombre,
      especialidad: p.especialidad,
      horario_atencion: horarioTexto,
      horas_disponibles: libresDe(p.nombre),
    };
  }

  const profesionales = await db.profesionales.listar();
  return {
    fecha,
    horario_atencion: horarioTexto,
    disponibilidad_por_doctor: profesionales.map((p) => ({
      profesional: p.nombre,
      especialidad: p.especialidad,
      horas_disponibles: libresDe(p.nombre),
    })),
  };
}

async function agendarCita({ nombre, servicio, profesional, fecha, hora, notas }, telefono) {
  // El tratamiento debe existir en el catálogo (no se agendan servicios inventados)
  const resolucion = await resolverServicio(servicio);
  if (resolucion.noExiste) {
    const items = await db.catalogo.listar();
    return {
      agendada: false,
      motivo: `"${servicio}" no está en el catálogo.`,
      servicios_disponibles: items.map((s) => s.nombre),
    };
  }
  if (resolucion.ambiguo) {
    return {
      agendada: false,
      motivo: `"${servicio}" coincide con varios tratamientos: pregunta al paciente cuál necesita.`,
      servicios_disponibles: resolucion.ambiguo.map((s) => s.nombre),
    };
  }
  const servicioCatalogo = resolucion.servicio;

  // El doctor debe existir (no se agenda con doctores inventados)
  if (!profesional) {
    const todos = await db.profesionales.listar();
    return { agendada: false, motivo: 'Falta indicar con qué doctor se atiende.', profesionales: todos.map(formatoProf) };
  }
  const resProf = await resolverProfesional(profesional);
  if (resProf.noExiste) {
    const todos = await db.profesionales.listar();
    return { agendada: false, motivo: `"${profesional}" no es un doctor de la clínica.`, profesionales: todos.map(formatoProf) };
  }
  if (resProf.ambiguo) {
    return { agendada: false, motivo: `"${profesional}" coincide con varios doctores: pregunta al paciente cuál.`, profesionales: resProf.ambiguo.map(formatoProf) };
  }
  const doctor = resProf.profesional;

  const disponibilidad = await consultarDisponibilidad({ fecha, profesional: doctor.nombre });
  if (disponibilidad.error) return disponibilidad;
  if (disponibilidad.disponible === false) return disponibilidad;
  const horaNorm = normalizarHora(hora);
  if (!disponibilidad.horas_disponibles.includes(horaNorm)) {
    return {
      agendada: false,
      motivo: `${doctor.nombre} no tiene libre las ${horaNorm} el ${fecha}.`,
      horas_disponibles_doctor: disponibilidad.horas_disponibles,
      sugerencia: 'Puedes ver las horas de los otros doctores llamando consultar_disponibilidad sin "profesional".',
    };
  }
  const cita = await db.citas.crear({
    telefono_cliente: telefono,
    nombre_cliente: nombre,
    servicio: servicioCatalogo.nombre, // nombre canónico del catálogo
    profesional: doctor.nombre,        // nombre canónico del doctor
    fecha,
    hora: horaNorm,
    personas: 1,
    notas: notas ?? null,
  });
  return {
    agendada: true,
    cita: { id: cita.id, nombre, servicio: servicioCatalogo.nombre, profesional: doctor.nombre, fecha, hora: horaNorm },
  };
}

const resumenCita = (c) => ({
  id: c.id,
  servicio: c.servicio,
  profesional: c.profesional,
  fecha: c.fecha,
  hora: normalizarHora(c.hora),
});

async function misCitas(telefono) {
  const citas = await db.citas.proximasPorTelefono(telefono, hoyChile());
  if (!citas.length) return { citas: [], mensaje: 'El paciente no tiene horas vigentes.' };
  return { citas: citas.map(resumenCita) };
}

async function cancelarCita({ cita_id } = {}, telefono) {
  const proximas = await db.citas.proximasPorTelefono(telefono, hoyChile());
  if (!proximas.length) return { cancelada: false, motivo: 'El paciente no tiene horas vigentes.' };

  let cita;
  if (cita_id != null) {
    cita = proximas.find((c) => c.id === Number(cita_id));
    if (!cita) {
      return {
        cancelada: false,
        motivo: `No hay una cita vigente con id ${cita_id}.`,
        citas: proximas.map(resumenCita),
      };
    }
  } else if (proximas.length > 1) {
    // Con varias citas NO se cancela a ciegas: hay que preguntar cuál
    return {
      cancelada: false,
      requiere_seleccion: true,
      citas: proximas.map(resumenCita),
      mensaje: 'El paciente tiene varias horas vigentes: pregúntale cuál quiere cancelar y vuelve a llamar con su cita_id.',
    };
  } else {
    cita = proximas[0];
  }

  await db.citas.cancelar(cita.id);
  return { cancelada: true, cita: { servicio: cita.servicio, profesional: cita.profesional, fecha: cita.fecha, hora: normalizarHora(cita.hora) } };
}

async function verHorarios() {
  const filas = await db.horarios.listar();
  const porDia = new Map(filas.map((h) => [h.dia_semana, h]));
  return {
    horarios: DIAS_SEMANA.map((dia, i) => (porDia.has(i)
      ? { dia, abre: porDia.get(i).abre, cierra: porDia.get(i).cierra }
      : { dia, cerrado: true })),
    colacion: `Sin atención de ${COLACION_DESDE} a ${COLACION_HASTA} (colación).`,
  };
}

/** '9:00' | '09:00:00' → '09:00' */
function normalizarHora(hora) {
  const [h = '0', m = '00'] = String(hora || '').split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

module.exports = { TOOL_DEFINITIONS, ejecutarHerramienta };
