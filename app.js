/* Lector de hojas de despacho del sistema SOFIA (PDF con texto).
   Recibe las páginas como listas de fragmentos {x, y, w, s} (posición, ancho y texto) y devuelve los datos de la hoja.
   No usa red: todo se procesa en el dispositivo. */
(function (g) {
  const isNum = s => /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(String(s).trim());
  const num = s => { const n = parseFloat(String(s).trim().replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; };
  const isoFromBR = s => { const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };

  function rowsOf(items) {
    const rows = [];
    items.filter(i => i.s.trim()).sort((a, b) => b.y - a.y || a.x - b.x).forEach(it => {
      let r = rows.find(r => Math.abs(r.y - it.y) <= 2.5);
      if (!r) { r = { y: it.y, its: [] }; rows.push(r); }
      r.its.push(it);
    });
    rows.forEach(r => r.its.sort((a, b) => a.x - b.x));
    return rows.sort((a, b) => b.y - a.y);
  }
  const t = it => it.s.trim();
  const findRow = (rows, re, from = 0) => { for (let i = from; i < rows.length; i++) if (rows[i].its.some(it => re.test(t(it)))) return i; return -1; };
  const nextTo = (row, re) => { const k = row.its.findIndex(it => re.test(t(it))); return k >= 0 && row.its[k + 1] ? t(row.its[k + 1]) : null; };
  const lastOf = row => t(row.its[row.its.length - 1]);
  function below(rows, i, x, pred = isNum, max = 5) {
    for (let j = i + 1; j < Math.min(rows.length, i + 1 + max); j++) {
      const it = rows[j].its.find(it => Math.abs(it.x - x) < 6 && pred(t(it)));
      if (it) return t(it);
    }
    return null;
  }
  function labelValue(rows, re, pred) {
    const i = findRow(rows, re); if (i < 0) return null;
    const it = rows[i].its.find(it => re.test(t(it)));
    return below(rows, i, it.x, pred);
  }
  const col = it => { const r = it.x + (it.w || 0); return r < 400 ? 'trib' : r < 500 ? 'lib' : 'gar'; };

  function parseHoja(pages) {
    if (!pages || !pages.length) throw new Error('El archivo no tiene páginas.');
    const head = rowsOf(pages[0]);
    if (findRow(head, /^DESPACHO NUMERO:$/) < 0 || findRow(head, /^LIQUIDACION$/) < 0) throw new Error('Este PDF no parece una hoja de despacho del sistema SOFIA.');
    const out = {};
    let r = head[findRow(head, /^DESPACHO NUMERO:$/)]; out.despacho = nextTo(r, /^DESPACHO NUMERO:$/);
    out.regimen = nextTo(head[findRow(head, /^REGIMEN :$/)], /^REGIMEN :$/);
    r = head[findRow(head, /^ADUANA :$/)]; out.aduana = nextTo(r, /^ADUANA :$/); out.fechaOficial = isoFromBR(nextTo(r, /^FECHA OFIC:$/));
    r = head[findRow(head, /^Fecha Imp\. :$/)]; if (r) { out.fechaImp = isoFromBR(nextTo(r, /^Fecha Imp\. :$/)); out.estado = nextTo(r, /^Estado:$/); }
    out.importador = { nombre:nextTo(head[findRow(head, /^IMP\.\/EXP :$/)], /^IMP\.\/EXP :$/), ruc:nextTo(head[findRow(head, /^RUC\/DOC :$/)], /^RUC\/DOC :$/) };
    const di = findRow(head, /^DESP\.$/);
    if (di >= 0) {
      let nombre = nextTo(head[di], /^DESP\.$/); const nx = head[di + 1];
      if (nx && nx.its.length === 1 && nx.its[0].x < 50 && head[di].y - nx.y < 16 && !/[:=]/.test(t(nx.its[0]))) nombre += ' ' + t(nx.its[0]);
      out.despachante = { nombre, ruc:nextTo(head[di], /^RUC:$/) };
    }
    const vi = findRow(head, /^VEND\/COMP\.$/); out.vendedor = vi >= 0 ? nextTo(head[vi], /^VEND\/COMP\.$/) : null;
    out.condVenta = labelValue(head, /^COND\. VENTA$/, s => /^[A-Z]{3}$/.test(s));
    out.valorFactura = num(labelValue(head, /^VALOR FACTURA$/));
    out.flete = num(labelValue(head, /^FLETE :$/));
    out.seguro = num(labelValue(head, /^SEGURO FACTURA$/));
    out.imponibleGs = num(labelValue(head, /^VALOR IMPONIBLE$/));
    out.cambio = num(labelValue(head, /^CAMBIO FACTURA$/));
    r = head[findRow(head, /^VIA$/)]; out.via = r ? nextTo(r, /^VIA$/) : null;
    r = head[findRow(head, /^CANT\.BULTOS$/)]; out.bultos = r ? num(lastOf(r)) : null;
    r = head[findRow(head, /^KILO\.BRUTO$/)]; out.kiloBruto = r ? num(lastOf(r)) : null;
    r = head[findRow(head, /^KILO NETO$/)]; out.kiloNeto = r ? num(nextTo(r, /^KILO NETO$/)) : null;
    r = head[findRow(head, /^DEP\. ALMAC\.$/)]; out.deposito = r ? nextTo(r, /^DEP\. ALMAC\.$/) : null;

    // Liquidación
    const li = findRow(head, /^LIQUIDACION$/); out.liquidacion = []; out.total = null;
    for (let i = li + 1; i < head.length; i++) {
      const row = head[i], f = t(row.its[0]);
      const sums = () => { const o = { trib:0, lib:0, gar:0 }; row.its.slice(1).filter(it => isNum(t(it))).forEach(it => { o[col(it)] = num(t(it)); }); return o; };
      if (/^TOTAL GENERAL/.test(f)) { out.total = sums(); break; }
      const m = f.match(/^(\d{3}) - (.+)$/);
      if (m) out.liquidacion.push(Object.assign({ codigo:m[1], concepto:m[2] }, sums()));
    }
    const ci = findRow(head, /^CANAL ASIGNADO$/); out.canal = ci >= 0 && head[ci + 1] ? t(head[ci + 1].its[0]) : null;

    // Resto de las páginas
    let rows = [];
    pages.slice(1).forEach(p => { rowsOf(p).filter(r => r.y < 935).forEach(r => rows.push(r)); });
    // Los datos de transporte pueden estar en la primera página si el documento es corto.
    const lim = (() => { const k = findRow(rows, /^\*\* DATOS MEDIO TRANSPORTE \*\*$/); return k >= 0 ? k : rows.length; })();
    const starts = []; rows.slice(0, lim).forEach((row, i) => { if (row.its[0].x < 50 && /^\d+\/\d+$/.test(t(row.its[0])) && +t(row.its[0]).split('/')[1] < 1000) starts.push(i); });
    const otros = findRow(rows, /^OTROS\.\.\.$/);
    out.items = starts.map((s, k) => {
      const end = k + 1 < starts.length ? starts[k + 1] : (otros > s ? otros : rows.length);
      const b = rows.slice(s, end), first = b[0];
      const it = { n:+t(first.its[0]).split('/')[0], tipo:t(first.its[1] || { s:'' }), posicion:t(first.its[2] || { s:'' }), arancel:parseFloat(String(t(first.its[3] || { s:'0' })).replace(',', '.')) || 0 };
      it.fob = num(labelValue(b, /^FOB FACTURA$/));
      const di2 = findRow(b, /^DESCRIPCION EN TERMINOS COMERCIALES$/), pi = findRow(b, /^PAIS ORIGEN\/DEPARTAMENTO$/);
      if (di2 >= 0 && pi > di2) {
        const r0 = b[di2 + 1]; const parts = [];
        b.slice(di2 + 1, pi).forEach(row => { const a = row.its[0]; if (a && a.x < 100) parts.push(t(a)); });
        it.descripcion = parts.join(' ').replace(/\s+/g, ' ');
        const dr = b.slice(di2 + 1, pi).find(row => row.its.some(x => Math.abs(x.x - 352) < 30 && isNum(t(x)))) || r0;
        const mk = dr.its.find(x => x.x > 200 && x.x < 320); it.marca = mk ? t(mk) : '';
        const cq = dr.its.find(x => Math.abs(x.x - 352) < 30 && isNum(t(x))); it.cantidad = cq ? num(t(cq)) : null;
        const un = dr.its.find(x => Math.abs(x.x - 439) < 20); it.unidad = un ? t(un) : '';
      }
      if (pi >= 0 && b[pi + 1]) {
        const o = b[pi + 1].its; it.origen = o[0] ? t(o[0]) : ''; it.procedencia = o[1] ? t(o[1]) : '';
        const kn = o.find(x => Math.abs(x.x - 352) < 30 && isNum(t(x))); it.kiloNeto = kn ? num(t(kn)) : null;
        const es = o.find(x => Math.abs(x.x - 439) < 20); it.estado = es ? t(es) : '';
      }
      it.imponibleUsd = num(labelValue(b, /^IMPONIBLE\(\$\)$/));
      it.imponibleGs = num(labelValue(b, /^IMPONIBLE\(Gs\)$/));
      return it;
    });

    // Transporte, manifiestos y facturas
    out.transporte = []; out.manifiestos = [];
    const ti = findRow(rows, /^\*\* DATOS MEDIO TRANSPORTE \*\*$/), mi = findRow(rows, /^\*\* MANIFIESTOS ENTRADA\/SALIDA \*\*$/), fi = findRow(rows, /^\*\* FACTURAS A PRESENTAR \*\*$/);
    if (ti >= 0 && mi > ti) rows.slice(ti + 1, mi).forEach(row => { if (row.its.length === 3 && !/^MATRICULA$/.test(t(row.its[0]))) out.transporte.push({ matricula:t(row.its[0]), carreta:t(row.its[1]), mic:t(row.its[2]) }); });
    if (mi >= 0) rows.slice(mi + 1, fi > mi ? fi : rows.length).forEach(row => row.its.forEach(it => t(it).split(/\s+/).forEach(w => { if (/^\d{5}MANI\w+$/.test(w)) out.manifiestos.push(w); })));
    out.factura = null;
    if (fi >= 0) {
      const all = rows.slice(fi + 1).flatMap(row => row.its.map(t));
      const nro = all.find(s => /^\d+\/\d{4}$/.test(s)), fecha = all.find(s => /^\d{2}-[A-Z]{3}-\d{2}$/.test(s));
      const imp = all.filter(s => /,\d{2}$/.test(s) && isNum(s)).map(num).sort((a, b) => b - a)[0];
      if (nro || imp) out.factura = { nro, fecha, importe:imp ?? null };
    }
    if (!out.items.length) throw new Error('No encontré ítems en la hoja. ¿Es la hoja completa?');
    return out;
  }
  g.parseHoja = parseHoja;
})(typeof globalThis !== 'undefined' ? globalThis : window);

(() => {
const KEY = 'pecomex-demo-v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dots = n => Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const gs = n => (n < 0 ? '−' : '') + 'Gs.\u00a0' + dots(n);
const bigN = n => `<small class="u">Gs.</small>${n < 0 ? '−' : ''}${dots(n)}`;
const dec = n => { const [i, d] = n.toFixed(2).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; };
const iso = d => d.toISOString().slice(0, 10);
const dago = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const fd = s => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
const days = s => Math.max(0, Math.floor((Date.now() - new Date(s + 'T12:00:00')) / 864e5));

/* ---------- Datos de ejemplo (nombres y RUC ficticios) ---------- */
const ITEMS = [
  ['8431.43.10','Complementos de máquina pilotera Liebherr LB28-32',30000,212161591,0],
  ['8431.43.90','Camisas iniciadoras de perforación (5)',11400,80621418,0],
  ['8431.43.90','Carotiere (turbo calador) 1600 mm',415,2934837,0],
  ['8431.43.90','Barrenas de perforación (5)',3460,24469265,0],
  ['8431.43.90','Útiles de perforación (3)',900,6364815,0],
  ['8431.43.90','Barras Kelly de perforación (2)',28400,200846331,0],
  ['7312.10.90','Rollos de cable para pilotera (4)',3464,24497561,12.6],
  ['7306.30.90','Jaula tremie con 12 tubos y cono',1160,8203562,14],
  ['7309.00.90','Estanques para polímero con plataforma (3)',6700,47382739,0],
  ['7309.00.90','Estanques para polímero y canastillo (3)',6350,44907545,0],
  ['8413.70.90','Bombas impulsoras y tablero eléctrico (4)',1800,12729688,0],
  ['8609.00.00','Contenedor 1x20 taller de herramientas',6850,48443561,0],
  ['8311.90.00','Contenedor con equipo de soldadura',1925,13614049,16]
];
const docs0 = (o = {}) => Object.assign({ factura:true, crt:true, packing:true, mandato:true, hoja:true }, o);
function seed() {
  return {
    clientes: [
      { id:1, nombre:'Consorcio Ruta Norte', ruc:'80000001-0' },
      { id:2, nombre:'Agroinsumos del Este S.A.', ruc:'80000002-8' },
      { id:3, nombre:'Ferretería Central S.R.L.', ruc:'80000003-6' },
      { id:4, nombre:'Maquila Guaraní S.A.', ruc:'80000004-4' }
    ],
    ops: [
      { id:1, cl:1, ref:'26003IT04000099X', reg:'IT04 · Importación temporaria', aduana:'José Falcón', desc:'Equipos de perforación usados (13 ítems)', estado:'Cerrada', fecha:dago(46), cierre:dago(38),
        usd:102824, flete:23360, cambio:5716.25, imponible:727176966, trib:13538013, gar:80136070, estG:15000000, hon:7500000,
        liq:[['010 Derecho aduanero',0,6413440],['031 Servicio de valoración',3635885,0],['042 Interés ad. temporal',9616328,0],['415 I.V.A.',0,73722630],['500 Tasa de intervención',285800,0]],
        items:ITEMS, docs:docs0(),
        movs:[{id:1,f:dago(44),t:'c',c:'Anticipo del cliente',m:14000000},{id:2,f:dago(40),t:'g',c:'Tributos pagados (liquidación)',m:13538013},{id:3,f:dago(39),t:'g',c:'Almacenaje depósito Falcón',m:1850000},{id:4,f:dago(39),t:'p',c:'Gestor en aduana',m:600000}] },
      { id:2, cl:2, ref:'26003IC04000118K', reg:'IC04 · Importación definitiva', aduana:'Asunción', desc:'Fertilizantes granulados, 1 contenedor', estado:'Abierta', fecha:dago(6), cierre:null,
        estG:30000000, hon:4200000, docs:docs0({packing:false}),
        movs:[{id:1,f:dago(5),t:'c',c:'Anticipo del cliente',m:20000000},{id:2,f:dago(2),t:'g',c:'Tributos pagados (liquidación)',m:28400000},{id:3,f:dago(1),t:'g',c:'Almacenaje',m:950000},{id:4,f:dago(1),t:'p',c:'Gestor en aduana',m:350000}] },
      { id:3, cl:3, ref:'26003IC04000077B', reg:'IC04 · Importación definitiva', aduana:'Ciudad del Este', desc:'Herramientas manuales, 2 contenedores', estado:'Cerrada', fecha:dago(80), cierre:dago(72),
        estG:20000000, hon:5100000, docs:docs0(),
        movs:[{id:1,f:dago(78),t:'c',c:'Anticipo del cliente',m:10000000},{id:2,f:dago(75),t:'g',c:'Tributos pagados (liquidación)',m:18900000},{id:3,f:dago(74),t:'g',c:'Almacenaje y flete local',m:1400000},{id:4,f:dago(74),t:'p',c:'Gestor en aduana',m:500000}] },
      { id:4, cl:3, ref:'26003IC04000092T', reg:'IC04 · Importación definitiva', aduana:'Ciudad del Este', desc:'Repuestos de bicicletas', estado:'Cerrada', fecha:dago(40), cierre:dago(34),
        estG:6500000, hon:2300000, docs:docs0(),
        movs:[{id:1,f:dago(39),t:'c',c:'Anticipo del cliente',m:8500000},{id:2,f:dago(36),t:'g',c:'Tributos pagados (liquidación)',m:6200000},{id:3,f:dago(35),t:'p',c:'Gestor en aduana',m:250000}] },
      { id:5, cl:4, ref:'26003MQ01000031H', reg:'Maquila · Admisión temporal', aduana:'Asunción', desc:'Insumos textiles para maquila', estado:'Abierta', fecha:dago(12), cierre:null,
        estG:1200000, hon:3000000, docs:docs0({mandato:false, packing:false}),
        movs:[{id:1,f:dago(9),t:'g',c:'Tributos pagados (liquidación)',m:1150000}] },
      { id:6, cl:1, ref:'26003IC04000125D', reg:'IC04 · Importación definitiva', aduana:'Asunción', desc:'Repuestos de maquinaria', estado:'Cerrada', fecha:dago(21), cierre:dago(15),
        estG:4500000, hon:2800000, docs:docs0(),
        movs:[{id:1,f:dago(17),t:'g',c:'Tributos pagados (liquidación)',m:4300000},{id:2,f:dago(16),t:'p',c:'Gestor en aduana',m:300000}] }
    ]
  };
}
let S = load();
function load() { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) {} return seed(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
const ui = { seg:'resumen', filtro:'todas' };

/* ---------- Cálculos ---------- */
const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
function calc(o) {
  const g = sum(o.movs.filter(m => m.t === 'g'), m => m.m), p = sum(o.movs.filter(m => m.t === 'p'), m => m.m), c = sum(o.movs.filter(m => m.t === 'c'), m => m.m);
  const total = g + o.hon, saldo = total - c;
  return { g, p, c, total, saldo, margen:o.hon - p, dif:g - o.estG,
    adel:o.estado === 'Abierta' ? Math.max(0, g - c) : 0,
    xcobrar:o.estado === 'Cerrada' ? Math.max(0, saldo) : 0,
    dias:o.cierre ? days(o.cierre) : 0 };
}
const bucket = d => d <= 30 ? 0 : d <= 60 ? 1 : 2;
const BL = ['0 a 30 días', '31 a 60 días', 'Más de 60 días'];
function cliCalc(id) {
  const b = [0, 0, 0]; let adel = 0, curso = 0;
  S.ops.filter(o => o.cl === id).forEach(o => { const k = calc(o); adel += k.adel; if (k.xcobrar > 0) b[bucket(k.dias)] += k.xcobrar; if (o.estado === 'Abierta') curso += Math.max(0, k.saldo); });
  return { b, total:b[0] + b[1] + b[2], adel, curso, peor:b[2] > 0 ? 2 : b[1] > 0 ? 1 : b[0] > 0 ? 0 : -1 };
}
const cliente = id => S.clientes.find(c => c.id === id);
function estadoTxt(id) {
  const c = cliente(id);
  const rows = S.ops.filter(o => o.cl === id).map(o => ({ o, k:calc(o) })).filter(r => r.k.saldo > 0);
  let t = `Estado de cuenta: ${c.nombre}\nRUC ${c.ruc}\nAl ${fd(iso(new Date()))}\n\n`;
  rows.forEach(({ o, k }) => { t += `• ${o.desc} (${o.ref})${o.estado === 'Abierta' ? ' · en trámite' : ''}\n  Total ${gs(k.total)} · Cobrado ${gs(k.c)} · Saldo ${gs(k.saldo)}\n`; });
  t += rows.length ? `\nSaldo total: ${gs(sum(rows, r => r.k.saldo))}\n` : 'No tiene saldo pendiente.\n';
  return t + '\nGracias.';
}

/* ---------- Piezas ---------- */
const I = {
  chev:'<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>',
  check:'<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5l3 3 6-7"/></svg>',
  mark:'<svg viewBox="0 0 18 18" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h7l3 3v11H4z"/><path d="M7 9h5M7 12h5"/></svg>'
};
const pill = (t, k = '') => `<span class="pill ${k}">${esc(t)}</span>`;
const stClass = n => n === 2 ? 's2' : n === 1 ? 's1' : n === 0 ? 's0' : 'sn';
function agingBar(b) {
  const t = b[0] + b[1] + b[2];
  if (!t) return '<p class="muted small">No hay saldos vencidos por cobrar.</p>';
  const cl = ['a0', 'a1', 'a2'];
  return `<div class="bar" role="img" aria-label="Por cobrar por antigüedad: ${b.map((v, i) => BL[i] + ' ' + gs(v)).join(', ')}">${b.map((v, i) => v ? `<span class="bseg ${cl[i]}" style="flex:${v}"></span>` : '').join('')}</div>
  <ul class="legend">${b.map((v, i) => `<li><i class="dot ${cl[i]}"></i><span>${BL[i]}</span><b class="mono">${gs(v)}</b></li>`).join('')}</ul>`;
}
function opRow(o) {
  const k = calc(o), c = cliente(o.cl);
  const miss = Object.values(o.docs).filter(v => !v).length;
  return `<a class="row" href="#op-${o.id}"><div class="main"><span class="t">${esc(o.desc)}</span><span class="s">${esc(c.nombre)} · <span class="mono">${esc(o.ref)}</span></span></div>
  <div class="r"><span class="amt">${gs(k.saldo)}</span>${pill(o.estado, o.estado === 'Abierta' ? '' : k.saldo > 0 ? 'warn' : 'ok')}${miss ? pill(miss + ' doc. falta' + (miss > 1 ? 'n' : ''), 'bad') : ''}</div>${I.chev}</a>`;
}
function cliRow(c) {
  const k = cliCalc(c.id);
  return `<a class="row" href="#cliente-${c.id}"><i class="stripe ${stClass(k.peor)}"></i><div class="main"><span class="t">${esc(c.nombre)}</span><span class="s mono">RUC ${esc(c.ruc)}</span></div>
  <div class="r"><span class="amt">${gs(k.total)}</span>${k.peor === 2 ? pill('+60 días', 'bad') : k.peor === 1 ? pill('31 a 60 días', 'warn') : k.total ? pill('al día', 'ok') : pill('sin deuda', 'ok')}</div>${I.chev}</a>`;
}

/* ---------- Vistas ---------- */
function vInicio() {
  const ops = S.ops, ks = ops.map(calc);
  const adel = sum(ks, k => k.adel), xc = sum(ks, k => k.xcobrar), b = [0, 0, 0];
  ops.forEach((o, i) => { if (ks[i].xcobrar > 0) b[bucket(ks[i].dias)] += ks[i].xcobrar; });
  const alerts = [];
  S.clientes.forEach(c => { const k = cliCalc(c.id); if (k.b[2] > 0) alerts.push({ h:'#cliente-' + c.id, t:`${c.nombre} tiene ${gs(k.b[2])} con más de 60 días`, s:'Cobranza vencida', k:'bad' }); });
  ops.forEach((o, i) => { const m = Object.entries(o.docs).filter(([, v]) => !v).map(([n]) => ({ factura:'factura', crt:'CRT', packing:'packing list', mandato:'mandato', hoja:'hoja de despacho' }[n])); if (m.length && o.estado === 'Abierta') alerts.push({ h:'#op-' + o.id, t:`${o.desc}: falta ${m.join(' y ')}`, s:'Documentos pendientes', k:'warn' }); });
  ops.forEach((o, i) => { if (o.estado === 'Abierta' && o.estG > 0 && ks[i].dif > o.estG * 0.05) alerts.push({ h:'#op-' + o.id, t:`${o.desc}: gastos ${gs(ks[i].dif)} sobre lo estimado`, s:'Desvío de costos', k:'warn' }); });
  const abiertas = ops.filter(o => o.estado === 'Abierta');
  return `<div class="top"><div class="brand"><span class="mark">${I.mark}</span>Pecomex</div>${pill('Datos de ejemplo')}</div>
  <h1>Hoy en la agencia</h1>
  <p class="muted small" style="margin-top:4px">${fd(iso(new Date()))} · ${abiertas.length} operaciones abiertas</p>
  <div class="sec"><div class="card hero">
    <div class="fig"><div><p class="lbl">Adelantado por la agencia</p><p class="val big">${bigN(adel)}</p></div><div><p class="lbl">Por cobrar (cerradas)</p><p class="val">${bigN(xc)}</p></div></div>
    ${agingBar(b)}
  </div></div>
  <div class="sec"><h2>Requieren atención</h2>${alerts.length ? `<div class="list">${alerts.map(a => `<a class="row" href="${a.h}"><div class="main"><span class="t">${esc(a.t)}</span><span class="s">${a.s}</span></div>${pill(a.k === 'bad' ? 'Urgente' : 'Revisar', a.k)}${I.chev}</a>`).join('')}</div>` : '<div class="card empty">Todo en orden por ahora.</div>'}</div>
  <div class="sec"><h2>Operaciones abiertas <a href="#operaciones" class="small" style="text-transform:none;letter-spacing:0;color:var(--accent)">Ver todas</a></h2><div class="list">${abiertas.map(opRow).join('') || '<div class="empty">No hay operaciones abiertas.</div>'}</div></div>
  <div class="foot"><p>Prototipo con datos de ejemplo y nombres ficticios. La operación con 13 ítems se armó a partir de una hoja de despacho real.</p><button data-a="reset" type="button">Restablecer datos de ejemplo</button></div>`;
}

/* ---------- Importar hoja de despacho (PDF) ---------- */
const rucKey = r => String(r || '').replace(/\D/g, '');
const rucFmt = r => { const d = rucKey(r); return d.length > 1 ? d.slice(0, -1) + '-' + d.slice(-1) : d; };
const tcase = s => String(s || '').toLowerCase().replace(/(^|[\s\-\/(])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bS\.?a\.?(?=\s|$)/g, 'S.A.').replace(/\bSpa\b/g, 'SpA').replace(/\bS\.?r\.?l\.?(?=\s|$)/g, 'S.R.L.');
const sent = s => { s = String(s || '').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
const REG = { IT04:'Importación temporaria', IC04:'Importación definitiva', IC01:'Importación definitiva', EC01:'Exportación definitiva', TR01:'Tránsito aduanero' };
function regTxt(r) { const m = String(r || '').match(/^(\w+)\s*-\s*(.+)$/); if (!m) return r || 'Por definir'; return m[1] + ' · ' + (REG[m[1]] || sent(m[2].split(/ S\//)[0])); }
function checks(d) {
  const sf = sum(d.items, i => i.fob || 0), si = sum(d.items, i => i.imponibleGs || 0), dI = (d.imponibleGs || 0) - si;
  const st = d.total ? d.total.trib : 0, sl = sum(d.liquidacion, r => r.trib), sg = sum(d.liquidacion, r => r.gar);
  return [
    ['Suma de ítems (USD) = valor factura', Math.abs(sf - (d.valorFactura || 0)) < 0.01, `${dec(sf)} / ${dec(d.valorFactura || 0)}`],
    ['Suma de imponibles por ítem = valor imponible', Math.abs(dI) <= Math.max(10, d.items.length), `diferencia ${gs(dI)} (redondeo)`],
    ['Suma de tributos = total tributado', d.total && sl === st, `${gs(sl)}`],
    ['Suma de garantizados = total garantizado', d.total && sg === d.total.gar, `${gs(sg)}`]
  ];
}
function impCard() { return `<div class="sec"><div class="card imp">
    <h3>Importar hoja de despacho (PDF)</h3>
    <p class="small muted" style="margin:4px 0 12px">Subí la hoja que baja el despachante y la operación se arma sola: cliente, tributos, ítems y controles. El archivo se lee en tu dispositivo y no se envía a ningún servidor.</p>
    <label class="btn acc filebtn">${ui.imp && ui.imp.busy ? 'Leyendo el PDF…' : 'Elegir PDF'}<input id="impFile" type="file" accept="application/pdf,.pdf" hidden></label>
    ${ui.imp && ui.imp.err ? `<div class="note warn" style="margin-top:12px"><b>No pude leer esa hoja.</b> ${esc(ui.imp.err)}</div>` : ''}
  </div></div>${ui.imp && ui.imp.data ? impPreview(ui.imp.data) : ''}`; }
function impPreview(d) {
  const cl = S.clientes.find(c => rucKey(c.ruc) === rucKey(d.importador.ruc)), dup = S.ops.find(o => o.ref === d.despacho);
  const ck = checks(d), ok = ck.every(c => c[1]);
  return `<div class="sec"><div class="card imp"><h3>Vista previa de la hoja</h3>
    <dl class="kv" style="margin-top:10px">
      <dt>Despacho</dt><dd class="mono">${esc(d.despacho)}</dd>
      <dt>Régimen</dt><dd>${esc(regTxt(d.regimen))}</dd>
      <dt>Aduana</dt><dd>${esc(tcase(d.aduana))}</dd>
      <dt>Cliente (importador)</dt><dd>${esc(tcase(d.importador.nombre))}<br><span class="mono small muted">RUC ${esc(rucFmt(d.importador.ruc))}</span></dd>
      <dt>Proveedor</dt><dd>${esc(tcase(d.vendedor))}</dd>
      <dt>Valor factura</dt><dd class="mono">USD ${dec(d.valorFactura || 0)}${d.condVenta ? ' · ' + esc(d.condVenta) : ''}</dd>
      <dt>Ítems</dt><dd class="mono">${d.items.length}</dd>
      <dt>Se paga en efectivo</dt><dd class="mono"><b>${gs(d.total ? d.total.trib : 0)}</b></dd>
      <dt>Garantizado</dt><dd class="mono">${gs(d.total ? d.total.gar : 0)}</dd></dl>
    <div class="note ${cl ? 'good' : 'warn'}" style="margin-top:12px">${cl ? `Cliente encontrado por RUC: <b>${esc(cl.nombre)}</b>.` : '<b>Cliente nuevo.</b> Se va a crear con el nombre y el RUC de la hoja.'}</div>
    <h3 style="margin:16px 0 8px">Controles automáticos</h3>
    <ul class="ck">${ck.map(c => `<li class="${c[1] ? 'ok' : 'bad'}"><span>${c[1] ? '✓' : '✗'}</span><span>${c[0]}<br><span class="mono small muted">${c[2]}</span></span></li>`).join('')}</ul>
    ${ok ? '' : '<div class="note warn" style="margin-top:10px">Alguno de los controles no cuadra. Revisá los datos antes de confiar en esta operación.</div>'}
    ${dup ? `<div class="note warn" style="margin-top:10px"><b>Esta hoja ya fue cargada</b> como operación existente. No se puede crear dos veces.</div>` : ''}
    <form class="form" id="impForm" style="margin-top:14px">
      <label>Honorario pactado (Gs.)<input id="i-hon" inputmode="numeric" required placeholder="3.000.000"></label>
      <label>Gastos estimados por cuenta del cliente (Gs.)<input id="i-est" inputmode="numeric" required value="${d.total ? dots(d.total.trib) : ''}"></label>
      <div class="btns"><button class="btn acc" type="submit" ${dup ? 'disabled' : ''}>Crear operación</button><button class="btn alt" type="button" data-a="impCancel">Descartar</button></div>
    </form></div></div>`;
}
let pdfjsP;
function loadPdfjs() {
  if (pdfjsP) return pdfjsP;
  const V = '6.2.108', tries = [
    [new URL('vendor/pdf.min.mjs', location.href).href, new URL('vendor/pdf.worker.min.mjs', location.href).href],
    [`https://cdn.jsdelivr.net/npm/pdfjs-dist@${V}/build/pdf.min.mjs`, `https://cdn.jsdelivr.net/npm/pdfjs-dist@${V}/build/pdf.worker.min.mjs`]
  ];
  pdfjsP = (async () => {
    for (const [lib, wk] of tries) {
      try { const m = await import(lib); m.GlobalWorkerOptions.workerSrc = wk; return m; } catch (e) {}
    }
    throw new Error('No se pudo cargar el lector de PDF. Probá abrir la versión publicada en GitHub Pages.');
  })();
  pdfjsP.catch(() => { pdfjsP = null; });
  return pdfjsP;
}
async function readPdf(file) {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data:new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) { const tc = await (await doc.getPage(p)).getTextContent(); pages.push(tc.items.filter(i => 'str' in i).map(i => ({ x:i.transform[4], y:i.transform[5], w:i.width, s:i.str }))); }
  return pages;
}
async function onFile(file) {
  ui.imp = { busy:true }; render();
  try { const data = window.parseHoja(await readPdf(file)); ui.imp = { data }; }
  catch (e) { ui.imp = { err:(e && e.message) || 'Error desconocido.' }; }
  render();
}
function crearDesdeHoja(d, hon, estG) {
  let cl = S.clientes.find(c => rucKey(c.ruc) === rucKey(d.importador.ruc));
  if (!cl) { cl = { id:Math.max(0, ...S.clientes.map(c => c.id)) + 1, nombre:tcase(d.importador.nombre), ruc:rucFmt(d.importador.ruc) }; S.clientes.push(cl); }
  const id = Math.max(0, ...S.ops.map(o => o.id)) + 1;
  S.ops.push({ id, cl:cl.id, ref:d.despacho, reg:regTxt(d.regimen), aduana:tcase(d.aduana), desc:`${d.items.length} ítem${d.items.length === 1 ? '' : 's'} · ${tcase(d.vendedor || 'sin proveedor')}`,
    estado:'Abierta', fecha:d.fechaOficial || iso(new Date()), cierre:null, usd:d.valorFactura || 0, flete:d.flete || 0, cambio:d.cambio || 0, imponible:d.imponibleGs || 0,
    trib:d.total ? d.total.trib : 0, gar:d.total ? d.total.gar : 0, estG, hon,
    liq:d.liquidacion.map(r => [r.codigo + ' ' + sent(r.concepto), r.trib, r.gar]),
    items:d.items.map(i => [String(i.posicion || '').slice(0, 10), sent(i.descripcion || ''), i.fob || 0, i.imponibleGs || 0, i.arancel || 0]),
    meta:{ via:d.via, bultos:d.bultos, kiloBruto:d.kiloBruto, kiloNeto:d.kiloNeto, deposito:d.deposito, canal:d.canal, seguro:d.seguro, condVenta:d.condVenta, despachante:d.despachante && d.despachante.nombre,
      factura:d.factura, manifiestos:d.manifiestos, camiones:d.transporte.length },
    docs:{ factura:false, crt:false, packing:false, mandato:false, hoja:true }, movs:[] });
  return id;
}
function vOps() {
  let ops = S.ops.slice().sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
  if (ui.filtro === 'abiertas') ops = ops.filter(o => o.estado === 'Abierta');
  if (ui.filtro === 'cerradas') ops = ops.filter(o => o.estado === 'Cerrada');
  const f = (k, t) => `<button class="chip" type="button" data-a="filtro" data-v="${k}" aria-pressed="${ui.filtro === k}">${t}</button>`;
  return `<div class="top"><h1>Operaciones</h1></div>
  <div class="chips">${f('todas', 'Todas')}${f('abiertas', 'Abiertas')}${f('cerradas', 'Cerradas')}</div>
  ${impCard()}
  <div class="sec" style="margin-top:14px"><div class="list">${ops.map(opRow).join('') || '<div class="empty">No hay operaciones.</div>'}</div></div>
  <div class="sec"><details class="card"><summary>Nueva operación</summary>
    <form class="form" id="newOp">
      <label>Cliente<select id="n-cl">${S.clientes.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select></label>
      <label>Descripción<input id="n-desc" required placeholder="Ej. Neumáticos, 1 contenedor"></label>
      <label>Honorario pactado (Gs.)<input id="n-hon" inputmode="numeric" required placeholder="3.000.000"></label>
      <label>Gastos estimados por cuenta del cliente (Gs.)<input id="n-est" inputmode="numeric" required placeholder="20.000.000"></label>
      <button class="btn acc" type="submit">Crear operación</button>
    </form></details></div>`;
}
function vOp(id) {
  const o = S.ops.find(x => x.id === id); if (!o) return '<p class="empty">No encontré esa operación.</p>';
  const k = calc(o), c = cliente(o.cl);
  const sg = (v, t) => `<button class="segbtn" type="button" data-a="seg" data-v="${v}" aria-pressed="${ui.seg === v}">${t}</button>`;
  let body = '';
  if (ui.seg === 'resumen') {
    body = `<div class="card"><div class="scroll"><table class="tbl"><thead><tr><th></th><th>Estimado</th><th>Real</th></tr></thead><tbody>
      <tr><td>Gastos por cuenta del cliente</td><td>${dots(o.estG)}</td><td>${dots(k.g)}</td></tr>
      <tr><td>Honorario</td><td>${dots(o.hon)}</td><td>${dots(o.hon)}</td></tr>
      <tr class="tot"><td>Total a cobrar</td><td>${dots(o.estG + o.hon)}</td><td>${dots(k.total)}</td></tr></tbody></table></div>
      ${o.estG ? `<p class="small muted" style="margin-top:10px">Gastos ${k.dif > 0 ? 'por encima' : 'por debajo'} de lo estimado: <b class="mono">${gs(Math.abs(k.dif))}</b> (${(Math.abs(k.dif) / o.estG * 100).toFixed(1).replace('.', ',')}%)</p>` : ''}</div>
      <div class="card"><dl class="kv"><dt>Cobrado</dt><dd class="mono">${gs(k.c)}</dd><dt>Saldo</dt><dd class="mono"><b>${gs(k.saldo)}</b></dd><dt>Costos propios</dt><dd class="mono">${gs(k.p)}</dd><dt>Margen de la agencia</dt><dd class="mono"><b>${gs(k.margen)}</b></dd>${o.estado === 'Abierta' ? `<dt>Adelantado ahora</dt><dd class="mono">${gs(k.adel)}</dd>` : `<dt>Días desde el cierre</dt><dd class="mono">${k.dias}</dd>`}</dl></div>
      ${o.estado === 'Abierta' ? '<button class="btn alt" type="button" data-a="cerrar" data-id="' + o.id + '">Marcar como cerrada y facturada</button>' : ''}`;
  } else if (ui.seg === 'liq') {
    if (!o.liq) body = '<div class="card empty">Esta operación todavía no tiene hoja de despacho cargada. En la versión real, acá se lee el PDF que baja el despachante.</div>';
    else {
      const sf = sum(o.items, i => i[2]), si = sum(o.items, i => i[3]), dI = o.imponible - si;
      body = `<div class="note good"><b>La agencia paga ${gs(o.trib)} en efectivo.</b> Los ${gs(o.gar)} restantes quedan garantizados, no se pagan ahora.</div>
      <div class="card"><div class="scroll"><table class="tbl"><thead><tr><th>Concepto</th><th>Tributado</th><th>Garantizado</th></tr></thead><tbody>
      ${o.liq.map(r => `<tr><td>${esc(r[0])}</td><td>${dots(r[1])}</td><td>${dots(r[2])}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td>${dots(o.trib)}</td><td>${dots(o.gar)}</td></tr></tbody></table></div></div>
      <div class="card"><h3 style="margin-bottom:10px">Controles automáticos</h3><dl class="kv">
        <dt>Valor factura (cabecera)</dt><dd class="mono">USD ${dec(o.usd)}</dd>
        <dt>Suma de los ${o.items.length} ítems</dt><dd class="mono">USD ${dec(sf)} ${Math.abs(sf - o.usd) < 0.01 ? '✓' : '✗'}</dd>
        <dt>Valor imponible (cabecera)</dt><dd class="mono">${gs(o.imponible)}</dd>
        <dt>Suma de imponibles por ítem</dt><dd class="mono">${gs(si)} ${Math.abs(dI) <= 10 ? '✓' : '✗'}</dd>
        <dt>Diferencia</dt><dd class="mono">${gs(dI)} (redondeo)</dd>
        <dt>Flete</dt><dd class="mono">USD ${dec(o.flete)}</dd><dt>Tipo de cambio</dt><dd class="mono">${dec(o.cambio)}</dd></dl></div>
      ${o.meta ? `<div class="card"><h3 style="margin-bottom:10px">Datos de la hoja</h3><dl class="kv">${[['Vía', o.meta.via && tcase(o.meta.via)], ['Condición de venta', o.meta.condVenta], ['Bultos', o.meta.bultos], ['Kilo bruto', o.meta.kiloBruto && dots(o.meta.kiloBruto) + ' kg'], ['Kilo neto', o.meta.kiloNeto && dots(o.meta.kiloNeto) + ' kg'], ['Depósito', o.meta.deposito && tcase(o.meta.deposito)], ['Canal', o.meta.canal && tcase(o.meta.canal)], ['Camiones', o.meta.camiones], ['Manifiestos', o.meta.manifiestos && o.meta.manifiestos.length], ['Factura del proveedor', o.meta.factura && o.meta.factura.nro]].filter(r => r[1]).map(r => `<dt>${r[0]}</dt><dd class="mono">${esc(r[1])}</dd>`).join('')}</dl></div>` : ''}
      <div class="sec"><h2>Ítems de la hoja</h2><div class="list">${o.items.map((i, n) => `<div class="row"><div class="main"><span class="t">${n + 1}. ${esc(i[1])}</span><span class="s mono">${i[0]}${i[4] ? ' · arancel ' + String(i[4]).replace('.', ',') + '%' : ''}</span></div><div class="r"><span class="amt">USD ${dec(i[2])}</span><span class="s mono">${gs(i[3])}</span></div></div>`).join('')}</div></div>`;
    }
  } else if (ui.seg === 'movs') {
    const T = { g:'Gasto por cuenta del cliente', p:'Costo propio', c:'Cobro recibido' };
    const ms = o.movs.slice().sort((a, b) => (b.f > a.f ? 1 : -1));
    body = `<div class="list">${ms.map(m => `<div class="row"><div class="main"><span class="t">${esc(m.c)}</span><span class="s">${fd(m.f)} · ${T[m.t]}</span></div><span class="amt" style="color:${m.t === 'c' ? 'var(--good)' : 'inherit'}">${m.t === 'c' ? '+' : '−'}${dots(m.m)}</span></div>`).join('') || '<div class="empty">Sin movimientos.</div>'}</div>
    <details class="card"><summary>Agregar movimiento</summary><form class="form" id="movForm" data-op="${o.id}">
      <label>Tipo<select id="mv-t"><option value="g">Gasto por cuenta del cliente</option><option value="p">Costo propio de la agencia</option><option value="c">Cobro recibido</option></select></label>
      <label>Concepto<input id="mv-c" required placeholder="Ej. Almacenaje depósito"></label>
      <label>Monto (Gs.)<input id="mv-m" inputmode="numeric" required placeholder="1.500.000"></label>
      <button class="btn acc" type="submit">Agregar</button></form></details>`;
  } else {
    const N = { factura:'Factura comercial', crt:'CRT / conocimiento de embarque', packing:'Packing list', mandato:'Mandato del cliente', hoja:'Hoja de despacho' };
    body = `<div class="list">${Object.keys(N).map(d => `<button class="doc" type="button" data-a="doc" data-id="${o.id}" data-v="${d}"><span class="box ${o.docs[d] ? 'on' : ''}">${o.docs[d] ? I.check : ''}</span><span style="flex:1">${N[d]}</span>${pill(o.docs[d] ? 'Recibido' : 'Falta', o.docs[d] ? 'ok' : 'bad')}</button>`).join('')}</div>
    <p class="muted small">En la versión real, acá se adjuntan los archivos de cada documento.</p>`;
  }
  return `<a class="back" href="#operaciones">← Operaciones</a>
  <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div style="min-width:0"><h1>${esc(o.desc)}</h1><p class="muted small mono" style="margin-top:4px">${esc(o.ref)}</p></div>${pill(o.estado, o.estado === 'Abierta' ? '' : 'ok')}</div>
  <p class="small" style="margin:8px 0 14px"><a href="#cliente-${c.id}" style="color:var(--accent)">${esc(c.nombre)}</a> · ${esc(o.reg)} · ${esc(o.aduana)} · ${fd(o.fecha)}</p>
  <div class="segs">${sg('resumen', 'Resumen')}${sg('liq', 'Hoja de despacho')}${sg('movs', 'Gastos y cobros')}${sg('docs', 'Documentos')}</div>
  <div class="sec" style="margin-top:14px">${body}</div>`;
}
function vClientes() {
  const cs = S.clientes.slice().sort((a, b) => cliCalc(b.id).total - cliCalc(a.id).total);
  return `<div class="top"><h1>Clientes</h1></div><div class="list">${cs.map(cliRow).join('')}</div>
  <div class="sec"><details class="card"><summary>Nuevo cliente</summary><form class="form" id="newCli"><label>Nombre o razón social<input id="c-n" required></label><label>RUC<input id="c-r" required placeholder="80000000-0"></label><button class="btn acc" type="submit">Agregar cliente</button></form></details></div>`;
}
function vCliente(id) {
  const c = cliente(id); if (!c) return '<p class="empty">No encontré ese cliente.</p>';
  const k = cliCalc(id), ops = S.ops.filter(o => o.cl === id), txt = estadoTxt(id);
  return `<a class="back" href="#clientes">← Clientes</a><h1>${esc(c.nombre)}</h1><p class="muted small mono" style="margin-top:4px">RUC ${esc(c.ruc)}</p>
  <div class="sec"><div class="card hero"><div class="fig"><div><p class="lbl">Por cobrar</p><p class="val big">${bigN(k.total)}</p></div><div><p class="lbl">Adelantado en trámite</p><p class="val">${bigN(k.adel)}</p></div></div>${agingBar(k.b)}</div></div>
  <div class="sec"><h2>Operaciones</h2><div class="list">${ops.map(opRow).join('')}</div></div>
  <div class="sec"><h2>Estado de cuenta</h2><div class="card form"><textarea id="estado-txt" readonly aria-label="Texto del estado de cuenta">${esc(txt)}</textarea>
  <div class="btns"><button class="btn" type="button" data-a="copiar">Copiar texto</button><a class="btn acc" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(txt)}">Enviar por WhatsApp</a></div></div></div>`;
}
function vCobros() {
  const cs = S.clientes.map(c => ({ c, k:cliCalc(c.id) })).filter(r => r.k.total > 0).sort((a, b) => b.k.b[2] - a.k.b[2] || b.k.total - a.k.total);
  const b = [0, 0, 0]; cs.forEach(r => r.k.b.forEach((v, i) => b[i] += v));
  return `<div class="top"><h1>Cobros</h1></div>
  <div class="card hero"><div><p class="muted small">Total por cobrar</p><p class="val mono" style="font-size:26px;font-weight:600">${bigN(b[0] + b[1] + b[2])}</p></div>${agingBar(b)}</div>
  <div class="sec"><h2>Clientes con saldo</h2><div class="list">${cs.map(r => cliRow(r.c)).join('') || '<div class="empty">Nadie tiene saldo pendiente.</div>'}</div>
  <p class="muted small">Entrá a un cliente para copiar o enviar su estado de cuenta por WhatsApp.</p></div>`;
}

/* ---------- Ruteo y eventos ---------- */
let lastHash = null;
function render() {
  const h = location.hash.slice(1) || 'inicio', m = h.match(/^(op|cliente)-(\d+)$/);
  let html, tab;
  if (m && m[1] === 'op') { html = vOp(+m[2]); tab = 'operaciones'; }
  else if (m) { html = vCliente(+m[2]); tab = 'clientes'; }
  else if (h === 'operaciones') { html = vOps(); tab = h; }
  else if (h === 'clientes') { html = vClientes(); tab = h; }
  else if (h === 'cobros') { html = vCobros(); tab = h; }
  else { html = vInicio(); tab = 'inicio'; }
  $('#app').innerHTML = html; $('#app').dataset.v = m ? m[1] : h;
  document.querySelectorAll('#tabs a').forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (lastHash !== h) { window.scrollTo(0, 0); if (m && m[1] === 'op') ui.seg = ui.seg || 'resumen'; }
  lastHash = h;
}
let tt;
function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(tt); tt = setTimeout(() => { e.hidden = true; }, 2200); }
const money = v => parseInt(String(v).replace(/\D/g, ''), 10) || 0;
window.addEventListener('hashchange', () => { if (/^op-/.test(location.hash.slice(1))) ui.seg = 'resumen'; render(); });
document.addEventListener('click', e => {
  const a = e.target.closest('[data-a]'); if (!a) return;
  const v = a.dataset.v, id = +a.dataset.id;
  if (a.dataset.a === 'filtro') { ui.filtro = v; render(); }
  else if (a.dataset.a === 'seg') { ui.seg = v; render(); }
  else if (a.dataset.a === 'doc') { const o = S.ops.find(x => x.id === id); o.docs[v] = !o.docs[v]; save(); render(); }
  else if (a.dataset.a === 'cerrar') { const o = S.ops.find(x => x.id === id); o.estado = 'Cerrada'; o.cierre = iso(new Date()); save(); render(); toast('Operación cerrada y facturada'); }
  else if (a.dataset.a === 'impCancel') { ui.imp = null; render(); }
  else if (a.dataset.a === 'reset') { S = seed(); save(); render(); toast('Datos de ejemplo restablecidos'); }
  else if (a.dataset.a === 'copiar') {
    const ta = $('#estado-txt'); const fallback = () => { ta.focus(); ta.select(); toast('Texto seleccionado, copialo manualmente'); };
    try { navigator.clipboard.writeText(ta.value).then(() => toast('Estado de cuenta copiado'), fallback); } catch (err) { fallback(); }
  }
});
document.addEventListener('change', e => { if (e.target.id === 'impFile' && e.target.files[0]) onFile(e.target.files[0]); });
document.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target;
  if (f.id === 'impForm') {
    const d = ui.imp && ui.imp.data; if (!d) return;
    const hon = money($('#i-hon').value), est = money($('#i-est').value); if (!hon) return toast('Ingresá el honorario');
    const id = crearDesdeHoja(d, hon, est); ui.imp = null; save(); location.hash = '#op-' + id; toast('Operación creada desde la hoja');
  } else if (f.id === 'movForm') {
    const o = S.ops.find(x => x.id === +f.dataset.op), m = money($('#mv-m').value); if (!m) return toast('Ingresá un monto');
    o.movs.push({ id:Date.now(), f:iso(new Date()), t:$('#mv-t').value, c:$('#mv-c').value.trim(), m }); save(); render(); toast('Movimiento agregado');
  } else if (f.id === 'newOp') {
    const id = Math.max(0, ...S.ops.map(o => o.id)) + 1;
    S.ops.push({ id, cl:+$('#n-cl').value, ref:'26003-NUEVA-' + id, reg:'Por definir', aduana:'Por definir', desc:$('#n-desc').value.trim(), estado:'Abierta', fecha:iso(new Date()), cierre:null, estG:money($('#n-est').value), hon:money($('#n-hon').value), docs:{ factura:false, crt:false, packing:false, mandato:false, hoja:false }, movs:[] });
    save(); location.hash = '#op-' + id; toast('Operación creada');
  } else if (f.id === 'newCli') {
    const id = Math.max(0, ...S.clientes.map(c => c.id)) + 1; S.clientes.push({ id, nombre:$('#c-n').value.trim(), ruc:$('#c-r').value.trim() }); save(); location.hash = '#cliente-' + id; toast('Cliente agregado');
  }
});
render();
})();
