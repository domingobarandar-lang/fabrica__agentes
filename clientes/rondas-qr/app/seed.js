// Datos semilla de demo: dos condominios con guardias, puntos y rondas.
// Uso:
//   node seed.js            → crea/reemplaza data/db.json con la demo
//   node seed.js --si-vacio → siembra solo si la base no existe (npm run demo)
const fs = require('fs');
const path = require('path');
const { crearStore, VACIA } = require('./lib/store');
const { hashPin } = require('./lib/auth');

const RUTA = path.join(__dirname, 'data', 'db.json');

function datosSemilla() {
  const db = VACIA();

  db.condominios.push(
    { id: 'aromos', nombre: 'Condominio Los Aromos', adminTelegramChatId: null },
    { id: 'mirador', nombre: 'Condominio Mirador del Valle', adminTelegramChatId: null }
  );

  db.usuarios.push(
    { id: 'u-marta', condominioId: 'aromos', usuario: 'marta', nombre: 'Marta (administradora)', rol: 'admin', pinHash: hashPin('1111') },
    { id: 'u-pedro', condominioId: 'aromos', usuario: 'pedro', nombre: 'Pedro Soto', rol: 'guardia', pinHash: hashPin('2222') },
    { id: 'u-luis', condominioId: 'aromos', usuario: 'luis', nombre: 'Luis Rojas', rol: 'guardia', pinHash: hashPin('3333') },
    { id: 'u-carmen', condominioId: 'mirador', usuario: 'carmen', nombre: 'Carmen (administradora)', rol: 'admin', pinHash: hashPin('4444') },
    { id: 'u-jorge', condominioId: 'mirador', usuario: 'jorge', nombre: 'Jorge Díaz', rol: 'guardia', pinHash: hashPin('5555') }
  );

  // Códigos cortos fijos para la demo (sin 0/O/1/I, únicos entre condominios).
  const puntosAromos = [
    ['p-porteria', 'Portería', 'PRT234'],
    ['p-estacionamiento', 'Estacionamiento A', 'EST456'],
    ['p-quincho', 'Quincho', 'QCH789'],
    ['p-piscina', 'Piscina', 'PSC234'],
    ['p-bodega', 'Bodega', 'BDG567'],
    ['p-bombas', 'Sala de bombas', 'BMB892'],
    ['p-trasero', 'Acceso trasero', 'TRS345'],
    ['p-sede', 'Sede social', 'SDS678']
  ];
  const puntosMirador = [
    ['p-m-acceso', 'Acceso principal', 'MAP234'],
    ['p-m-terraza', 'Terraza', 'MTR567'],
    ['p-m-subterraneo', 'Subterráneo', 'MSB892']
  ];
  for (const [pid, nombre, codigo] of puntosAromos) {
    db.puntos.push({ id: pid, condominioId: 'aromos', nombre, codigoCorto: codigo });
  }
  for (const [pid, nombre, codigo] of puntosMirador) {
    db.puntos.push({ id: pid, condominioId: 'mirador', nombre, codigoCorto: codigo });
  }

  db.rondas.push(
    {
      id: 'ronda-nocturna',
      condominioId: 'aromos',
      nombre: 'Nocturna completa',
      puntoIds: puntosAromos.map(p => p[0]),
      ordenEstricto: true,
      duracionMaxMin: 45
    },
    {
      id: 'ronda-express',
      condominioId: 'aromos',
      nombre: 'Perimetral express',
      puntoIds: ['p-porteria', 'p-quincho', 'p-piscina', 'p-trasero'],
      ordenEstricto: false,
      duracionMaxMin: 20
    },
    {
      id: 'ronda-mirador',
      condominioId: 'mirador',
      nombre: 'Ronda general',
      puntoIds: puntosMirador.map(p => p[0]),
      ordenEstricto: true,
      duracionMaxMin: 15
    }
  );

  return db;
}

function sembrar({ soloSiVacio = false } = {}) {
  if (soloSiVacio && fs.existsSync(RUTA)) {
    console.log('La base ya existe — se conserva tal cual (usa "node seed.js" para resembrar la demo).');
    return false;
  }
  const store = crearStore(RUTA);
  Object.assign(store.db, datosSemilla());
  store.guardar();
  console.log('Base de demo sembrada en', RUTA);
  console.log(`
Usuarios de prueba (usuario / PIN):
  Los Aromos        → admin: marta / 1111 · guardias: pedro / 2222, luis / 3333
  Mirador del Valle → admin: carmen / 4444 · guardia: jorge / 5555
`);
  return true;
}

if (require.main === module) {
  sembrar({ soloSiVacio: process.argv.includes('--si-vacio') });
}

module.exports = { datosSemilla, sembrar };
