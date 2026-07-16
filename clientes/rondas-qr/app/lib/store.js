// Persistencia: todo el estado vive en data/db.json con escritura atómica
// (tmp + rename). Suficiente para pilotos — pocos condominios, decenas de
// rondas al día. La migración a SQLite/Postgres está descrita en
// entrega/OPERACION.md y no toca el resto del código (solo este módulo).
const fs = require('fs');
const path = require('path');

const VACIA = () => ({
  condominios: [],
  usuarios: [],
  puntos: [],
  rondas: [],
  ejecuciones: [],
  sesiones: {},
  notificaciones: []
});

function crearStore(rutaArchivo) {
  const ruta = rutaArchivo || path.join(__dirname, '..', 'data', 'db.json');
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  let db;
  if (fs.existsSync(ruta)) {
    db = { ...VACIA(), ...JSON.parse(fs.readFileSync(ruta, 'utf8')) };
  } else {
    db = VACIA();
  }

  function guardar() {
    const tmp = ruta + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, ruta);
  }

  return { db, guardar, ruta };
}

module.exports = { crearStore, VACIA };
