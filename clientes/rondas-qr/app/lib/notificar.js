// Aviso al administrador al cierre de cada ronda.
//
// MOCK (por defecto): no llama a ningún servicio — el mensaje queda en
// db.notificaciones y en consola. Así QA y demo cuestan $0 y no requieren red.
//
// Real (MOCK=false): Telegram Bot API por HTTPS directo, sin SDK. Requiere
// TELEGRAM_BOT_TOKEN en .env y adminTelegramChatId en el condominio (el
// administrador le escribe /start al bot una vez y su chat_id se anota en el
// panel — pasos en entrega/OPERACION.md).
//
// Nunca lanza: si Telegram falla, el informe igual queda guardado y el error
// se registra en la notificación.

async function notificarAdmin(store, condominio, texto) {
  const registro = {
    ts: new Date().toISOString(),
    condominioId: condominio.id,
    texto,
    medio: 'mock',
    enviada: false
  };

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const mock = (process.env.MOCK || 'true') !== 'false';

  if (!mock && token && condominio.adminTelegramChatId) {
    registro.medio = 'telegram';
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: condominio.adminTelegramChatId, text: texto })
      });
      registro.enviada = resp.ok;
      if (!resp.ok) registro.error = `Telegram respondió HTTP ${resp.status}`;
    } catch (err) {
      registro.error = err.message;
    }
  } else {
    registro.enviada = true; // "entregada" al registro mock
    console.log(`[MOCK notificación → admin de ${condominio.nombre}]\n${texto}\n`);
  }

  store.db.notificaciones.push(registro);
  store.guardar();
  return registro;
}

module.exports = { notificarAdmin };
