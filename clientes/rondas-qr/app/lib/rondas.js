// Motor de rondas: iniciar ejecución, registrar escaneos, cerrar y evaluar.
// Todas las operaciones son idempotentes para soportar el reenvío desde la
// cola offline del teléfono (mismo evento dos veces = mismo resultado).
const { id, interpretarCodigo } = require('./codigos');

function puntosDeRonda(db, ronda) {
  return ronda.puntoIds
    .map(pid => db.puntos.find(p => p.id === pid))
    .filter(Boolean);
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

function registrarEscaneo(db, ejecucion, { codigo, ts, offline }) {
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
    offline: Boolean(offline)
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

  const duracionMin = Math.max(0, Math.round((new Date(ejecucion.fin) - new Date(ejecucion.inicio)) / 60000));
  if (ronda.duracionMaxMin && duracionMin > ronda.duracionMaxMin) {
    observaciones.push(`La ronda tomó ${duracionMin} min (máximo definido: ${ronda.duracionMaxMin} min).`);
  }
  if (ejecucion.escaneos.some(e => e.offline)) {
    observaciones.push('Incluye marcas hechas sin conexión (hora tomada del teléfono del guardia).');
  }

  return { faltantes, fueraDeOrden, duracionMin, observaciones };
}

function nombres(db, puntoIds) {
  return puntoIds
    .map(pid => (db.puntos.find(p => p.id === pid) || { nombre: pid }).nombre)
    .join(', ');
}

module.exports = { iniciarEjecucion, registrarEscaneo, cerrarEjecucion, puntosDeRonda, nombres };
