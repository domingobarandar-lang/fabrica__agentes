// Imprime el DDL de las tablas del núcleo con el prefijo del cliente ya puesto.
//
//   npm run schema            # a la pantalla, para copiar al editor de Supabase
//   npm run schema > tablas.sql
//
// Existe para que nadie tenga que sustituir {{PREFIJO}} a mano: ese es el tipo
// de paso que se salta con prisa, y saltárselo crea tablas SIN prefijo en un
// proyecto Supabase COMPARTIDO entre agentes — donde el modo_humano de un
// negocio deja mudo al bot de otro.

const fs   = require('fs');
const path = require('path');

const RAIZ   = path.resolve(__dirname, '..');
const config = require(path.join(RAIZ, 'config'));

const prefijo = config.valor('datos.prefijo');
if (!prefijo) {
  console.error('❌ Falta "datos.prefijo" en agente.config.json: sin él las tablas quedarían sin prefijo.');
  process.exit(1);
}

const plantilla = path.join(RAIZ, 'database', 'schema-nucleo.sql');
if (!fs.existsSync(plantilla)) {
  console.error(`❌ No encuentro ${plantilla}`);
  process.exit(1);
}

process.stdout.write(
  fs.readFileSync(plantilla, 'utf8').replace(/\{\{PREFIJO\}\}/g, prefijo)
);
