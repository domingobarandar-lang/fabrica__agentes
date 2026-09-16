// La planilla de propiedades de Gesta, leída como datos.
//
// POR QUÉ LA PLANILLA Y NO UNA BASE DE DATOS: la corredora ya trabaja así. Una
// tabla en Supabase obligaría a alguien a copiar propiedades a mano todos los
// días, y ese alguien un día no lo hace — el bot queda ofreciendo un
// departamento arrendado hace tres semanas. La planilla es la fuente de verdad
// del negocio; el agente se adapta a ella y no al revés.
//
// SE LEE COMO CSV PUBLICADO, SIN CREDENCIAL. Google entrega cualquier hoja
// compartida "con el enlace" en CSV. Usar la API de Google Sheets habría
// significado una cuenta de servicio nueva — credencial nueva, o sea gate 🔴
// del semáforo — para leer exactamente los mismos datos. Si algún día la
// planilla pasa a ser privada de verdad, ahí se conversa la credencial.
//
// CACHÉ DE 15 MINUTOS, y el número no es arbitrario: es lo que la propia hoja
// le promete a la corredora en su pestaña de instrucciones ("el agente lee esta
// planilla automáticamente cada 15 minutos"). El contrato con el cliente manda.
//
// FALLA HACIA LA ÚLTIMA COPIA BUENA. Si Google no responde, se sigue atendiendo
// con lo último que se leyó, y si nunca se leyó nada, con el CSV de
// `datos/propiedades.csv`. Un bot que dice "no puedo consultar el sistema" es
// un lead perdido; uno que muestra una propiedad de hace veinte minutos, no.

const fs   = require('fs');
const path = require('path');

const CACHE_MS = 15 * 60 * 1000;
const RESPALDO = path.join(__dirname, '..', 'datos', 'propiedades.csv');

// La hoja tiene un encabezado con un typo — `Requsitos`, sin la i — y así está
// en la planilla que usa la corredora hoy. Corregirlo allá rompería el bot el
// día que alguien lo corrija de vuelta, así que el que se adapta es este mapa:
// se aceptan las dos formas y cualquier variante de tildes y mayúsculas.
const COLUMNAS = {
  tipo:          ['tipo'],
  operacion:     ['operacion'],
  precio:        ['precio'],
  m2:            ['m2 construidos', 'm2', 'metros', 'm2 utiles'],
  dormitorios:   ['dormitorios', 'dorms'],
  banos:         ['banos', 'bano'],
  direccion:     ['direccion'],
  comuna:        ['comuna'],
  gastos:        ['gastoscomunes', 'gastos comunes'],
  extra:         ['datosextra', 'datos extra'],
  link:          ['link', 'url'],
  activa:        ['activa'],
  requisitos:    ['requsitos', 'requisitos'],
};

