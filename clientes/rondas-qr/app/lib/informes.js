// Informe de una ejecución: estructura de datos + versión en texto plano
// (para Telegram y consola). El HTML imprimible lo arma el navegador en
// public/informe.html a partir del JSON.
const ETIQUETAS = {
  completa: 'Completa',
  completa_obs: 'Completa con observaciones',
  incompleta: 'INCOMPLETA',
  en_curso: 'En curso'
};

function armarInforme(db, ejecucion) {
  const ronda = db.rondas.find(r => r.id === ejecucion.rondaId) || { puntoIds: [] };
  const condominio = db.condominios.find(c => c.id === ejecucion.condominioId) || {};
  const guardia = db.usuarios.find(u => u.id === ejecucion.guardiaId) || {};
  const escaneosPorPunto = new Map(ejecucion.escaneos.map(e => [e.puntoId, e]));

  const detalle = (ronda.puntoIds || []).map((pid, i) => {
    const punto = db.puntos.find(p => p.id === pid) || { id: pid, nombre: '(punto eliminado)' };
    const esc = escaneosPorPunto.get(pid);
    return {
      orden: i + 1,
      puntoId: pid,
      nombre: punto.nombre,
      hora: esc ? esc.ts : null,
      offline: esc ? esc.offline : false,
      faltante: !esc
    };
  });

  return {
    id: ejecucion.id,
    condominio: condominio.nombre,
    ronda: ronda.nombre,
    guardia: guardia.nombre || guardia.usuario,
    inicio: ejecucion.inicio,
    fin: ejecucion.fin,
    estado: ejecucion.estado,
    etiqueta: ETIQUETAS[ejecucion.estado] || ejecucion.estado,
    evaluacion: ejecucion.evaluacion,
    detalle
  };
}

function hora(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-CL', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function informeTexto(inf) {
  const lineas = [];
  lineas.push(`🛡️ Ronda "${inf.ronda}" — ${inf.condominio}`);
  lineas.push(`Guardia: ${inf.guardia}`);
  lineas.push(`Estado: ${inf.etiqueta}`);
  const duracion = inf.evaluacion ? `${inf.evaluacion.duracionMin} min` : '—';
  lineas.push(`Inicio: ${hora(inf.inicio)} · Fin: ${hora(inf.fin)} · Duración: ${duracion}`);
  lineas.push('');
  for (const d of inf.detalle) {
    lineas.push(d.faltante
      ? `❌ ${d.orden}. ${d.nombre} — FALTANTE`
      : `✅ ${d.orden}. ${d.nombre} — ${hora(d.hora)}${d.offline ? ' (offline)' : ''}`);
  }
  if (inf.evaluacion && inf.evaluacion.observaciones.length) {
    lineas.push('');
    lineas.push('Observaciones:');
    for (const o of inf.evaluacion.observaciones) lineas.push(`• ${o}`);
  }
  return lineas.join('\n');
}

module.exports = { armarInforme, informeTexto, ETIQUETAS, hora };
