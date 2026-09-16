// `npm run datos` — la revisión de la planilla, pensada para la corredora.
//
// POR QUÉ EXISTE: Sofía se calla cuando un dato no está claro, y callarse es lo
// correcto — pero es invisible. Una celda de precio sin moneda hace que una
// propiedad se muestre sin precio, y nadie se entera: ni la corredora, que la
// cargó, ni quien pregunta, que nunca supo que faltaba. Este script hace visible
// exactamente lo que Sofía está omitiendo, fila por fila, con el número de fila
// de la planilla para poder ir a arreglarlo.
//
// No arregla nada solo, y eso es a propósito: la planilla es del negocio.

require('dotenv').config();

const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const planilla = require(path.join(RAIZ, 'database', 'planilla'));
const formato  = require(path.join(RAIZ, 'agent', 'formato'));
const config   = require(path.join(RAIZ, 'config'));

const TIPOS      = ['casa', 'departamento', 'oficina', 'local', 'terreno', 'parcela', 'bodega', 'sitio'];
const OPERACIONES = ['venta', 'arriendo'];
const sinTilde = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function main() {
  const todas = await planilla.cargar({ forzar: true });
  const activas = todas.filter((p) => p.activa);
  const fuente = planilla.estado();

  console.log('\n' + '─'.repeat(66));
  console.log('REVISIÓN DE LA PLANILLA — Sofía · Gesta Inmobiliaria');
  console.log(
    `Origen: ${fuente.origen === 'google' ? 'planilla de Google, en vivo' : `copia local (${fuente.origen})`}` +
    `   ·   ${todas.length} filas   ·   ${activas.length} publicadas`
  );
  console.log('─'.repeat(66));

  const problemas = [];
  const avisos = [];
  const vistos = new Map();

  for (const p of todas) {
    const donde = `fila ${p.fila}` + (p.direccion ? ` (${p.direccion})` : '');
    const marcar = (lista, que, porque) => lista.push({ donde, que, porque, activa: p.activa });

    if (vistos.has(p.id)) marcar(problemas, `código repetido "${p.id}"`, `ya lo usa la ${vistos.get(p.id)}: las dos propiedades se pisan`);
    else vistos.set(p.id, donde);

    if (!p.link) marcar(problemas, 'sin link', 'sin link no hay fotos que mandar y el código de la propiedad queda inestable');

    if (!p.precio) marcar(problemas, 'sin precio', 'la ficha sale sin precio');
    else if (p.precio.valor == null) {
      marcar(problemas, `precio "${p.precio.crudo}" sin moneda clara`,
        'Sofía NO lo muestra: no puede adivinar si son UF o pesos. Escribir "5000 UF" o "320000 CLP"');
    }

    if (p.gastos && p.gastos.valor == null) {
      marcar(problemas, `gastos comunes "${p.gastos.crudo}" sin moneda`,
        'Sofía los omite de la ficha. Escribir "200000 CLP" o "14 UF"');
    }

    if (!p.direccion && !p.comuna) {
      marcar(problemas, 'sin dirección ni comuna',
        'nadie la va a encontrar preguntando por su dirección: solo aparece si la buscan por su código');
    } else if (!p.direccion) {
      marcar(avisos, 'sin dirección', 'solo se encuentra por comuna');
    } else if (!p.comuna) {
      marcar(avisos, 'sin comuna', 'no aparece cuando alguien busca por comuna');
    }

    if (p.tipo && !TIPOS.includes(sinTilde(p.tipo))) {
      marcar(avisos, `tipo "${p.tipo}" fuera de la lista`, `los conocidos son: ${TIPOS.slice(0, 5).join(', ')}`);
    }
    if (p.operacion && !OPERACIONES.includes(sinTilde(p.operacion))) {
      marcar(problemas, `operación "${p.operacion}"`, 'tiene que decir Venta o Arriendo: de ahí sale si la ficha dice "en venta" o "en arriendo"');
    }
    if (!p.m2) marcar(avisos, 'sin metros cuadrados', 'la ficha sale sin metros');

    if (p.requisitos && sinTilde(p.operacion) === 'venta') {
      marcar(avisos, 'tiene requisitos cargados siendo una venta', 'el botón de requisitos aparecerá en una propiedad que se vende');
    }
  }

  const deActivas = (lista) => lista.filter((x) => x.activa);
  const imprimir = (titulo, lista, icono) => {
    if (!lista.length) return;
    console.log(`\n${icono} ${titulo} (${lista.length}):`);
    for (const x of lista) console.log(`   · ${x.donde} — ${x.que}\n     ${x.porque}`);
  };

  imprimir('DATOS QUE SOFÍA NO ESTÁ MOSTRANDO', deActivas(problemas), '❌');
  imprimir('Se podría mejorar', deActivas(avisos), '⚠️');

  const enPausa = problemas.filter((x) => !x.activa).length + avisos.filter((x) => !x.activa).length;
  if (enPausa) console.log(`\n(${enPausa} observación(es) más en filas con Activa = NO: no se muestran, no urgen.)`);

  // Lo que no es de la planilla pero sin ello el agente entrega a medias.
  console.log('\n' + '─'.repeat(66));
  console.log('CONFIGURACIÓN');
  const inbox = String(config.valor('handoff.inbox') || '').replace(/[^\d]/g, '');
  console.log(inbox
    ? `✅ WhatsApp de la ejecutiva: +${inbox}`
    : '❌ Sin WhatsApp de la ejecutiva (handoff.inbox en agente.config.json):\n   los informes de cada contacto NO se envían, solo quedan en el log del servidor.');
  console.log(planilla.urlPlanilla()
    ? '✅ Planilla en vivo configurada (PLANILLA_URL)'
    : '⚠️  Sin PLANILLA_URL: Sofía atiende con la copia local datos/propiedades.csv,\n   así que no ve los cambios que se hagan en la planilla de Google.');

  console.log('\n' + '─'.repeat(66));
  const conRequisitos = activas.filter((p) => formato.tieneRequisitos(p)).length;
  const arriendos = activas.filter((p) => sinTilde(p.operacion) === 'arriendo');
  console.log(`${activas.length} propiedades publicadas · ${conRequisitos} con requisitos cargados`);
  if (arriendos.length && conRequisitos < arriendos.length) {
    console.log(`⚠️  ${arriendos.length - conRequisitos} de ${arriendos.length} arriendos no tienen requisitos:`);
    console.log('   en esas, Sofía dirá que no los tiene cargados y ofrecerá una ejecutiva.');
  }
  console.log('─'.repeat(66) + '\n');

  process.exitCode = deActivas(problemas).length ? 1 : 0;
}

main().catch((e) => { console.error('No pude revisar la planilla:', e.message); process.exitCode = 1; });
