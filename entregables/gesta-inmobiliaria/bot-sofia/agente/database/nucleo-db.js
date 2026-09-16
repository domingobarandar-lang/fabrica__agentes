// Capa de datos QUE EL NÚCLEO NECESITA. Vive acá y no en el archivo de cada
// cliente por el reparto que fijó el diseño del paso 4:
//
//   NÚCLEO  → la conexión, el fallback en memoria, y las tres tablas sin las
//             que el núcleo no funciona: sesiones, estado_canal y metricas.
//   CLIENTE → los repositorios de dominio del vertical (propiedades, citas,
//             catálogo, horarios…). Son el modelo de negocio, no infraestructura,
//             y por eso se reescriben en cada proyecto.
//
// El cliente monta las dos mitades en `database/supabase.js`:
//
//   const { crearBaseNucleo } = require('./nucleo-db');
//   const nucleo = crearBaseNucleo();
//   const db = { ...nucleo, propiedades: { … } };
//
// TODA TABLA VA PREFIJADA, y acá eso FALLA CERRADO. El proyecto Supabase está
// compartido entre agentes: una tabla `estado_canal` sin prefijo la comparten
// todos, y entonces el modo_humano de un cliente de la dental deja mudo al bot
// de otro agente si coinciden los canal_id. Los nombres salen de `datos.*` de
// agente.config.json; si no se pueden resolver y hay credenciales de Supabase,
// esto lanza en vez de conectarse a una tabla compartida.

const config = require('../config');

// ─── En memoria ──────────────────────────────────────────────────────────────
// Sin credenciales de Supabase, todo vive en el proceso. Es lo que hace que la
// semilla arranque y que los evals corran sin red. Se pierde en cada reinicio:
// sirve para demo, no para producción.

const memoria = {
  sesiones:    new Map(),
  estadoCanal: new Map(),
  metricas:    [],
};

const MAX_METRICAS_MEMORIA = 1000;

// LAS COLUMNAS DE estado_canal, EN UN SOLO LUGAR. Mismo motivo que la lista
// CAMPOS de agent/metricas.js, pero acá el daño es peor: un upsert con una
// columna que no existe falla ENTERO, y este es el camino por el que se marca
// `modo_humano`. Un cliente con el DDL viejo y el núcleo nuevo dejaría de poder
// derivar a una persona — el bot hablaría encima de una ejecutiva — por una
// columna que se agregó para otra cosa.
//
// Se filtra y se avisa fuerte, en vez de dejar que reviente. `agente_actual` y
// `lead` llegaron con el núcleo 1.5.0 y hay proyectos con la tabla anterior.
const CAMPOS_ESTADO = [
  'canal_id', 'modo_humano', 'humano_desde', 'motivo', 'fallos_seguidos',
  'agente_actual', 'lead', 'updated_at',
];

const columnasAvisadas = new Set();

function soloColumnas(estado) {
  const fila = {};
  for (const [clave, valor] of Object.entries(estado || {})) {
    if (CAMPOS_ESTADO.includes(clave)) { fila[clave] = valor; continue; }
    if (!columnasAvisadas.has(clave)) {
      columnasAvisadas.add(clave);
      console.warn(
        `[DB] "${clave}" no es columna de estado_canal y se descarta. ` +
        'Agrégala a CAMPOS_ESTADO en database/nucleo-db.js y a database/schema-nucleo.sql, o sácala.'
      );
    }
  }
  return fila;
}

function baseEnMemoria() {
  return {
    modo: 'memoria',
    sesiones: {
      async get(canalId) {
        return memoria.sesiones.get(canalId) || null;
      },
      async upsert(canalId, messages) {
        memoria.sesiones.set(canalId, { messages, updated_at: new Date().toISOString() });
      },
    },
    estadoCanal: {
      async get(canalId) {
        return memoria.estadoCanal.get(canalId) || null;
      },
      async set(canalId, estado) {
        // También en memoria se filtra: si no, un campo de más pasaría todas las
        // pruebas y solo fallaría en el primer cliente con Supabase de verdad.
        memoria.estadoCanal.set(canalId, {
          ...(memoria.estadoCanal.get(canalId) || {}),
          ...soloColumnas(estado),
        });
      },
    },
    metricas: {
      async registrar(fila) {
        memoria.metricas.push(fila);
        if (memoria.metricas.length > MAX_METRICAS_MEMORIA) memoria.metricas.shift();
      },
      async listar() {
        return memoria.metricas.map((f) => ({ ...f }));
      },
    },
  };
}

