// PWA del guardia — local-first:
// - El paquete de rondas se descarga al entrar y queda en localStorage.
// - Los escaneos se validan localmente contra el paquete y se ENCOLAN.
// - Una cola de eventos idempotentes (iniciar / escaneo / cerrar) se reenvía
//   al servidor cada pocos segundos; si no hay señal, se reintenta después.
'use strict';

const CLAVE = 'rondasqr';

let estado = cargarEstado();
let sincronizando = false;
let stream = null;
let escaneando = false;
let ultimoCodigoLeido = { valor: null, ts: 0 };
let gpsWatchId = null;
let gpsActual = null;

// ---------- GPS (CU-15): se observa mientras hay ronda activa ----------
// Nunca bloquea una marca: si no hay señal GPS, la marca vale igual.

function iniciarGps() {
  if (gpsWatchId !== null || !('geolocation' in navigator)) return;
  gpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      gpsActual = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        acc: Math.round(pos.coords.accuracy || 0),
        ts: Date.now()
      };
    },
    () => {},
    { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 }
  );
}

function detenerGps() {
  if (gpsWatchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(gpsWatchId);
  }
  gpsWatchId = null;
  gpsActual = null;
}

// Última posición si tiene menos de 1 minuto; si no, nada.
function gpsFresco() {
  if (!gpsActual || Date.now() - gpsActual.ts > 60000) return null;
  return { lat: gpsActual.lat, lon: gpsActual.lon, acc: gpsActual.acc };
}

// ---------- Estado persistente ----------

function cargarEstado() {
  try {
    return Object.assign(
      { sesion: null, paquete: null, ejecucion: null, cola: [], ultimoInforme: null },
      JSON.parse(localStorage.getItem(CLAVE) || '{}')
    );
  } catch {
    return { sesion: null, paquete: null, ejecucion: null, cola: [], ultimoInforme: null };
  }
}

function guardarEstado() {
  localStorage.setItem(CLAVE, JSON.stringify(estado));
}

// ---------- Utilidades ----------

const $ = id => document.getElementById(id);

function mostrarVista(id) {
  for (const v of document.querySelectorAll('.vista')) v.classList.add('oculta');
  $(id).classList.remove('oculta');
}

let avisoTimer = null;
function aviso(texto, tipo = 'info') {
  const el = $('aviso');
  el.textContent = texto;
  el.className = `aviso aviso-${tipo}`;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.add('oculta'), 3200);
}

