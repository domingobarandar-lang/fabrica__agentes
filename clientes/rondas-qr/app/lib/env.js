// Carga .env local sin dependencias (formato CLAVE=valor, líneas # son comentario).
const fs = require('fs');
const path = require('path');

function cargarEnv(dir = path.join(__dirname, '..')) {
  const ruta = path.join(dir, '.env');
  if (!fs.existsSync(ruta)) return;
  for (const linea of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const i = limpia.indexOf('=');
    if (i === -1) continue;
    const clave = limpia.slice(0, i).trim();
    const valor = limpia.slice(i + 1).trim();
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}

module.exports = { cargarEnv };