// La celda de "DatosExtra" la escribe una persona apurada: comillas que abren y
// no cierran, espacios dobles, comas y guiones mezclados. Se limpia para
// mostrar, nunca se cambia el contenido: lo que dice la planilla es lo que se
// dice, y lo único que se toca es cómo se ve.
const limpiarTextoLibre = (s) => String(s || '')
  .replace(/["“”]/g, '')
  .replace(/[ \t]+/g, ' ')
  .replace(/\s*-\s*/g, ' - ')
  .replace(/\s+,/g, ',')
  .trim()
  .replace(/^[-,\s]+|[-,\s]+$/g, '');

const sinTilde = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim();

// ─── CSV ─────────────────────────────────────────────────────────────────────
// Escrito a mano y no con una librería por una razón concreta: la columna de
// requisitos trae saltos de línea DENTRO de la celda (los "1️⃣ 2️⃣ 3️⃣" de un
// arriendo), y un split('\n') los convierte en filas basura. Son 30 líneas de
// RFC-4180; una dependencia más en el repo del cliente cuesta más que esto.
function parsearCSV(texto) {
  const filas = [];
  let fila = [], campo = '', entreComillas = false;
  const limpio = String(texto || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { entreComillas = true; continue; }
    if (c === ',') { fila.push(campo); campo = ''; continue; }
    if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; continue; }
    campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((c) => String(c).trim() !== ''));
}

// ─── Normalización de una fila ───────────────────────────────────────────────

/**
 * Precio y gastos comunes vienen escritos a mano y en todos los formatos que
 * existen: "5000 UF", "6200UF", "131000000 CLP", "55.322.400 CLP", "320.000CLP".
 *
 * NO SE ADIVINA LA MONEDA. Una celda con "14" y nada más puede ser 14 UF o
 * 14.000 pesos, y mostrar la equivocada es exactamente lo que este agente tiene
 * prohibido hacer. Se devuelve `{ crudo, valor: null, moneda: null }` y el dato
 * NO se muestra; `npm run datos` lo lista para que la corredora lo arregle en la
 * planilla. Callar un dato dudoso es recuperable; publicarlo, no.
 */
function parsearMonto(crudo) {
  const texto = String(crudo || '').trim();
  if (!texto) return null;

  // La moneda se busca sobre las LETRAS sueltas, no con \b: en la planilla hay
  // "6200UF" y "320.000CLP" pegados, y entre un dígito y una letra no existe
  // borde de palabra — con \b esas dos filas salían "sin moneda" y el bot se
  // callaba dos propiedades reales.
  const letras = texto.replace(/[\d.,\s]/g, '').toUpperCase();
  const moneda = letras.includes('UF') ? 'UF'
    : (letras.includes('CLP') || letras.includes('$') || /PESO/.test(letras)) ? 'CLP'
    : letras.includes('USD') ? 'USD'
    : null;

  // Separadores de miles chilenos (punto) y decimal opcional: 55.322.400 → 55322400
  const soloNumero = texto.replace(/[^\d.,]/g, '');
  const sinMiles = soloNumero.replace(/\.(?=\d{3}\b)/g, '').replace(/,/g, '.');
  const valor = Number.parseFloat(sinMiles);

  if (!Number.isFinite(valor) || valor <= 0) return { crudo: texto, valor: null, moneda: null };
  if (!moneda) return { crudo: texto, valor: null, moneda: null };
  return { crudo: texto, valor, moneda };
}

const numero = (crudo) => {
  const n = Number.parseFloat(String(crudo || '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** El id estable de una propiedad es el código de su link publicado. */
function idDesdeLink(link, respaldo) {
  const m = String(link || '').match(/(\d{4,})\s*\/?\s*$/);
  return m ? m[1] : `fila${respaldo}`;
}

function normalizarFila(cruda, encabezados, nroFila) {
  const valor = (campo) => {
    const alias = COLUMNAS[campo] || [];
    const i = encabezados.findIndex((h) => alias.includes(h));
    return i === -1 ? '' : String(cruda[i] ?? '').trim();
  };

  const link = valor('link');
  return {
    id:          idDesdeLink(link, nroFila),
    fila:        nroFila,
    tipo:        valor('tipo'),
    operacion:   valor('operacion'),
    precio:      parsearMonto(valor('precio')),
    m2:          numero(valor('m2')),
    dormitorios: numero(valor('dormitorios')),
    banos:       numero(valor('banos')),
    direccion:   limpiarTextoLibre(valor('direccion')),
    comuna:      valor('comuna'),
    gastos:      parsearMonto(valor('gastos')),
    extra:       limpiarTextoLibre(valor('extra')),
    link,
    // La planilla manda: solo un "SI" explícito la publica. Una celda vacía es
    // una propiedad a medio cargar, y el default seguro es no mostrarla.
    activa:      /^s[ií]$/i.test(valor('activa')),
    requisitos:  valor('requisitos'),
  };
}

/** Convierte el CSV completo en propiedades normalizadas. */
function parsearPlanilla(csv) {
  const filas = parsearCSV(csv);
  if (!filas.length) return [];
  const encabezados = filas[0].map(sinTilde);
  return filas.slice(1).map((f, i) => normalizarFila(f, encabezados, i + 2));
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

/**
 * La URL de la hoja publicada. Acepta la URL completa de exportación o el id de
 * la planilla a secas, que es lo que una persona copia del navegador.
 */
function urlPlanilla() {
  const crudo = (process.env.PLANILLA_URL || '').trim();
  if (!crudo) return null;
  if (/^https?:\/\//i.test(crudo)) return crudo;
  const hoja = (process.env.PLANILLA_HOJA || 'Propiedades').trim();
  return `https://docs.google.com/spreadsheets/d/${crudo}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(hoja)}`;
}

let cache = { propiedades: null, leidoEn: 0, origen: null };

function leerRespaldo() {
  try {
    return parsearPlanilla(fs.readFileSync(RESPALDO, 'utf8'));
  } catch (error) {
    console.error('[Planilla] No pude leer ni la copia local:', error.message);
    return [];
  }
}

/**
 * Todas las propiedades de la planilla, activas e inactivas.
 * @param {{ forzar?: boolean }} [opciones]
 */
async function cargar(opciones = {}) {
  const ahora = Date.now();
  if (!opciones.forzar && cache.propiedades && ahora - cache.leidoEn < CACHE_MS) {
    return cache.propiedades;
  }

  const url = urlPlanilla();
  if (!url) {
    // Sin PLANILLA_URL se trabaja con la copia del repo. Es el modo de la demo
    // y el de los evals, y se dice en voz alta: un agente que cree estar
    // leyendo la planilla en vivo y no lo está es el peor de los dos mundos.
    if (!cache.propiedades) console.warn('[Planilla] Sin PLANILLA_URL: se usa la copia local datos/propiedades.csv');
    cache = { propiedades: leerRespaldo(), leidoEn: ahora, origen: 'local' };
    return cache.propiedades;
  }

  try {
    const axios = require('axios');
    const { data } = await axios.get(url, { timeout: 10_000, responseType: 'text' });
    const propiedades = parsearPlanilla(data);
    if (!propiedades.length) throw new Error('la planilla vino vacía');
    cache = { propiedades, leidoEn: ahora, origen: 'google' };
    return propiedades;
  } catch (error) {
    console.error('[Planilla] No pude leer la planilla en vivo:', error.message);
    // Última copia buena antes que nada: seguir atendiendo con datos de hace
    // quince minutos es mejor que decirle a un cliente que el sistema no anda.
    if (cache.propiedades) {
      cache.leidoEn = ahora - CACHE_MS + 60_000; // reintentar en un minuto
      return cache.propiedades;
    }
    cache = { propiedades: leerRespaldo(), leidoEn: ahora, origen: 'local' };
    return cache.propiedades;
  }
}

/** Solo las que la corredora marcó como publicables. */
async function activas(opciones) {
  return (await cargar(opciones)).filter((p) => p.activa);
}

function estado() {
  return { origen: cache.origen, leidoEn: cache.leidoEn, cantidad: cache.propiedades?.length ?? 0 };
}

/** Los evals y la demo siembran la planilla sin tocar la red. */
function _sembrar(propiedades) {
  cache = { propiedades, leidoEn: Date.now(), origen: 'sembrado' };
}
function _limpiar() {
  cache = { propiedades: null, leidoEn: 0, origen: null };
}

module.exports = {
  cargar, activas, estado, urlPlanilla,
  parsearPlanilla, parsearCSV, parsearMonto, idDesdeLink, limpiarTextoLibre,
  _sembrar, _limpiar, CACHE_MS,
};
