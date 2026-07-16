// Simulador de conversación por consola — ESTE es el canal de la demo v1.
// Uso: npm run chat   (requiere LLM_PROVIDER + LLM_API_KEY en .env; con
// LLM_PROVIDER=anthropic exige ANTHROPIC_API_KEY)

require('dotenv').config();
const readline = require('readline');

// Guard de credenciales ANTES de cargar el agente: el error del adapter LLM
// recién aparecería al primer mensaje, mejor avisar al arrancar.
const proveedor = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
const hayCredencial = proveedor === 'anthropic'
  ? !!process.env.ANTHROPIC_API_KEY
  : (proveedor === 'ollama' || !!process.env.LLM_API_KEY);
if (!hayCredencial) {
  console.error('[Chat] Faltan credenciales del LLM en .env: configura LLM_PROVIDER + LLM_API_KEY');
  console.error('[Chat] (o ANTHROPIC_API_KEY si LLM_PROVIDER=anthropic). Para QA sin costo: npm run telegram:mock');
  process.exit(1);
}

const { processMessage } = require('../agent/core');
const { usandoMemoria } = require('../database/supabase');

const TELEFONO_DEMO = '56900000000';

console.log('─'.repeat(60));
console.log('Chat local — Corredora Andes Propiedades (escribe "salir" para terminar)');
console.log(`DB: ${usandoMemoria ? 'en memoria (demo)' : 'Supabase'}  ·  LLM: ${proveedor}`);
console.log('Prueba: "busco un depto en arriendo en Ñuñoa" o "¿qué piden para arrendar?"');
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
