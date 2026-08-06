// Punto de entrada de los evals — pieza de la SEMILLA.
// Uso:  npm test
//       npm test -- --perfil=pide_humano      (un solo perfil)
//       npm test -- --escenario=CU-2          (un solo escenario)
//       npm test -- --verboso                 (imprime todas las conversaciones)
//
// Todo el trabajo lo hace evals/motor.js, que viene del núcleo. Acá solo se
// declara qué es "inventar un dato" y qué es "una lista demasiado larga" en
// ESTE negocio, porque eso cambia por rubro.

require('dotenv').config();

const { crearMotor } = require('./motor');
const escenarios = require('./escenarios');

crearMotor({
  nombre: 'Negocio de ejemplo',

  // Un dato que el agente NO puede afirmar si ninguna herramienta lo devolvió.
  // Acá son horas: si dice "abrimos a las 10:00" y ver_horario nunca devolvió
  // esa hora, la inventó. En un cliente real suele ser el precio (default del
  // motor: montos en pesos, /\$\s?\d[\d.,]*/g).
  patronDato: /\b\d{1,2}:\d{2}\b/g,

  // Cuando una tool devuelve listas, descomentar para que el motor verifique
  // que el agente no vomite el catálogo entero en un mensaje:
  // patronId: /\bP\d+\b/g,
  // topeResultados: 3,

  // Frases propias que nunca deben llegarle a un cliente (además de las
  // genéricas del núcleo: nombres de tools, prompt de sistema, etc.):
  // fugaExtra: [/margen de la corredora/i],
})
  .correr(escenarios)
  .catch((e) => {
    console.error('Error fatal en los evals:', e);
    process.exitCode = 1;
  });
