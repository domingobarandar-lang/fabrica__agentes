// Autenticación: usuario + PIN (hash scrypt con sal), sesiones por token Bearer.
const crypto = require('crypto');

function hashPin(pin) {
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), sal, 32).toString('hex');
  return `${sal}:${hash}`;
}

function verificarPin(pin, guardado) {
  const [sal, hash] = String(guardado || '').split(':');
  if (!sal || !hash) return false;
  const calculado = crypto.scryptSync(String(pin), sal, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calculado, 'hex'));
}

function crearSesion(db, usuario) {
  const token = crypto.randomBytes(24).toString('hex');
  db.sesiones[token] = { usuarioId: usuario.id, creada: new Date().toISOString() };
  return token;
}

function autenticar(store) {
  return (req, res, next) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const sesion = token && store.db.sesiones[token];
    if (!sesion) return res.status(401).json({ error: 'Sesión inválida. Vuelve a iniciar sesión.' });
    const usuario = store.db.usuarios.find(u => u.id === sesion.usuarioId);
    if (!usuario) return res.status(401).json({ error: 'El usuario ya no existe.' });
    req.usuario = usuario;
    req.token = token;
    next();
  };
}

function soloAdmin(req, res, next) {
  if (req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Solo para administradores.' });
  next();
}

module.exports = { hashPin, verificarPin, crearSesion, autenticar, soloAdmin };
