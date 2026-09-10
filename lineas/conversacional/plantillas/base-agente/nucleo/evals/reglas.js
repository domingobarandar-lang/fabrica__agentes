// Invariantes que se verifican SOLOS en cada turno de cada escenario.
//
// POR QUÉ ESTÁN EN EL NÚCLEO: son las formas de fallar que no dependen del
// rubro. Un agente inmobiliario y uno dental fallan distinto al agendar, pero
// los dos fallan igual cuando vuelven a preguntar un dato que ya les dieron,
// cuando inventan un precio que ninguna herramienta devolvió, o cuando se les
// escapa el nombre de una tool. El cliente escribe sus expect(); esto corre
// además, gratis, en todos.
//
// TODAS SON DETERMINISTAS Y BLOQUEANTES. Nada de "juez LLM": eso gastaría
// tokens en QA, que es regla dura de la fábrica (y roza la causa 🔴 nº1 del
// semáforo, gastar plata). Si algún día se agrega, va detrás de un proveedor
// gratuito declarado y de una puerta explícita.
//
// Una regla que no se puede evaluar con la config que dio el cliente se declara
// OMITIDA, no aprobada: un check que no corrió nunca se cuenta como verde.

const { esPeticionDeHumano, MENSAJE_DERIVACION } = require('../agent/handoff');
const conocimiento = require('../agent/conocimiento');
const flujo = require('../agent/flujo');
const estilo = require('../agent/estilo');

const OMITIDA = Symbol('regla omitida');

// Un bot que anuncia que pasa la conversación a otra persona. Hacen falta las
// DOS piezas —el verbo de entrega y el sustantivo de persona— porque cada una
// por separado aparece en respuestas perfectamente sanas: "te dejo el horario"
// no promete a nadie, y "atiende un equipo de tres" tampoco.
const RE_ENTREGA = /\b(te\s+(paso|derivo|transfiero|comunico|conecto|dejo)|paso\s+(con|a)|deriv[aoáí]\w*|transfier\w+)\b/i;
const RE_PERSONA =
  /\b(persona|humano|asesor\w*|ejecutiv[oa]\w*|especialista|compañer[oa]\w*|colega|encargad[oa]\w*|superviso\w+|equipo)\b/i;

// Campos de captura por defecto. `claves` son los nombres de parámetro con que
// una tool recibe el dato; `rePregunta` es cómo se vería el agente volviendo a
// pedirlo. Se pueden reemplazar o ampliar desde la config del motor.
const CAMPOS_CAPTURA = {
  nombre: {
    claves: ['nombre', 'name', 'nombre_cliente', 'cliente'],
    rePregunta: /(c[oó]mo te llamas|tu nombre|me (dices|das|dejas) tu nombre|con qui[eé]n tengo el gusto|a nombre de qui[eé]n)/i,
  },
  telefono: {
    claves: ['telefono', 'tel', 'phone', 'celular', 'numero'],
    rePregunta: /(tu (tel[eé]fono|n[uú]mero|celular)|un n[uú]mero (de contacto|para)|me (dejas|das|pasas) tu (tel[eé]fono|n[uú]mero|celular))/i,
  },
  email: {
    claves: ['email', 'correo', 'mail'],
    rePregunta: /(tu (correo|email|mail)|me (dejas|das|pasas) tu (correo|email|mail))/i,
  },
};

// Fugas del andamiaje que nunca deben llegarle a un cliente.
const RE_FUGA_GENERICA =
  /\b(system[_ ]?prompt|input_schema|tool_use|tool_result|TOOL_DEFINITIONS|stop_reason|assistant:|<\/?[a-z_]+>)\b/i;

const normal = (s) => String(s || '').toLowerCase();

/**
 * @param {object} cfg config del motor
 * @returns {Array<{id, titulo, evaluar(t) => string|null|OMITIDA}>}
 */
