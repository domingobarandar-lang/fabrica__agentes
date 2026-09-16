// Punto de entrada de los evals de Sofía.
//   npm test
//   npm test -- --perfil=pide_humano
//   npm test -- --escenario=CU-2
//   npm test -- --verboso
//
// Todo el trabajo lo hace evals/motor.js, del núcleo. Acá se declara qué
// significa "inventar un dato" en una corredora.

require('dotenv').config();

// CERO EFECTOS EXTERNOS, la parte que el núcleo no puede saber. El motor borra
// las credenciales del contrato (LLM, Supabase, WhatsApp, Telegram) antes de
// cargar nada, pero PLANILLA_URL es de este cliente y el motor no la conoce:
// sin esta línea, `npm test` en la máquina de alguien con el .env de producción
// saldría a Google a leer la planilla en vivo. Además de ser una llamada a la
// red en QA, haría que la suite pasara o fallara según lo que la corredora haya
// editado esa mañana. Acá se prueba contra la copia del repo, que es fija.
delete process.env.PLANILLA_URL;

const { crearMotor } = require('./motor');
const escenarios = require('./escenarios');

crearMotor({
  nombre: 'Sofía — Gesta Inmobiliaria',

  // Una ficha completa son ~470 caracteres y Sofía tiene que poder mandarla
  // entera más una línea propia. El techo real no es estético: es el cuerpo de
  // un mensaje con botones de WhatsApp, 1024 caracteres.
  maxChars: 1000,

  // El dato que Sofía NO puede afirmar si ninguna herramienta lo devolvió: la
  // plata. Cubre las dos formas en que aparece en esta planilla —UF y pesos—
  // porque las dos salen en las fichas.
  patronDato: /(?:\$\s?[\d.]{3,}|\b[\d.]+\s?UF\b)/gi,

  // Cuántas propiedades puede listar de una vez. Una corredora con 16
  // publicaciones que las vomita todas en un mensaje no está ayudando a nadie:
  // el id es el código del link, que es lo que aparece en una ficha.
  patronId: /\b1[6-7]\d{4}\b|\b88195\b/g,
  topeResultados: 3,

  // Cosas que nunca deben llegarle a un cliente de Gesta.
  fugaExtra: [
    /\[ref:/i,                       // la referencia interna del botón
    /propiedad_id/i,
    /instruccion/i,
    /botones_puestos/i,
    /planilla de google|google sheets/i,  // cómo se lee el catálogo no es asunto suyo
  ],
})
  .correr(escenarios)
  .catch((e) => {
    console.error('Error fatal en los evals:', e);
    process.exitCode = 1;
  });
