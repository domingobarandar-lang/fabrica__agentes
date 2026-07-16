// Simulador de conversación por consola — prueba el agente SIN WhatsApp ni Meta.
// Uso: npm run chat   (requiere solo ANTHROPIC_API_KEY en .env)

require('dotenv').config();
const readline = require('readline');
const { processMessage } = require('../agent/core');
const { usandoMemoria } = require('../database/supabase');

const TELEFONO_DEMO = '56900000000';

console.log('─'.repeat(60));
console.log('Chat local — Agente de citas (escribe "salir" para terminar)');
console.log(`DB: ${usandoMemoria ? 'en memoria (demo)' : 'Supabase'}`);
console.log('─'.repeat(60));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function preguntar() {
  rl.question('\nTú: ', async (linea) => {
    const texto = linea.trim();
    if (!texto) return preguntar();
    if (['salir', 'exit', 'quit'].includes(texto.toLowerCase())) {
      rl.close();
      process.exit(0);
    }
    try {
      const respuesta = await processMessage(TELEFONO_DEMO, texto);
      console.log(`\nBot: ${respuesta}`);
    } catch (error) {
      console.error('\n[Error]', error.message);
    }
    preguntar();
  });
}

preguntar();
