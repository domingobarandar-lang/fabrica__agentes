// Capa de acceso a datos del agente inmobiliario (Corredora Andes Propiedades).
// Con SUPABASE_URL + SUPABASE_ANON_KEY usa Supabase; sin ellas cae a una base
// EN MEMORIA con los datos semilla del SPEC (la demo v1 corre así, por terminal).
//
// OJO: en memoria nada sobrevive a un reinicio — las visitas y leads de una
// demo se pierden al cortar el proceso. Para producción, ejecutar schema.sql
// en Supabase y configurar las variables.

// Polyfill WebSocket para Node < 22 (Railway usa Node 18): realtime-js exige
// un WebSocket global nativo. Debe parchearse ANTES de cargar supabase-js.
const ws = require('ws');
if (!globalThis.WebSocket) {
  globalThis.WebSocket = ws;
}

const { createClient } = require('@supabase/supabase-js');

const usandoMemoria = !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY;

// ─── Fechas (zona horaria de Chile) ──────────────────────────────────────────

const hoyChileISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

function addDiasISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Próxima fecha (estrictamente futura) que cae en el día de semana pedido.
// La visita semilla es "el próximo miércoles": si HOY es miércoles, es el de
// la semana siguiente (una visita de hoy podría quedar en el pasado por hora).
function proximoDiaSemana(diaObjetivo) {
  let f = addDiasISO(hoyChileISO(), 1);
  while (new Date(`${f}T12:00:00Z`).getUTCDay() !== diaObjetivo) f = addDiasISO(f, 1);
  return f;
}

// ─── Implementación en memoria (modo demo) ───────────────────────────────────

// Catálogo semilla del SPEC: 8 propiedades. P4 está ARRENDADA a propósito
// (CU-10: el bot debe informar que ya no está y ofrecer alternativas).
// Venta en UF, arriendo en CLP; gastos_comunes siempre en CLP (null = sin GC).
const PROPIEDADES_DEMO = [
  { id: 'P1', operacion: 'arriendo', tipo: 'depto', comuna: 'Santiago Centro', direccion_referencial: 'Santa Isabel alt. 350, Santiago Centro', precio: 420000, moneda: 'CLP', gastos_comunes: 65000, dormitorios: 1, banos: 1, m2: 45, estado: 'disponible', descripcion: 'Depto de 1 dormitorio orientación oriente, cocina equipada y conserjería 24/7. A pasos del metro Santa Isabel.' },
  { id: 'P2', operacion: 'arriendo', tipo: 'depto', comuna: 'Ñuñoa', direccion_referencial: 'Av. Irarrázaval alt. 3400, Ñuñoa', precio: 560000, moneda: 'CLP', gastos_comunes: 80000, dormitorios: 2, banos: 1, m2: 58, estado: 'disponible', descripcion: 'Depto luminoso de 2 dormitorios, remodelado, con logia y bodega. A 2 cuadras de la plaza de Ñuñoa.' },
  { id: 'P3', operacion: 'arriendo', tipo: 'casa', comuna: 'Maipú', direccion_referencial: 'Av. Los Pajaritos alt. 2500, Maipú', precio: 650000, moneda: 'CLP', gastos_comunes: null, dormitorios: 3, banos: 2, m2: 90, estado: 'disponible', descripcion: 'Casa de 3 dormitorios con patio y estacionamiento para 2 autos, cerca del metro Plaza de Maipú.' },
  { id: 'P4', operacion: 'arriendo', tipo: 'depto', comuna: 'Providencia', direccion_referencial: 'Av. Providencia alt. 2100, Providencia', precio: 480000, moneda: 'CLP', gastos_comunes: 70000, dormitorios: 1, banos: 1, m2: 40, estado: 'arrendada', descripcion: 'Depto de 1 dormitorio full amoblado, edificio con gimnasio y cowork. Metro Pedro de Valdivia.' },
  { id: 'P5', operacion: 'venta', tipo: 'depto', comuna: 'Ñuñoa', direccion_referencial: 'José Pedro Alessandri alt. 1100, Ñuñoa', precio: 3400, moneda: 'UF', gastos_comunes: 75000, dormitorios: 2, banos: 2, m2: 62, estado: 'disponible', descripcion: 'Depto de 2 dormitorios y 2 baños con terraza, edificio 2018 con quincho. Sector plaza Egaña.' },
  { id: 'P6', operacion: 'venta', tipo: 'depto', comuna: 'San Miguel', direccion_referencial: 'Gran Avenida alt. 4900, San Miguel', precio: 4200, moneda: 'UF', gastos_comunes: 60000, dormitorios: 3, banos: 2, m2: 78, estado: 'disponible', descripcion: 'Depto de 3 dormitorios en piso alto con vista despejada, estacionamiento y bodega. Metro San Miguel.' },
  { id: 'P7', operacion: 'venta', tipo: 'casa', comuna: 'La Florida', direccion_referencial: 'Walker Martínez alt. 700, La Florida', precio: 6500, moneda: 'UF', gastos_comunes: null, dormitorios: 4, banos: 3, m2: 120, estado: 'disponible', descripcion: 'Casa de 4 dormitorios en dos pisos, patio grande con quincho. Cerca de Vespucio y metro Bellavista de La Florida.' },
  { id: 'P8', operacion: 'venta', tipo: 'depto', comuna: 'Las Condes', direccion_referencial: 'Av. Apoquindo alt. 6300, Las Condes', precio: 5900, moneda: 'UF', gastos_comunes: 110000, dormitorios: 2, banos: 2, m2: 70, estado: 'disponible', descripcion: 'Depto de 2 dormitorios y 2 baños con terraza vidriada, edificio con piscina y gimnasio. Metro Manquehue.' },
];

