// Chat por consola contra el agente.  Uso: npm run chat  ·  npm run chat -- --real
//
// Es el canal "terminal" de agente.config.json: sirve para mostrarle el agente a
// un cliente sin desplegar nada, y para lo único que los evals NO pueden medir
// — si el modelo de verdad entiende y llama bien a las herramientas.
//
// MOCK POR DEFECTO, A PROPÓSITO. Sin `--real` no toca la API de nadie: inyecta
// un doble que contesta con un texto fijo. Gastar tokens es una decisión que se
// toma escribiendo una bandera, no algo que pasa por descuido al probar. Con
// `--real` avisa qué proveedor y qué modelo va a usar antes de la primera
// llamada, para que nadie descubra el gasto después.

const readline = require('readline');
const path     = require('path');

require('dotenv').config();

const RAIZ = path.resolve(__dirname, '..');
const config = require(path.join(RAIZ, 'config'));
const { processMessage, MENSAJE_ERROR, _setClienteParaTests } = require(path.join(RAIZ, 'agent', 'core'));

const REAL = process.argv.includes('--real');
const CANAL_ID = 'chat-local';

if (!REAL) {
  _setClienteParaTests({
    messages: {
      async create() {
        return {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: '(mock) No estoy llamando a ningún modelo. Corre `npm run chat -- --real` para conversar de verdad.' }],
        };
      },
    },
  });
}

const nombre = config.valor('identidad.nombre_agente') || config.valor('cliente.nombre');

console.log('─'.repeat(64));
console.log(`Chat local con ${nombre}`);
console.log(REAL
  ? `MODO REAL — proveedor: ${process.env.LLM_PROVIDER || 'anthropic'} · modelo: ${process.env.LLM_MODEL || '(default)'} · ESTO GASTA TOKENS`
  : 'MODO MOCK — sin red, sin tokens. Para conversar de verdad: npm run chat -- --real');
console.log('Escribe "salir" para terminar.');
console.log('─'.repeat(64) + '\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// La consola se puede cerrar mientras hay un turno en vuelo: Ctrl+D, o la
// entrada por tubería que se acaba. Sin esta bandera, el turno terminaba y
// volvía a preguntarle a un readline ya cerrado — al cliente le aparecía un
// stack trace de Node justo al final de la demo.
let cerrado = false;
rl.on('close', () => { cerrado = true; });

function preguntar() {
  if (cerrado) return;
  rl.question('Tú:  ', async (texto) => {
    const limpio = texto.trim();
    if (!limpio) return preguntar();
    if (/^(salir|exit|chao)$/i.test(limpio)) { rl.close(); return; }

    try {
      const respuesta = await processMessage(CANAL_ID, limpio, {
        onProgreso: (puente) => console.log(`Bot: ${puente}`),
      });
      // null = silencio real: hay una persona atendiendo, o el buffer fusionó
      // este turno con el siguiente. Se muestra como silencio y no como error,
      // igual que lo vería un cliente.
      console.log(respuesta == null ? 'Bot: (silencio)\n' : `Bot: ${respuesta}\n`);
    } catch (error) {
      console.log(`Bot: ${MENSAJE_ERROR}\n     (${error.message})\n`);
    }
    preguntar();
  });
}

preguntar();