function construirReglas(cfg) {
  const campos = { ...CAMPOS_CAPTURA, ...(cfg.camposCaptura || {}) };
  // El tope sale del contrato de estilo (`estilo.max_caracteres`), no de un
  // número escrito acá: el prompt le pide al modelo ese mismo tope, y dos
  // números distintos para la misma regla es cómo se llega a una suite verde
  // sobre respuestas que en el chat se ven larguísimas.
  const maxChars = cfg.maxChars ?? estilo.maxCaracteres();

  return [
    {
      id: 'no_repregunta_dato_capturado',
      titulo: 'No vuelve a pedir un dato que el cliente ya dio',
      evaluar(t) {
        if (t.respuesta == null) return null;
        const capturados = [];
        for (const [campo, def] of Object.entries(campos)) {
          const yaLoTiene = t.toolLogAcumulado.some((e) =>
            Object.entries(e.input || {}).some(
              ([k, v]) => def.claves.includes(normal(k)) && v != null && String(v).trim() !== ''
            )
          );
          if (yaLoTiene && def.rePregunta.test(t.respuesta)) capturados.push(campo);
        }
        return capturados.length
          ? `vuelve a pedir ${capturados.join(' y ')} después de que una herramienta ya lo recibió`
          : null;
      },
    },

    {
      id: 'no_afirma_dato_sin_tool',
      titulo: 'No afirma datos que ninguna herramienta devolvió',
      evaluar(t) {
        if (!cfg.patronDato) return OMITIDA;
        if (t.respuesta == null) return null;
        const enRespuesta = t.respuesta.match(cfg.patronDato) || [];
        if (!enRespuesta.length) return null;
        // Todo lo que devolvió CUALQUIER herramienta de la conversación, más lo
        // que el propio cliente escribió: si el dato salió de ahí, no se inventó.
        const respaldo =
          t.toolLogAcumulado.map((e) => JSON.stringify(e.result ?? '')).join(' ') +
          ' ' + t.mensajesUsuario.join(' ');
        const normalizar = (s) => String(s).replace(/[\s.]/g, '');
        const inventados = [...new Set(enRespuesta)].filter(
          (d) => !normalizar(respaldo).includes(normalizar(d))
        );
        return inventados.length
          ? `afirma ${inventados.join(', ')} y ninguna herramienta devolvió ese dato`
          : null;
      },
    },

    {
      id: 'respeta_tope_resultados',
      titulo: 'No supera el tope de resultados en un mensaje',
      evaluar(t) {
        if (!cfg.patronId || !cfg.topeResultados) return OMITIDA;
        if (t.respuesta == null) return null;
        const ids = new Set(t.respuesta.match(cfg.patronId) || []);
        return ids.size > cfg.topeResultados
          ? `lista ${ids.size} resultados y el tope es ${cfg.topeResultados}`
          : null;
      },
    },

    {
      id: 'respuesta_breve',
      titulo: `Responde en ${maxChars} caracteres o menos`,
      evaluar(t) {
        if (t.respuesta == null) return null;
        return t.respuesta.length > maxChars
          ? `respondió ${t.respuesta.length} caracteres (tope ${maxChars}) — es mensajería, no un documento`
          : null;
      },
    },

    // ── El contrato de forma (agent/estilo.js) ───────────────────────────────
    // Las cinco reglas de acá abajo son las que separan un agente que se siente
    // una persona escribiendo de uno que se siente un sistema respondiendo. Son
    // deterministas y no dependen del rubro: un bot dental y uno inmobiliario
    // dicen cosas distintas, pero los dos suenan a máquina cuando mandan viñetas,
    // tres preguntas juntas o vuelven a saludar en el mensaje ocho.
    //
    // TODAS SE OMITEN CON `estilo.activo: false`: es la palanca de emergencia
    // que vuelve al comportamiento de la 1.6.0, y una regla que no se puede
    // evaluar con la config del cliente se declara OMITIDA, nunca aprobada.

    {
      id: 'sin_markdown_en_el_chat',
      titulo: 'No manda formato de documento por un canal de mensajería',
      // La regresión: el modelo, entregado a sí mismo, escribe como escribe un
      // informe — **negritas**, ## títulos, listas de seis viñetas. En WhatsApp
      // los asteriscos se ven literales y la lista convierte una respuesta en un
      // folleto. agent/estilo.js lo limpia ANTES de enviar, así que el cliente
      // final nunca lo ve: por eso el único lugar donde esto puede aparecer es
      // acá, mirando el texto crudo. Sin esta regla, un prompt que pide informes
      // quedaría tapado por el limpiador para siempre.
      evaluar(t) {
        if (!estilo.activo()) return OMITIDA;
        if (t.respuesta == null) return null;
        const marcas = estilo.marcasDeDocumento(t.respuesta);
        return marcas.length
          ? `escribe con ${marcas.join(' y ')}: es mensajería, no un documento`
          : null;
      },
    },

    {
      id: 'una_pregunta_por_mensaje',
      titulo: 'Hace una sola pregunta por mensaje',
      // Dos preguntas en el mismo mensaje se leen como formulario, y la persona
      // contesta UNA. El agente da por respondida la otra o la vuelve a
      // preguntar; en los dos casos la conversación se alarga y se siente un
      // trámite. Es la forma más común de que un bot "no escuche".
      evaluar(t) {
        if (!estilo.activo() || !estilo.unaPregunta()) return OMITIDA;
        if (t.respuesta == null) return null;
        const n = estilo.preguntas(t.respuesta);
        return n > 1
          ? `hace ${n} preguntas en el mismo mensaje: la gente contesta una sola y la otra queda perdida`
          : null;
      },
    },

    {
      id: 'no_vuelve_a_saludar',
      titulo: 'No saluda de nuevo a alguien con quien ya viene hablando',
      // El "Hola, ¿en qué puedo ayudarte?" en el mensaje ocho es la señal más
      // barata de que del otro lado no hay nadie: ninguna persona saluda dos
      // veces en la misma conversación. Ninguna prueba funcional lo ve, porque
      // la respuesta es correcta — lo roto es que se nota la máquina.
      evaluar(t) {
        if (!estilo.activo()) return OMITIDA;
        if (t.respuesta == null) return OMITIDA;
        // Solo si ya hubo una respuesta antes: saludar en el primer turno está
        // bien, y saludar después de un silencio del bot no es re-saludar.
        if (!(t.respuestasPrevias || []).some((r) => r != null)) return OMITIDA;
        // Y solo si la persona NO saludó: devolver el saludo a quien saluda es
        // lo que hace cualquiera. Esta línea la escribió la propia suite de la
        // semilla — sin ella, tres perfiles (insistente, fuera_de_tema,
        // cambia_opinion) se ponían rojos sobre una conversación correcta, y un
        // invariante que se queja de lo bien hecho termina apagado por el
        // primero que lo mire.
        if (t.mensajesUsuario.some((m) => estilo.abreSaludando(m))) return OMITIDA;
        return estilo.abreSaludando(t.respuesta)
          ? `vuelve a saludar en el turno ${t.indiceTurno + 1} sin que nadie lo haya saludado: ` +
            `"${t.respuesta.slice(0, 50)}…"`
          : null;
      },
    },

    {
      id: 'no_habla_como_maquina',
      titulo: 'No habla de sí mismo como sistema',
      // "Según mi base de datos", "no estoy programado para", "estimado usuario".
      // El cliente escribió por WhatsApp esperando que le contesten; esto le
      // recuerda que le contestó un software, y encima suena a excusa. El bloque
      // del prompt lo pide (agent/estilo.js) y esto lo verifica.
      evaluar(t) {
        if (!estilo.activo()) return OMITIDA;
        if (t.respuesta == null) return null;
        const muletilla = estilo.muletillaDeBot(t.respuesta);
        return muletilla
          ? `dice "${muletilla}": habla de sí mismo como sistema en vez de atender`
          : null;
      },
    },

    {
      id: 'respeta_tope_emojis',
      titulo: 'No se pasa de emojis',
      // Un emoji cierra bien un mensaje; cuatro son un bot esforzándose por caer
      // simpático, que es exactamente el efecto contrario. El tope lo declara el
      // cliente (`estilo.max_emojis`), y 0 es legítimo: hay rubros donde un
      // emoji en la respuesta equivocada es una falta de respeto.
      evaluar(t) {
        if (!estilo.activo()) return OMITIDA;
        if (t.respuesta == null) return null;
        const tope = estilo.maxEmojis();
        const n = estilo.emojis(t.respuesta);
        return n > tope
          ? `usa ${n} emojis y el tope declarado es ${tope}`
          : null;
      },
    },

    {
      id: 'deriva_si_piden_humano',
      titulo: 'Deriva cuando le piden una persona, y sin gastar el modelo',
      evaluar(t) {
        const pidio = t.mensajesUsuario.some((m) => esPeticionDeHumano(m));
        if (!pidio) return OMITIDA;
        // null es válido: el canal ya estaba en modo humano y el bot calla.
        if (t.respuesta == null) return null;
        if (t.respuesta !== MENSAJE_DERIVACION) {
          return `pidieron una persona y respondió otra cosa en vez de derivar: "${t.respuesta.slice(0, 80)}"`;
        }
        return t.llamadasModelo > 0
          ? `derivó, pero llamó al modelo ${t.llamadasModelo} vez/veces — el handoff va ANTES de gastar un token`
          : null;
      },
    },

    {
      id: 'sin_fuga_de_andamiaje',
      titulo: 'No se le escapa el prompt de sistema ni el nombre de una tool',
      evaluar(t) {
        if (t.respuesta == null) return null;
        const fuga = t.respuesta.match(RE_FUGA_GENERICA);
        if (fuga) return `se le escapó "${fuga[0]}" al cliente`;

        const tool = t.toolNames.find((n) => normal(t.respuesta).includes(normal(n)));
        if (tool) return `nombra la herramienta "${tool}" en la respuesta al cliente`;

        // Cualquier línea larga del prompt de sistema copiada literal.
        const lineas = String(t.systemPrompt || '')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length >= 40);
        const copiada = lineas.find((l) => t.respuesta.includes(l));
        if (copiada) return `repite literal una línea del prompt de sistema: "${copiada.slice(0, 60)}…"`;

        for (const re of cfg.fugaExtra || []) {
          if (re.test(t.respuesta)) return `coincide con un patrón de fuga declarado por el cliente: ${re}`;
        }
        return null;
      },
    },

    {
      id: 'conocimiento_fuera_del_prompt',
      titulo: 'El conocimiento del negocio no está pegado en el prompt de sistema',
      // La regresión que atrapa es de las que se hacen con buena intención: el
      // bot se equivoca en un dato, alguien copia el archivo de conocimiento
      // dentro de prompts.js "para que no falle", y a partir de ahí ese texto se
      // paga en tokens EN CADA TURNO aunque nadie pregunte por el tema — que es
      // justo lo que agent/conocimiento.js existe para evitar. No se ve en
      // ninguna respuesta: solo en la factura.
      evaluar(t) {
        const muestras = conocimiento.muestrasDelCorpus();
        if (!muestras.length) return OMITIDA;
        const prompt = String(t.systemPrompt || '');
        if (!prompt) return OMITIDA;
        const pegado = muestras.find((m) => prompt.includes(m.linea));
        return pegado
          ? `el contenido del tema "${pegado.intencion}" está copiado en el prompt de sistema: ` +
            'se paga en cada turno y la herramienta de conocimiento deja de tener sentido'
          : null;
      },
    },

    {
      id: 'cambio_de_agente_no_finge_humano',
      titulo: 'Cambiar de agente no se le anuncia a la persona como una derivación',
      // LA FORMA EN QUE UN FLUJO MULTI-AGENTE MIENTE SIN QUE SE NOTE. El modelo
      // cambia de etapa —que por dentro es cambiar un bloque del prompt— y se lo
      // cuenta al cliente como si lo pasara con alguien: "te derivo con un
      // especialista". Del otro lado eso es indistinguible de un handoff a un
      // humano de verdad, así que la persona se queda ESPERANDO a alguien que no
      // existe, y encima deja de escribir. El bot sigue ahí y contesta perfecto:
      // ninguna prueba funcional lo ve, porque la respuesta es correcta. Lo que
      // está roto es la promesa.
      evaluar(t) {
        const cambio = (t.toolLog || []).some((e) => e.name === flujo.NOMBRE_TOOL && e.result?.ok);
        if (!cambio) return OMITIDA;
        if (t.respuesta == null) return null;
        if (!RE_ENTREGA.test(t.respuesta) || !RE_PERSONA.test(t.respuesta)) return null;
        return 'cambió de agente y se lo anunció al cliente como si lo pasara con una persona: ' +
          `"${t.respuesta.slice(0, 90)}". Sigue siendo el mismo bot y nadie más le va a escribir`;
      },
    },
  ];
}

module.exports = { construirReglas, CAMPOS_CAPTURA, OMITIDA };
