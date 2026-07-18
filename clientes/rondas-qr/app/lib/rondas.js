// Motor de rondas: iniciar ejecución, registrar escaneos, cerrar y evaluar.
// Todas las operaciones son idempotentes para soportar el reenvío desde la
// cola offline del teléfono (mismo evento dos veces = mismo resultado).
const { id, interpretarCodigo } = require('./codigos');

// Verificación de presencia (CU-16): una marca queda "lejos del punto" si la
// distancia supera RADIO_OK_M más el margen de precisión que informa el GPS
// del teléfono (acotado a MARGEN_PRECISION_MAX_M para que un GPS malo no
// convierta cualquier distancia en válida).
const RADIO_OK_M = 75;
const MARGEN_PRECISION_MAX_M = 50;

function puntosDeRonda(db, ronda) {
  return ronda.puntoIds
    .map(pid => db.puntos.find(p => p.id === pid))
    .filter(Boolean);
}

// Distancia haversine en metros entre {lat, lon}.
function distanciaM(a, b) {
  const rad = x => (x * Math.PI) / 180;
  const R = 6371000;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)));
}

// Normaliza el GPS que manda el teléfono; null si no viene o viene inválido.
function limpiarGps(gps) {
  if (!gps || typeof gps !== 'object') return null;
  const lat = Number(gps.lat);
  const lon = Number(gps.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const acc = Number(gps.acc);
  return { lat, lon, acc: Number.isFinite(acc) ? Math.round(acc) : null };
}

function iniciarEjecucion(db, { ejecucionId, rondaId, guardia, inicio, offline }) {
  const ronda = db.rondas.find(r => r.id === rondaId);
  if (!ronda) return { error: 'La ronda no existe.', codigo: 404 };
  if (ronda.condominioId !== guardia.condominioId) {
    return { error: 'Esa ronda no es de tu condominio.', codigo: 403 };
  }
  if (ejecucionId && !/^[0-9a-zA-Z-]{8,40}$/.test(ejecucionId)) {
    return { error: 'Identificador de ejecución inválido.', codigo: 422 };
  }
  if (ejecucionId) {
    const existente = db.ejecuciones.find(e => e.id === ejecucionId);
    if (existente) return { ejecucion: existente, repetida: true };
  }
  const ejecucion = {
    id: ejecucionId || id(),
    rondaId,
    condominioId: ronda.condominioId,
    guardiaId: guardia.id,
    inicio: inicio || new Date().toISOString(),
    fin: null,
    estado: 'en_curso',
    escaneos: [],
    evaluacion: null
  };
  db.ejecuciones.push(ejecucion);
  return { ejecucion };
}

function avance(ejecucion, ronda) {
  return { hechos: ejecucion.escaneos.length, total: ronda.puntoIds.length };
}

function registrarEscaneo(db, ejecucion, { codigo, ts, offline, gps }) {
  if (ejecucion.estado !== 'en_curso') return { error: 'La ronda ya está cerrada.', codigo: 409 };
  const interpretado = interpretarCodigo(codigo);
  if (!interpretado) return { error: 'Código no reconocido.', codigo: 422 };

  const ronda = db.rondas.find(r => r.id === ejecucion.rondaId);
  let punto = null;
  if (interpretado.tipo === 'qr') {
    // El payload debe calzar completo (id + código corto): un QR forjado con
    // un id real pero código incorrecto no pasa.
    punto = db.puntos.find(p => p.id === interpretado.puntoId && p.codigoCorto === interpretado.codigoCorto);
  } else {
    // Entrada manual: el código corto se busca solo dentro del condominio de la ronda.
    punto = db.puntos.find(p => p.condominioId === ejecucion.condominioId && p.codigoCorto === interpretado.codigoCorto);
  }
  if (!punto) return { error: 'Ese código no corresponde a ningún punto de control.', codigo: 422 };
  if (punto.condominioId !== ejecucion.condominioId) {
    return { error: 'Ese punto es de otro condominio.', codigo: 422 };
  }
  if (!ronda.puntoIds.includes(punto.id)) {
    return { error: `"${punto.nombre}" no es parte de esta ronda.`, codigo: 422 };
  }
  const previo = ejecucion.escaneos.find(e => e.puntoId === punto.id);
  if (previo) return { duplicado: true, punto, avance: avance(ejecucion, ronda) };

  ejecucion.escaneos.push({
    puntoId: punto.id,
    ts: ts || new Date().toISOString(),
    offline: Boolean(offline),
    gps: limpiarGps(gps)
  });
  return { punto, avance: avance(ejecucion, ronda) };
}

function cerrarEjecucion(db, ejecucion, { fin } = {}) {
  if (ejecucion.estado !== 'en_curso') return { ejecucion, repetida: true };
  const ronda = db.rondas.find(r => r.id === ejecucion.rondaId);
  ejecucion.fin = fin || new Date().toISOString();
  ejecucion.evaluacion = evaluar(db, ejecucion, ronda);
  ejecucion.estado = ejecucion.evaluacion.faltantes.length
    ? 'incompleta'
    : (ejecucion.evaluacion.observaciones.length ? 'completa_obs' : 'completa');
  return { ejecucion };
}

function evaluar(db, ejecucion, ronda) {
  const escaneados = new Set(ejecucion.escaneos.map(e => e.puntoId));
  const faltantes = ronda.puntoIds.filter(pid => !escaneados.has(pid));
  const observaciones = [];

  // Orden (solo rondas estrictas): un punto queda "fuera de orden" si se marcó
  // después que otro que venía más adelante en la secuencia definida.
  const fueraDeOrden = [];
  if (ronda.ordenEstricto) {
    let maxIndice = -1;
    const porTs = [...ejecucion.escaneos].sort((a, b) => a.ts.localeCompare(b.ts));
    for (const esc of porTs) {
      const indice = ronda.puntoIds.indexOf(esc.puntoId);
      if (indice < maxIndice) fueraDeOrden.push(esc.puntoId);
      else maxIndice = indice;
    }
    if (fueraDeOrden.length) {
      observaciones.push(`Orden de la ronda no respetado en: ${nombres(db, fueraDeOrden)}.`);
    }
  }

  // Verificación de presencia (solo puntos con ubicación fijada por el admin).
  const gpsLejos = [];
  const sinGps = [];
  for (const esc of ejecucion.escaneos) {
    const punto = db.puntos.find(p => p.id === esc.puntoId);
    if (!punto || punto.lat == null || punto.lon == null) continue;
    if (esc.gps) {
      const d = distanciaM({ lat: esc.gps.lat, lon: esc.gps.lon }, { lat: punto.lat, lon: punto.lon });
      esc.distanciaM = d;
      const margen = RADIO_OK_M + Math.min(esc.gps.acc || 0, MARGEN_PRECISION_MAX_M);
      if (d > margen) gpsLejos.push({ puntoId: esc.puntoId, distanciaM: d });
    } else {
      sinGps.push(esc.puntoId);
    }
  }
  if (gpsLejos.length) {
    const detalle = gpsLejos
      .map(l => `${nombres(db, [l.puntoId])} (a ${l.distanciaM} m)`)
      .join(', ');
    observaciones.push(`📍 Marcas LEJOS del punto: ${detalle}.`);
  }
  if (sinGps.length) {
    observaciones.push(`Marcas sin ubicación GPS en puntos verificables: ${nombres(db, sinGps)}.`);
  }

  const duracionMin = Math.max(0, Math.round((new Date(ejecucion.fin) - new Date(ejecucion.inicio)) / 60000));
  if (ronda.duracionMaxMin && duracionMin > ronda.duracionMaxMin) {
    observaciones.push(`La ronda tomó ${duracionMin} min (máximo definido: ${ronda.duracionMaxMin} min).`);
  }
  if (ejecucion.escaneos.some(e => e.offline)) {
    observaciones.push('Incluye marcas hechas sin conexión (hora tomada del teléfono del guardia).');
  }

  return { faltantes, fueraDeOrden, gpsLejos, sinGps, duracionMin, observaciones };
}

function nombres(db, puntoIds) {
  return puntoIds
    .map(pid => (db.puntos.find(p => p.id === pid) || { nombre: pid }).nombre)
    .join(', ');
}

module.exports = {
  iniciarEjecucion, registrarEscaneo, cerrarEjecucion, puntosDeRonda, nombres,
  distanciaM, RADIO_OK_M
};
