// Panel del administrador — sesión separada de la app del guardia.
'use strict';

const CLAVE_ADMIN = 'rondasqr-admin';
let sesion = cargarSesion();
let secuencia = [];        // puntoIds elegidos para la ronda en edición
let puntosCache = [];
let rondaEnEdicion = null; // id de la ronda que se está editando

const $ = id => document.getElementById(id);

function cargarSesion() {
  try { return JSON.parse(localStorage.getItem(CLAVE_ADMIN) || 'null'); }
  catch { return null; }
}
function guardarSesion() {
  if (sesion) localStorage.setItem(CLAVE_ADMIN, JSON.stringify(sesion));
  else localStorage.removeItem(CLAVE_ADMIN);
}

let avisoTimer = null;
function aviso(texto, tipo = 'ok') {
  const el = $('aviso');
  el.textContent = texto;
  el.className = `aviso aviso-${tipo}`;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.add('oculta'), 3000);
}

async function api(ruta, opciones = {}) {
  const cabeceras = { 'content-type': 'application/json' };
  if (sesion) cabeceras.authorization = `Bearer ${sesion.token}`;
  const resp = await fetch(ruta, {
    method: opciones.metodo || 'GET',
    headers: cabeceras,
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined
  });
  const datos = await resp.json().catch(() => ({}));
  if (resp.status === 401) {
    sesion = null;
    guardarSesion();
    render();
    throw new Error(datos.error || 'Sesión caducada.');
  }
  if (!resp.ok) throw new Error(datos.error || `Error HTTP ${resp.status}`);
  return datos;
}

function fecha(ts) {
  return ts ? new Date(ts).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}

function esc(texto) {
  const div = document.createElement('div');
  div.textContent = String(texto == null ? '' : texto);
  return div.innerHTML;
}

// ---------- Login ----------

async function entrar() {
  $('error-login').classList.add('oculta');
  try {
    const r = await api('/api/login', {
      metodo: 'POST',
      cuerpo: { usuario: $('campo-usuario').value, pin: $('campo-pin').value }
    });
    if (r.rol !== 'admin') {
      $('error-login').textContent = 'Esta pantalla es solo para administradores. Los guardias usan la app principal.';
      $('error-login').classList.remove('oculta');
      return;
    }
    sesion = r;
    guardarSesion();
    render();
  } catch (err) {
    $('error-login').textContent = err.message || 'No se pudo conectar.';
    $('error-login').classList.remove('oculta');
  }
}

function salir() {
  api('/api/logout', { metodo: 'POST' }).catch(() => {});
  sesion = null;
  guardarSesion();
  render();
}

// ---------- Pestañas ----------

function mostrarTab(nombre) {
  for (const t of document.querySelectorAll('.tab')) t.classList.add('oculta');
  for (const p of document.querySelectorAll('.pestana')) p.classList.remove('activa');
  $(`tab-${nombre}`).classList.remove('oculta');
  document.querySelector(`.pestana[data-tab="${nombre}"]`).classList.add('activa');
  ({ informes: cargarInformes, puntos: cargarPuntos, guardias: cargarGuardias, rondas: cargarRondas, avisos: cargarAvisos })[nombre]();
}

// ---------- Informes ----------

const CHIPS = {
  completa: '<span class="chip chip-verde">Completa</span>',
  completa_obs: '<span class="chip chip-ambar">Con observaciones</span>',
  incompleta: '<span class="chip chip-roja">INCOMPLETA</span>',
  en_curso: '<span class="chip">En curso</span>'
};

