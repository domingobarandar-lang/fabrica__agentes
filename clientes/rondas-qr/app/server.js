// Rondas QR — servidor: API + PWA del guardia + panel del administrador.
// Arranque: `npm run demo` (siembra datos de prueba si no hay) o `npm start`.
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const { cargarEnv } = require('./lib/env');
const { crearStore } = require('./lib/store');
const { hashPin, verificarPin, crearSesion, autenticar, soloAdmin } = require('./lib/auth');
const { codigoCorto, id, payloadQR } = require('./lib/codigos');
const motor = require('./lib/rondas');
const { armarInforme, informeTexto } = require('./lib/informes');
const { notificarAdmin } = require('./lib/notificar');

cargarEnv(__dirname);

function crearApp({ rutaDb } = {}) {
  const store = crearStore(rutaDb);
  const db = store.db;
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('/vendor/jsqr.js', (req, res) => res.sendFile(require.resolve('jsqr/dist/jsQR.js')));

  const auth = autenticar(store);
  const admin = [auth, soloAdmin];
  const miCondominio = req => req.usuario.condominioId;

  // ---------- Sesión ----------

  app.post('/api/login', (req, res) => {
    const { usuario, pin } = req.body || {};
    const u = db.usuarios.find(x => x.usuario === String(usuario || '').toLowerCase().trim());
    if (!u || !verificarPin(pin, u.pinHash)) {
      return res.status(401).json({ error: 'Usuario o PIN incorrectos.' });
    }
    const token = crearSesion(db, u);
    store.guardar();
    const condominio = db.condominios.find(c => c.id === u.condominioId) || {};
    res.json({
      token,
      rol: u.rol,
      nombre: u.nombre,
      usuario: u.usuario,
      condominio: { id: condominio.id, nombre: condominio.nombre }
    });
  });

  app.post('/api/logout', auth, (req, res) => {
    delete db.sesiones[req.token];
    store.guardar();
    res.json({ ok: true });
  });

  // ---------- Guardia: paquete de rondas descargable ----------

  app.get('/api/mi/paquete', auth, (req, res) => {
    const condominio = db.condominios.find(c => c.id === miCondominio(req)) || {};
    const rondas = db.rondas
      .filter(r => r.condominioId === miCondominio(req))
      .map(r => ({
        id: r.id,
        nombre: r.nombre,
        ordenEstricto: Boolean(r.ordenEstricto),
        duracionMaxMin: r.duracionMaxMin || null,
        puntos: motor.puntosDeRonda(db, r).map(p => ({
          id: p.id, nombre: p.nombre, codigoCorto: p.codigoCorto, payload: payloadQR(p)
        }))
      }));
    res.json({
      generado: new Date().toISOString(),
      condominio: { id: condominio.id, nombre: condominio.nombre },
      rondas
    });
  });

  // Permisos sobre una ejecución: el guardia dueño, o un admin del mismo condominio.
  function ejecucionAutorizada(req, res) {
    const ejecucion = db.ejecuciones.find(e => e.id === req.params.id);
    if (!ejecucion) {
      res.status(404).json({ error: 'La ejecución no existe.' });
      return null;
    }
    const esDueno = ejecucion.guardiaId === req.usuario.id;
    const esAdminDelCondominio = req.usuario.rol === 'admin' && req.usuario.condominioId === ejecucion.condominioId;
    if (!esDueno && !esAdminDelCondominio) {
      res.status(403).json({ error: 'Esta ronda no te pertenece.' });
      return null;
    }
    return ejecucion;
  }

  async function cerrarYNotificar(ejecucion, { cerradaPorAdmin = false, fin } = {}) {
    const r = motor.cerrarEjecucion(db, ejecucion, { fin });
    store.guardar();
    const informe = armarInforme(db, ejecucion);
    if (!r.repetida) {
      const condominio = db.condominios.find(c => c.id === ejecucion.condominioId);
      const alerta = informe.estado === 'incompleta' ? '⚠️ ALERTA: ronda con puntos sin marcar\n\n' : '';
      const nota = cerradaPorAdmin ? '(cerrada por el administrador)\n' : '';
      await notificarAdmin(store, condominio, alerta + nota + informeTexto(informe));
    }
    return informe;
  }

  // ---------- Guardia: ejecuciones ----------

  app.post('/api/ejecuciones', auth, (req, res) => {
    const { id: ejecucionId, rondaId, inicio } = req.body || {};
    const r = motor.iniciarEjecucion(db, { ejecucionId, rondaId, guardia: req.usuario, inicio });
    if (r.error) return res.status(r.codigo).json({ error: r.error });
    store.guardar();
    res.status(r.repetida ? 200 : 201).json(r.ejecucion);
  });

  app.post('/api/ejecuciones/:id/escaneos', auth, (req, res) => {
    const ejecucion = ejecucionAutorizada(req, res);
    if (!ejecucion) return;
    const { codigo, ts, offline } = req.body || {};
    const r = motor.registrarEscaneo(db, ejecucion, { codigo, ts, offline });
    if (r.error) return res.status(r.codigo).json({ error: r.error });
    store.guardar();
    res.json({
      duplicado: Boolean(r.duplicado),
      punto: { id: r.punto.id, nombre: r.punto.nombre },
      avance: r.avance
    });
  });

  app.post('/api/ejecuciones/:id/cerrar', auth, async (req, res) => {
    const ejecucion = ejecucionAutorizada(req, res);
    if (!ejecucion) return;
    res.json(await cerrarYNotificar(ejecucion, { fin: (req.body || {}).fin }));
  });

  // ---------- Admin: puntos ----------

  app.get('/api/admin/puntos', ...admin, (req, res) => {
    res.json(db.puntos.filter(p => p.condominioId === miCondominio(req)));
  });

  app.post('/api/admin/puntos', ...admin, (req, res) => {
    const nombre = String((req.body || {}).nombre || '').trim();
    if (!nombre) return res.status(422).json({ error: 'El punto necesita un nombre.' });
    let codigo;
    do { codigo = codigoCorto(); } while (db.puntos.some(p => p.codigoCorto === codigo));
    const punto = { id: id(), condominioId: miCondominio(req), nombre, codigoCorto: codigo };
    db.puntos.push(punto);
    store.guardar();
    res.status(201).json(punto);
  });

  app.put('/api/admin/puntos/:id', ...admin, (req, res) => {
    const punto = db.puntos.find(p => p.id === req.params.id && p.condominioId === miCondominio(req));
    if (!punto) return res.status(404).json({ error: 'El punto no existe.' });
    const nombre = String((req.body || {}).nombre || '').trim();
    if (nombre) punto.nombre = nombre;
    store.guardar();
    res.json(punto);
  });

  app.delete('/api/admin/puntos/:id', ...admin, (req, res) => {
    const i = db.puntos.findIndex(p => p.id === req.params.id && p.condominioId === miCondominio(req));
    if (i === -1) return res.status(404).json({ error: 'El punto no existe.' });
    const [punto] = db.puntos.splice(i, 1);
    for (const r of db.rondas) r.puntoIds = r.puntoIds.filter(pid => pid !== punto.id);
    store.guardar();
    res.json({ ok: true });
  });

  // ---------- Admin: guardias ----------

  app.get('/api/admin/guardias', ...admin, (req, res) => {
    res.json(db.usuarios
      .filter(u => u.condominioId === miCondominio(req) && u.rol === 'guardia')
      .map(u => ({ id: u.id, usuario: u.usuario, nombre: u.nombre })));
  });

  app.post('/api/admin/guardias', ...admin, (req, res) => {
    const { usuario, nombre, pin } = req.body || {};
    const nombreUsuario = String(usuario || '').toLowerCase().trim();
    if (!/^[a-z0-9._-]{3,20}$/.test(nombreUsuario)) {
      return res.status(422).json({ error: 'Usuario inválido (3 a 20 caracteres: letras, números, punto o guión).' });
    }
    if (!/^\d{4,8}$/.test(String(pin || ''))) {
      return res.status(422).json({ error: 'El PIN debe tener entre 4 y 8 dígitos.' });
    }
    if (db.usuarios.some(u => u.usuario === nombreUsuario)) {
      return res.status(409).json({ error: 'Ese usuario ya existe.' });
    }
    const guardia = {
      id: id(),
      condominioId: miCondominio(req),
      usuario: nombreUsuario,
      nombre: String(nombre || '').trim() || nombreUsuario,
      rol: 'guardia',
      pinHash: hashPin(pin)
    };
    db.usuarios.push(guardia);
    store.guardar();
    res.status(201).json({ id: guardia.id, usuario: guardia.usuario, nombre: guardia.nombre });
  });

  app.put('/api/admin/guardias/:id', ...admin, (req, res) => {
    const guardia = db.usuarios.find(u => u.id === req.params.id && u.condominioId === miCondominio(req) && u.rol === 'guardia');
    if (!guardia) return res.status(404).json({ error: 'El guardia no existe.' });
    const { nombre, pin } = req.body || {};
    if (nombre) guardia.nombre = String(nombre).trim();
    if (pin !== undefined && pin !== '') {
      if (!/^\d{4,8}$/.test(String(pin))) return res.status(422).json({ error: 'El PIN debe tener entre 4 y 8 dígitos.' });
      guardia.pinHash = hashPin(pin);
    }
    store.guardar();
    res.json({ id: guardia.id, usuario: guardia.usuario, nombre: guardia.nombre });
  });

  app.delete('/api/admin/guardias/:id', ...admin, (req, res) => {
    const i = db.usuarios.findIndex(u => u.id === req.params.id && u.condominioId === miCondominio(req) && u.rol === 'guardia');
    if (i === -1) return res.status(404).json({ error: 'El guardia no existe.' });
    const [guardia] = db.usuarios.splice(i, 1);
    for (const [token, sesion] of Object.entries(db.sesiones)) {
      if (sesion.usuarioId === guardia.id) delete db.sesiones[token];
    }
    store.guardar();
    res.json({ ok: true });
  });

  // ---------- Admin: rondas ----------

  app.get('/api/admin/rondas', ...admin, (req, res) => {
    res.json(db.rondas.filter(r => r.condominioId === miCondominio(req)));
  });

  function validarRonda(req, res) {
    const { nombre, puntoIds, ordenEstricto, duracionMaxMin } = req.body || {};
    const nombreLimpio = String(nombre || '').trim();
    if (!nombreLimpio) { res.status(422).json({ error: 'La ronda necesita un nombre.' }); return null; }
    if (!Array.isArray(puntoIds) || puntoIds.length === 0) {
      res.status(422).json({ error: 'La ronda necesita al menos un punto.' });
      return null;
    }
    const propios = new Set(db.puntos.filter(p => p.condominioId === miCondominio(req)).map(p => p.id));
    if (puntoIds.some(pid => !propios.has(pid))) {
      res.status(422).json({ error: 'Hay puntos que no son de este condominio.' });
      return null;
    }
    if (new Set(puntoIds).size !== puntoIds.length) {
      res.status(422).json({ error: 'Hay puntos repetidos en la ronda.' });
      return null;
    }
    const duracion = duracionMaxMin ? Number(duracionMaxMin) : null;
    if (duracion !== null && (!Number.isFinite(duracion) || duracion <= 0)) {
      res.status(422).json({ error: 'Duración máxima inválida.' });
      return null;
    }
    return { nombre: nombreLimpio, puntoIds, ordenEstricto: Boolean(ordenEstricto), duracionMaxMin: duracion };
  }

  app.post('/api/admin/rondas', ...admin, (req, res) => {
    const datos = validarRonda(req, res);
    if (!datos) return;
    const ronda = { id: id(), condominioId: miCondominio(req), ...datos };
    db.rondas.push(ronda);
    store.guardar();
    res.status(201).json(ronda);
  });

  app.put('/api/admin/rondas/:id', ...admin, (req, res) => {
    const ronda = db.rondas.find(r => r.id === req.params.id && r.condominioId === miCondominio(req));
    if (!ronda) return res.status(404).json({ error: 'La ronda no existe.' });
    const datos = validarRonda(req, res);
    if (!datos) return;
    Object.assign(ronda, datos);
    store.guardar();
    res.json(ronda);
  });

  app.delete('/api/admin/rondas/:id', ...admin, (req, res) => {
    const i = db.rondas.findIndex(r => r.id === req.params.id && r.condominioId === miCondominio(req));
    if (i === -1) return res.status(404).json({ error: 'La ronda no existe.' });
    db.rondas.splice(i, 1);
    store.guardar();
    res.json({ ok: true });
  });

  // ---------- Admin: ejecuciones e informes ----------

  app.get('/api/admin/ejecuciones', ...admin, (req, res) => {
    const lista = db.ejecuciones
      .filter(e => e.condominioId === miCondominio(req))
      .sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)))
      .map(e => {
        const ronda = db.rondas.find(r => r.id === e.rondaId) || {};
        const guardia = db.usuarios.find(u => u.id === e.guardiaId) || {};
        return {
          id: e.id,
          ronda: ronda.nombre || '(ronda eliminada)',
          guardia: guardia.nombre || guardia.usuario || '(guardia eliminado)',
          inicio: e.inicio,
          fin: e.fin,
          estado: e.estado,
          hechos: e.escaneos.length,
          total: (ronda.puntoIds || []).length,
          faltantes: e.evaluacion ? e.evaluacion.faltantes.length : null
        };
      });
    res.json(lista);
  });

  app.get('/api/admin/informes/:id', ...admin, (req, res) => {
    const ejecucion = db.ejecuciones.find(e => e.id === req.params.id && e.condominioId === miCondominio(req));
    if (!ejecucion) return res.status(404).json({ error: 'El informe no existe.' });
    res.json(armarInforme(db, ejecucion));
  });

  // Cierre administrativo de una ronda que quedó abierta.
  app.post('/api/admin/ejecuciones/:id/cerrar', ...admin, async (req, res) => {
    const ejecucion = db.ejecuciones.find(e => e.id === req.params.id && e.condominioId === miCondominio(req));
    if (!ejecucion) return res.status(404).json({ error: 'La ejecución no existe.' });
    res.json(await cerrarYNotificar(ejecucion, { cerradaPorAdmin: true }));
  });

  // ---------- Admin: hoja de QR y notificaciones ----------

  app.get('/api/admin/hoja-qr', ...admin, async (req, res) => {
    const condominio = db.condominios.find(c => c.id === miCondominio(req)) || {};
    const puntos = db.puntos.filter(p => p.condominioId === miCondominio(req));
    const hoja = [];
    for (const p of puntos) {
      hoja.push({
        id: p.id,
        nombre: p.nombre,
        codigoCorto: p.codigoCorto,
        dataUrl: await QRCode.toDataURL(payloadQR(p), { margin: 1, scale: 8, errorCorrectionLevel: 'M' })
      });
    }
    res.json({ condominio: condominio.nombre, puntos: hoja });
  });

  app.get('/api/admin/notificaciones', ...admin, (req, res) => {
    res.json(db.notificaciones
      .filter(n => n.condominioId === miCondominio(req))
      .slice(-50)
      .reverse());
  });

  // Chat id de Telegram del administrador (para pasar de mock a real).
  app.put('/api/admin/telegram', ...admin, (req, res) => {
    const condominio = db.condominios.find(c => c.id === miCondominio(req));
    condominio.adminTelegramChatId = String((req.body || {}).chatId || '').trim() || null;
    store.guardar();
    res.json({ ok: true, adminTelegramChatId: condominio.adminTelegramChatId });
  });

  return { app, store };
}

if (require.main === module) {
  const puerto = Number(process.env.PORT || 3737);
  const { app, store } = crearApp();
  app.listen(puerto, () => {
    const modo = (process.env.MOCK || 'true') !== 'false' ? 'MOCK (quedan en consola y registro)' : 'REALES (Telegram)';
    console.log(`Rondas QR — servidor en http://localhost:${puerto}`);
    console.log(`  App del guardia:     http://localhost:${puerto}/`);
    console.log(`  Panel administrador: http://localhost:${puerto}/admin.html`);
    console.log(`  Notificaciones: ${modo}`);
    console.log(`  Base de datos: ${store.ruta}`);
  });
}

module.exports = { crearApp };