/** Deja las tablas del núcleo como recién sembradas. Lo usan los evals. */
function resetMemoria() {
  memoria.sesiones.clear();
  memoria.estadoCanal.clear();
  memoria.metricas.length = 0;
}

// ─── Supabase ────────────────────────────────────────────────────────────────

function credenciales() {
  const url = process.env.SUPABASE_URL;
  // service_role primero: la anon da "permission denied" con RLS encendido.
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

function tablas() {
  const t = {
    sesiones:    config.valor('datos.tabla_sesiones'),
    estadoCanal: config.valor('datos.tabla_estado_canal'),
    metricas:    config.valor('datos.tabla_metricas'),
  };
  // Sin prefijo resuelto los nombres quedan como "_sesiones": una tabla que
  // TODOS los agentes del proyecto compartirían. Antes de conectarse a eso,
  // caerse.
  const malas = Object.entries(t).filter(([, nombre]) => !nombre || nombre.startsWith('_'));
  if (malas.length) {
    throw new Error(
      '[DB] Hay credenciales de Supabase pero las tablas del núcleo no tienen prefijo: ' +
      malas.map(([k, v]) => `${k}="${v}"`).join(', ') + '. ' +
      `Declara "datos.prefijo" en ${config.ARCHIVO} — el proyecto Supabase está compartido entre agentes ` +
      'y una tabla sin prefijo cruza datos entre negocios distintos.'
    );
  }
  return t;
}

function baseEnSupabase({ url, key }) {
  // Polyfill de WebSocket antes de cargar supabase-js: realtime-js exige un
  // WebSocket global y Node < 22 no lo trae. Railway corrió con Node 18.
  if (!globalThis.WebSocket) globalThis.WebSocket = require('ws');
  const { createClient } = require('@supabase/supabase-js');

  const supabase = createClient(url, key);
  const t = tablas();
  console.log(`[DB] Supabase conectado. Tablas del núcleo: ${t.sesiones}, ${t.estadoCanal}, ${t.metricas}`);

  return {
    modo: 'supabase',
    supabase,
    tablas: t,
    sesiones: {
      async get(canalId) {
        const { data, error } = await supabase
          .from(t.sesiones)
          .select('messages')
          .eq('canal_id', canalId)
          .single();
        if (error) {
          if (error.code === 'PGRST116') return null; // sin filas
          throw new Error(`[DB] sesiones.get: ${error.message}`);
        }
        return data;
      },
      async upsert(canalId, messages) {
        const { error } = await supabase
          .from(t.sesiones)
          .upsert({ canal_id: canalId, messages, updated_at: new Date().toISOString() },
                  { onConflict: 'canal_id' });
        if (error) throw new Error(`[DB] sesiones.upsert: ${error.message}`);
      },
    },
    estadoCanal: {
      async get(canalId) {
        const { data, error } = await supabase
          .from(t.estadoCanal)
          .select('*')
          .eq('canal_id', canalId)
          .single();
        if (error) {
          if (error.code === 'PGRST116') return null;
          // El error se PROPAGA a propósito: agent/handoff.js falla cerrado y
          // asume que hay una persona atendiendo. Tragarlo acá y devolver null
          // haría que el bot hable encima de una ejecutiva.
          throw new Error(`[DB] estadoCanal.get: ${error.message}`);
        }
        return data;
      },
      async set(canalId, estado) {
        const { error } = await supabase
          .from(t.estadoCanal)
          .upsert({ canal_id: canalId, ...soloColumnas(estado), updated_at: new Date().toISOString() },
                  { onConflict: 'canal_id' });
        if (error) throw new Error(`[DB] estadoCanal.set: ${error.message}`);
      },
    },
    metricas: {
      async registrar(fila) {
        const { error } = await supabase.from(t.metricas).insert(fila);
        if (error) throw new Error(`[DB] metricas.registrar: ${error.message}`);
      },
      async listar() {
        const { data, error } = await supabase
          .from(t.metricas).select('*').order('ts', { ascending: false }).limit(500);
        if (error) throw new Error(`[DB] metricas.listar: ${error.message}`);
        return data ?? [];
      },
    },
  };
}

/**
 * Construye la mitad del núcleo de la capa de datos.
 * Con SUPABASE_URL + key usa Supabase; sin ellas, memoria.
 */
function crearBaseNucleo() {
  const creds = credenciales();
  if (!creds) return baseEnMemoria();
  return baseEnSupabase(creds);
}

module.exports = { crearBaseNucleo, resetMemoria, CAMPOS_ESTADO };