// Semillas mutables del SPEC: 1 visita pre-agendada (prueba colisión de slot,
// ADV-4) y 1 lead existente (prueba upsert por teléfono). Teléfonos guardados
// normalizados a solo dígitos ("+56 9 8765 4321" → "56987654321").
function datosSemilla() {
  const ahora = new Date().toISOString();
  return {
    visitas: [
      { id: 1, propiedad_id: 'P2', nombre: 'Marcela Fuentes', telefono: '56987654321', fecha: proximoDiaSemana(3), hora: '12:00', estado: 'agendada', creado_en: ahora },
    ],
    leads: [
      { id: 1, nombre: 'Marcela Fuentes', telefono: '56987654321', operacion: 'arriendo', comuna: 'Ñuñoa', presupuesto: 600000, urgencia: 'inmediata', propiedad_interes: 'P2', score: 'caliente', nota: null, actualizado_en: ahora },
    ],
    proximoIdVisita: 2,
    proximoIdLead: 2,
  };
}

const memoria = {
  sesiones: new Map(), // telefono/chat → messages[]
  propiedades: PROPIEDADES_DEMO,
  // Ventana de visitas del negocio: SOLO lunes (1), miércoles (3) y jueves (4),
  // 11:00 a 14:00. Un día sin fila = sin visitas ese día.
  horariosVisita: new Map([
    [1, { abre: '11:00', cierra: '14:00' }],
    [3, { abre: '11:00', cierra: '14:00' }],
    [4, { abre: '11:00', cierra: '14:00' }],
  ]),
  ...datosSemilla(),
};

const dbMemoria = {
  async testConexion() { return true; },
  // Solo en modo memoria: vuelve al estado semilla del SPEC (lo usa la suite
  // de tests para aislar escenarios). En modo Supabase no existe.
  async resetDemo() {
    memoria.sesiones.clear();
    Object.assign(memoria, datosSemilla());
  },
  sesiones: {
    async get(telefono) {
      const messages = memoria.sesiones.get(telefono);
      return messages ? { messages } : null;
    },
    async upsert(telefono, messages) { memoria.sesiones.set(telefono, messages); },
  },
  propiedades: {
    async listar() { return [...memoria.propiedades]; },
    async get(id) {
      return memoria.propiedades.find((p) => p.id.toUpperCase() === String(id || '').toUpperCase()) ?? null;
    },
  },
  horariosVisita: {
    async get(diaSemana) { return memoria.horariosVisita.get(diaSemana) ?? null; },
    async listar() {
      return [...memoria.horariosVisita.entries()].map(([dia_semana, h]) => ({ dia_semana, ...h }));
    },
  },
  visitas: {
    // Las visitas de CUALQUIER propiedad ocupan el slot: hay un solo corredor
    // que acompaña las visitas (por eso la disponibilidad es global por fecha).
    async listarPorFecha(fecha) {
      return memoria.visitas.filter((v) => v.fecha === fecha && v.estado === 'agendada');
    },
    async crear(datos) {
      const visita = { id: memoria.proximoIdVisita++, estado: 'agendada', creado_en: new Date().toISOString(), ...datos };
      memoria.visitas.push(visita);
      return visita;
    },
    async proximasPorTelefono(telefono, desdeFecha) {
      return memoria.visitas
        .filter((v) => v.telefono === telefono && v.estado === 'agendada' && v.fecha >= desdeFecha)
        .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    },
    async cancelar(id) {
      const visita = memoria.visitas.find((v) => v.id === id);
      if (visita) visita.estado = 'cancelada';
    },
  },
  leads: {
    async getPorTelefono(telefono) {
      return memoria.leads.find((l) => l.telefono === telefono) ?? null;
    },
    // Upsert por teléfono (clave natural: un lead por teléfono). El merge de
    // campos y el cálculo de score se hacen en agent/tools.js — aquí llega el
    // registro ya resuelto.
    async upsert(datos) {
      const existente = memoria.leads.find((l) => l.telefono === datos.telefono);
      if (existente) {
        Object.assign(existente, datos, { id: existente.id, actualizado_en: new Date().toISOString() });
        return existente;
      }
      const lead = { id: memoria.proximoIdLead++, actualizado_en: new Date().toISOString(), ...datos };
      memoria.leads.push(lead);
      return lead;
    },
  },
};

