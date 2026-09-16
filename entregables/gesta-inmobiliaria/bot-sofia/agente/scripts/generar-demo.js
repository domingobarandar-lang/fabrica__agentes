// `npm run demo` — arma una demo navegable de Sofía en un archivo HTML.
//
// LA DEMO SALE DEL CÓDIGO DE VERDAD, y esa es toda la idea. Las fichas, los
// requisitos, los botones y el informe a la ejecutiva se generan llamando a los
// MISMOS módulos que usa el agente en producción (database/planilla.js,
// agent/formato.js, avisos/ejecutiva.js) sobre la planilla real. Una demo
// escrita a mano se vuelve mentira en la primera semana: alguien cambia el
// formato de la ficha y la demo sigue mostrando la de antes, que es justo lo que
// el cliente ya aprobó.
//
// LO ÚNICO QUE NO ES REAL son las frases de enlace de Sofía ("¡Hola! 😊 Sí, esa
// es la de..."), porque esas las escribe el modelo en cada conversación. Van
// marcadas como ejemplo en la propia demo: prometer que va a decir exactamente
// eso sería vender algo que no se puede cumplir.
//
// Cero efectos externos: no manda un mensaje, no llama a ningún modelo y lee la
// planilla local salvo que haya PLANILLA_URL.

require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const planilla  = require(path.join(RAIZ, 'database', 'planilla'));
const formato   = require(path.join(RAIZ, 'agent', 'formato'));
const ejecutiva = require(path.join(RAIZ, 'avisos', 'ejecutiva'));
const config    = require(path.join(RAIZ, 'config'));

const SALIDA = path.join(RAIZ, '..', 'entrega', 'demo-sofia.html');

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  const activas = await planilla.activas({ forzar: true });

  // Una entrada por propiedad: el menú, la ficha y los requisitos, tal como los
  // devolverían las tools.
  const propiedades = activas.map((p) => ({
    id: p.id,
    titulo: formato.titulo(p),
    linea: formato.linea(p),
    direccion: p.direccion || '',
    comuna: p.comuna || '',
    operacion: p.operacion || '',
    mensajeDeAviso: `Hola, me interesó la propiedad en ${p.direccion || p.comuna || p.tipo}`,
    menu: formato.menuPropiedad(p),
    ficha: formato.ficha(p),
    menuDespuesFicha: [
      ...(formato.tieneRequisitos(p) ? [formato.BTN.requisitos(p.id)] : []),
      formato.BTN.agendar(p.id), formato.BTN.ejecutiva(),
    ],
    requisitos: formato.requisitos(p),
    menuDespuesRequisitos: formato.menuDespues(p),
  }));

  // El informe que le llega a la ejecutiva. Se arma con el módulo real, con una
  // conversación de ejemplo sembrada a mano.
  const demoCanal = '56998765432';
  const conRequisitos = activas.find((p) => formato.tieneRequisitos(p)) || activas[0];
  ejecutiva.anotar(demoCanal, {
    motivo: 'visita_agendada',
    propiedad: conRequisitos,
    preferencias: ['jueves a las 18:00', 'sábado en la mañana'],
    nombre: 'Claudia',
  });
  const informeVisita = await ejecutiva.armarInforme({ canalId: demoCanal, motivo: 'visita_agendada' });

  ejecutiva.anotar(demoCanal, {
    motivo: 'captacion',
    nombre: 'Rodrigo',
    captacion: { operacion: 'arrendar', comuna: 'Maipú', tipo: 'casa', detalle: 'casa de 120 m², 3 dormitorios y 2 baños' },
  });
  const informeCaptacion = await ejecutiva.armarInforme({ canalId: demoCanal, motivo: 'captacion' });

  const datos = {
    generado: new Date().toISOString().slice(0, 16).replace('T', ' '),
    agente: config.valor('identidad.nombre_agente'),
    negocio: config.valor('cliente.nombre'),
    origen: planilla.estado().origen,
    propiedades,
    bienvenida: formato.menuBienvenida(),
    siNo: formato.menuSiNo(),
    informeVisita,
    informeCaptacion,
    telefonoDemo: demoCanal,
  };

  fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
  fs.writeFileSync(SALIDA, plantilla(datos), 'utf8');
  console.log(`\n✅ Demo generada: ${path.relative(process.cwd(), SALIDA)}`);
  console.log(`   ${propiedades.length} propiedades, tomadas de la planilla (${datos.origen}).`);
  console.log('   Ábrela en el navegador o mándala por WhatsApp: es un solo archivo.\n');
}