async function cargarInformes() {
  const lista = await api('/api/admin/ejecuciones');
  if (!lista.length) {
    $('tabla-informes').innerHTML = '<p class="nota">Todavía no hay rondas registradas.</p>';
    return;
  }
  const filas = lista.map(e => `
    <tr>
      <td>${fecha(e.inicio)}</td>
      <td>${esc(e.ronda)}</td>
      <td>${esc(e.guardia)}</td>
      <td>${e.hechos}/${e.total}</td>
      <td>${CHIPS[e.estado] || esc(e.estado)}</td>
      <td>
        ${e.estado === 'en_curso'
          ? `<button class="btn btn-borde btn-chico" data-cerrar="${e.id}">Cerrar</button>`
          : `<a class="btn btn-borde btn-chico" href="informe.html?id=${e.id}" target="_blank">Ver informe</a>`}
      </td>
    </tr>`).join('');
  $('tabla-informes').innerHTML = `
    <table>
      <thead><tr><th>Inicio</th><th>Ronda</th><th>Guardia</th><th>Puntos</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
  for (const btn of $('tabla-informes').querySelectorAll('[data-cerrar]')) {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Cerrar esta ronda ahora? Se evaluará con lo que el guardia haya marcado hasta el momento.')) return;
      try {
        await api(`/api/admin/ejecuciones/${btn.dataset.cerrar}/cerrar`, { metodo: 'POST' });
        aviso('Ronda cerrada y informe generado.');
        cargarInformes();
      } catch (err) { aviso(err.message, 'error'); }
    });
  }
}

// ---------- Puntos ----------

async function cargarPuntos() {
  puntosCache = await api('/api/admin/puntos');
  if (!puntosCache.length) {
    $('tabla-puntos').innerHTML = '<p class="nota">Aún no hay puntos. Agrega el primero arriba.</p>';
    return;
  }
  const filas = puntosCache.map(p => `
    <tr>
      <td>${esc(p.nombre)}</td>
      <td><code>${esc(p.codigoCorto)}</code></td>
      <td>${p.lat != null
        ? `<a href="https://maps.google.com/?q=${p.lat},${p.lon}" target="_blank">📍 ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</a>`
        : '<span class="nota">sin verificar</span>'}</td>
      <td>
        <button class="btn btn-borde btn-chico" data-ubicar="${p.id}">📍 Fijar aquí</button>
        ${p.lat != null ? `<button class="btn btn-borde btn-chico" data-desubicar="${p.id}">Quitar 📍</button>` : ''}
        <button class="btn btn-borde btn-chico" data-renombrar="${p.id}">Renombrar</button>
        <button class="btn btn-peligro btn-chico" data-eliminar="${p.id}">Eliminar</button>
      </td>
    </tr>`).join('');
  $('tabla-puntos').innerHTML = `
    <table>
      <thead><tr><th>Punto</th><th>Código</th><th>Ubicación (verificación GPS)</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
  for (const btn of $('tabla-puntos').querySelectorAll('[data-ubicar]')) {
    btn.addEventListener('click', () => {
      const punto = puntosCache.find(p => p.id === btn.dataset.ubicar);
      if (!('geolocation' in navigator)) return aviso('Este navegador no entrega ubicación.', 'error');
      if (!confirm(`Fijar la ubicación de "${punto.nombre}" en donde estás parado AHORA.\n\nHazlo desde un teléfono, de pie junto al punto. ¿Continuar?`)) return;
      aviso('Obteniendo ubicación…');
      navigator.geolocation.getCurrentPosition(async pos => {
        try {
          await api(`/api/admin/puntos/${punto.id}`, {
            metodo: 'PUT',
            cuerpo: { lat: pos.coords.latitude, lon: pos.coords.longitude }
          });
          aviso('Ubicación fijada: las marcas en este punto ahora se verifican por distancia.');
          cargarPuntos();
        } catch (err) { aviso(err.message, 'error'); }
      }, () => aviso('No se pudo obtener la ubicación (¿permiso denegado?).', 'error'),
        { enableHighAccuracy: true, timeout: 15000 });
    });
  }
  for (const btn of $('tabla-puntos').querySelectorAll('[data-desubicar]')) {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Quitar la ubicación? Las marcas en este punto dejarán de verificarse por GPS.')) return;
      try {
        await api(`/api/admin/puntos/${btn.dataset.desubicar}`, { metodo: 'PUT', cuerpo: { quitarUbicacion: true } });
        cargarPuntos();
      } catch (err) { aviso(err.message, 'error'); }
    });
  }
  for (const btn of $('tabla-puntos').querySelectorAll('[data-renombrar]')) {
    btn.addEventListener('click', async () => {
      const punto = puntosCache.find(p => p.id === btn.dataset.renombrar);
      const nombre = prompt('Nuevo nombre del punto:', punto.nombre);
      if (!nombre) return;
      try {
        await api(`/api/admin/puntos/${punto.id}`, { metodo: 'PUT', cuerpo: { nombre } });
        cargarPuntos();
      } catch (err) { aviso(err.message, 'error'); }
    });
  }
  for (const btn of $('tabla-puntos').querySelectorAll('[data-eliminar]')) {
    btn.addEventListener('click', async () => {
      const punto = puntosCache.find(p => p.id === btn.dataset.eliminar);
      if (!confirm(`¿Eliminar "${punto.nombre}"? También saldrá de las rondas que lo incluyan.`)) return;
      try {
        await api(`/api/admin/puntos/${punto.id}`, { metodo: 'DELETE' });
        cargarPuntos();
      } catch (err) { aviso(err.message, 'error'); }
    });
  }
}

