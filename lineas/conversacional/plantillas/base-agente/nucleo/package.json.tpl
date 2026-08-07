{
  "name": "{{NOMBRE}}",
  "version": "0.1.0",
  "description": "{{DESCRIPCION}}",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js",
    "chat": "node scripts/chat-local.js",
    "telegram": "node telegram/bot.js",
    "telegram:mock": "node telegram/bot.js --mock",
    "test": "node evals/correr.js",
    "validar": "node scripts/validar-config.js",
    "railway": "node scripts/generar-railway.js",
    "schema": "node scripts/schema-nucleo.js",
    "metricas": "node scripts/panel-metricas.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.111.0",
    "@supabase/supabase-js": "^2.38.0",
    "axios": "^1.7.9",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "node-telegram-bot-api": "^1.1.2",
    "ws": "^8.21.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.9"
  },
  "engines": {
    "node": ">=22"
  }
}
