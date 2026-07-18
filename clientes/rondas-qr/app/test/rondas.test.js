// QA de Rondas QR — cubre los casos de uso CU-01 a CU-14 del SPEC más
// escenarios adversariales (permisos cruzados, cierre repetido, escaneo tras
// cierre). Todo en MOCK: cero llamadas externas.
'use strict';

process.env.MOCK = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { crearApp } = require('../server');
const { datosSemilla } = require('../seed');

let base;
let servidor;
let store;

async function api(ruta, { metodo = 'GET', cuerpo, token } = {}) {
  const resp = await fetch(base + ruta, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const datos = await resp.json().catch(() => ({}));
  return { status: resp.status, datos };
}

async function login(usuario, pin) {
  const { status, datos } = await api('/api/login', { metodo: 'POST', cuerpo: { usuario, pin } });
  assert.equal(status, 200, `login de ${usuario} debería funcionar`);
  return datos;
}

// El payload QR de un punto, tal como saldría impreso en la hoja.
function payloadDe(paquete, rondaId, nombrePunto) {
  const ronda = paquete.rondas.find(r => r.id === rondaId);
  const punto = ronda.puntos.find(p => p.nombre === nombrePunto);
  return punto.payload;
}

test.before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rondasqr-'));
  const rutaDb = path.join(dir, 'db.json');
  fs.writeFileSync(rutaDb, JSON.stringify(datosSemilla()));
  const creado = crearApp({ rutaDb });
  store = creado.store;
  await new Promise(resolve => { servidor = creado.app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(() => servidor.close());

test('CU-01: login correcto entrega sesión; PIN malo no', async () => {
  const r = await login('pedro', '2222');
  assert.ok(r.token);
  assert.equal(r.rol, 'guardia');
  assert.equal(r.condominio.id, 'aromos');

  const malo = await api('/api/login', { metodo: 'POST', cuerpo: { usuario: 'pedro', pin: '9999' } });
  assert.equal(malo.status, 401);
  assert.ok(!malo.datos.token);
});

test('auth: el API exige token válido', async () => {
  const sin = await api('/api/mi/paquete');
  assert.equal(sin.status, 401);
  const falso = await api('/api/mi/paquete', { token: 'token-falso' });
  assert.equal(falso.status, 401);
});

test('CU-02: el paquete trae las rondas del condominio con sus puntos', async () => {
  const { token } = await login('pedro', '2222');
  const { status, datos } = await api('/api/mi/paquete', { token });
  assert.equal(status, 200);
  assert.equal(datos.condominio.id, 'aromos');
  assert.equal(datos.rondas.length, 2);
  const nocturna = datos.rondas.find(r => r.id === 'ronda-nocturna');
  assert.equal(nocturna.puntos.length, 8);
  assert.ok(nocturna.puntos[0].payload.startsWith('RQR:aromos:'));
  assert.match(nocturna.puntos[0].codigoCorto, /^[A-Z2-9]{6}$/);
});

test('CU-03/04/09: ronda completa en orden → informe "completa" + notificación al admin', async () => {
  const { token } = await login('pedro', '2222');
  const { datos: paquete } = await api('/api/mi/paquete', { token });
  const nocturna = paquete.rondas.find(r => r.id === 'ronda-nocturna');

  const ini = await api('/api/ejecuciones', { metodo: 'POST', token, cuerpo: { rondaId: 'ronda-nocturna' } });
  assert.equal(ini.status, 201);
  const ejecucionId = ini.datos.id;

  for (const [i, punto] of nocturna.puntos.entries()) {
    const esc = await api(`/api/ejecuciones/${ejecucionId}/escaneos`, {
      metodo: 'POST', token, cuerpo: { codigo: punto.payload }
    });
    assert.equal(esc.status, 200);
    assert.equal(esc.datos.avance.hechos, i + 1);
  }

  const notifsAntes = store.db.notificaciones.length;
  const cierre = await api(`/api/ejecuciones/${ejecucionId}/cerrar`, { metodo: 'POST', token });
  assert.equal(cierre.status, 200);
  assert.equal(cierre.datos.estado, 'completa');
  assert.ok(cierre.datos.detalle.every(d => !d.faltante));

  assert.equal(store.db.notificaciones.length, notifsAntes + 1);
  const notif = store.db.notificaciones.at(-1);
  assert.equal(notif.condominioId, 'aromos');
  assert.match(notif.texto, /Nocturna completa/);
  assert.doesNotMatch(notif.texto, /ALERTA/);
});

test('CU-05/06/13: escaneos inválidos, duplicado y código manual', async () => {
  const { token } = await login('pedro', '2222');
  const { datos: paquete } = await api('/api/mi/paquete', { token });

  const ini = await api('/api/ejecuciones', { metodo: 'POST', token, cuerpo: { rondaId: 'ronda-express' } });
  const ejecucionId = ini.datos.id;
  const url = `/api/ejecuciones/${ejecucionId}/escaneos`;

  // Basura
  const basura = await api(url, { metodo: 'POST', token, cuerpo: { codigo: 'hola esto no es un QR' } });
  assert.equal(basura.status, 422);

  // QR de otro condominio (payload real de Mirador)
  const ajeno = await api(url, { metodo: 'POST', token, cuerpo: { codigo: 'RQR:mirador:p-m-acceso:MAP234' } });
  assert.equal(ajeno.status, 422);

  // Punto del condominio pero que no es parte de esta ronda
  const bodega = paquete.rondas.find(r => r.id === 'ronda-nocturna').puntos.find(p => p.nombre === 'Bodega');
  const fuera = await api(url, { metodo: 'POST', token, cuerpo: { codigo: bodega.payload } });
  assert.equal(fuera.status, 422);
  assert.match(fuera.datos.error, /no es parte/);

  // Escaneo válido + duplicado (gana el primero)
  const porteria = payloadDe(paquete, 'ronda-express', 'Portería');
  const ok = await api(url, { metodo: 'POST', token, cuerpo: { codigo: porteria } });
  assert.equal(ok.status, 200);
  assert.equal(ok.datos.duplicado, false);
  const dup = await api(url, { metodo: 'POST', token, cuerpo: { codigo: porteria } });
  assert.equal(dup.status, 200);
  assert.equal(dup.datos.duplicado, true);
  assert.equal(dup.datos.avance.hechos, 1);

  // Código corto tipeado a mano (minúsculas, se normaliza)
  const manual = await api(url, { metodo: 'POST', token, cuerpo: { codigo: 'qch789' } });
  assert.equal(manual.status, 200);
  assert.equal(manual.datos.punto.nombre, 'Quincho');

  // CU-08/10: cierre con 2 de 4 puntos → INCOMPLETA + alerta con los faltantes
  const notifsAntes = store.db.notificaciones.length;
  const cierre = await api(`/api/ejecuciones/${ejecucionId}/cerrar`, { metodo: 'POST', token });
  assert.equal(cierre.datos.estado, 'incompleta');
  assert.equal(cierre.datos.evaluacion.faltantes.length, 2);
  const notif = store.db.notificaciones.at(-1);
  assert.equal(store.db.notificaciones.length, notifsAntes + 1);
  assert.match(notif.texto, /ALERTA/);
  assert.match(notif.texto, /Piscina — FALTANTE/);
  assert.match(notif.texto, /Acceso trasero — FALTANTE/);
});

test('CU-07: reenvío offline idempotente con timestamps del teléfono', async () => {
  const { token } = await login('luis', '3333');
  const { datos: paquete } = await api('/api/mi/paquete', { token });
  const express = paquete.rondas.find(r => r.id === 'ronda-express');

  const idCliente = 'cli-' + Date.now();
  const hace30 = new Date(Date.now() - 30 * 60000).toISOString();

  // El teléfono reenvía el "iniciar" dos veces (reintento): mismo resultado.
  const uno = await api('/api/ejecuciones', { metodo: 'POST', token, cuerpo: { id: idCliente, rondaId: 'ronda-express', inicio: hace30 } });
  assert.equal(uno.status, 201);
  const dos = await api('/api/ejecuciones', { metodo: 'POST', token, cuerpo: { id: idCliente, rondaId: 'ronda-express', inicio: hace30 } });
  assert.equal(dos.status, 200);
  assert.equal(dos.datos.id, idCliente);

  // Escaneos hechos sin señal, con hora original del teléfono.
  for (const [i, punto] of express.puntos.entries()) {
    const ts = new Date(Date.now() - (25 - i * 5) * 60000).toISOString();
    const esc = await api(`/api/ejecuciones/${idCliente}/escaneos`, {
      metodo: 'POST', token, cuerpo: { codigo: punto.payload, ts, offline: true }
    });
    assert.equal(esc.status, 200);
  }

  const cierre = await api(`/api/ejecuciones/${idCliente}/cerrar`, { metodo: 'POST', token, cuerpo: { fin: new Date().toISOString() } });
  assert.equal(cierre.status, 200);
  // Sin faltantes, pero con observaciones: duración excedida (30 > 20 min) y marcas offline.
  assert.equal(cierre.datos.estado, 'completa_obs');
  assert.equal(cierre.datos.evaluacion.faltantes.length, 0);
  assert.ok(cierre.datos.evaluacion.observaciones.some(o => /sin conexión/.test(o)));
  assert.ok(cierre.datos.evaluacion.observaciones.some(o => /máximo definido: 20/.test(o)));
  assert.ok(cierre.datos.detalle.every(d => d.offline));
});

test('orden estricto: marcar fuera de secuencia queda como observación', async () => {
  const { token } = await login('pedro', '2222');
  const { datos: paquete } = await api('/api/mi/paquete', { token });
  const nocturna = paquete.rondas.find(r => r.id === 'ronda-nocturna');

  const ini = await api('/api/ejecuciones', { metodo: 'POST', token, cuerpo: { rondaId: 'ronda-nocturna' } });
  const ejecucionId = ini.datos.id;

  // Orden real: 1, 3, 2, 4, 5, 6, 7, 8 → "Estacionamiento A" (índice 2) queda fuera de orden.
  const orden = [0, 2, 1, 3, 4, 5, 6, 7];
  for (const i of orden) {
    const esc = await api(`/api/ejecuciones/${ejecucionId}/escaneos`, {
      metodo: 'POST', token, cuerpo: { codigo: nocturna.puntos[i].payload }
    });
    assert.equal(esc.status, 200);
  }

  const cierre = await api(`/api/ejecuciones/${ejecucionId}/cerrar`, { metodo: 'POST', token });
  assert.equal(cierre.datos.estado, 'completa_obs');
  assert.deepEqual(cierre.datos.evaluacion.fueraDeOrden, ['p-estacionamiento']);
  assert.ok(cierre.datos.evaluacion.observaciones.some(o => /Orden de la ronda no respetado/.test(o)));
});

test('CU-11: CRUD de puntos, guardias y rondas del panel admin', async () => {
  const { token } = await login('marta', '1111');

  // Punto nuevo
  const punto = await api('/api/admin/puntos', { metodo: 'POST', token, cuerpo: { nombre: 'Antena' } });
  assert.equal(punto.status, 201);
  assert.match(punto.datos.codigoCorto, /^[A-Z2-9]{6}$/);

  // Guardia nuevo (y validaciones)
  const malPin = await api('/api/admin/guardias', { metodo: 'POST', token, cuerpo: { usuario: 'diego', pin: 'abc' } });
  assert.equal(malPin.status, 422);
  const repetido = await api('/api/admin/guardias', { metodo: 'POST', token, cuerpo: { usuario: 'pedro', pin: '8888' } });
  assert.equal(repetido.status, 409);
  const diego = await api('/api/admin/guardias', { metodo: 'POST', token, cuerpo: { usuario: 'diego', nombre: 'Diego Pérez', pin: '9876' } });
  assert.equal(diego.status, 201);
  await login('diego', '9876'); // puede entrar

  // Ronda nueva con el punto nuevo
  const ronda = await api('/api/admin/rondas', {
    metodo: 'POST', token,
    cuerpo: { nombre: 'Prueba antena', puntoIds: [punto.datos.id, 'p-porteria'], ordenEstricto: false, duracionMaxMin: 10 }
  });
  assert.equal(ronda.status, 201);

  // Ronda con punto ajeno → rechazada
  const ajena = await api('/api/admin/rondas', {
    metodo: 'POST', token,
    cuerpo: { nombre: 'Trampa', puntoIds: ['p-m-acceso'] }
  });
  assert.equal(ajena.status, 422);

  // Al eliminar el punto, sale de la ronda
  await api(`/api/admin/puntos/${punto.datos.id}`, { metodo: 'DELETE', token });
  const rondas = await api('/api/admin/rondas', { token });
  const prueba = rondas.datos.find(r => r.id === ronda.datos.id);
  assert.deepEqual(prueba.puntoIds, ['p-porteria']);

  // Limpieza
  await api(`/api/admin/rondas/${ronda.datos.id}`, { metodo: 'DELETE', token });
  await api(`/api/admin/guardias/${diego.datos.id}`, { metodo: 'DELETE', token });
});

test('CU-12: la hoja de QR trae una imagen por punto', async () => {
  const { token } = await login('marta', '1111');
  const { status, datos } = await api('/api/admin/hoja-qr', { token });
  assert.equal(status, 200);
  assert.equal(datos.puntos.length, 8);
  for (const p of datos.puntos) {
    assert.ok(p.dataUrl.startsWith('data:image/png;base64,'), `QR de ${p.nombre} debería ser un PNG embebido`);
  }
});

test('CU-14: aislamiento total entre condominios', async () => {
  const jorge = await login('jorge', '5555');

  // Jorge (Mirador) no puede iniciar una ronda de Los Aromos.
  const robo = await api('/api/ejecuciones', { metodo: 'POST', token: jorge.token, cuerpo: { rondaId: 'ronda-nocturna' } });
  assert.equal(robo.status, 403);

  // En su propia ronda, un QR de Los Aromos no vale.
  const ini = await api('/api/ejecuciones', { metodo: 'POST', token: jorge.token, cuerpo: { rondaId: 'ronda-mirador' } });
  const cruzado = await api(`/api/ejecuciones/${ini.datos.id}/escaneos`, {
    metodo: 'POST', token: jorge.token, cuerpo: { codigo: 'RQR:aromos:p-porteria:PRT234' }
  });
  assert.equal(cruzado.status, 422);

  // Carmen (admin Mirador) solo ve lo suyo.
  const carmen = await login('carmen', '4444');
  const ejecuciones = await api('/api/admin/ejecuciones', { token: carmen.token });
  assert.ok(ejecuciones.datos.every(e => e.ronda === 'Ronda general'));
  const ejecucionAromos = store.db.ejecuciones.find(e => e.condominioId === 'aromos');
  const espiar = await api(`/api/admin/informes/${ejecucionAromos.id}`, { token: carmen.token });
  assert.equal(espiar.status, 404);
  const puntos = await api('/api/admin/puntos', { token: carmen.token });
  assert.ok(puntos.datos.every(p => p.condominioId === 'mirador'));
});

test('permisos: la ejecución de un guardia no la toca otro; guardias no entran al panel', async () => {
  const pedro = await login('pedro', '2222');
  const luis = await login('luis', '3333');

  const ini = await api('/api/ejecuciones', { metodo: 'POST', token: pedro.token, cuerpo: { rondaId: 'ronda-express' } });
  const intruso = await api(`/api/ejecuciones/${ini.datos.id}/escaneos`, {
    metodo: 'POST', token: luis.token, cuerpo: { codigo: 'PRT234' }
  });
  assert.equal(intruso.status, 403);

  const panel = await api('/api/admin/puntos', { token: pedro.token });
  assert.equal(panel.status, 403);

  // (se deja abierta para el test del cierre administrativo)
  global.__ejecucionOlvidada = ini.datos.id;
});

test('cierre administrativo de una ronda olvidada + cierre repetido inocuo', async () => {
  const marta = await login('marta', '1111');
  const ejecucionId = global.__ejecucionOlvidada;

  const notifsAntes = store.db.notificaciones.length;
  const cierre = await api(`/api/admin/ejecuciones/${ejecucionId}/cerrar`, { metodo: 'POST', token: marta.token });
  assert.equal(cierre.status, 200);
  assert.equal(cierre.datos.estado, 'incompleta');
  assert.equal(store.db.notificaciones.length, notifsAntes + 1);
  assert.match(store.db.notificaciones.at(-1).texto, /cerrada por el administrador/);

  // Cerrar de nuevo no duplica notificaciones ni cambia el resultado.
  const repetido = await api(`/api/admin/ejecuciones/${ejecucionId}/cerrar`, { metodo: 'POST', token: marta.token });
  assert.equal(repetido.status, 200);
  assert.equal(store.db.notificaciones.length, notifsAntes + 1);

  // Y escanear sobre una ronda cerrada se rechaza.
  const pedro = await login('pedro', '2222');
  const tarde = await api(`/api/ejecuciones/${ejecucionId}/escaneos`, {
    metodo: 'POST', token: pedro.token, cuerpo: { codigo: 'PRT234' }
  });
  assert.equal(tarde.status, 409);
});

test('CU-15/16: verificación de presencia por GPS', async () => {
  const marta = await login('marta', '1111');
  const pedro = await login('pedro', '2222');

  // La administradora fija la ubicación real de Portería.
  const fijar = await api('/api/admin/puntos/p-porteria', {
    metodo: 'PUT', token: marta.token, cuerpo: { lat: -33.45, lon: -70.66 }
  });
  assert.equal(fijar.status, 200);
  const invalida = await api('/api/admin/puntos/p-porteria', {
    metodo: 'PUT', token: marta.token, cuerpo: { lat: 999, lon: 0 }
  });
  assert.equal(invalida.status, 422);

  async function rondaConMarca(gps) {
    const ini = await api('/api/ejecuciones', { metodo: 'POST', token: pedro.token, cuerpo: { rondaId: 'ronda-express' } });
    const esc = await api(`/api/ejecuciones/${ini.datos.id}/escaneos`, {
      metodo: 'POST', token: pedro.token, cuerpo: { codigo: 'PRT234', gps }
    });
    assert.equal(esc.status, 200, 'el GPS nunca bloquea la marca');
    const cierre = await api(`/api/ejecuciones/${ini.datos.id}/cerrar`, { metodo: 'POST', token: pedro.token });
    return cierre.datos;
  }

  // Marca a ~30 m del punto (dentro del margen de 75 m + precisión) → limpia.
  const cerca = await rondaConMarca({ lat: -33.45027, lon: -70.66, acc: 10 });
  assert.equal(cerca.evaluacion.gpsLejos.length, 0);
  assert.equal(cerca.evaluacion.sinGps.length, 0);
  assert.equal(cerca.detalle.find(d => d.puntoId === 'p-porteria').lejos, false);

  // Marca a ~1.1 km → "LEJOS del punto" con la distancia exacta.
  const lejos = await rondaConMarca({ lat: -33.46, lon: -70.66, acc: 10 });
  assert.equal(lejos.evaluacion.gpsLejos.length, 1);
  assert.ok(lejos.evaluacion.gpsLejos[0].distanciaM > 1000);
  assert.ok(lejos.evaluacion.observaciones.some(o => /LEJOS del punto/.test(o)));
  const detalleLejos = lejos.detalle.find(d => d.puntoId === 'p-porteria');
  assert.equal(detalleLejos.lejos, true);
  assert.ok(detalleLejos.distanciaM > 1000);

  // Marca sin GPS sobre un punto verificable → observada como "sin ubicación".
  const sinGps = await rondaConMarca(null);
  assert.deepEqual(sinGps.evaluacion.sinGps, ['p-porteria']);
  assert.ok(sinGps.evaluacion.observaciones.some(o => /sin ubicación GPS/.test(o)));

  // GPS basura se descarta sin romper la marca.
  const basura = await rondaConMarca({ lat: 'no', lon: {} });
  assert.deepEqual(basura.evaluacion.sinGps, ['p-porteria']);

  // Limpiar: quitar la ubicación para no afectar otros escenarios.
  await api('/api/admin/puntos/p-porteria', { metodo: 'PUT', token: marta.token, cuerpo: { quitarUbicacion: true } });
});