// ---------- Guardias ----------

async function cargarGuardias() {
  const guardias = await api('/api/admin/guardias');
  if (!guardias.length) {
    $('tabla-guardias').innerHTML = '<p class="nota">Aún no hay guardias registrados.</p>';
    return;
  }
  const filas = guardias.map(g => `
    <tr>
      <td>${esc(g.nombre)}</td>
      <td><code>${esc(g.usuario)}</code></td>
      <td>
        <button class="btn btn-borde btn-chico" data-pin="${g.id}">Nuevo PIN</button>
        <button class="btn btn-peligro btn-chico" data-eliminar="${g.id}">Eliminar</button>
      </td>
    </tr>`).join('');
  $('tabla-guardias').innerHTML = `
    <table>
      <thead><tr><th>Nombre</th><th>Usuario</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
  for (const btn of $('tabla-guardias').querySelectorAll('[data-pin]')) {
    btn.addEventListener('click', async () => {
      const pin = prompt('Nuevo PIN (4 a 8 dígitos):');
      if (!pin) return;
      try {
        await api(`/api/admin/guardias/${btn.dataset.pin}`, { metodo: 'PUT', cuerpo: { pin } });
        aviso('PIN actualizado.');
      } catch (err) { aviso(err.message, 'error'); }
    });
  }
  for (const btn of $('tabla-guardias').querySelectorAll('[data-eliminar]')) {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este guardia? No podrá volver a entrar.')) return;
      try {
        await api(`/api/admin/guardias/${btn.dataset.eliminar}`, { metodo: 'DELETE' });
        cargarGuardias();
      } catch (err) { aviso(err.message, 'error'); }
    });
  }
}

// ---------- Rondas ----------

async function cargarRondas() {
  puntosCache = await api('/api/admin/puntos');
  pintarEditorRonda();
  const rondas = await api('/api/admin/rondas');
  if (!rondas.length) {
    $('tabla-rondas').innerHTML = '<p class="nota">Aún no hay rondas definidas.</p>';
    return;
  }
  const nombrePunto = pid => (puntosCache.find(p => p.id === pid) || { nombre: '(eliminado)' }).nombre;
  const filas = rondas.map(r => `
    <tr>
      <td><strong>${esc(r.nombre)}</strong><br><span class="nota">${r.puntoIds.map(nombrePunto).map(esc).join(' → ')}</span></td>
      <td>${r.ordenEstricto ? 'Estricta' : 'Orden libre'}${r.duracionMaxMin ? ` · máx ${r.duracionMaxMin} min` : ''}</td>
      <td>
        <button class="btn btn-borde btn-chico" data-editar="${r.id}">Editar</button>
        <button class="btn btn-peligro btn-chico" data-eliminar="${r.id}">Eliminar</button>
      </td>
    </tr>`).join('');
  $('tabla-rondas').innerHTML = `
    <table>
      <thead><tr><th>Ronda</th><th>Reglas</th><th></th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
  for (const btn of $('tabla-rondas').querySelectorAll('[data-editar]')) {
    btn.addEventListener('click', () => {
      const r = rondas.find(x => x.id === btn.dataset.editar);
      rondaEnEdicion = r.id;
      $('ronda-nombre').value = r.nombre;
      $('ronda-estricta').checked = Boolean(r.ordenEstricto);
      $('ronda-duracion').value = r.duracionMaxMin || '';
      secuencia = [...r.puntoIds];
      pintarEditorRonda();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  for (const btn of $('tabla-rondas').querySelectorAll('[data-eliminar]')) {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta ronda? Los informes ya generados se conservan.')) return;
      try {
        await api(`/api/admin/rondas/${btn.dataset.eliminar}`, { metodo: 'DELETE' });
        cargarRondas();
      } catch (err) { aviso(err.message, 'error'); }
    });
  }
}

function pintarEditorRonda() {
  const disponibles = $('puntos-disponibles');
  disponibles.innerHTML = '';
  for (const p of puntosCache) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-punto';
    btn.textContent = p.nombre;
    btn.disabled = secuencia.includes(p.id);
    btn.addEventListener('click', () => { secuencia.push(p.id); pintarEditorRonda(); });
    disponibles.appendChild(btn);
  }
  const ol = $('secuencia');
  ol.innerHTML = '';
  secuencia.forEach((pid, i) => {
    const p = puntosCache.find(x => x.id === pid);
    const li = document.createElement('li');
    li.innerHTML = `${esc(p ? p.nombre : pid)} <button type="button" class="quitar" title="Quitar">✕</button>`;
    li.querySelector('.quitar').addEventListener('click', () => { secuencia.splice(i, 1); pintarEditorRonda(); });
    ol.appendChild(li);
  });
  if (!secuencia.length) ol.innerHTML = '<li class="nota vacio">Toca puntos de la izquierda para armar la secuencia.</li>';
  $('btn-guardar-ronda').textContent = rondaEnEdicion ? 'Guardar cambios' : 'Guardar ronda';
}

