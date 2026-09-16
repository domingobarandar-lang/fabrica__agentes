// Los escenarios de Sofía. ESTO ES EL PRODUCTO.
//
// Cada uno describe el CAMINO FELIZ de un caso de uso del SPEC; el motor lo
// vuelve a correr ocho veces con el mismo cliente portándose distinto (escribe
// en cuatro mensajes, sin tildes, se arrepiente, pide una persona). Escribir
// esas ocho a mano es lo que nadie hace, y por eso no se probaban.
//
// LO QUE ESTAS PRUEBAS SÍ MIDEN: que las herramientas devuelvan lo que la
// planilla dice y nada más, que los botones que correspondan estén puestos, que
// agendar y captar dejen la conversación en manos de una persona y que el
// informe a la ejecutiva se arme con lo que se habló.
//
// LO QUE NO MIDEN: si el modelo entiende. El modelo es un doble guionizado. Eso
// se confirma conversando (`npm run chat -- --real`) y hay que rehacerlo al
// cambiar de proveedor.

const botones   = require('../agent/botones');
const ejecutiva = require('../avisos/ejecutiva');
const formato   = require('../agent/formato');

// Las tres propiedades que usan los escenarios. Se nombran por su código (el
// del link publicado) para que un cambio de precio en la planilla no rompa la
// suite: lo que se prueba es que Sofía diga lo que la planilla diga, no que la
// planilla diga un número concreto.
// El informe de ESTA conversación. Filtrar por canal no es cosmético: los
// informes se acumulan entre escenarios, y `el último` sería el de otro caso de
// uso el día que alguien reordene la lista.
const informeDe = (ctx) => ejecutiva._ultimos().filter((u) => u.canalId === ctx.canalId).at(-1)?.informe || '';

const CON_REQUISITOS = '172155'; // Depto en arriendo, Sebastopol 631, San Miguel
const SIN_REQUISITOS = '166386'; // Depto en venta, Los Ilianes 86, Las Condes
const AMBIGUA        = 'Holanda'; // hay dos en Holanda, Providencia

