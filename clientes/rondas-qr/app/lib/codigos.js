// Códigos de punto de control.
// Cada punto tiene un código corto de 6 caracteres (sin 0/O/1/I para que se
// pueda tipear sin ambigüedad) y un payload de QR: RQR:<condominio>:<punto>:<código>.
const crypto = require('crypto');

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function codigoCorto(largo = 6) {
  const bytes = crypto.randomBytes(largo);
  let s = '';
  for (let i = 0; i < largo; i++) s += ALFABETO[bytes[i] % ALFABETO.length];
  return s;
}

function id() {
  return crypto.randomUUID();
}

function payloadQR(punto) {
  return `RQR:${punto.condominioId}:${punto.id}:${punto.codigoCorto}`;
}

// Acepta el payload completo de un QR o el código corto tipeado a mano.
function interpretarCodigo(texto) {
  const limpio = String(texto || '').trim();
  if (limpio.toUpperCase().startsWith('RQR:')) {
    const partes = limpio.split(':');
    if (partes.length !== 4 || !partes[1] || !partes[2] || !partes[3]) return null;
    return { tipo: 'qr', condominioId: partes[1], puntoId: partes[2], codigoCorto: partes[3].toUpperCase() };
  }
  if (/^[A-Za-z0-9]{4,10}$/.test(limpio)) {
    return { tipo: 'manual', codigoCorto: limpio.toUpperCase() };
  }
  return null;
}

module.exports = { ALFABETO, codigoCorto, id, payloadQR, interpretarCodigo };