function plantilla(d) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sofía — Demo</title>
<style>
  :root{
    --fondo:#0b141a; --panel:#111b21; --burbuja:#1f2c34; --mia:#005c4b;
    --texto:#e9edef; --tenue:#8696a0; --linea:#2a3942; --accion:#53bdeb; --verde:#00a884;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--fondo);color:var(--texto);
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       font-size:15px;line-height:1.45;-webkit-font-smoothing:antialiased}
  .envoltura{max-width:460px;margin:0 auto;height:100dvh;display:flex;flex-direction:column;
             background:var(--fondo);box-shadow:0 0 40px rgba(0,0,0,.6);overflow:hidden}
  header{background:var(--panel);padding:10px 16px;display:flex;align-items:center;gap:12px;
         flex:none;border-bottom:1px solid var(--linea)}
  .avatar{width:40px;height:40px;border-radius:50%;background:var(--verde);display:grid;place-items:center;
          font-weight:700;color:#0b141a;flex:none}
  header h1{font-size:16px;margin:0;font-weight:600}
  header p{margin:0;font-size:12px;color:var(--tenue)}
  .cinta{background:#1d2b20;color:#a7d7b4;font-size:12px;padding:8px 16px;border-bottom:1px solid var(--linea);flex:none}
  .chat{flex:1;min-height:0;padding:14px 12px 28px;display:flex;flex-direction:column;gap:8px;overflow-y:auto}
  .msg{max-width:88%;padding:8px 10px;border-radius:8px;white-space:pre-wrap;word-wrap:break-word;
       animation:entra .18s ease-out}
  @keyframes entra{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .bot{background:var(--burbuja);border-top-left-radius:0;align-self:flex-start}
  .yo{background:var(--mia);border-top-right-radius:0;align-self:flex-end}
  .hora{font-size:10px;color:var(--tenue);text-align:right;margin-top:2px}
  .botones{align-self:flex-start;max-width:88%;width:88%;background:var(--burbuja);border-radius:0 0 8px 8px;
           margin-top:-8px;overflow:hidden}
  .botones button{display:block;width:100%;background:none;border:none;border-top:1px solid var(--linea);
                  color:var(--accion);padding:11px 8px;font-size:14px;cursor:pointer;font-family:inherit}
  .botones button:hover{background:#26343d}
  .nota{align-self:center;font-size:11px;color:var(--tenue);text-align:center;max-width:90%;
        background:#182229;padding:6px 10px;border-radius:6px}
  .informe{align-self:flex-start;max-width:92%;background:#1a2b24;border:1px solid #2f5d4a;border-radius:8px;
           padding:10px;white-space:pre-wrap;font-size:13px}
  .informe .quien{color:var(--verde);font-size:11px;text-transform:uppercase;letter-spacing:.04em;
                  margin-bottom:6px;font-weight:700}
  .informe .cta{margin-top:8px;border-top:1px solid #2f5d4a;padding-top:8px;color:var(--accion);text-align:center}
  footer{background:var(--panel);border-top:1px solid var(--linea);padding:10px 14px;
         display:flex;gap:8px;flex-wrap:wrap;flex:none}
  footer button{background:var(--burbuja);color:var(--texto);border:1px solid var(--linea);border-radius:16px;
                padding:7px 12px;font-size:13px;cursor:pointer;font-family:inherit}
  footer button:hover{border-color:var(--verde)}
  select{background:var(--burbuja);color:var(--texto);border:1px solid var(--linea);border-radius:8px;
         padding:7px 8px;font-size:13px;width:100%;font-family:inherit}
  .pie{font-size:11px;color:var(--tenue);text-align:center;padding:8px 16px 12px;flex:none;background:var(--panel)}
</style>
</head>
<body>
<div class="envoltura">
  <header>
    <div class="avatar">S</div>
    <div><h1>${esc(d.agente)}</h1><p>${esc(d.negocio)} · en línea</p></div>
  </header>
  <div class="cinta">Demo navegable. Las fichas y los botones salen del código real, sobre las ${d.propiedades.length} propiedades de la planilla.</div>
  <div class="chat" id="chat"></div>
  <footer id="pie"></footer>
  <div class="pie">Generada el ${esc(d.generado)} desde la planilla (${esc(d.origen)}).<br>
    Las frases de enlace son un ejemplo: eso lo redacta el modelo en cada conversación.</div>
</div>
<script>
const D = ${JSON.stringify(d)};
const chat = document.getElementById('chat');
const pie  = document.getElementById('pie');
let propiedadActual = null;

const hora = () => new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
const alFinal = () => requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });

function burbuja(texto, quien){
  const d1 = document.createElement('div');
  d1.className = 'msg ' + (quien === 'yo' ? 'yo' : 'bot');
  d1.textContent = texto;
  const h = document.createElement('div'); h.className='hora'; h.textContent = hora();
  d1.appendChild(h); chat.appendChild(d1); alFinal(); return d1;
}
function nota(texto){
  const n = document.createElement('div'); n.className='nota'; n.textContent = texto;
  chat.appendChild(n); alFinal();
}
function botonera(lista, alApretar){
  const caja = document.createElement('div'); caja.className='botones';
  lista.forEach((b) => {
    const btn = document.createElement('button'); btn.textContent = b.titulo;
    btn.onclick = () => { caja.remove(); burbuja(b.titulo,'yo'); setTimeout(()=>alApretar(b),320); };
    caja.appendChild(btn);
  });
  chat.appendChild(caja); alFinal();
}
function informe(texto, telefono){
  const caja = document.createElement('div'); caja.className='informe';
  const q = document.createElement('div'); q.className='quien';
  q.textContent = '▼ lo que le llega al WhatsApp de la corredora';
  const t = document.createElement('div'); t.textContent = texto;
  const cta = document.createElement('div'); cta.className='cta'; cta.textContent = '💬 Escribirle';
  caja.append(q,t,cta); chat.appendChild(caja); alFinal();
}
function fin(texto){
  nota(texto);
  pie.innerHTML = '';
  const b = document.createElement('button'); b.textContent = '↺ Empezar de nuevo';
  b.onclick = inicio; pie.appendChild(b);
}

function menuPropiedad(p){
  propiedadActual = p;
  burbuja('¡Hola! 😊 Sí, esa es la de ' + (p.direccion || p.comuna) + (p.comuna && p.direccion ? ', ' + p.comuna : '') + '. ¿Qué te gustaría ver?','bot');
  botonera(p.menu, (b) => apretar(b, p));
}

function apretar(b, p){
  const accion = String(b.id).split(':')[0];
  if (accion === 'ficha'){
    burbuja('Con gusto, acá va la información 👇','bot');
    burbuja(p.ficha,'bot');
    burbuja('¿Quieres que una ejecutiva coordine una visita?','bot');
    botonera(p.menuDespuesFicha, (x) => apretar(x, p));
  } else if (accion === 'requisitos'){
    burbuja(p.requisitos,'bot');
    botonera(p.menuDespuesRequisitos, (x) => apretar(x, p));
  } else if (accion === 'agendar'){
    burbuja('¡Dale! 😊 Dame dos opciones de día y hora que te acomoden y una ejecutiva coordina contigo.','bot');
    pie.innerHTML = '';
    const b1 = document.createElement('button');
    b1.textContent = '✍️ "el jueves a las 6, o el sábado en la mañana"';
    b1.onclick = () => { burbuja('el jueves a las 6 de la tarde, o el sábado en la mañana. Me llamo Claudia','yo'); setTimeout(agendado, 380); };
    pie.appendChild(b1);
  } else if (accion === 'ejecutiva'){
    burbuja('Te paso con una ejecutiva de Gesta, te escribe a este mismo número 🙌','bot');
    informe(D.informeVisita, D.telefonoDemo);
    fin('Sofía no responde más en este chat: la conversación es de la ejecutiva.');
  }
}

function agendado(){
  burbuja('Listo Claudia, quedaste con las dos opciones anotadas ✅ Una ejecutiva de Gesta te escribe para cerrar el día.','bot');
  informe(D.informeVisita, D.telefonoDemo);
  fin('Acá Sofía se calla: después de agendar, la conversación es de la ejecutiva.');
}

function captacion(){
  burbuja('Hola, estoy interesado en vender o arrendar mi propiedad con ustedes. ¿Me podrías ayudar?','yo');
  setTimeout(()=>{
    burbuja('¡Hola! Claro que sí 😊 Cuéntame: ¿tu propiedad está en la Región Metropolitana?','bot');
    botonera(D.siNo, (b) => {
      if (b.id === 'rm:no'){
        burbuja('Te agradezco un montón que hayas pensado en Gesta 🙏 Por ahora trabajamos solo con propiedades de la Región Metropolitana, así que esta no la podríamos tomar.','bot');
        fin('No deriva a nadie: el caso ya está resuelto y nadie pierde el tiempo.');
        return;
      }
      burbuja('¡Perfecto! Cuéntame de ella: qué tipo de propiedad es, cuántos metros cuadrados, cuántos dormitorios y baños, y cualquier detalle que sirva.','bot');
      pie.innerHTML='';
      const b1 = document.createElement('button');
      b1.textContent = '✍️ "casa en Maipú, 120 m², 3D 2B, para arrendar"';
      b1.onclick = () => {
        burbuja('es una casa de 120 metros, 3 dormitorios y 2 baños en Maipú, quiero arrendarla. Soy Rodrigo','yo');
        setTimeout(()=>{
          burbuja('¡Gracias Rodrigo! Ya tengo todos los datos 🙌 Una ejecutiva de Gesta te contacta para ver tu propiedad.','bot');
          informe(D.informeCaptacion, D.telefonoDemo);
          fin('Captación tomada. Desde acá sigue la ejecutiva.');
        }, 380);
      };
      pie.appendChild(b1);
    });
  }, 380);
}

function noPublicada(){
  burbuja('hola, me interesó la propiedad en Pedro de Valdivia 1234','yo');
  setTimeout(()=>{
    burbuja('Mmm, esa no la tengo publicada 😕 Puede que ya no esté disponible. ¿Quieres que te contacte una ejecutiva?','bot');
    botonera([{id:'ejecutiva',titulo:'💬 Con una ejecutiva'}], () => {
      burbuja('Te paso con una ejecutiva de Gesta, te escribe a este mismo número 🙌','bot');
      fin('No inventó una propiedad parecida: dijo que no la tiene y pasó a una persona.');
    });
  }, 380);
}

function inicio(){
  chat.innerHTML = ''; pie.innerHTML = ''; propiedadActual = null;
  nota('Elige por dónde llega la persona');

  const sel = document.createElement('select');
  sel.innerHTML = '<option value="">📲 Llega por el aviso de una propiedad…</option>' +
    D.propiedades.map((p,i)=>'<option value="'+i+'">'+p.linea.replace(/</g,'')+'</option>').join('');
  sel.onchange = () => {
    if (sel.value === '') return;
    const p = D.propiedades[+sel.value];
    pie.innerHTML = '';
    burbuja(p.mensajeDeAviso, 'yo');
    setTimeout(()=>menuPropiedad(p), 380);
  };
  const caja = document.createElement('div'); caja.style.width='100%'; caja.appendChild(sel);
  pie.appendChild(caja);

  const b2 = document.createElement('button'); b2.textContent='👋 Solo saluda';
  b2.onclick = () => { pie.innerHTML=''; burbuja('hola','yo'); setTimeout(()=>{
    burbuja('¡Hola! Soy Sofía, de Gesta 😊 ¿Qué te interesa?','bot');
    botonera(D.bienvenida, (b) => {
      if (b.id === 'captacion') { pie.innerHTML=''; captacion(); return; }
      burbuja('Perfecto. ¿Viste alguna publicación que te gustara? Mándame la dirección y te cuento todo 😊','bot');
      fin('Desde acá sigue igual que si hubiera llegado por el aviso.');
    });
  }, 380); };
  pie.appendChild(b2);

  const b3 = document.createElement('button'); b3.textContent='💰 Quiere vender con Gesta';
  b3.onclick = () => { pie.innerHTML=''; captacion(); };
  pie.appendChild(b3);

  const b4 = document.createElement('button'); b4.textContent='🚫 Pregunta por una que no existe';
  b4.onclick = () => { pie.innerHTML=''; noPublicada(); };
  pie.appendChild(b4);
}

inicio();
</script>
</body>
</html>`;
}

main().catch((e) => { console.error('No pude generar la demo:', e); process.exitCode = 1; });
