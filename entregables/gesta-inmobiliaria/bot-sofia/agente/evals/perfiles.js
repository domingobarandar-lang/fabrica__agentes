// Perfiles de cliente difícil: convierten UN escenario escrito a mano en varias
// conversaciones distintas.
//
// LA IDEA: el cliente escribe su camino feliz (los CU-* del SPEC). El arnés lo
// vuelve a correr con el mismo cliente escribiendo mal, partiendo el mensaje en
// cuatro, arrepintiéndose o pidiendo un humano. Escribir eso a mano por cada
// caso de uso es lo que nadie hace, y por eso no se probaba.
//
// LA PROPIEDAD QUE HAY QUE PRESERVAR: ningún perfil puede desbalancear el guión
// del mock. O no agrega turnos (identidad, partir, ensuciar, invertir), o el
// turno que agrega trae su propia respuesta (`respuesta_generica`), o lo
// resuelve el núcleo sin llamar al modelo (pedir un humano). Un perfil nuevo
// que no cumpla esto hace fallar el mock con "el guión se quedó sin respuestas".
//
// Los datos viven en perfiles/_base.json; acá solo están los transformadores.

const fs   = require('fs');
const path = require('path');

const RUTA_BASE = path.join(__dirname, 'perfiles', '_base.json');

/**
 * Carga el catálogo base y, si se pide, uno propio del cliente.
 * @param {string[]} [rutasExtra] rutas a JSON con la misma forma que _base.json
 */
function cargarCatalogo(rutasExtra = []) {
  const leer = (ruta) => {
    if (!fs.existsSync(ruta)) throw new Error(`No encuentro el catálogo de perfiles: ${ruta}`);
    return JSON.parse(fs.readFileSync(ruta, 'utf8')).perfiles || [];
  };
  const porId = new Map();
  for (const p of leer(RUTA_BASE)) porId.set(p.id, p);
  // Los del cliente pisan a los base si repiten id: así se ajusta un perfil sin
  // tocar el núcleo.
  for (const ruta of rutasExtra) for (const p of leer(ruta)) porId.set(p.id, p);
  return [...porId.values()];
}

// ─── Transformadores ─────────────────────────────────────────────────────────
// Cada uno recibe los turnos NORMALIZADOS y devuelve turnos normalizados.
// Turno normalizado: { partes: string[], modelo: [], despues?, origen, inyectado }
//   partes  — los mensajes que el cliente manda; más de uno = van seguidos.
//   origen  — índice del turno ORIGINAL, o null si lo insertó el perfil.
//             El runner usa esto para que ctx.respuestas[i] siga apuntando al
//             turno i del escenario, aunque el perfil haya metido turnos en
//             medio. Sin eso, cada expect() del cliente se rompería por perfil.

const identidad = (turnos) => turnos;

function partir_turnos(turnos, op = {}) {
  const separadores = op.separadores || [', '];
  const max = op.max_partes || 4;
  return turnos.map((t) => {
    if (t.partes.length > 1) return t;           // ya venía partido
    let partes = [t.partes[0]];
    for (const sep of separadores) {
      partes = partes.flatMap((p) => p.split(sep));
      if (partes.length >= max) break;
    }
    partes = partes.map((p) => p.trim()).filter(Boolean).slice(0, max);
    return { ...t, partes: partes.length ? partes : t.partes };
  });
}

const TILDES = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n', Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N' };

function ensuciar(texto, op = {}) {
  let t = texto;
  if (op.minusculas) t = t.toLowerCase();
  if (op.quitar_tildes) t = t.replace(/[áéíóúüñÁÉÍÓÚÑ]/g, (c) => TILDES[c] || c);
  if (op.quitar_signos_apertura) t = t.replace(/[¿¡]/g, '');
  for (const [de, a] of op.sustituciones || []) t = t.split(de).join(a);
  return t;
}

function ensuciar_ortografia(turnos, op = {}) {
  return turnos.map((t) => ({ ...t, partes: t.partes.map((p) => ensuciar(p, op)) }));
}

function invertir_fragmentos(turnos, op = {}) {
  const separadores = op.separadores || [', '];
  return turnos.map((t) => ({
    ...t,
    partes: t.partes.map((p) => {
      for (const sep of separadores) {
        const frag = p.split(sep);
        if (frag.length > 1) return frag.reverse().join(sep);
      }
      return p;
    }),
  }));
}

function repetir_ultimo(turnos, op = {}) {
  if (!turnos.length) return turnos;
  const ultimo = turnos[turnos.length - 1];
  const copias = Array.from({ length: op.veces ?? 1 }, () => ({
    ...ultimo,
    // Mismo guión: el mock lo vuelve a servir, así la tool se ejecuta DE NUEVO.
    // Ahí es donde se ve si es idempotente o si duplica.
    origen: null,
    inyectado: true,
    despues: undefined,
  }));
  return [...turnos, ...copias];
}

function insertar_turno(turnos, op = {}) {
  const nuevo = {
    partes: [op.texto],
    modelo: op.respuesta_generica ? [{ text: op.respuesta_generica }] : [],
    origen: null,
    inyectado: true,
    espera_derivacion: !!op.espera_derivacion,
  };
  // "penultimo" = justo antes del último turno, que es donde suele estar la
  // confirmación. Con un solo turno no hay "antes del último" que no sea el
  // principio, así que va primero.
  const corte = op.posicion === 'penultimo' ? Math.max(0, turnos.length - 1) : turnos.length;
  return [...turnos.slice(0, corte), nuevo, ...turnos.slice(corte)];
}

const TRANSFORMACIONES = {
  identidad,
  partir_turnos,
  ensuciar_ortografia,
  invertir_fragmentos,
  repetir_ultimo,
  insertar_turno,
};

/** Normaliza los turnos que escribió el cliente a la forma interna. */
function normalizar(turnos) {
  return turnos.map((t, i) => ({
    partes: Array.isArray(t.user) ? [...t.user] : [t.user],
    modelo: t.modelo || [],
    despues: t.despues,
    origen: i,
    inyectado: false,
  }));
}

/**
 * Deriva la conversación de `escenario` bajo `perfil`.
 * @returns {{ turnos: object[], ventanaMs: number|null }}
 */
function derivar(escenario, perfil) {
  const transformar = TRANSFORMACIONES[perfil.transformacion];
  if (!transformar) {
    throw new Error(
      `El perfil "${perfil.id}" pide la transformación "${perfil.transformacion}", que no existe en evals/perfiles.js`
    );
  }
  return {
    turnos: transformar(normalizar(escenario.turnos), perfil.opciones || {}),
    ventanaMs: perfil.opciones?.ventana_ms ?? null,
  };
}

module.exports = { cargarCatalogo, derivar, TRANSFORMACIONES, RUTA_BASE };