async function guardarRonda() {
  const cuerpo = {
    nombre: $('ronda-nombre').value,
    puntoIds: secuencia,
    ordenEstricto: $('ronda-estricta').checked,
    duracionMaxMin: $('ronda-duracion').value ? Number($('ronda-duracion').value) : null
  };
  try {
    if (rondaEnEdicion) await api(`/api/admin/rondas/${rondaEnEdicion}`, { metodo: 'PUT', cuerpo });
    else await api('/api/admin/rondas', { metodo: 'POST', cuerpo });
    aviso('Ronda guardada. Los guardias la verán al actualizar sus rondas.');
    limpiarEditorRonda();
    cargarRondas();
  } catch (err) { aviso(err.message, 'error'); }
}

function limpiarEditorRonda() {
  rondaEnEdicion = null;
  secuencia = [];
  $('ronda-nombre').value = '';
  $('ronda-estricta').checked = false;
  $('ronda-duracion').value = '';
  pintarEditorRonda();
}

// ---------- Avisos ----------

async function cargarAvisos() {
  const avisos = await api('/api/admin/notificaciones');
  if (!avisos.length) {
    $('lista-avisos').innerHTML = '<p class="nota">Todavía no hay avisos. Se generan al cerrar cada ronda.</p>';
    return;
  }
  $('lista-avisos').innerHTML = avisos.map(n => `
    <div class="aviso-tarjeta">
      <div class="nota">${fecha(n.ts)} · vía ${n.medio}${n.error ? ` · <span class="rojo">error: ${esc(n.error)}</span>` : ''}</div>
      <pre>${esc(n.texto)}</pre>
    </div>`).join('');
}

// ---------- Render y arranque ----------

function render() {
  if (!sesion) {
    $('vista-login').classList.remove('oculta');
    $('vista-panel').classList.add('oculta');
    return;
  }
  $('vista-login').classList.add('oculta');
  $('vista-panel').classList.remove('oculta');
  $('texto-condominio').textContent = ` · ${sesion.condominio.nombre}`;
  mostrarTab('informes');
}

document.addEventListener('DOMContentLoaded', () => {
  $('btn-login').addEventListener('click', entrar);
  $('campo-pin').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
  $('btn-salir').addEventListener('click', salir);
  for (const p of document.querySelectorAll('.pestana')) {
    p.addEventListener('click', () => mostrarTab(p.dataset.tab));
  }
  $('form-punto').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/admin/puntos', { metodo: 'POST', cuerpo: { nombre: $('punto-nombre').value } });
      $('punto-nombre').value = '';
      aviso('Punto creado. Reimprime la hoja de QR para pegarlo.');
      cargarPuntos();
    } catch (err) { aviso(err.message, 'error'); }
  });
  $('form-guardia').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/admin/guardias', {
        metodo: 'POST',
        cuerpo: { usuario: $('guardia-usuario').value, nombre: $('guardia-nombre').value, pin: $('guardia-pin').value }
      });
      $('guardia-usuario').value = $('guardia-nombre').value = $('guardia-pin').value = '';
      aviso('Guardia creado.');
      cargarGuardias();
    } catch (err) { aviso(err.message, 'error'); }
  });
  $('btn-guardar-ronda').addEventListener('click', guardarRonda);
  $('btn-limpiar-ronda').addEventListener('click', limpiarEditorRonda);
  $('btn-guardar-chatid').addEventListener('click', async () => {
    try {
      await api('/api/admin/telegram', { metodo: 'PUT', cuerpo: { chatId: $('campo-chatid').value } });
      aviso('Guardado. Si el servidor tiene el bot configurado, los próximos informes llegarán por Telegram.');
    } catch (err) { aviso(err.message, 'error'); }
  });
  render();
});