// ─── Implementación Supabase (producción — misma interfaz) ──────────────────

function crearDbSupabase() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    // Redundante con el polyfill global de arriba (que es el fix real en
    // Node < 22); se mantiene como respaldo por si el global se pierde.
    realtime: { transport: ws },
  });

  return {
    supabase,
    async testConexion() {
      const { error } = await supabase.from('propiedades').select('count', { count: 'exact', head: true });
      return !error;
    },
    sesiones: {
      async get(telefono) {
        const { data, error } = await supabase
          .from('inmobiliaria_sesiones')
          .select('messages')
          .eq('telefono', telefono)
          .single();
        if (error) {
          if (error.code === 'PGRST116') return null; // sin filas
          throw new Error(`[DB] sesiones.get: ${error.message}`);
        }
        return data;
      },
      async upsert(telefono, messages) {
        const { error } = await supabase
          .from('inmobiliaria_sesiones')
          .upsert({ telefono, messages, updated_at: new Date().toISOString() }, { onConflict: 'telefono' });
        if (error) throw new Error(`[DB] sesiones.upsert: ${error.message}`);
      },
    },
    propiedades: {
      async listar() {
        const { data, error } = await supabase.from('propiedades').select('*').order('id');
        if (error) throw new Error(`[DB] propiedades.listar: ${error.message}`);
        return data ?? [];
      },
      async get(id) {
        const { data, error } = await supabase
          .from('propiedades')
          .select('*')
          .eq('id', String(id || '').toUpperCase())
          .single();
        if (error) {
          if (error.code === 'PGRST116') return null;
          throw new Error(`[DB] propiedades.get: ${error.message}`);
        }
        return data;
      },
    },
    horariosVisita: {
      async get(diaSemana) {
        const { data, error } = await supabase
          .from('horarios_visita')
          .select('abre, cierra')
          .eq('dia_semana', diaSemana)
          .single();
        if (error) {
          if (error.code === 'PGRST116') return null; // día sin visitas
          throw new Error(`[DB] horariosVisita.get: ${error.message}`);
        }
        // Postgres devuelve time como 'HH:MM:SS' — recortamos a 'HH:MM'
        return { abre: String(data.abre).slice(0, 5), cierra: String(data.cierra).slice(0, 5) };
      },
      async listar() {
        const { data, error } = await supabase
          .from('horarios_visita')
          .select('dia_semana, abre, cierra')
          .order('dia_semana');
        if (error) throw new Error(`[DB] horariosVisita.listar: ${error.message}`);
        return (data ?? []).map((h) => ({
          dia_semana: h.dia_semana,
          abre: String(h.abre).slice(0, 5),
          cierra: String(h.cierra).slice(0, 5),
        }));
      },
    },
    visitas: {
      async listarPorFecha(fecha) {
        const { data, error } = await supabase
          .from('visitas')
          .select('id, propiedad_id, hora')
          .eq('fecha', fecha)
          .eq('estado', 'agendada');
        if (error) throw new Error(`[DB] visitas.listarPorFecha: ${error.message}`);
        return data ?? [];
      },
      async crear(datos) {
        const { data, error } = await supabase.from('visitas').insert(datos).select().single();
        if (error) throw new Error(`[DB] visitas.crear: ${error.message}`);
        return data;
      },
      async proximasPorTelefono(telefono, desdeFecha) {
        const { data, error } = await supabase
          .from('visitas')
          .select('*')
          .eq('telefono', telefono)
          .eq('estado', 'agendada')
          .gte('fecha', desdeFecha)
          .order('fecha')
          .order('hora');
        if (error) throw new Error(`[DB] visitas.proximasPorTelefono: ${error.message}`);
        return data ?? [];
      },
      async cancelar(id) {
        const { error } = await supabase.from('visitas').update({ estado: 'cancelada' }).eq('id', id);
        if (error) throw new Error(`[DB] visitas.cancelar: ${error.message}`);
      },
    },
    leads: {
      async getPorTelefono(telefono) {
        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .eq('telefono', telefono)
          .single();
        if (error) {
          if (error.code === 'PGRST116') return null;
          throw new Error(`[DB] leads.getPorTelefono: ${error.message}`);
        }
        return data;
      },
      async upsert(datos) {
        const { data, error } = await supabase
          .from('leads')
          .upsert({ ...datos, actualizado_en: new Date().toISOString() }, { onConflict: 'telefono' })
          .select()
          .single();
        if (error) throw new Error(`[DB] leads.upsert: ${error.message}`);
        return data;
      },
    },
  };
}

const db = usandoMemoria ? dbMemoria : crearDbSupabase();

module.exports = { db, usandoMemoria };