function hora(ts) {
  return new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function rondaActual() {
  if (!estado.ejecucion || !estado.paquete) return null;
  return estado.paquete.rondas.find(r => r.id === estado.ejecucion.rondaId) || null;
}

async function api(ruta, opciones = {}) {
  const cabeceras = { 'content-type': 'application/json' };
  if (estado.sesion) cabeceras.authorization = `Bearer ${estado.sesion.token}`;
  const resp = await fetch(ruta, {
    method: opciones.metodo || 'GET',
    headers: cabeceras,
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined
  });
  const datos = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(datos.error || `Error HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  return datos;
}

// ---------- Conexión ----------

function pintarConexion() {
  const chip = $('chip-conexion');
  if (navigator.onLine) {
    const pendientes = estado.cola.length;
    chip.textContent = pendientes ? `En línea · ${pendientes} por enviar` : 'En línea';
    chip.className = 'chip chip-ok';
  } else {
    chip.textContent = 'Sin conexión · la ronda sigue';
    chip.className = 'chip chip-off';
  }
}

// ---------- Sesión ----------

async function entrar() {
  const usuario = $('campo-usuario').value.trim();
  const pin = $('campo-pin').value.trim();
  $('error-login').classList.add('oculta');
  if (!usuario || !pin) return;
  try {
    const r = await api('/api/login', { metodo: 'POST', cuerpo: { usuario, pin } });
    if (r.rol === 'admin') {
      location.href = '/admin.html';
      return;
    }
    estado.sesion = r;
    guardarEstado();
    await bajarPaquete(true);
    render();
  } catch (err) {
    const el = $('error-login');
    el.textContent = err.status ? err.message : 'No se pudo conectar al servidor.';
    el.classList.remove('oculta');
  }
}

function salir() {
  if (estado.cola.length && !confirm('Hay marcas sin enviar al servidor. ¿Salir igual?')) return;
  detenerGps();
  api('/api/logout', { metodo: 'POST' }).catch(() => {});
  estado = { sesion: null, paquete: null, ejecucion: null, cola: [], ultimoInforme: null };
  guardarEstado();
  render();
}

async function bajarPaquete(silencioso = false) {
  try {
    estado.paquete = await api('/api/mi/paquete');
    guardarEstado();
    if (!silencioso) aviso('Rondas actualizadas.', 'ok');
  } catch (err) {
    if (!silencioso) aviso('Sin conexión: se usan las rondas ya descargadas.', 'error');
  }
}

// ---------- Ronda ----------

function iniciarRonda(rondaId) {
  const ronda = estado.paquete.rondas.find(r => r.id === rondaId);
  if (!ronda) return;
  if (!ronda.puntos.length) { aviso('Esa ronda no tiene puntos configurados.', 'error'); return; }
  estado.ejecucion = {
    id: crypto.randomUUID(),
    rondaId,
    inicio: new Date().toISOString(),
    escaneos: [],
    cerrada: false
  };
  estado.ultimoInforme = null;
  estado.cola.push({ tipo: 'iniciar', ejecucionId: estado.ejecucion.id, rondaId, inicio: estado.ejecucion.inicio });
  guardarEstado();
  iniciarGps();
  render();
  sincronizar();
}

// Valida un código contra el paquete local y registra la marca.
function procesarCodigo(texto) {
  const ejecucion = estado.ejecucion;
  const ronda = rondaActual();
  if (!ejecucion || !ronda || ejecucion.cerrada) return;

  const limpio = String(texto || '').trim();
  let punto = null;
  if (limpio.toUpperCase().startsWith('RQR:')) {
    punto = ronda.puntos.find(p => p.payload === limpio) || null;
    if (!punto) {
      const esDeOtroLado = !estado.paquete.rondas.some(r => r.puntos.some(p => p.payload === limpio));
      aviso(esDeOtroLado ? 'Ese QR no es de este condominio o no existe.' : 'Ese punto no es parte de esta ronda.', 'error');
      navigator.vibrate && navigator.vibrate([80, 60, 80]);
      return;
    }
  } else {
    const codigo = limpio.toUpperCase();
    punto = ronda.puntos.find(p => p.codigoCorto === codigo) || null;
    if (!punto) {
      aviso('Código no reconocido para esta ronda.', 'error');
      navigator.vibrate && navigator.vibrate([80, 60, 80]);
      return;
    }
  }

  if (ejecucion.escaneos.some(e => e.puntoId === punto.id)) {
    aviso(`"${punto.nombre}" ya estaba marcado.`, 'info');
    return;
  }

  const ts = new Date().toISOString();
  const gps = gpsFresco();
  ejecucion.escaneos.push({ puntoId: punto.id, ts, offline: !navigator.onLine, gps });
  estado.cola.push({
    tipo: 'escaneo',
    ejecucionId: ejecucion.id,
    codigo: limpio,
    ts,
    offline: !navigator.onLine,
    gps
  });
  guardarEstado();
  navigator.vibrate && navigator.vibrate(120);
  aviso(`✅ ${punto.nombre} (${ejecucion.escaneos.length}/${ronda.puntos.length})`, 'ok');
  render();
  sincronizar();
}

function cerrarRonda() {
  const ejecucion = estado.ejecucion;
  const ronda = rondaActual();
  if (!ejecucion || ejecucion.cerrada) return;
  const faltan = ronda.puntos.length - ejecucion.escaneos.length;
  const mensaje = faltan > 0
    ? `Faltan ${faltan} punto(s) por marcar. Si terminas ahora, el informe saldrá INCOMPLETO y se avisará al administrador. ¿Terminar igual?`
    : '¿Terminar la ronda y enviar el informe?';
  if (!confirm(mensaje)) return;
  ejecucion.cerrada = true;
  ejecucion.fin = new Date().toISOString();
  estado.cola.push({ tipo: 'cerrar', ejecucionId: ejecucion.id, fin: ejecucion.fin });
  guardarEstado();
  detenerGps();
  render();
  sincronizar();
}

// ---------- Cola de sincronización ----------

async function sincronizar() {
  if (sincronizando || !estado.sesion || !navigator.onLine) { pintarConexion(); return; }
  sincronizando = true;
  try {
    while (estado.cola.length) {
      const evento = estado.cola[0];
      try {
        if (evento.tipo === 'iniciar') {
          await api('/api/ejecuciones', {
            metodo: 'POST',
            cuerpo: { id: evento.ejecucionId, rondaId: evento.rondaId, inicio: evento.inicio }
          });
        } else if (evento.tipo === 'escaneo') {
          await api(`/api/ejecuciones/${evento.ejecucionId}/escaneos`, {
            metodo: 'POST',
            cuerpo: { codigo: evento.codigo, ts: evento.ts, offline: evento.offline, gps: evento.gps || null }
          });
        } else if (evento.tipo === 'cerrar') {
          const informe = await api(`/api/ejecuciones/${evento.ejecucionId}/cerrar`, {
            metodo: 'POST',
            cuerpo: { fin: evento.fin }
          });
          estado.ultimoInforme = informe;
          if (estado.ejecucion && estado.ejecucion.id === evento.ejecucionId) estado.ejecucion = null;
        }
        estado.cola.shift();
        guardarEstado();
      } catch (err) {
        if (err.status === 401) {
          // Sesión caducada: se conserva la cola y se pide entrar de nuevo.
          estado.sesion = null;
          guardarEstado();
          aviso('La sesión caducó. Entra de nuevo para enviar lo pendiente.', 'error');
          break;
        } else if (err.status) {
          // El servidor rechazó el evento (p. ej. validación): no bloquear la cola.
          console.warn('Evento rechazado por el servidor:', evento, err.message);
          estado.cola.shift();
          guardarEstado();
        } else {
          break; // sin red: reintentar en el próximo ciclo
        }
      }
    }
  } finally {
    sincronizando = false;
    pintarConexion();
    renderSync();
    if (!document.getElementById('vista-final').classList.contains('oculta')) renderFinal();
  }
}

// ---------- Escáner ----------

async function abrirEscaner() {
  $('modal-escaner').classList.remove('oculta');
  escaneando = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 } },
      audio: false
    });
    const video = $('video');
    video.srcObject = stream;
    await video.play();
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      cicloDetector(detector);
    } else {
      cicloJsqr();
    }
  } catch (err) {
    cerrarEscaner();
    aviso('No se pudo abrir la cámara. Usa el código manual.', 'error');
  }
}

function cerrarEscaner() {
  escaneando = false;
  if (stream) {
    for (const pista of stream.getTracks()) pista.stop();
    stream = null;
  }
  $('modal-escaner').classList.add('oculta');
}

function codigoDetectado(valor) {
  // Evita procesar el mismo QR dos veces seguidas mientras sigue en cámara.
  const ahora = Date.now();
  if (valor === ultimoCodigoLeido.valor && ahora - ultimoCodigoLeido.ts < 2500) return;
  ultimoCodigoLeido = { valor, ts: ahora };
  cerrarEscaner();
  procesarCodigo(valor);
}

function cicloDetector(detector) {
  const video = $('video');
  const paso = async () => {
    if (!escaneando) return;
    try {
      const codigos = await detector.detect(video);
      if (codigos.length && codigos[0].rawValue) return codigoDetectado(codigos[0].rawValue);
    } catch {}
    requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

function cicloJsqr() {
  const video = $('video');
  const lienzo = $('lienzo');
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  const paso = () => {
    if (!escaneando) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const escala = 480 / video.videoWidth;
      lienzo.width = 480;
      lienzo.height = Math.round(video.videoHeight * escala);
      ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
      const imagen = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
      const resultado = window.jsQR && window.jsQR(imagen.data, imagen.width, imagen.height, { inversionAttempts: 'dontInvert' });
      if (resultado && resultado.data) return codigoDetectado(resultado.data);
    }
    requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

// ---------- Render ----------

function render() {
  pintarConexion();
  if (!estado.sesion && !estado.paquete) return mostrarVista('vista-login');
  if (!estado.sesion && estado.cola.length) {
    // Sesión caducada con cola pendiente: pedir login sin perder nada.
    mostrarVista('vista-login');
    return;
  }
  if (estado.ejecucion && !estado.ejecucion.cerrada) return renderRonda();
  if (estado.ejecucion && estado.ejecucion.cerrada) return renderFinal();
  if (estado.ultimoInforme) return renderFinal();
  renderInicio();
}

function renderInicio() {
  mostrarVista('vista-inicio');
  $('texto-guardia').textContent = estado.sesion ? estado.sesion.nombre : '';
  $('texto-condominio').textContent = estado.paquete ? estado.paquete.condominio.nombre : '';
  renderSync();

  const contenedor = $('lista-rondas');
  contenedor.innerHTML = '';
  const rondas = estado.paquete ? estado.paquete.rondas : [];
  if (!rondas.length) {
    contenedor.innerHTML = '<p class="nota centrado">No hay rondas configuradas para tu condominio.</p>';
  }
  for (const r of rondas) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'tarjeta';
    const reglas = [
      `${r.puntos.length} puntos`,
      r.ordenEstricto ? 'orden estricto' : 'orden libre',
      r.duracionMaxMin ? `máx ${r.duracionMaxMin} min` : null
    ].filter(Boolean).join(' · ');
    tarjeta.innerHTML = `
      <div class="tarjeta-texto">
        <div class="grande">${r.nombre}</div>
        <div class="nota">${reglas}</div>
      </div>
      <button class="btn btn-principal">Iniciar</button>`;
    tarjeta.querySelector('button').addEventListener('click', () => iniciarRonda(r.id));
    contenedor.appendChild(tarjeta);
  }
  $('texto-paquete').textContent = estado.paquete
    ? `Rondas descargadas: ${new Date(estado.paquete.generado).toLocaleString('es-CL')}`
    : '';
}

function renderSync() {
  const el = $('estado-sync');
  if (!el) return;
  if (estado.cola.length) {
    el.classList.remove('oculta');
    el.textContent = navigator.onLine
      ? `Enviando ${estado.cola.length} registro(s) al servidor…`
      : `${estado.cola.length} registro(s) guardados en el teléfono — se enviarán al volver la señal.`;
  } else {
    el.classList.add('oculta');
  }
}

function renderRonda() {
  mostrarVista('vista-ronda');
  iniciarGps(); // cubre recarga de página con ronda activa
  const ronda = rondaActual();
  const ejecucion = estado.ejecucion;
  $('ronda-nombre').textContent = ronda.nombre;
  const hechos = ejecucion.escaneos.length;
  $('ronda-avance').textContent = `Iniciada ${hora(ejecucion.inicio)}${ronda.ordenEstricto ? ' · orden estricto' : ''}${gpsActual ? ' · 📍 GPS' : ''}`;
  $('ronda-progreso').textContent = `${hechos}/${ronda.puntos.length}`;

  const lista = $('lista-puntos');
  lista.innerHTML = '';
  const marcados = new Map(ejecucion.escaneos.map(e => [e.puntoId, e]));
  ronda.puntos.forEach((p, i) => {
    const esc = marcados.get(p.id);
    const fila = document.createElement('div');
    fila.className = `punto ${esc ? 'punto-hecho' : ''}`;
    fila.innerHTML = `
      <div class="punto-numero">${i + 1}</div>
      <div class="punto-texto">
        <div>${p.nombre}</div>
        <div class="nota">${esc ? `Marcado ${hora(esc.ts)}${esc.offline ? ' (sin señal)' : ''}` : 'Pendiente'}</div>
      </div>
      <div class="punto-check">${esc ? '✅' : '·'}</div>`;
    lista.appendChild(fila);
  });
}

function renderFinal() {
  mostrarVista('vista-final');
  const informe = estado.ultimoInforme;

  if (informe) {
    const etiquetas = { completa: '✅ Ronda completa', completa_obs: '🟡 Completa con observaciones', incompleta: '⚠️ Ronda INCOMPLETA' };
    $('final-titulo').textContent = etiquetas[informe.estado] || informe.estado;
    const faltantes = informe.detalle.filter(d => d.faltante);
    let html = `<p class="nota">${informe.ronda} · ${informe.guardia} · ${informe.evaluacion ? informe.evaluacion.duracionMin + ' min' : ''}</p>`;
    if (faltantes.length) {
      html += `<div class="caja caja-alerta"><strong>Puntos sin marcar:</strong><br>${faltantes.map(f => f.nombre).join('<br>')}</div>`;
    }
    if (informe.evaluacion && informe.evaluacion.observaciones.length) {
      html += `<div class="caja">${informe.evaluacion.observaciones.map(o => `• ${o}`).join('<br>')}</div>`;
    }
    html += '<p class="nota centrado">El informe ya le llegó al administrador.</p>';
    $('final-resumen').innerHTML = html;
    $('final-sync').textContent = '';
    return;
  }

  // Cierre aún no sincronizado: resumen local.
  const ejecucion = estado.ejecucion;
  const ronda = rondaActual();
  if (!ejecucion || !ronda) { renderInicio(); return; }
  const marcados = new Set(ejecucion.escaneos.map(e => e.puntoId));
  const faltantes = ronda.puntos.filter(p => !marcados.has(p.id));
  $('final-titulo').textContent = faltantes.length ? '⚠️ Ronda terminada (incompleta)' : '✅ Ronda terminada';
  $('final-resumen').innerHTML = faltantes.length
    ? `<div class="caja caja-alerta"><strong>Puntos sin marcar:</strong><br>${faltantes.map(f => f.nombre).join('<br>')}</div>`
    : '<div class="caja">Todos los puntos quedaron marcados.</div>';
  $('final-sync').textContent = navigator.onLine
    ? 'Enviando el informe al administrador…'
    : 'Sin señal: el informe se enviará automáticamente al volver la conexión.';
}

function volverAlInicio() {
  estado.ultimoInforme = null;
  if (estado.ejecucion && estado.ejecucion.cerrada && !estado.cola.some(e => e.ejecucionId === estado.ejecucion.id)) {
    estado.ejecucion = null;
  }
  guardarEstado();
  bajarPaquete(true).finally(render);
}

// ---------- Arranque ----------

document.addEventListener('DOMContentLoaded', () => {
  $('btn-login').addEventListener('click', entrar);
  $('campo-pin').addEventListener('keydown', e => { if (e.key === 'Enter') entrar(); });
  $('btn-salir').addEventListener('click', salir);
  $('btn-actualizar').addEventListener('click', () => bajarPaquete().then(render));
  $('btn-escanear').addEventListener('click', abrirEscaner);
  $('btn-cancelar-escaner').addEventListener('click', cerrarEscaner);
  $('btn-manual').addEventListener('click', () => {
    $('campo-codigo').value = '';
    $('modal-manual').classList.remove('oculta');
    $('campo-codigo').focus();
  });
  $('btn-cancelar-manual').addEventListener('click', () => $('modal-manual').classList.add('oculta'));
  $('btn-confirmar-manual').addEventListener('click', () => {
    const codigo = $('campo-codigo').value.trim();
    $('modal-manual').classList.add('oculta');
    if (codigo) procesarCodigo(codigo);
  });
  $('campo-codigo').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-confirmar-manual').click(); });
  $('btn-cerrar-ronda').addEventListener('click', cerrarRonda);
  $('btn-volver').addEventListener('click', volverAlInicio);

  window.addEventListener('online', () => { pintarConexion(); sincronizar(); });
  window.addEventListener('offline', pintarConexion);
  setInterval(sincronizar, 4000);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  render();
  sincronizar();
});
