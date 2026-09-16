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
const botones = require(path.join(RAIZ, 'agent', 'botones'));

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

// LA ENTRADA SE LEE COMO UNA COLA, no con question() recursivo.
//
// Con `rl.question` encadenado, una conversación por tubería
// (`printf '...\n...' | npm run chat`) perdía todo menos la primera línea: el
// pipe termina, readline emite 'close' mientras el primer turno sigue en vuelo,
// y las líneas ya leídas se descartan. Guionizar una demo o dejar una
// conversación de humo contra el proveedor real era imposible, y el modo de
// falla era silencioso — parecía que el bot había dejado de contestar.
//
// Con cola: 'line' encola, un solo bombeo procesa en orden, y 'close' espera a
// que la cola se vacíe antes de salir. Interactivo se comporta igual que antes.
const cola = [];
let procesando = false;
let entradaCerrada = false;

// Los botones del último turno, para poder apretarlos escribiendo su número.
let ultimosBotones = [];

rl.setPrompt('Tú:  ');
rl.prompt();

rl.on('line', (linea) => { cola.push(linea); bombear(); });
rl.on('close', () => { entradaCerrada = true; bombear(); });

async function bombear() {
  if (procesando) return;
  procesando = true;

  while (cola.length) {
    const limpio = cola.shift().trim();
    if (!limpio) continue;
    if (/^(salir|exit|chao)$/i.test(limpio)) { entradaCerrada = true; break; }

    // Apretar un botón se escribe como su número: [1], [2]… Sin esto, probar
    // una conversación con botones por consola sería imposible, y la consola es
    // justo donde se prueba antes de desplegar.
    const eleccion = limpio.match(/^\[?(\d)\]?$/);
    const entrada = (eleccion && ultimosBotones[Number(eleccion[1]) - 1])
      ? botones.textoDeRespuesta(ultimosBotones[Number(eleccion[1]) - 1])
      : limpio;

    try {
      const respuesta = await processMessage(CANAL_ID, entrada, {
        onProgreso: (puente) => console.log(`Bot: ${puente}`),
      });
      // null = silencio real: hay una persona atendiendo, o el buffer fusionó
      // este turno con el siguiente. Se muestra como silencio y no como error,
      // igual que lo vería un cliente.
      ultimosBotones = respuesta == null ? [] : botones.tomar(CANAL_ID);
      console.log(respuesta == null ? 'Bot: (silencio)\n' : `Bot: ${respuesta}`);
      if (ultimosBotones.length) {
        console.log('     ' + ultimosBotones.map((b, i) => `[${i + 1}] ${b.titulo}`).join('   '));
      }
      if (respuesta != null) console.log('');
    } catch (error) {
      console.log(`Bot: ${MENSAJE_ERROR}\n     (${error.message})\n`);
    }
  }

  procesando = false;
  if (entradaCerrada) { rl.close(); process.exit(0); }
  rl.prompt();
}
