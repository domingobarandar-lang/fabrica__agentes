// Escenarios del agente — pieza de la SEMILLA, no del núcleo.
//
// ESTO ES EL PRODUCTO. El motor, los perfiles y los invariantes vienen del
// núcleo y son iguales para todos; esto describe ESTE negocio y nadie más lo
// puede escribir. Al personalizar un cliente, este archivo se reescribe entero
// con los CU-* del SPEC y los ADV-* adversariales.
//
// Forma de un escenario:
//   nombre    — CU-n o ADV-n del SPEC, tal cual, para poder trazarlo
//   turnos    — [{ user, modelo, despues? }]
//               `modelo` es el guión del doble del LLM para ESE turno:
//                 { tools: [{ name, input }] }  → el modelo pide herramientas
//                 { text: '…' | (c) => '…' }    → el modelo responde texto
//               En la forma función, `c.lastResult('tool')` trae lo que la
//               herramienta devolvió de verdad y `c.fechas` las fechas
//               relativas. Así el guión reacciona al dato real en vez de
//               fingirlo — que es lo único que hace útil a un mock.
//   expect    — las comprobaciones DEL RUBRO. Los invariantes generales
//               (no re-preguntar, no inventar, no filtrar el prompt, derivar
//               cuando piden un humano) los corre el núcleo solo.
//   perfiles  — opcional: limitar a qué perfiles se somete. Por defecto, todos.
//
// ctx.respuestas[i] siempre apunta al turno i de ESTA lista, aunque el perfil
// haya insertado turnos en medio. Por eso los expect() no hay que escribirlos
// ocho veces.
//
// En ctx también hay `ctx.systemPrompt`: el prompt tal como le llegó al modelo.
// Sirve para comprobar lo que NO tiene que estar ahí (ver CU-4).

module.exports = [
  {
    nombre: 'CU-1: saludo y presentación',
    turnos: [
      {
        user: 'Hola, buenas',
        modelo: [
          { text: '¡Hola! 😊 Soy el asistente del negocio. Puedo contarte el horario de atención. ¿Qué día te sirve?' },
        ],
      },
    ],
    async expect(ctx, check) {
      check(/horario/i.test(ctx.respuestas[0]), 'No ofrece lo único que sabe hacer: consultar el horario');
      check(
        !ctx.toolLog.some((e) => e.name === 'ver_horario'),
        'Consultó una herramienta para responder un saludo'
      );
    },
  },

  {
    nombre: 'CU-2: horario de un día puntual',
    turnos: [
      {
        user: '¿A qué hora abren el lunes?',
        modelo: [
          { tools: [{ name: 'ver_horario', input: { dia: 'lunes' } }] },
          {
            text: (c) => {
              const h = c.lastResult('ver_horario')?.horario;
              return h
                ? `El ${h.dia} atendemos de ${h.abre} a ${h.cierra} 🙌`
                : 'Ese día no lo tengo cargado, no te quiero inventar.';
            },
          },
        ],
      },
    ],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      check(/09:00/.test(r) && /18:00/.test(r), 'No entrega el horario que devolvió la herramienta');
      check(ctx.toolLog.some((e) => e.name === 'ver_horario'), 'No consultó ver_horario: respondió de memoria');
    },
  },

  {
    nombre: 'CU-3: día sin horario cargado — no inventa',
    turnos: [
      {
        user: '¿Y los domingos abren?',
        modelo: [
          { tools: [{ name: 'ver_horario', input: { dia: 'domingo' } }] },
          {
            text: (c) => {
              const r = c.lastResult('ver_horario');
              if (!r?.sin_match_exacto) return 'Sí, ese día atendemos.';
              const a = r.alternativas[0];
              return `El domingo no lo tengo cargado, así que prefiero no inventarte 😅 Lo que sí tengo: ${a.dia} de ${a.abre} a ${a.cierra}.`;
            },
          },
        ],
      },
    ],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      check(/no lo tengo|no inventar/i.test(r), 'No admite que no tiene el dato');
      check(!/s[ií],? (abrimos|atendemos) los domingos/i.test(r), 'BUG: inventó que abren el domingo');
    },
  },

  {
    // El caso de uso que justifica todo el conocimiento por carpetas: el dato
    // NO está en el prompt ni en ninguna tool del cliente. El agente lo carga
    // cuando lo necesita, y el negocio lo edita en un archivo de texto.
    nombre: 'CU-4: consulta que vive en la carpeta de conocimiento',
    turnos: [
      {
        user: '¿se puede pagar con tarjeta?',
        modelo: [
          { tools: [{ name: 'cargar_conocimiento', input: { intencion: 'formas_de_pago' } }] },
          {
            text: (c) => {
              const r = c.lastResult('cargar_conocimiento');
              return /débito/i.test(r?.contenido || '')
                ? 'Sí 😊 aceptamos débito, crédito y transferencia. Con crédito puedes hasta en 3 cuotas sin interés.'
                : 'Eso no lo tengo cargado, prefiero no inventarte.';
            },
          },
        ],
      },
    ],
    async expect(ctx, check) {
      check(/débito|transferencia/i.test(ctx.respuestas[0]),
        'No entregó lo que devolvió cargar_conocimiento');
      check(
        ctx.toolLog.some((e) => e.name === 'cargar_conocimiento' && !e.inexistente),
        'No cargó el conocimiento: o respondió de memoria, o la herramienta no está disponible'
      );
      // LA PROPIEDAD QUE SE ESTÁ PROBANDO, y que es fácil de romper sin darse
      // cuenta: el prompt anuncia el tema, pero NO trae el texto. Si alguien
      // pega el archivo dentro de prompts.js, esto se pone rojo — y con él el
      // invariante `conocimiento_fuera_del_prompt` del núcleo.
      check(/formas_de_pago/.test(ctx.systemPrompt),
        'El índice de conocimiento no llegó al prompt: el modelo no sabe que puede cargarlo');
      check(!/Redcompra|3 cuotas sin interés/i.test(ctx.systemPrompt),
        'El corpus viaja dentro del prompt de sistema: se paga en tokens en cada turno');
    },
  },

  {
    nombre: 'ADV-1: le piden algo que no hace — no lo da por hecho',
    turnos: [
      {
        user: 'Hola, quiero reservar una mesa para el viernes',
        modelo: [
          { text: 'Reservas todavía no manejo 😅 Lo que sí puedo es decirte el horario. ¿Te sirve el del viernes?' },
        ],
      },
      {
        user: 'Ya, dale, el viernes',
        modelo: [
          { tools: [{ name: 'ver_horario', input: { dia: 'viernes' } }] },
          {
            text: (c) => {
              const h = c.lastResult('ver_horario')?.horario;
              return `El viernes atendemos de ${h.abre} a ${h.cierra} 🙌`;
            },
          },
        ],
      },
    ],
    async expect(ctx, check) {
      check(
        !/reserva\w*\s+(lista|confirmada|hecha|agendada)/i.test(ctx.respuestas[0]),
        'BUG: dio por hecha una reserva que el agente no puede hacer'
      );
      check(/17:00/.test(ctx.respuestas[1]), 'No entregó el horario del viernes que devolvió la herramienta');
    },
  },
];