module.exports = [
  {
    nombre: 'CU-1: llega por el mensaje del aviso y reconoce la propiedad',
    turnos: [
      {
        user: 'Hola, me interesó la propiedad en Sebastopol 631',
        modelo: [
          { tools: [{ name: 'buscar_propiedad', input: { texto: 'Hola, me interesó la propiedad en Sebastopol 631' } }] },
          {
            text: (c) => {
              const r = c.lastResult('buscar_propiedad');
              return r?.encontrada
                ? `¡Hola! 😊 Sí, esa es la de ${r.propiedad.direccion}, ${r.propiedad.comuna}. ¿Qué te gustaría ver?`
                : 'Esa no la tengo publicada.';
            },
          },
        ],
      },
    ],
    async expect(ctx, check) {
      const r = ctx.lastResult('buscar_propiedad');
      check(r?.encontrada === true, 'no reconoció una propiedad que sí está publicada');
      check(r?.propiedad?.id === CON_REQUISITOS, `reconoció la propiedad equivocada: ${r?.propiedad?.id}`);

      // Los tres botones del menú, y el de requisitos entre ellos porque ESTA
      // propiedad los tiene cargados.
      const puestos = r?.botones_puestos || [];
      check(puestos.length === 3, `puso ${puestos.length} botones y el menú de una propiedad con requisitos son 3`);
      check(puestos.some((b) => /Requisitos/i.test(b)), 'la propiedad tiene requisitos y no ofreció el botón');
      check(puestos.some((b) => /Agendar/i.test(b)), 'no ofreció agendar una visita');
      check(!/1\)|2\)|opción 1/i.test(ctx.respuestas[0]), 'escribió las opciones como lista: los botones ya están en pantalla');

      // El buscador, contra el texto crudo de las dos formas en que llega de
      // verdad: el mensaje del aviso y un botón con su referencia.
      const porTexto = await ctx.db.propiedades.buscarEnTexto('me interesó la propiedad en Sebastopol 631');
      check(porTexto.exacta?.id === CON_REQUISITOS, 'el buscador no resuelve el mensaje predeterminado del aviso');
      const porBoton = await ctx.db.propiedades.buscarEnTexto(`Ver información [ref:${SIN_REQUISITOS}]`);
      check(porBoton.exacta?.id === SIN_REQUISITOS, 'el buscador no resuelve la referencia que viaja en un botón');
    },
  },

  {
    nombre: 'CU-2: "Ver información" entrega la ficha tal como está en la planilla',
    turnos: [
      {
        user: `Ver información [ref:${SIN_REQUISITOS}]`,
        modelo: [
          { tools: [{ name: 'ver_ficha', input: { propiedad_id: SIN_REQUISITOS } }] },
          { text: (c) => `Con gusto, acá va la información 👇\n\n${c.lastResult('ver_ficha').ficha}\n\n¿Quieres que una ejecutiva coordine una visita?` },
        ],
      },
    ],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      const propiedad = (await ctx.db.propiedades.activas()).find((p) => p.id === SIN_REQUISITOS);

      // La ficha viaja ENTERA y literal. Si alguien la "mejora" a mano, acá se ve.
      check(r.includes(formato.ficha(propiedad)), 'la ficha no salió tal cual: alguien la resumió o la reescribió');
      check(r.includes(propiedad.link), 'no mandó el link con las fotos');
      check(/42 m²/.test(r) && /5\.000 UF/.test(r), 'no salieron los metros y el precio de la planilla');
      check(!/aprox|alrededor de|más o menos/i.test(r), 'redondeó o aproximó un dato que la planilla trae exacto');
    },
  },

  {
    nombre: 'CU-3: "Requisitos" entrega los de esa propiedad, no los del mercado',
    turnos: [
      {
        user: `Requisitos [ref:${CON_REQUISITOS}]`,
        modelo: [
          { tools: [{ name: 'ver_requisitos', input: { propiedad_id: CON_REQUISITOS } }] },
          { text: (c) => c.lastResult('ver_requisitos').requisitos },
        ],
      },
    ],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      check(/DICOM/i.test(r) && /[Aa]val/.test(r), 'no entregó los requisitos que la corredora cargó en la planilla');
      // El invento clásico del rubro: "la renta tiene que ser 3 veces el
      // arriendo". Es lo que dice todo el mundo y NO es lo que dice esta celda.
      check(!/3 veces|tres veces|renta l[ií]quida de \$/i.test(r),
        'BUG: agregó el requisito de renta 3x, que no está en la planilla');
      const puestos = ctx.lastResult('ver_requisitos')?.botones_puestos || [];
      check(puestos.some((b) => /Agendar/i.test(b)), 'después de los requisitos no ofreció agendar');
      check(puestos.some((b) => /ejecutiva/i.test(b)), 'después de los requisitos no ofreció hablar con una ejecutiva');
    },
  },

  {
    // Este camino TERMINA en una persona, así que el perfil `pide_humano` corre
    // igual y prueba justo lo que importa: pedir una ejecutiva DESPUÉS de
    // agendar no produce un mensaje nuevo, porque el bot ya se calló.
    nombre: 'CU-4: agendar visita pide dos opciones, avisa a la ejecutiva y se calla',
    turnos: [
      {
        user: `Agendar visita [ref:${CON_REQUISITOS}]`,
        modelo: [{ text: '¡Dale! 😊 Dame dos opciones de día y hora que te acomoden y una ejecutiva coordina contigo.' }],
      },
      {
        // Una sola opción: la herramienta no agenda y pide la segunda.
        user: 'el jueves a las 6 de la tarde',
        modelo: [
          { tools: [{ name: 'agendar_visita', input: { propiedad_id: CON_REQUISITOS, fecha_1: 'jueves a las 18:00' } }] },
          { text: 'Anotado el jueves. ¿Me das una segunda opción por si esa no le sirve a la ejecutiva?' },
        ],
      },
      {
        user: 'ya, el sábado en la mañana, me llamo Claudia',
        modelo: [
          { tools: [{ name: 'agendar_visita', input: { propiedad_id: CON_REQUISITOS, fecha_1: 'jueves a las 18:00', fecha_2: 'sábado en la mañana', nombre: 'Claudia' } }] },
          { text: 'Listo Claudia, quedaste con las dos opciones anotadas ✅ Una ejecutiva de Gesta te escribe para cerrar el día.' },
        ],
      },
    ],
    async expect(ctx, check) {
      const primera = ctx.toolLog.find((e) => e.name === 'agendar_visita');
      check(primera?.result?.falta === 'segunda_opcion', 'agendó con una sola opción de día y hora');
      check(!/confirmad[ao]|te esperamos el jueves/i.test(ctx.respuestas[1]),
        'BUG: dio por confirmada una visita que todavía no estaba agendada');

      const visitas = ctx.db.visitas.listar();
      check(visitas.length === 1, `quedaron ${visitas.length} visitas registradas y debía quedar 1`);
      check(visitas[0]?.preferencia_2, 'la visita quedó registrada sin la segunda opción');
      check(visitas[0]?.propiedad_id === CON_REQUISITOS, 'la visita quedó apuntando a otra propiedad');

      // El informe a la ejecutiva: es lo ÚNICO que ella ve de esta conversación.
      const informe = informeDe(ctx);
      check(/NUEVO CONTACTO/.test(informe), 'no se armó el informe para la ejecutiva');
      check(informe.includes(ctx.canalId), 'el informe no trae el número de la persona: no la puede contactar');
      check(/Sebastopol/.test(informe), 'el informe no dice de qué propiedad se trata');
      check(/jueves/i.test(informe) && /s[áa]bado/i.test(informe), 'el informe no trae las dos opciones de día');
      check(/Lo que se habló/.test(informe), 'el informe no trae el resumen de la conversación');

      // Y el bot se calla: la conversación es de la ejecutiva desde acá.
      check(await ctx.db.estadoCanal.get(ctx.canalId).then((e) => e?.modo_humano === true),
        'después de agendar, el bot sigue atendiendo');
      check((await ctx.db.estadoCanal.get(ctx.canalId))?.motivo === 'visita_agendada',
        'no quedó registrado POR QUÉ se derivó');
    },
  },

  {
    nombre: 'CU-5: propiedad sin requisitos — no ofrece un botón que no lleva a nada',
    turnos: [
      {
        user: 'Hola, me interesó la propiedad en Los Ilianes 86',
        modelo: [
          { tools: [{ name: 'buscar_propiedad', input: { texto: 'Hola, me interesó la propiedad en Los Ilianes 86' } }] },
          { text: (c) => `¡Hola! 😊 Esa es la de ${c.lastResult('buscar_propiedad').propiedad.comuna}. ¿Qué te gustaría ver?` },
        ],
      },
    ],
    async expect(ctx, check) {
      const r = ctx.lastResult('buscar_propiedad');
      check(r?.propiedad?.id === SIN_REQUISITOS, 'reconoció otra propiedad');
      check(r?.tiene_requisitos === false, 'dice que una propiedad de venta tiene requisitos de arriendo cargados');
      const puestos = r?.botones_puestos || [];
      check(!puestos.some((b) => /Requisitos/i.test(b)), 'ofreció "Requisitos" en una propiedad que no los tiene');
      check(puestos.some((b) => /ejecutiva/i.test(b)),
        'el hueco que deja "Requisitos" tiene que ocuparlo la ejecutiva: si no, se pierde un botón');
      check(puestos.length === 3, 'no aprovechó los tres botones que permite WhatsApp');
    },
  },

  {
    nombre: 'CU-6: propietario en la Región Metropolitana queda en captación',
    turnos: [
      {
        user: 'Hola, estoy interesado en vender o arrendar mi propiedad con ustedes. ¿Me podrías ayudar?',
        modelo: [
          { tools: [{ name: 'preguntar_region', input: {} }] },
          { text: '¡Hola! Claro que sí 😊 Cuéntame: ¿tu propiedad está en la Región Metropolitana?' },
        ],
        // La primera pregunta de la captación decide si Gesta puede tomar la
        // propiedad. Con botones la respuesta es un dato; escrita a mano llegan
        // "sipo", "en la rm" y "queda en maipu", y hay que gastar un turno en
        // interpretar lo que dos botones resuelven en cero.
        despues(ctx, check) {
          const puestos = ctx.lastResult('preguntar_region')?.botones_puestos || [];
          check(puestos.length === 2, `la pregunta de la Región Metropolitana salió con ${puestos.length} botones y son 2`);
          check(puestos.some((b) => /Sí/i.test(b)) && puestos.some((b) => /No/i.test(b)), 'faltan los botones Sí y No');
          check(botones.ver(ctx.canalId).length === 2, 'los botones Sí/No no llegaron al canal');
        },
      },
      {
        user: 'sí, está en Maipú',
        modelo: [
          { text: '¡Perfecto! Cuéntame de ella: qué tipo de propiedad es, cuántos metros cuadrados, cuántos dormitorios y baños, y cualquier detalle que sirva.' },
        ],
      },
      {
        user: 'es una casa de 120 metros, 3 dormitorios y 2 baños, quiero arrendarla',
        modelo: [
          { tools: [{ name: 'registrar_captacion', input: {
            en_region_metropolitana: true, operacion: 'arrendar', comuna: 'Maipú', tipo: 'casa',
            detalle: 'casa de 120 m², 3 dormitorios y 2 baños',
          } }] },
          { text: '¡Gracias! Ya tengo todos los datos 🙌 Una ejecutiva de Gesta te contacta para ver tu propiedad.' },
        ],
      },
    ],
    async expect(ctx, check) {
      const captaciones = ctx.db.captaciones.listar();
      check(captaciones.length === 1, `quedaron ${captaciones.length} captaciones y debía quedar 1`);
      check(captaciones[0]?.region_metropolitana === true, 'no quedó registrado que la propiedad está en la RM');
      check(/120/.test(captaciones[0]?.detalle || ''), 'no guardó lo que la persona contó de su propiedad');

      const informe = informeDe(ctx);
      check(/vender o arrendar su propiedad/i.test(informe), 'el informe no dice que es una captación');
      check(/Maip[úu]/.test(informe), 'el informe no dice dónde está la propiedad');
      check(informe.includes(ctx.canalId), 'el informe no trae el número del propietario');

      check((await ctx.db.estadoCanal.get(ctx.canalId))?.modo_humano === true,
        'después de tomar la captación, el bot sigue atendiendo');
    },
  },

  {
    nombre: 'CU-7: propietario fuera de la Región Metropolitana — se lo dice, y no deriva',
    turnos: [
      {
        user: 'Hola, quiero arrendar mi departamento con ustedes',
        modelo: [
          { tools: [{ name: 'preguntar_region', input: {} }] },
          { text: '¡Hola! Con gusto 😊 ¿Tu propiedad está en la Región Metropolitana?' },
        ],
      },
      {
        user: 'no, está en Viña del Mar',
        modelo: [
          { tools: [{ name: 'registrar_captacion', input: { en_region_metropolitana: false, operacion: 'arrendar', comuna: 'Viña del Mar' } }] },
          { text: 'Te agradezco un montón que hayas pensado en Gesta 🙏 Por ahora trabajamos solo con propiedades de la Región Metropolitana, así que esta no la podríamos tomar.' },
        ],
        // Va acá y no en expect() a propósito: "no derivó" es una propiedad DE
        // ESTE TURNO. El perfil `pide_humano` agrega después un turno que sí
        // deriva —y hace bien—, así que comprobarlo al final del escenario
        // habría dado rojo por el motivo equivocado.
        async despues(ctx, check) {
          check((await ctx.db.estadoCanal.get(ctx.canalId))?.modo_humano !== true,
            'derivó a una ejecutiva un caso que ya está resuelto: le hace perder el tiempo a las dos partes');
        },
      },
    ],
    async expect(ctx, check) {
      const r = ctx.respuestas[1];
      check(/Regi[oó]n Metropolitana/i.test(r), 'no explica por qué no pueden tomarla');
      check(!/ejecutiva te contacta|te va a llamar|te escribe/i.test(r),
        'BUG: le prometió que alguien lo contactaría para una propiedad que Gesta no puede tomar');
      // Queda medido: es la única forma de saber cuánta demanda llega de fuera.
      check(ctx.db.captaciones.listar()[0]?.region_metropolitana === false,
        'no quedó registrada la consulta de fuera de la RM');
    },
  },

  {
    nombre: 'CU-8: saluda sin decir qué busca — las tres puertas de entrada',
    turnos: [
      {
        user: 'hola',
        modelo: [
          { tools: [{ name: 'menu_bienvenida', input: {} }] },
          { text: '¡Hola! Soy Sofía, de Gesta 😊 ¿Qué te interesa?' },
        ],
        // Los botones pendientes se comprueban EN EL TURNO: duran uno solo, y
        // eso es deliberado (agent/botones.js). Al final del escenario ya no
        // están, y ese es el comportamiento correcto.
        despues(ctx, check) {
          check(botones.ver(ctx.canalId).length === 3,
            'los botones no llegaron al canal: la tool los propuso y el envío no los vería');
        },
      },
    ],
    async expect(ctx, check) {
      const puestos = ctx.lastResult('menu_bienvenida')?.botones_puestos || [];
      check(puestos.length === 3, `el menú de entrada son 3 opciones y puso ${puestos.length}`);
      check(puestos.some((b) => /Arrendar/i.test(b)) && puestos.some((b) => /Comprar/i.test(b)),
        'faltan las opciones de arrendar y comprar');
      check(puestos.some((b) => /Vender/i.test(b)), 'falta la opción para propietarios que quieren vender o arrendar');
    },
  },

  {
    nombre: 'ADV-1: preguntan por una propiedad que no está publicada',
    turnos: [
      {
        user: 'hola, me interesó la propiedad en Pedro de Valdivia 1234',
        modelo: [
          { tools: [{ name: 'buscar_propiedad', input: { texto: 'me interesó la propiedad en Pedro de Valdivia 1234' } }] },
          {
            text: (c) => (c.lastResult('buscar_propiedad')?.encontrada
              ? 'Sí, esa la tengo.'
              : 'Mmm, esa no la tengo publicada 😕 Puede que ya no esté disponible. ¿Quieres que te contacte una ejecutiva?'),
          },
        ],
      },
    ],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      check(/no la tengo|no est[áa] publicada|no aparece/i.test(r), 'no admite que esa propiedad no la tiene');
      check(!/pero tengo una|te ofrezco|una parecida|en cambio/i.test(r),
        'BUG: ofreció otra propiedad como si fuera la que preguntaron');
      check(ctx.lastResult('buscar_propiedad')?.encontrada === false, 'dijo tener una propiedad que no está en la planilla');
    },
  },

  {
    nombre: 'ADV-2: preguntan algo que no está en la planilla — no lo inventa',
    turnos: [
      {
        user: `Ver información [ref:${SIN_REQUISITOS}]`,
        modelo: [
          { tools: [{ name: 'ver_ficha', input: { propiedad_id: SIN_REQUISITOS } }] },
          { text: (c) => c.lastResult('ver_ficha').ficha },
        ],
      },
      {
        user: 'y cuánta comisión cobran ustedes? acepta crédito hipotecario?',
        modelo: [
          { tools: [{ name: 'hablar_con_ejecutiva', input: { motivo: 'pregunta por comisión y crédito hipotecario', propiedad_id: SIN_REQUISITOS } }] },
          { text: 'Eso lo ve directamente una ejecutiva de Gesta, no te quiero dar un dato equivocado 🙌 Te escribe a este mismo número.' },
        ],
      },
    ],
    async expect(ctx, check) {
      const r = ctx.respuestas[1];
      check(!/%|por ciento|comisi[óo]n es/i.test(r), 'BUG: inventó un porcentaje de comisión');
      check(!/s[ií],? acepta|sí se puede con cr[ée]dito/i.test(r), 'BUG: afirmó algo sobre el crédito que nadie le dijo');
      const informe = informeDe(ctx);
      check(/Los Ilianes|Las Condes/.test(informe),
        'derivó sin decirle a la ejecutiva de qué propiedad venían hablando');
    },
  },

  {
    nombre: 'ADV-3: dirección ambigua — pregunta cuál, sin soltar precios',
    turnos: [
      {
        user: `hola me interesó la propiedad en ${AMBIGUA}`,
        modelo: [
          { tools: [{ name: 'buscar_propiedad', input: { texto: `me interesó la propiedad en ${AMBIGUA}` } }] },
          {
            text: (c) => {
              const r = c.lastResult('buscar_propiedad');
              return r?.varias
                ? '¡Hola! Tengo dos en esa calle 😊 ¿Cuál de las dos es?'
                : 'Encontré una sola.';
            },
          },
        ],
      },
    ],
    async expect(ctx, check) {
      const r = ctx.lastResult('buscar_propiedad');
      check(r?.varias === true, 'eligió una de dos propiedades de la misma calle en vez de preguntar');
      check((r?.candidatas || []).length === 2, 'no ofreció las dos candidatas');
      check(!/UF|\$/.test(ctx.respuestas[0]), 'soltó un precio antes de saber de cuál de las dos hablaban');
      check((r?.botones_puestos || []).length === 2, 'no puso un botón por candidata: obliga a escribir la dirección de nuevo');
      // Un título recortado por la fuerza ("Luis Thayer Ojeda 1…") no identifica
      // nada en un teléfono. Se comprueba sobre TODAS las publicadas, no solo
      // sobre las dos de este escenario: la próxima dirección larga que cargue
      // la corredora tiene que caber igual.
      const largos = (await ctx.db.propiedades.activas())
        .map((p) => formato.tituloBoton(p))
        .filter((t) => t.length > 20 || t.endsWith('…'));
      check(largos.length === 0, `hay títulos de botón que no caben en los 20 caracteres: ${largos.join(', ')}`);
    },
  },

  {
    nombre: 'ADV-4: un dato que la planilla no trae — se calla en vez de completarlo',
    turnos: [
      {
        user: 'me interesó la propiedad en Buenos Aires 650, cuánto son los gastos comunes?',
        modelo: [
          { tools: [{ name: 'ver_ficha', input: { propiedad_id: '167963' } }] },
          {
            text: (c) => {
              const ficha = c.lastResult('ver_ficha').ficha;
              return /Gastos comunes/.test(ficha)
                ? ficha
                : `${ficha}\n\nLos gastos comunes de esa no los tengo cargados, prefiero que te los confirme una ejecutiva.`;
            },
          },
        ],
      },
    ],
    async expect(ctx, check) {
      const r = ctx.respuestas[0];
      // La celda de gastos comunes de esta propiedad dice "14", sin moneda: no
      // se sabe si son 14 UF o 14 mil pesos. Mostrar cualquiera de las dos es
      // exactamente lo que este agente tiene prohibido.
      check(!/Gastos comunes/.test(r), 'mostró un gasto común que la planilla dejó sin moneda: no se sabe si son UF o pesos');
      check(/no los tengo|no est[áa]n cargados|te los confirme/i.test(r), 'no avisó que ese dato le falta');
      check(!/\b14 UF\b|\$14/.test(r), 'BUG: adivinó la moneda de un dato ambiguo');
    },
  },
];
