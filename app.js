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
    if (!out.imponibleGs) { // respaldo: valor más cercano a la columna de la etiqueta, aunque esté algo desplazado
      const k = findRow(head, /^VALOR IMPONIBLE$/);
      if (k >= 0) { const x0 = head[k].its.find(it => /^VALOR IMPONIBLE$/.test(t(it))).x; for (let j = k + 1; j < Math.min(head.length, k + 4) && !out.imponibleGs; j++) { const c = head[j].its.filter(it => isNum(t(it)) && Math.abs(it.x - x0) < 60).sort((a, b) => Math.abs(a.x - x0) - Math.abs(b.x - x0))[0]; if (c) out.imponibleGs = num(t(c)); } }
    }
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
    if (!out.imponibleGs) out.imponibleGs = out.items.reduce((a, i) => a + (i.imponibleGs || 0), 0) || null;
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
const iso = d => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); // fecha local, no UTC
const pad = n => String(n).padStart(2, '0');
const fdt = s => { const d = new Date(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const abbr = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : dots(n);
const waNum = t => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '595' + d.slice(1); return d; }; // 0981… → 595981…
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
/* Configuración de la agencia: plantilla de la liquidación y numeración correlativa */
const cfg0 = () => ({ agencia:'', liqN:{}, plantilla:{
  gastos:['Gastos de origen', 'Consularización de documentos', 'Centro de Despachantes', 'Tasa portuaria', 'Marina Mercante', 'Retiro de guía', 'Ministerio de Relaciones Exteriores', 'Fotocopias', 'Diferencia de peso'],
  servicios:[{ c:'Gastos de despacho', m:390000 }, { c:'Gastos de verificación', m:250000 }] } });
let S = load();
function load() { let s; try { const r = localStorage.getItem(KEY); if (r) s = JSON.parse(r); } catch (e) {} s = s || seed(); s.cfg = s.cfg || cfg0(); return s; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
const ui = { seg:'resumen', filtro:'todas' };

/* ---------- Cálculos ---------- */
const sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
function calc(o) {
  const g = sum(o.movs.filter(m => m.t === 'g'), m => m.m), p = sum(o.movs.filter(m => m.t === 'p'), m => m.m), c = sum(o.movs.filter(m => m.t === 'c'), m => m.m);
  const L = o.lq && o.lq.emitida ? lqTot(o) : null; // con liquidación emitida, el total es el de la liquidación
  const total = L ? L.total : g + o.hon, saldo = total - c;
  return { g, p, c, total, saldo, margen:(L ? L.sv : o.hon) - p, dif:g - o.estG,
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
const saldoRows = id => S.ops.filter(o => o.cl === id).map(o => ({ o, k:calc(o) })).filter(r => r.k.saldo > 0).sort((a, b) => (a.o.fecha > b.o.fecha ? 1 : -1));
/* Registro de envíos del estado de cuenta (se guarda en el cliente) */
function registrar(c, via) {
  c.envios = c.envios || [];
  c.envios.unshift({ f:new Date().toISOString(), via, saldo:sum(saldoRows(c.id), r => r.k.saldo) });
  c.envios = c.envios.slice(0, 20); save();
}
function estadoTxt(id) {
  const c = cliente(id);
  const rows = saldoRows(id);
  let t = `Estado de cuenta: ${c.nombre}\nRUC ${c.ruc}\nAl ${fd(iso(new Date()))}\n\n`;
  rows.forEach(({ o, k }) => { t += `• ${o.desc} (${o.ref})${o.estado === 'Abierta' ? ' · en trámite' : ''}\n  Total ${gs(k.total)} · Cobrado ${gs(k.c)} · Saldo ${gs(k.saldo)}\n`; });
  t += rows.length ? `\nSaldo total: ${gs(sum(rows, r => r.k.saldo))}\n` : 'No tiene saldo pendiente.\n';
  return t + '\nGracias.';
}

/* ---------- Piezas ---------- */
const I = {
  chev:'<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>',
  check:'<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 7.5l3 3 6-7"/></svg>',
  mark:'<svg viewBox="0 0 18 18" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h7l3 3v11H4z"/><path d="M7 9h5M7 12h5"/></svg>',
  pen:'<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg>'
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

/* Cobros recibidos por mes (últimos n meses, el actual a la derecha) */
function cobrosMes(n = 6) {
  const now = new Date(), out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push({ k:d.getFullYear() + '-' + pad(d.getMonth() + 1), l:MES[d.getMonth()], y:d.getFullYear(), v:0 }); }
  S.ops.forEach(o => o.movs.forEach(m => { if (m.t === 'c') { const b = out.find(x => x.k === m.f.slice(0, 7)); if (b) b.v += m.m; } }));
  return out;
}
function chartCobros() {
  const ms = cobrosMes(), max = Math.max(0, ...ms.map(m => m.v)), tot = sum(ms, m => m.v), act = ms[ms.length - 1], prev = ms[ms.length - 2];
  const cmp = prev.v ? Math.round((act.v - prev.v) / prev.v * 100) : null;
  return `<div class="card">
    <div class="fig"><div><p class="lbl">Cobrado en 6 meses</p><p class="val">${bigN(tot)}</p></div><div><p class="lbl">Este mes (${act.l})</p><p class="val">${bigN(act.v)}</p>${cmp === null ? '' : `<p class="small ${cmp >= 0 ? 'up' : 'down'}">${cmp >= 0 ? '▲' : '▼'} ${Math.abs(cmp)} % vs. ${prev.l}</p>`}</div></div>
    <div class="cm" role="img" aria-label="Cobros por mes: ${ms.map(m => m.l + ' ' + gs(m.v)).join(', ')}">${ms.map((m, i) => `<div class="cm-col">
      <div class="cm-track"><span class="cm-v mono" style="bottom:calc(${max ? m.v / max * 100 : 0}% + 4px)">${m.v ? abbr(m.v) : ''}</span><span class="cm-bar${i === ms.length - 1 ? ' now' : ''}" style="height:${max && m.v ? Math.max(3, m.v / max * 100) : 0}%"></span></div>
      <span class="cm-l">${m.l}${m.l === 'ene' ? ' ' + String(m.y).slice(2) : ''}</span></div>`).join('')}</div>
    ${tot ? '' : '<p class="muted small">Todavía no hay cobros registrados en estos meses.</p>'}
  </div>`;
}

/* ---------- Vistas ---------- */
function vInicio() {
  const ops = S.ops, ks = ops.map(calc);
  const adel = sum(ks, k => k.adel), xc = sum(ks, k => k.xcobrar), b = [0, 0, 0];
  ops.forEach((o, i) => { if (ks[i].xcobrar > 0) b[bucket(ks[i].dias)] += ks[i].xcobrar; });
  const alerts = [];
  S.clientes.forEach(c => { const k = cliCalc(c.id); if (k.b[2] > 0) alerts.push({ h:'#cliente-' + c.id, t:`${c.nombre} tiene ${gs(k.b[2])} con más de 60 días`, s:'Cobranza vencida', k:'bad' }); });
  ops.forEach((o, i) => { const m = Object.entries(o.docs).filter(([, v]) => !v).map(([n]) => ({ factura:'factura', crt:'CRT', packing:'packing list', mandato:'mandato', hoja:'hoja de despacho' }[n])); if (m.length && o.estado === 'Abierta') alerts.push({ h:'#op-' + o.id, t:`${o.desc}: falta ${m.join(' y ')}`, s:'Documentos pendientes', k:'warn' }); });
  ops.forEach((o, i) => { if (ks[i].adel > 0) { const ps = o.prov || []; alerts.push({ h:'#op-' + o.id, t:`${o.desc}: la agencia está financiando ${gs(ks[i].adel)}`, s:ps.length ? `Provisión pedida el ${fd(ps[ps.length - 1].f)}` : 'Pedí la provisión de fondos', k:ps.length ? 'warn' : 'bad' }); } });
  ops.forEach(o => { if (o.estado === 'Cerrada' && !(o.lq && o.lq.emitida) && (!o.cierre || days(o.cierre) <= 30)) alerts.push({ h:'#op-' + o.id, t:`${o.desc}: ${o.lq ? 'liquidación en borrador' : 'falta armar la liquidación'}`, s:'Despacho terminado sin liquidación emitida', k:'warn' }); });
  if (!S.cfg.backup || days(S.cfg.backup) > 7) alerts.push({ h:'#datos', t:S.cfg.backup ? `Hace ${days(S.cfg.backup)} días que no descargás un respaldo` : 'Todavía no descargaste un respaldo de tus datos', s:'Tus datos están solo en este dispositivo', k:'warn' });
  ops.forEach((o, i) => { if (o.estado === 'Abierta' && o.estG > 0 && ks[i].dif > o.estG * 0.05) alerts.push({ h:'#op-' + o.id, t:`${o.desc}: gastos ${gs(ks[i].dif)} sobre lo estimado`, s:'Desvío de costos', k:'warn' }); });
  const abiertas = ops.filter(o => o.estado === 'Abierta');
  return `<div class="top"><div class="brand"><img class="toplogo" src="icons/logo-pecomex.png" alt="Pecomex"></div>${pill('Datos de ejemplo')}</div>
  <h1>Hoy en la agencia</h1>
  <p class="muted small" style="margin-top:4px">${fd(iso(new Date()))} · ${abiertas.length} operaciones abiertas</p>
  <div class="sec"><div class="card hero">
    <div class="fig"><div><p class="lbl">Adelantado por la agencia</p><p class="val big">${bigN(adel)}</p></div><div><p class="lbl">Por cobrar (cerradas)</p><p class="val">${bigN(xc)}</p></div></div>
    ${agingBar(b)}
  </div></div>
  <div class="sec"><h2>Cobros por mes</h2>${chartCobros()}</div>
  <div class="sec"><h2>Requieren atención${alerts.length > 6 ? ` <span class="small" style="text-transform:none;letter-spacing:0">${alerts.length} en total</span>` : ''}</h2>${alerts.length ? `<div class="list">${alerts.sort((x, y) => (y.k === 'bad') - (x.k === 'bad')).slice(0, 6).map(a => `<a class="row" href="${a.h}"><div class="main"><span class="t">${esc(a.t)}</span><span class="s">${a.s}</span></div>${pill(a.k === 'bad' ? 'Urgente' : 'Revisar', a.k)}${I.chev}</a>`).join('')}</div>` : '<div class="card empty">Todo en orden por ahora.</div>'}</div>
  <div class="sec"><h2>Operaciones abiertas <a href="#operaciones" class="small" style="text-transform:none;letter-spacing:0;color:var(--accent)">Ver todas</a></h2><div class="list">${abiertas.map(opRow).join('') || '<div class="empty">No hay operaciones abiertas.</div>'}</div></div>
  <div class="sec">${datosCard()}</div>
  <div class="foot"><p>Prototipo con datos de ejemplo y nombres ficticios. La operación con 13 ítems se armó a partir de una hoja de despacho real.</p><button data-a="reset" type="button">Restablecer datos de ejemplo</button></div>`;
}

/* ---------- Importar hoja de despacho (PDF) ---------- */
const rucKey = r => String(r || '').replace(/\D/g, '');
const rucFmt = r => { const d = rucKey(r); return d.length > 1 ? d.slice(0, -1) + '-' + d.slice(-1) : d; };
const tcase = s => String(s || '').toLowerCase().replace(/(^|[\s\-\/(])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bS\.?a\.?(?=\s|$)/g, 'S.A.').replace(/\bSpa\b/g, 'SpA').replace(/\bS\.?r\.?l\.?(?=\s|$)/g, 'S.R.L.');
const sent = s => { s = String(s || '').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); };
const REG = { IT04:'Importación temporaria', IC04:'Importación definitiva', IC01:'Importación definitiva', EC01:'Exportación definitiva', TR01:'Tránsito aduanero' };
function regTxt(r) { const m = String(r || '').match(/^(\w+)\s*-\s*(.+)$/); if (!m) return r || 'Por definir'; return m[1] + ' · ' + (REG[m[1]] || sent(m[2].split(/ S\//)[0])); }
/* Honorario mínimo según la escala (porcentajes sobre el valor imponible; exportación con 50 % de descuento) */
const ESCALA = [[1, 10e6, 50000, 0.02], [10000001, 50e6, 250000, 0.01], [50000001, 100e6, 750000, 0.008], [100000001, 250e6, 1550000, 0.005], [250000001, Infinity, 2800000, 0.003]];
function honorario(imp, exp) {
  if (!imp || imp < 1) return { total:0, basico:0, adic:0, pct:0, desc:0, tramo:null };
  const t = ESCALA.find(r => imp <= r[1]), adic = Math.round(imp * t[3]), bruto = t[2] + adic, desc = exp ? Math.round(bruto / 2) : 0;
  return { total:bruto - desc, basico:t[2], adic, pct:t[3], desc, tramo:t };
}
const esExport = r => /^E/i.test(String(r || '').trim());
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
  const ck = checks(d), ok = ck.every(c => c[1]), H = honorario(d.imponibleGs, esExport(d.regimen));
  return `<div class="sec"><div class="card imp"><h3>Vista previa de la hoja</h3>
    <dl class="kv" style="margin-top:10px">
      <dt>Despacho</dt><dd class="mono">${esc(d.despacho)}</dd>
      <dt>Régimen</dt><dd>${esc(regTxt(d.regimen))}</dd>
      <dt>Aduana</dt><dd>${esc(tcase(d.aduana))}</dd>
      <dt>Cliente (importador)</dt><dd>${esc(tcase(d.importador.nombre))}<br><span class="mono small muted">RUC ${esc(rucFmt(d.importador.ruc))}</span></dd>
      <dt>Proveedor</dt><dd>${esc(tcase(d.vendedor))}</dd>
      <dt>Valor factura</dt><dd class="mono">USD ${dec(d.valorFactura || 0)}${d.condVenta ? ' · ' + esc(d.condVenta) : ''}</dd>
      <dt>Valor imponible</dt><dd class="mono">${gs(d.imponibleGs || 0)}<br><span class="small muted">cambio ${dec(d.cambio || 0)}</span></dd>
      <dt>Ítems</dt><dd class="mono">${d.items.length}</dd>
      <dt>Se paga en efectivo</dt><dd class="mono"><b>${gs(d.total ? d.total.trib : 0)}</b></dd>
      <dt>Garantizado</dt><dd class="mono">${gs(d.total ? d.total.gar : 0)}</dd></dl>
    <div class="note ${cl ? 'good' : 'warn'}" style="margin-top:12px">${cl ? `Cliente encontrado por RUC: <b>${esc(cl.nombre)}</b>.` : '<b>Cliente nuevo.</b> Se va a crear con el nombre y el RUC de la hoja.'}</div>
    <h3 style="margin:16px 0 8px">Controles automáticos</h3>
    <ul class="ck">${ck.map(c => `<li class="${c[1] ? 'ok' : 'bad'}"><span>${c[1] ? '✓' : '✗'}</span><span>${c[0]}<br><span class="mono small muted">${c[2]}</span></span></li>`).join('')}</ul>
    ${ok ? '' : '<div class="note warn" style="margin-top:10px">Alguno de los controles no cuadra. Revisá los datos antes de confiar en esta operación.</div>'}
    ${dup ? `<div class="note warn" style="margin-top:10px"><b>Esta hoja ya fue cargada</b> como operación existente. No se puede crear dos veces.</div>` : ''}
    <form class="form" id="impForm" style="margin-top:14px">
      <label>Honorario (Gs.) · calculado con la escala, podés cambiarlo<input id="i-hon" inputmode="numeric" required value="${dots(H.total)}"></label>
      <p class="small muted" style="margin:-4px 0 0">${H.tramo ? `Básico ${gs(H.basico)} + ${String(H.pct * 100).replace('.', ',')} % sobre el valor imponible (${gs(H.adic)})${H.desc ? ` − 50 % por exportación (${gs(H.desc)})` : ''}.` : 'No hay valor imponible para calcular.'}</p>
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
      factura:d.factura, manifiestos:d.manifiestos, camiones:d.transporte.length,
      origen:d.items[0] && tcase(d.items[0].origen), procedencia:d.items[0] && tcase(d.items[0].procedencia) },
    docs:{ factura:false, crt:false, packing:false, mandato:false, hoja:true }, movs:[] });
  return id;
}
/* ---------- Importar liquidación hecha en Excel (.xlsx) ----------
   Un .xlsx es un ZIP con archivos XML. Se descomprime con el navegador (DecompressionStream), sin librerías ni servidor. */
async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder(), files = {};
  let e = buf.byteLength - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('El archivo no es una planilla de Excel (.xlsx). Si es .xls, abrila en Excel y guardala como .xlsx.');
  let p = dv.getUint32(e + 16, true);
  for (let i = 0, n = dv.getUint16(e + 10, true); i < n; i++) {
    const nl = dv.getUint16(p + 28, true), name = td.decode(u8.subarray(p + 46, p + 46 + nl));
    files[name] = { meth:dv.getUint16(p + 10, true), cs:dv.getUint32(p + 20, true), off:dv.getUint32(p + 42, true) };
    p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return async name => {
    const f = files[name]; if (!f) return null;
    const s = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true), data = u8.subarray(s, s + f.cs);
    if (f.meth === 0) return td.decode(data);
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  };
}
async function leerXlsx(file) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador es muy viejo para leer Excel. Actualizá el sistema o probá desde Chrome.');
  const get = await unzip(await file.arrayBuffer()), X = s => new DOMParser().parseFromString(s, 'application/xml');
  const tx = el => [...el.getElementsByTagName('t')].map(t => t.textContent).join('');
  const ss = await get('xl/sharedStrings.xml'), strs = ss ? [...X(ss).getElementsByTagName('si')].map(tx) : [];
  // primera hoja del libro, según el orden del archivo
  let path = 'xl/worksheets/sheet1.xml';
  try {
    const wb = X(await get('xl/workbook.xml')), rid = wb.getElementsByTagName('sheet')[0].getAttribute('r:id');
    const rel = [...X(await get('xl/_rels/workbook.xml.rels')).getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
    if (rel) path = 'xl/' + rel.getAttribute('Target').replace(/^\/?xl\//, '');
  } catch (err) {}
  const sh = await get(path); if (!sh) throw new Error('No encontré la hoja de cálculo dentro del archivo.');
  const colN = ref => [...ref.replace(/\d+/g, '')].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows = [], doc = X(sh), ocultas = new Set(); // columnas ocultas: no se ven en Excel ni al imprimir, se ignoran
  [...doc.getElementsByTagName('col')].forEach(c => { if (c.getAttribute('hidden') === '1' || c.getAttribute('hidden') === 'true') for (let i = +c.getAttribute('min'); i <= +c.getAttribute('max'); i++) ocultas.add(i - 1); });
  [...doc.getElementsByTagName('row')].forEach(r => {
    if (r.getAttribute('hidden') === '1' || r.getAttribute('hidden') === 'true') return; // fila oculta (restos de otras liquidaciones)
    const cells = [];
    [...r.getElementsByTagName('c')].forEach(c => {
      if (ocultas.has(colN(c.getAttribute('r')))) return;
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
      let val = t === 'inlineStr' ? tx(c) : v ? v.textContent : '';
      if (t === 's') val = strs[+val] || '';
      else if (t !== 'str' && t !== 'inlineStr' && t !== 'e' && val !== '' && !isNaN(+val)) val = +val;
      if (t === 'e' || val === '') return; // celdas vacías o con error (#REF!)
      cells.push({ c:colN(c.getAttribute('r')), v:val });
    });
    if (cells.length) rows.push({ r:+r.getAttribute('r'), cells });
  });
  return rows;
}
const nrm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const ACENTO = { valoracion:'valoración', verificacion:'verificación', consularizacion:'consularización', guia:'guía', intervencion:'intervención', interes:'interés', mercaderia:'mercadería', almacenaje:'almacenaje', aduanero:'aduanero', maritima:'marítima', transito:'tránsito', deposito:'depósito', despacho:'despacho' };
function etiqueta(s) { // "SERVICIO DE VALORACION" → "Servicio de valoración"; deja siglas como IRE, INDI, I.V.A.
  const w = String(s).replace(/\s+/g, ' ').trim().split(' ');
  return w.map((x, i) => {
    if (/\w\.\w/.test(x) || /^(IRE|INDI|IVA|ISC|DINAN|DNIT|ANNP|DINAC|MIC|SENAVE|CDAP|CRT|DTA|BL|USD|S\.?A\.?|SRL|SAECA)$/.test(x)) return x; // siglas
    const l = x.toLowerCase(), b = ACENTO[l.normalize('NFD').replace(/[̀-ͯ]/g, '')] || l;
    return i === 0 ? b.charAt(0).toUpperCase() + b.slice(1) : b;
  }).join(' ');
}
const RE_TRIB = /DERECHO|\bINDI\b|VALORACION|\bIRE\b|(^|\s)I\.\s?V\.\s?A\.?(\s|$)|\bIVA\b|CANON|INTERVENCION|ARANCEL|SELECTIVO|\bISC\b|RED BANCARIA|IMPUESTO|INTERES|TRIBUTO/;
const RE_SERV = /GASTOS? DE DESPACHO|VERIFICACION|HONORARIO/;
function parseLiqXlsx(rows) {
  const txt = c => typeof c.v === 'string';
  const label = (re) => { // valor a la derecha de una etiqueta del encabezado
    for (const row of rows) { const k = row.cells.findIndex(c => txt(c) && re.test(nrm(c.v))); if (k >= 0) { const v = row.cells.slice(k + 1).find(c => !(txt(c) && /:\s*$/.test(c.v))); return v ? v.v : null; } }
    return null;
  };
  const fecha = v => typeof v === 'number' ? iso(new Date(Date.UTC(1899, 11, 30) + v * 864e5 + 12 * 36e5)) : (s => s ? `${s[3]}-${s[2].padStart(2, '0')}-${s[1].padStart(2, '0')}` : null)(String(v || '').match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/));
  const num = v => typeof v === 'number' ? v : money(v);
  const d = { nro:label(/^LIQ/), para:label(/^PARA\b/), consignado:label(/^CONSIGNADO/), fecha:fecha(label(/^FECHA/)), despacho:label(/^DESPACHO/),
    imponible:num(label(/^VALOR IMP/)), cambio:num(label(/CAMBIO/)), procedencia:label(/^PROCEDENCIA/), origen:label(/^PAIS DE ORIGEN/), aduana:label(/^ADUANA/) };
  const di = rows.findIndex(r => r.cells.some(c => txt(c) && nrm(c.v).replace(/ /g, '').includes('DETALLEDEGASTOS')));
  if (di < 0) throw new Error('No encontré el "Detalle de gastos" en la planilla. ¿Es una liquidación de la agencia?');
  const ti = rows.findIndex((r, i) => i > di && r.cells.some(c => c.c < 4 && txt(c) && /^TOTAL\b/.test(nrm(c.v))));
  const end = ti > 0 ? ti : rows.length;
  // la columna de los montos es la del TOTAL; si no hay TOTAL, la columna con más números
  let col = ti > 0 ? (rows[ti].cells.find(c => typeof c.v === 'number') || {}).c : null;
  if (col == null) { const cnt = {}; rows.slice(di + 1, end).forEach(r => r.cells.forEach(c => { if (typeof c.v === 'number') cnt[c.c] = (cnt[c.c] || 0) + 1; })); col = +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]; }
  d.t = []; d.g = []; d.s = []; d.ivaPlanilla = null; d.mercaderia = '';
  rows.slice(di + 1, end).forEach((r, i) => {
    const lc = r.cells.find(c => txt(c) && c.c < col); if (!lc) return;
    const n = nrm(lc.v), am = r.cells.find(c => c.c === col && typeof c.v === 'number'), m = am ? Math.round(am.v) : 0;
    if (i === 0 && !m && !RE_TRIB.test(n) && !RE_SERV.test(n)) { d.mercaderia = etiqueta(lc.v); return; }
    if (/^I\.?\s?V\.?\s?A\.?$|^IVA$/.test(n) && d.s.length) { d.ivaPlanilla = m; return; } // IVA de los servicios: la app lo calcula
    const l = { c:etiqueta(lc.v), m };
    if (RE_SERV.test(n)) { if (/HONORARIO/.test(n)) l.h = true; d.s.push(l); } else if (RE_TRIB.test(n) && !d.g.some(x => x.m)) d.t.push(l); else d.g.push(l);
  });
  d.totalPlanilla = ti > 0 ? Math.round((rows[ti].cells.find(c => c.c === col) || { v:0 }).v || 0) : null;
  if (!d.t.length && !d.g.length && !d.s.length) throw new Error('La planilla no tiene líneas de gastos con montos.');
  ['para', 'consignado', 'procedencia', 'origen', 'aduana', 'despacho', 'nro'].forEach(k => { if (d[k] != null) d[k] = String(d[k]).trim(); });
  return d;
}
async function onXlsx(file, opId) {
  ui.lx = { busy:true, opId }; render();
  try { ui.lx = { d:parseLiqXlsx(await leerXlsx(file)), opId, name:file.name }; }
  catch (e) { ui.lx = { err:(e && e.message) || 'No se pudo leer la planilla.', opId }; }
  render();
}
const lxOp = lx => lx.opId ? S.ops.find(o => o.id === lx.opId) : S.ops.find(o => String(o.ref).trim().toUpperCase() === String(lx.d.despacho || '').trim().toUpperCase());
function lxCard(opId) { // botón + vista previa; opId = null desde Operaciones
  const lx = ui.lx && (ui.lx.opId || null) === (opId || null) ? ui.lx : null;
  return `<label class="btn alt filebtn">${lx && lx.busy ? 'Leyendo la planilla…' : 'Importar liquidación de Excel'}<input class="lxfile" data-op="${opId || ''}" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>
    ${lx && lx.err ? `<div class="note warn"><b>No pude leer esa planilla.</b> ${esc(lx.err)}</div>` : ''}${lx && lx.d ? lxPreview(lx) : ''}`;
}
function lxPreview(lx) {
  const d = lx.d, o = lxOp(lx), q = { t:d.t, g:d.g, s:d.s }, s = a => sum(a, l => l.m);
  const sv = s(d.s), iva = Math.round(sv * 0.1), tot = s(d.t) + s(d.g) + sv + iva;
  const okTot = d.totalPlanilla == null || Math.abs(d.totalPlanilla - tot) <= 2;
  const cl = !o && S.clientes.find(c => nrm(c.nombre) === nrm(d.para || ''));
  return `<div class="card imp lxprev"><h3>Liquidación leída de Excel</h3><p class="small muted">${esc(lx.name || '')}</p>
    <dl class="kv" style="margin-top:10px">${[['Liquidación N°', d.nro], ['Fecha', d.fecha && fd(d.fecha)], ['Para', d.para], ['Despacho N°', d.despacho], ['Valor imponible', d.imponible ? gs(d.imponible) : ''], ['Tipo de cambio', d.cambio ? dec(d.cambio) : ''], ['Aduana', d.aduana], ['Mercadería', d.mercaderia]].filter(r => r[1]).map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>
    <ul class="ck" style="margin-top:12px">${['t', 'g', 's'].map(k => `<li class="ok"><span>✓</span><span>${LQG[k].replace(' (hoja de despacho)', '')}: ${q[k].filter(l => l.m).length} con monto${q[k].some(l => !l.m) ? `, ${q[k].filter(l => !l.m).length} en blanco` : ''} · <b class="mono">${gs(s(q[k]))}</b></span></li>`).join('')}
      <li class="${okTot ? 'ok' : 'bad'}"><span>${okTot ? '✓' : '✗'}</span><span>Total recalculado <b class="mono">${gs(tot)}</b>${d.totalPlanilla != null ? (okTot ? ' (igual al de la planilla)' : ` · la planilla dice <b class="mono">${gs(d.totalPlanilla)}</b>: revisá las fórmulas`) : ''}</span></li></ul>
    <div class="note ${o ? 'good' : 'warn'}" style="margin-top:12px">${o ? `Se carga en la operación <b>${esc(o.desc)}</b>${o.ref !== d.despacho && d.despacho ? ` (despacho ${esc(o.ref)}; la planilla dice ${esc(d.despacho)})` : ''}.${o.lq ? ` Reemplaza la liquidación N° ${esc(o.lq.nro)}.` : ''}${o.estado === 'Abierta' ? ' La operación pasa a terminada.' : ''}`
      : `No hay una operación con el despacho ${esc(d.despacho || '(sin número)')}: se crea una nueva, ya terminada, para ${cl ? `<b>${esc(cl.nombre)}</b>` : `el cliente nuevo <b>${esc(tcase(d.para || 'Sin nombre'))}</b> (cargale el RUC después)`}.`}</div>
    <p class="small muted" style="margin-top:10px">Después de cargarla podés agregar, cambiar o quitar líneas en "Completar".</p>
    <div class="btns" style="margin-top:14px"><button class="btn acc" type="button" data-a="lxOk">Cargar liquidación</button><button class="btn alt" type="button" data-a="lxCancel">Descartar</button></div></div>`;
}
function cargarLx() {
  const lx = ui.lx, d = lx.d; let o = lxOp(lx);
  if (o && o.lq && !confirm(`¿Reemplazar la liquidación N° ${o.lq.nro} de esta operación por la de Excel?`)) return null;
  if (!o) {
    let cl = S.clientes.find(c => nrm(c.nombre) === nrm(d.para || ''));
    if (!cl) { cl = { id:Math.max(0, ...S.clientes.map(c => c.id)) + 1, nombre:tcase(d.para || 'Cliente sin nombre'), ruc:'' }; S.clientes.push(cl); }
    const code = (String(d.despacho || '').match(/[A-Z]{2}\d{2}/) || [''])[0];
    o = { id:Math.max(0, ...S.ops.map(x => x.id)) + 1, cl:cl.id, ref:d.despacho || 'SIN-NUMERO-' + Date.now(), reg:REG[code] ? code + ' · ' + REG[code] : 'Por definir', aduana:tcase(d.aduana || 'Por definir'),
      desc:d.mercaderia || 'Despacho ' + (d.despacho || ''), estado:'Cerrada', fecha:d.fecha || iso(new Date()), cierre:d.fecha || iso(new Date()),
      estG:sum(d.t.concat(d.g), l => l.m), hon:(d.s.find(l => l.h) || { m:0 }).m, docs:{ factura:false, crt:false, packing:false, mandato:false, hoja:false }, movs:[] };
    S.ops.push(o);
  }
  if (!o.imponible && d.imponible) o.imponible = d.imponible;
  if (!o.cambio && d.cambio) o.cambio = d.cambio;
  if (o.estado === 'Abierta') { o.estado = 'Cerrada'; o.cierre = d.fecha || iso(new Date()); }
  o.lq = { nro:d.nro || '', fecha:d.fecha || iso(new Date()), consignado:d.consignado || 'Al mismo.', mercaderia:d.mercaderia || o.desc, procedencia:etiqueta(d.procedencia || ''), origen:etiqueta(d.origen || ''), emitida:null,
    t:d.t.map(l => ({ ...l })), g:d.g.map(l => ({ ...l })), s:d.s.map(l => ({ ...l })), excel:true };
  ui.lx = null; save(); return o;
}
function vOps() {
  let ops = S.ops.slice().sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
  if (ui.filtro === 'abiertas') ops = ops.filter(o => o.estado === 'Abierta');
  if (ui.filtro === 'cerradas') ops = ops.filter(o => o.estado === 'Cerrada');
  const f = (k, t) => `<button class="chip" type="button" data-a="filtro" data-v="${k}" aria-pressed="${ui.filtro === k}">${t}</button>`;
  return `<div class="top"><h1>Operaciones</h1></div>
  <div class="chips">${f('todas', 'Todas')}${f('abiertas', 'Abiertas')}${f('cerradas', 'Cerradas')}</div>
  ${impCard()}
  <div class="sec"><div class="card imp"><h3>Importar liquidación hecha en Excel</h3>
    <p class="small muted" style="margin:4px 0 12px">Si la agencia prefiere armar la liquidación en su planilla, subila acá: se carga en la operación con el mismo despacho (o se crea una), lista para imprimir o mandar. Se lee en tu dispositivo.</p>
    ${lxCard(null)}</div></div>
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
      ${provCard(o)}
      ${o.estado === 'Abierta' ? `<button class="btn" type="button" data-a="cerrar" data-id="${o.id}">Terminar despacho y liquidar</button><p class="muted small">Cuando la mercadería ya tiene levante y se retiró: se cierra la operación y pasás a armar la liquidación de gastos.</p>`
        : `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3>Liquidación de gastos</h3>${o.lq ? (o.lq.emitida ? pill('Emitida · N° ' + o.lq.nro, 'ok') : pill('Borrador · N° ' + o.lq.nro, 'warn')) : pill('Pendiente', 'bad')}</div>
          <button class="btn ${o.lq && o.lq.emitida ? 'alt' : 'acc'}" type="button" data-a="seg" data-v="lqc" style="width:100%;margin-top:12px">${o.lq ? (o.lq.emitida ? 'Ver liquidación' : 'Seguir completando') : 'Armar liquidación'}</button></div>`}
      <details class="card"><summary>Editar operación</summary>
      <form class="form" id="opEdit" data-op="${o.id}">
        <label>Cliente<select id="e-cl">${S.clientes.map(x => `<option value="${x.id}"${x.id === o.cl ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>
        <label>Descripción<input id="e-desc" required value="${esc(o.desc)}"></label>
        <label>Número de despacho o referencia<input id="e-ref" required value="${esc(o.ref)}"></label>
        <label>Honorario (Gs.)<input id="e-hon" inputmode="numeric" required value="${dots(o.hon)}"></label>
        <label>Gastos estimados por cuenta del cliente (Gs.)<input id="e-est" inputmode="numeric" required value="${dots(o.estG)}"></label>
        <label>Estado<select id="e-estado"><option${o.estado === 'Abierta' ? ' selected' : ''}>Abierta</option><option${o.estado === 'Cerrada' ? ' selected' : ''}>Cerrada</option></select></label>
        <label>Fecha de inicio<input id="e-fecha" type="date" required value="${o.fecha}"></label>
        <label>Fecha de cierre (solo si está cerrada; define la antigüedad de la deuda)<input id="e-cierre" type="date" value="${o.cierre || ''}"></label>
        <div class="btns"><button class="btn acc" type="submit">Guardar cambios</button><button class="btn bad" type="button" data-a="delOp" data-id="${o.id}">Borrar operación</button></div>
      </form></details>`;
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
    const opt = (v, t, sel) => `<option value="${v}"${v === sel ? ' selected' : ''}>${t}</option>`;
    const mvRow = m => ui.editMov === m.id
      ? `<form class="form" id="movEdit" data-op="${o.id}" data-mv="${m.id}">
          <label>Tipo<select id="me-t">${opt('g', T.g, m.t)}${opt('p', 'Costo propio de la agencia', m.t)}${opt('c', T.c, m.t)}</select></label>
          <label>Concepto<input id="me-c" required value="${esc(m.c)}"></label>
          <label>Monto (Gs.)<input id="me-m" inputmode="numeric" required value="${dots(m.m)}"></label>
          <label>Fecha<input id="me-f" type="date" required value="${m.f}"></label>
          <div class="btns"><button class="btn acc" type="submit">Guardar</button><button class="btn alt" type="button" data-a="editMov" data-v="">Cancelar</button></div>
          <button class="btn bad" type="button" data-a="delMov" data-id="${o.id}" data-v="${m.id}">Borrar movimiento</button></form>`
      : `<button class="row rowbtn" type="button" data-a="editMov" data-v="${m.id}"><div class="main"><span class="t">${esc(m.c)}</span><span class="s">${fd(m.f)} · ${T[m.t]}</span></div><span class="amt" style="color:${m.t === 'c' ? 'var(--good)' : 'inherit'}">${m.t === 'c' ? '+' : '−'}${dots(m.m)}</span>${I.pen}</button>`;
    body = `<div class="list">${ms.map(mvRow).join('') || '<div class="empty">Sin movimientos.</div>'}</div>
    ${ms.length ? '<p class="muted small">Tocá un movimiento para corregirlo o borrarlo.</p>' : ''}
    <details class="card"><summary>Agregar movimiento</summary><form class="form" id="movForm" data-op="${o.id}">
      <label>Tipo<select id="mv-t"><option value="g">Gasto por cuenta del cliente</option><option value="p">Costo propio de la agencia</option><option value="c">Cobro recibido</option></select></label>
      <label>Concepto<input id="mv-c" required placeholder="Ej. Almacenaje depósito"></label>
      <label>Monto (Gs.)<input id="mv-m" inputmode="numeric" required placeholder="1.500.000"></label>
      <button class="btn acc" type="submit">Agregar</button></form></details>`;
  } else if (ui.seg === 'lqc') {
    body = o.estado === 'Cerrada' || o.lq ? vLiq(o) : '<div class="card empty">La liquidación se arma cuando termina el despacho. Usá "Terminar despacho y liquidar" en Resumen.</div>';
  } else {
    const N = { factura:'Factura comercial', crt:'CRT / conocimiento de embarque', packing:'Packing list', mandato:'Mandato del cliente', hoja:'Hoja de despacho' };
    body = `<div class="list">${Object.keys(N).map(d => `<button class="doc" type="button" data-a="doc" data-id="${o.id}" data-v="${d}"><span class="box ${o.docs[d] ? 'on' : ''}">${o.docs[d] ? I.check : ''}</span><span style="flex:1">${N[d]}</span>${pill(o.docs[d] ? 'Recibido' : 'Falta', o.docs[d] ? 'ok' : 'bad')}</button>`).join('')}</div>
    <p class="muted small">En la versión real, acá se adjuntan los archivos de cada documento.</p>`;
  }
  return `<a class="back" href="#operaciones">← Operaciones</a>
  <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div style="min-width:0"><h1>${esc(o.desc)}</h1><p class="muted small mono" style="margin-top:4px">${esc(o.ref)}</p></div>${pill(o.estado, o.estado === 'Abierta' ? '' : 'ok')}</div>
  <p class="small" style="margin:8px 0 14px"><a href="#cliente-${c.id}" style="color:var(--accent)">${esc(c.nombre)}</a> · ${esc(o.reg)} · ${esc(o.aduana)} · ${fd(o.fecha)}</p>
  <div class="segs">${sg('resumen', 'Resumen')}${sg('liq', 'Hoja de despacho')}${sg('movs', 'Gastos y cobros')}${o.estado === 'Cerrada' || o.lq ? sg('lqc', 'Liquidación') : ''}${sg('docs', 'Documentos')}</div>
  <div class="sec${ui.seg === 'lqc' && o.lq && (ui.lqView || (o.lq.emitida ? 'doc' : 'edit')) === 'doc' ? ' sec-edoc' : ''}" style="margin-top:14px">${body}</div>`;
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
  <div class="sec"><h2>Operaciones</h2><div class="list">${ops.map(opRow).join('') || '<div class="empty">Este cliente todavía no tiene operaciones.</div>'}</div></div>
  <div class="sec sec-edoc"><h2>Estado de cuenta</h2>${estadoDoc(c, k)}
    <div class="btns"><a class="btn acc" data-a="wa" data-id="${c.id}" target="_blank" rel="noopener" href="https://wa.me/${waNum(c.tel)}?text=${encodeURIComponent(txt)}">Enviar por WhatsApp</a><button class="btn alt" type="button" data-a="print" data-id="${c.id}">Imprimir o guardar PDF</button></div>
    ${c.tel ? '' : '<p class="muted small">Agregá el celular del cliente (en "Editar cliente") para que WhatsApp se abra directo en su chat.</p>'}
    <details class="card"><summary>Ver el texto del mensaje</summary><div class="form"><textarea id="estado-txt" readonly aria-label="Texto del estado de cuenta">${esc(txt)}</textarea>
      <button class="btn alt" type="button" data-a="copiar" data-id="${c.id}">Copiar texto</button></div></details>
    <h2 style="margin-top:8px">Envíos registrados</h2>
    ${(c.envios || []).length ? `<div class="list">${c.envios.slice(0, 6).map(e => `<div class="row"><div class="main"><span class="t">${esc(e.via)}</span><span class="s mono">${fdt(e.f)}</span></div><span class="amt">${gs(e.saldo)}</span></div>`).join('')}</div>
      <p class="muted small">Último envío ${(n => n === 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`)(days(iso(new Date(c.envios[0].f))))}. El monto es el saldo que figuraba al enviarlo.</p>`
      : '<div class="card empty">Todavía no enviaste este estado de cuenta.</div>'}
  </div>
  <div class="sec"><details class="card"><summary>Editar cliente</summary><form class="form" id="cliEdit" data-id="${c.id}">
    <label>Nombre o razón social<input id="ce-n" required value="${esc(c.nombre)}"></label>
    <label>RUC<input id="ce-r" required value="${esc(c.ruc)}"></label>
    <label>Celular para WhatsApp (opcional)<input id="ce-t" inputmode="tel" placeholder="0981 123 456" value="${esc(c.tel || '')}"></label>
    <div class="btns"><button class="btn acc" type="submit">Guardar cambios</button><button class="btn bad" type="button" data-a="delCli" data-id="${c.id}">Borrar cliente</button></div>
    ${ops.length ? `<p class="muted small">Para borrar este cliente primero hay que borrar sus ${ops.length} operación(es).</p>` : ''}
  </form></details></div>`;
}
/* ---------- Liquidación de gastos al cliente ----------
   o.lq = { nro, fecha, consignado, mercaderia, procedencia, origen, emitida, t:[tributos], g:[gastos de terceros], s:[servicios con IVA] }
   Cada línea es { c:concepto, m:monto }; la del honorario lleva h:true. Las líneas en 0 no salen en el documento. */
const logoSrc = () => S.cfg.logo || 'icons/logo-pecomex.png'; // logo de los documentos: el de la agencia o el de Pecomex
function cargarLogo(file) { // achica la imagen (máx. 600×220) para que entre en el almacenamiento del navegador
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, 600 / img.width, 220 / img.height), cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url); S.cfg.logo = cv.toDataURL('image/png'); save(); render(); toast('Logo actualizado en los documentos');
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('No pude abrir esa imagen'); };
  img.src = url;
}
const LQG = { t:'Tributos (hoja de despacho)', g:'Gastos de terceros', s:'Servicios de la agencia (+ IVA 10 %)' };
function lqTot(o) {
  const q = o.lq, s = a => sum(a, l => +l.m || 0);
  const t = s(q.t), g = s(q.g), sv = s(q.s), iva = Math.round(sv * 0.1);
  return { t, g, sv, iva, total:t + g + sv + iva };
}
/* Número en letras (guaraníes, sin decimales) */
function letras(n) {
  n = Math.round(Math.abs(n)); if (!n) return 'CERO';
  const U = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIÚN', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  const D = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const C = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const tres = (x, fin) => { // 1 a 999; "fin" = último grupo (dice UNO en vez de UN)
    if (x === 100) return 'CIEN';
    const r = x % 100; let t = '';
    if (r) t = r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' Y ' + U[r % 10] : '');
    if (fin) t = t.replace(/UN$/, 'UNO').replace(/VEINTIÚN$/, 'VEINTIUNO');
    return [C[Math.floor(x / 100)], t].filter(Boolean).join(' ');
  };
  const seis = (x, fin) => { const m = Math.floor(x / 1000), r = x % 1000; return [m ? (m === 1 ? 'MIL' : tres(m) + ' MIL') : '', r ? tres(r, fin) : ''].filter(Boolean).join(' '); };
  const mi = Math.floor(n / 1e6), r = n % 1e6;
  return [mi ? (mi === 1 ? 'UN MILLÓN' : seis(mi) + ' MILLONES') : '', r ? seis(r, true) : ''].filter(Boolean).join(' ');
}
/* Arma la liquidación con lo que ya se sabe; lo demás queda para completar a mano */
function armarLiq(o) {
  const cf = S.cfg, yy = String(new Date().getFullYear()).slice(2), n = (cf.liqN[yy] || 0) + 1; cf.liqN[yy] = n;
  const sinCod = s => String(s).replace(/^\d{3}\s*-?\s*/, '');
  const t = o.liq ? o.liq.filter(r => r[1] > 0).map(r => ({ c:sinCod(r[0]), m:r[1] })) : [];
  const gm = o.movs.filter(m => m.t === 'g'), esTrib = m => /^tributos/i.test(m.c);
  if (!o.liq) gm.filter(esTrib).forEach(m => t.push({ c:'Tributos según liquidación de aduana', m:m.m }));
  const g = cf.plantilla.gastos.map(c => ({ c, m:0 }));
  gm.filter(m => !esTrib(m)).forEach(m => { const l = g.find(x => x.c.toLowerCase() === m.c.toLowerCase()); if (l) l.m += m.m; else g.push({ c:m.c, m:m.m }); });
  const s = cf.plantilla.servicios.map(x => ({ c:x.c, m:x.m })).concat([{ c:'Honorarios profesionales', m:o.hon, h:true }]);
  o.lq = { nro:`${n}/${yy}`, fecha:iso(new Date()), consignado:'Al mismo.', mercaderia:o.desc, procedencia:(o.meta && o.meta.procedencia) || '', origen:(o.meta && o.meta.origen) || '', emitida:null, t, g, s };
}
/* Sugerencias al escribir un concepto: lista base + lo que la agencia ya usó en otras liquidaciones (se puede escribir cualquier otro) */
const SUG = {
  t:['Derecho aduanero', 'INDI', 'Servicio de valoración', 'IRE general', 'I.V.A.', 'Canon despachante', 'Tasa de intervención', 'Impuesto selectivo al consumo', 'Interés por admisión temporal', 'Servicio red bancaria DINAN'],
  g:['Tasa portuaria', 'Marina Mercante', 'Almacenaje', 'Flete interno', 'Estiba', 'Gastos de origen', 'Consularización de documentos', 'Centro de Despachantes', 'Retiro de guía', 'Ministerio de Relaciones Exteriores', 'Fotocopias', 'Diferencia de peso', 'Escaneo de contenedor', 'Precintos'],
  s:['Gastos de despacho', 'Gastos de verificación', 'Honorarios profesionales', 'Gestión de licencias previas', 'Gestión de certificado de origen']
};
function sugerencias(k) {
  const set = new Map(); const add = c => { c = String(c || '').trim(); if (c && !set.has(c.toLowerCase())) set.set(c.toLowerCase(), c); };
  SUG[k].forEach(add); if (k === 'g') S.cfg.plantilla.gastos.forEach(add); if (k === 's') S.cfg.plantilla.servicios.forEach(x => add(x.c));
  S.ops.forEach(o => o.lq && (o.lq[k] || []).forEach(l => add(l.c)));
  return `<datalist id="dl-${k}">${[...set.values()].sort((a, b) => a.localeCompare(b, 'es')).map(c => `<option value="${esc(c)}">`).join('')}</datalist>`;
}
function lqTotHtml(o) {
  const L = lqTot(o), reg = sum(o.movs.filter(m => m.t === 'g'), m => m.m), dg = L.t + L.g - reg;
  return `<dl class="kv"><dt>Tributos</dt><dd class="mono">${gs(L.t)}</dd><dt>Gastos de terceros</dt><dd class="mono">${gs(L.g)}</dd><dt>Servicios de la agencia</dt><dd class="mono">${gs(L.sv)}</dd><dt>IVA 10 % sobre servicios</dt><dd class="mono">${gs(L.iva)}</dd>
    <dt><b>Total</b></dt><dd class="mono"><b>${gs(L.total)}</b></dd></dl>
    <div class="note ${dg === 0 ? 'good' : 'warn'}" style="margin-top:12px">${dg === 0 ? '✓ Tributos y gastos coinciden con lo registrado en "Gastos y cobros".'
      : `Tributos y gastos de la liquidación: <b class="mono">${gs(L.t + L.g)}</b>. Registrado en "Gastos y cobros": <b class="mono">${gs(reg)}</b>. Diferencia <b class="mono">${gs(dg)}</b>: revisá si falta cargar algo de un lado o del otro.`}</div>`;
}
function vLiq(o) {
  if (!o.lq) return `<div class="card"><h3>Liquidación de gastos al cliente</h3>
    <p class="small muted" style="margin:6px 0 14px">Se arma sola con lo que ya está cargado: tributos de la hoja de despacho, gastos registrados, servicios de la agencia y honorario por escala. Después completás a mano lo que falte (tasa portuaria, fotocopias, etc.).</p>
    <div class="btns"><button class="btn acc" type="button" data-a="lqNew" data-id="${o.id}">Armar liquidación</button>${lxCard(o.id)}</div></div>`;
  const q = o.lq, view = ui.lqView || (q.emitida ? 'doc' : 'edit');
  const sg = (v, t) => `<button class="chip" type="button" data-a="lqView" data-v="${v}" aria-pressed="${view === v}">${t}</button>`;
  const top = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div class="chips">${sg('edit', 'Completar')}${sg('doc', 'Ver documento')}</div>${q.emitida ? pill('Emitida el ' + fd(q.emitida), 'ok') : pill('Borrador', 'warn')}</div>`;
  if (view === 'doc') return top + lqDoc(o) + `<div class="btns"><a class="btn acc" data-a="lqWa" target="_blank" rel="noopener" href="https://wa.me/${waNum(cliente(o.cl).tel)}?text=${encodeURIComponent(lqTxt(o))}">Enviar por WhatsApp</a><button class="btn alt" type="button" data-a="lqPrint">Imprimir o guardar PDF</button></div>
    <button class="btn ${q.emitida ? 'alt' : ''}" type="button" data-a="lqEmit" data-id="${o.id}">${q.emitida ? 'Volver a borrador' : 'Marcar como emitida'}</button>
    <p class="muted small">${q.emitida ? 'Emitida: el saldo del cliente y el estado de cuenta usan el total de esta liquidación.' : 'Al marcarla como emitida, el saldo del cliente pasa a usar el total de esta liquidación.'}</p>
    ${lqFacHtml(o)}`;
  const line = (k, l, i) => `<div class="lqline" data-g="${k}" data-i="${i}"><input class="lq-c" list="dl-${k}" aria-label="Concepto" placeholder="Escribí o elegí un concepto" value="${esc(l.c)}"><input class="lq-m mono" aria-label="Monto en Gs." inputmode="numeric" placeholder="0" value="${l.m ? dots(l.m) : ''}"><button class="x" type="button" data-a="lqDel" data-v="${k}:${i}" aria-label="Quitar línea">×</button></div>`;
  const H = honorario(o.imponible, esExport(o.reg));
  const grp = k => `<div class="card lqgrp"><h3>${LQG[k]}</h3>${q[k].map((l, i) => line(k, l, i)).join('') || '<p class="muted small">Sin líneas.</p>'}
    ${k === 's' && H.tramo ? `<p class="small muted">Honorario según escala sobre el valor imponible: <b class="mono">${gs(H.total)}</b>. Si cobrás extras, sumalos en la línea del honorario o agregá otra línea.</p>` : ''}
    ${k === 't' && !o.liq ? '<p class="small muted">Esta operación no tiene hoja de despacho importada: cargá los tributos a mano.</p>' : ''}
    <button class="btn alt" type="button" data-a="lqAdd" data-v="${k}">+ Agregar línea</button>${sugerencias(k)}</div>`;
  return top + `<form class="form" id="lqForm" data-op="${o.id}" autocomplete="off">
    <details class="card"><summary>Datos de la liquidación · N° ${esc(q.nro)}</summary><div class="form">
      <label>Nombre de la agencia (encabezado de todas las liquidaciones)<input id="lq-agencia" value="${esc(S.cfg.agencia)}" placeholder="Ej. Agencia de Despachos …"></label>
      <div class="logopick"><img src="${logoSrc()}" alt="Logo actual de los documentos"><div class="btns"><label class="btn alt filebtn">Cambiar logo<input id="logoFile" type="file" accept="image/png,image/jpeg,image/webp" hidden></label>${S.cfg.logo ? '<button class="btn alt" type="button" data-a="logoReset">Usar logo de Pecomex</button>' : ''}</div></div>
      <div class="two"><label>Liquidación N°<input id="lq-nro" value="${esc(q.nro)}"></label><label>Fecha<input id="lq-fecha" type="date" value="${q.fecha}"></label></div>
      <label>Consignado<input id="lq-consignado" value="${esc(q.consignado)}"></label>
      <label>Mercadería<input id="lq-mercaderia" value="${esc(q.mercaderia)}"></label>
      <div class="two"><label>Procedencia<input id="lq-procedencia" value="${esc(q.procedencia)}"></label><label>País de origen<input id="lq-origen" value="${esc(q.origen)}"></label></div>
    </div></details>
    ${grp('t')}${grp('g')}${grp('s')}
    <div class="card" id="lq-tot">${lqTotHtml(o)}</div>
    <div id="lq-fac">${lqFacHtml(o)}</div>
    <p class="muted small">Agregá las líneas que necesite cada despacho: podés elegir un concepto sugerido o escribir uno nuevo. Se guarda solo mientras escribís, y las líneas en 0 no aparecen en el documento.</p>
    <div class="btns"><button class="btn acc" type="button" data-a="lqView" data-v="doc">Ver documento</button><button class="btn alt" type="button" data-a="lqTpl">Guardar como plantilla</button></div>
    <button class="btn bad" type="button" data-a="lqDelAll" data-id="${o.id}">Borrar y volver a armar</button>
  </form>
  <div class="card"><h3>¿La hiciste en Excel?</h3><p class="small muted" style="margin:4px 0 12px">Subí la planilla y reemplaza estos datos.</p>${lxCard(o.id)}</div>`;
}
function lqDoc(o) {
  const q = o.lq, L = lqTot(o), c = cliente(o.cl);
  const rows = k => q[k].filter(l => +l.m).map(l => `<tr><td>${esc(l.c || 'Sin concepto')}</td><td>${dots(l.m)}</td></tr>`).join('');
  const sec = k => rows(k) ? `<tr class="grp"><td colspan="2">${LQG[k].replace(' (hoja de despacho)', '').replace(' (+ IVA 10 %)', '')}</td></tr>${rows(k)}` : '';
  const kv = [['Para', c.nombre], ['Consignado', q.consignado], ['Despacho N°', o.ref], ['Aduana', o.aduana], ['Valor imponible', o.imponible ? gs(o.imponible) : ''], ['Tipo de cambio', o.cambio ? dec(o.cambio) : ''], ['Procedencia', q.procedencia], ['País de origen', q.origen]].filter(r => r[1]);
  return `<div class="card edoc print-area lqdoc">
    <div class="lh"><img class="doclogo" src="${logoSrc()}" alt="${esc(S.cfg.agencia || 'Pecomex')}"><p class="small muted">${S.cfg.agencia ? `<b class="ink">${esc(S.cfg.agencia)}</b><br>` : ''}${fd(q.fecha)}<br>Montos en Gs.</p></div>
    <div class="edoc-head"><p class="edoc-kicker">Liquidación de gastos</p><h3>N° ${esc(q.nro)}</h3></div>
    <dl class="kv lqkv">${kv.map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl>
    ${q.mercaderia ? `<p class="small"><span class="muted">Mercadería:</span> <b>${esc(q.mercaderia)}</b></p>` : ''}
    <table class="tbl"><thead><tr><th>Detalle de gastos</th><th>Gs.</th></tr></thead><tbody>
      ${sec('t')}${sec('g')}${sec('s')}
      ${L.iva ? `<tr><td>I.V.A. 10 % sobre servicios</td><td>${dots(L.iva)}</td></tr>` : ''}
      <tr class="tot"><td>TOTAL</td><td>${dots(L.total)}</td></tr>
    </tbody></table>
    <p class="small"><span class="muted">Son guaraníes:</span> <b>${letras(L.total)}.-</b></p>
    <div class="docband" aria-hidden="true"></div>
  </div>`;
}
/* Para la factura física: uso interno de la agencia, NO va en el documento ni en el mensaje al cliente */
function lqFacHtml(o) {
  const L = lqTot(o), fac = o.lq.s.filter(l => +l.m);
  if (!fac.length) return '';
  return `<div class="card lqfac"><h3>Para la factura <span class="pill">Uso interno · no se envía al cliente</span></h3>
    <table class="tbl" style="margin-top:8px"><tbody>${fac.map(l => `<tr><td>${esc(l.c)}</td><td>${dots(Math.round(l.m * 1.1))}</td></tr>`).join('')}
    <tr class="tot"><td>Total a facturar</td><td>${dots(L.sv + L.iva)}</td></tr><tr><td>I.V.A. incluido (10 %)</td><td>${dots(L.iva)}</td></tr></tbody></table></div>`;
}
function lqTxt(o) {
  const q = o.lq, L = lqTot(o), c = cliente(o.cl);
  const ls = k => q[k].filter(l => +l.m).map(l => `• ${l.c}: ${gs(l.m)}`).join('\n');
  return `Liquidación de gastos N° ${q.nro}${S.cfg.agencia ? ' · ' + S.cfg.agencia : ''}\n${c.nombre}\nDespacho ${o.ref} · ${fd(q.fecha)}\n\n` +
    ['t', 'g', 's'].filter(k => ls(k)).map(k => ls(k)).join('\n') + (L.iva ? `\n• IVA 10 % sobre servicios: ${gs(L.iva)}` : '') +
    `\n\nTotal: ${gs(L.total)}\n(${letras(L.total).toLowerCase()} guaraníes)\n\nGracias.`;
}

/* ---------- Provisión de fondos (anticipo que se pide al cliente antes de pagar los tributos) ----------
   o.prov = [{f, m}] pedidos hechos. S.cfg.banco = datos para transferencia (texto libre). */
function provCalc(o) {
  const k = calc(o), gastos = Math.max(o.estG || 0, o.trib || 0), hon = Math.round((o.hon || 0) * 1.1);
  return { gastos, hon, rec:k.c, sug:Math.max(0, gastos + hon - k.c), pedido:sum(o.prov || [], p => p.m) };
}
function provTxt(o, monto) {
  const P = provCalc(o);
  return `Hola, le solicitamos la provisión de fondos para el despacho ${o.ref} (${o.desc}).\n\n• Tributos y gastos estimados: ${gs(P.gastos)}\n• Honorario + IVA: ${gs(P.hon)}` +
    (P.rec ? `\n• Ya recibido: −${gs(P.rec)}` : '') + `\n\nMonto a transferir: ${gs(monto)}` + (S.cfg.banco ? `\n\n${S.cfg.banco}` : '') + `\n\nGracias.${S.cfg.agencia ? '\n' + S.cfg.agencia : ''}`;
}
function provCard(o) {
  if (o.estado !== 'Abierta') return '';
  const P = provCalc(o), ps = o.prov || [], falta = Math.max(0, P.gastos + P.hon - P.rec);
  return `<details class="card prov"${ps.length ? '' : ' open'}><summary>Provisión de fondos ${falta ? pill('Faltan ' + abbr(falta), 'warn') : pill('Cubierta', 'ok')}</summary>
    <dl class="kv"><dt>Tributos y gastos estimados</dt><dd class="mono">${gs(P.gastos)}</dd><dt>Honorario + IVA</dt><dd class="mono">${gs(P.hon)}</dd><dt>Ya recibido del cliente</dt><dd class="mono">${P.rec ? '−' + dots(P.rec) : '0'}</dd><dt><b>Falta recibir</b></dt><dd class="mono"><b>${gs(falta)}</b></dd></dl>
    ${ps.length ? `<p class="small muted" style="margin-top:10px">Pedidos: ${ps.map(p => `${fd(p.f)} por <b class="mono">${gs(p.m)}</b>`).join(' · ')}</p>` : '<p class="small muted" style="margin-top:10px">Pedila antes de oficializar, así la agencia no pone plata propia para los tributos.</p>'}
    <div class="form" style="margin-top:12px">
      <label>Monto a solicitar (Gs.)<input id="pv-m" inputmode="numeric" value="${dots(P.sug)}"></label>
      <label>Datos para la transferencia (se guardan para todos los pedidos)<textarea id="pv-banco" rows="3" style="min-height:84px" placeholder="Banco …, cuenta N° …, a nombre de …, RUC …">${esc(S.cfg.banco || '')}</textarea></label>
      <a class="btn acc" data-a="pvWa" data-id="${o.id}" target="_blank" rel="noopener" href="#">Pedir por WhatsApp</a>
    </div></details>`;
}

/* ---------- Respaldo y exportación ---------- */
function descargar(nombre, contenido, tipo) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([contenido], { type:tipo })); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function csvOps() {
  const q = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const head = ['Despacho', 'Cliente', 'RUC', 'Descripción', 'Régimen', 'Aduana', 'Estado', 'Fecha', 'Cierre', 'Valor imponible', 'Gastos por cuenta del cliente', 'Honorario', 'Total a cobrar', 'Cobrado', 'Saldo', 'Costos propios', 'Margen', 'Días desde cierre', 'Liquidación N°'];
  const rows = S.ops.map(o => { const k = calc(o), c = cliente(o.cl) || {};
    return [o.ref, c.nombre, c.ruc, o.desc, o.reg, o.aduana, o.estado, o.fecha, o.cierre || '', o.imponible || '', k.g, o.hon, k.total, k.c, k.saldo, k.p, k.margen, o.cierre ? k.dias : '', o.lq ? o.lq.nro : '']; });
  return '﻿' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n'); // BOM y ";" para que Excel en español lo abra bien
}
function datosCard() {
  const b = S.cfg.backup, d = b ? days(b) : null;
  return `<div class="card" id="datos"><h3>Tus datos</h3>
    <p class="small muted" style="margin:4px 0 12px">Por ahora todo se guarda solo en este dispositivo. Descargá un respaldo cada semana y guardalo en Drive o mandatelo por correo.</p>
    <p class="small" style="margin-bottom:12px">Último respaldo: ${b ? `<b>${fd(b)}</b>${d > 7 ? ' ' + pill('hace ' + d + ' días', 'warn') : ''}` : pill('nunca', 'warn')}</p>
    <div class="btns"><button class="btn acc" type="button" data-a="backup">Descargar respaldo</button><label class="btn alt filebtn">Restaurar respaldo<input id="restoreFile" type="file" accept="application/json,.json" hidden></label></div>
    <button class="btn alt" type="button" data-a="csv" style="width:100%;margin-top:10px">Exportar operaciones a Excel</button></div>`;
}

/* Estado de cuenta con formato de documento (también es lo que se imprime) */
function estadoDoc(c, k) {
  const rows = saldoRows(c.id), tot = sum(rows, r => r.k.saldo);
  return `<div class="card edoc print-area">
    <div class="lh"><img class="doclogo" src="${logoSrc()}" alt="${esc(S.cfg.agencia || 'Pecomex')}"><p class="small muted">Al ${fd(iso(new Date()))}<br>Montos en Gs.</p></div>
    <div class="edoc-head"><p class="edoc-kicker">Estado de cuenta</p><h3>${esc(c.nombre)}</h3><p class="mono small muted">${c.ruc ? 'RUC ' + esc(c.ruc) : 'RUC sin cargar'}</p></div>
    ${rows.length ? `<div class="scroll"><table class="tbl"><thead><tr><th>Operación</th><th class="hm">Total</th><th class="hm">Cobrado</th><th>Saldo</th></tr></thead><tbody>
      ${rows.map(({ o, k }) => `<tr><td>${esc(o.desc)}<span class="sub mono">${esc(o.ref)} · ${o.estado === 'Abierta' ? 'en trámite' : 'cerrada el ' + fd(o.cierre)}</span><span class="sub mono om">Total ${dots(k.total)} · cobrado ${dots(k.c)}</span></td><td class="hm">${dots(k.total)}</td><td class="hm">${dots(k.c)}</td><td><b>${dots(k.saldo)}</b></td></tr>`).join('')}
      <tr class="tot"><td>Saldo total</td><td class="hm">${dots(sum(rows, r => r.k.total))}</td><td class="hm">${dots(sum(rows, r => r.k.c))}</td><td>${dots(tot)}</td></tr></tbody></table></div>
      ${k.total ? `<p class="small" style="margin-top:12px">De las operaciones cerradas: ${k.b.map((v, i) => v ? `${BL[i].toLowerCase()} <b class="mono">${gs(v)}</b>` : '').filter(Boolean).join(' · ')}.</p>` : ''}`
      : '<p class="empty">No tiene saldo pendiente. ¡Al día!</p>'}
    <p class="small muted edoc-foot">Total = gastos pagados por cuenta del cliente + honorario. Ante cualquier duda sobre un monto, consultanos.</p>
    <div class="docband" aria-hidden="true"></div>
  </div>`;
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
  $('#app').innerHTML = html; $('#app').dataset.v = m ? m[1] : h === 'datos' ? 'inicio' : h;
  document.querySelectorAll('#tabs a').forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (h === 'datos' && lastHash !== h) { const d = $('#datos'); if (d) setTimeout(() => d.scrollIntoView({ block:'center' }), 0); }
  else if (lastHash !== h) { window.scrollTo(0, 0); if (m && m[1] === 'op') ui.seg = ui.seg || 'resumen'; }
  lastHash = h;
}
let tt;
function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(tt); tt = setTimeout(() => { e.hidden = true; }, 2200); }
const money = v => parseInt(String(v).replace(/\D/g, ''), 10) || 0;
window.addEventListener('hashchange', () => {
  if (/^op-/.test(location.hash.slice(1))) ui.seg = ui.go === 'lqdoc' ? 'lqc' : 'resumen';
  ui.lqView = ui.go === 'lqdoc' ? 'doc' : null; ui.go = null; ui.editMov = null; render();
});
/* Liquidación: se guarda mientras se escribe, sin redibujar toda la pantalla */
function leerLq(f) {
  const o = S.ops.find(x => x.id === +f.dataset.op), q = o.lq;
  f.querySelectorAll('.lqline').forEach(r => { const l = q[r.dataset.g][+r.dataset.i]; l.c = r.querySelector('.lq-c').value; l.m = money(r.querySelector('.lq-m').value); });
  ['nro', 'fecha', 'consignado', 'mercaderia', 'procedencia', 'origen'].forEach(k => { const i = f.querySelector('#lq-' + k); if (i) q[k] = i.value; });
  const ag = f.querySelector('#lq-agencia'); if (ag) S.cfg.agencia = ag.value;
  save(); $('#lq-tot').innerHTML = lqTotHtml(o); $('#lq-fac').innerHTML = lqFacHtml(o);
}
document.addEventListener('input', e => {
  const f = e.target.closest('#lqForm'); if (f) leerLq(f);
  if (e.target.id === 'pv-banco') { S.cfg.banco = e.target.value; save(); }
});
document.addEventListener('click', e => {
  const a = e.target.closest('[data-a]'); if (!a) return;
  const v = a.dataset.v, id = +a.dataset.id;
  if (a.dataset.a === 'filtro') { ui.filtro = v; render(); }
  else if (a.dataset.a === 'seg') { ui.seg = v; ui.editMov = null; ui.lqView = null; render(); }
  else if (a.dataset.a === 'editMov') { ui.editMov = v ? +v : null; render(); const f = $('#me-c'); if (f) f.focus(); }
  else if (a.dataset.a === 'delMov') {
    const o = S.ops.find(x => x.id === id);
    if (!confirm('¿Borrar este movimiento? No se puede deshacer.')) return;
    o.movs = o.movs.filter(m => m.id !== +v); ui.editMov = null; save(); render(); toast('Movimiento borrado');
  }
  else if (a.dataset.a === 'delOp') {
    const o = S.ops.find(x => x.id === id);
    if (!confirm(`¿Borrar la operación "${o.desc}"?\nSe borran también sus gastos, cobros y documentos. No se puede deshacer.`)) return;
    S.ops = S.ops.filter(x => x.id !== id); save(); location.hash = '#operaciones'; toast('Operación borrada');
  }
  else if (a.dataset.a === 'delCli') {
    const c = cliente(id), n = S.ops.filter(o => o.cl === id).length;
    if (n) return toast(`Tiene ${n} operación(es): borralas primero`);
    if (!confirm(`¿Borrar el cliente "${c.nombre}"? No se puede deshacer.`)) return;
    S.clientes = S.clientes.filter(x => x.id !== id); save(); location.hash = '#clientes'; toast('Cliente borrado');
  }
  else if (/^lq/.test(a.dataset.a)) {
    const o = S.ops.find(x => x.id === +(location.hash.match(/^#op-(\d+)$/) || [])[1]); if (!o) return;
    const act = a.dataset.a;
    if (act === 'lqNew') { armarLiq(o); ui.lqView = 'edit'; save(); render(); toast(`Liquidación N° ${o.lq.nro} armada`); }
    else if (act === 'lqView') { ui.lqView = v; render(); window.scrollTo(0, 0); }
    else if (act === 'lqAdd') { o.lq[v].push({ c:'', m:0 }); save(); render(); const ls = document.querySelectorAll(`.lqline[data-g="${v}"] .lq-c`); if (ls.length) ls[ls.length - 1].focus(); }
    else if (act === 'lqDel') { const [k, i] = v.split(':'); o.lq[k].splice(+i, 1); save(); render(); }
    else if (act === 'lqTpl') {
      S.cfg.plantilla = { gastos:o.lq.g.map(l => l.c.trim()).filter(Boolean), servicios:o.lq.s.filter(l => !l.h && l.c.trim()).map(l => ({ c:l.c.trim(), m:l.m })) };
      save(); toast('Plantilla guardada: se usa en las próximas liquidaciones');
    }
    else if (act === 'lqDelAll') { if (!confirm('¿Borrar esta liquidación y volver a armarla desde cero? Se pierde lo que completaste a mano.')) return; o.lq = null; ui.lqView = null; save(); render(); }
    else if (act === 'lqEmit') { o.lq.emitida = o.lq.emitida ? null : iso(new Date()); save(); render(); toast(o.lq.emitida ? 'Liquidación emitida' : 'Liquidación vuelta a borrador'); }
    else if (act === 'lqPrint') window.print();
    // lqWa: el enlace de WhatsApp se abre solo
  }
  else if (a.dataset.a === 'logoReset') { S.cfg.logo = null; save(); render(); toast('Se usa el logo de Pecomex'); }
  else if (a.dataset.a === 'lxCancel') { ui.lx = null; render(); }
  else if (a.dataset.a === 'lxOk') {
    const o = cargarLx(); if (!o) return;
    toast(`Liquidación N° ${o.lq.nro} cargada desde Excel`);
    if (location.hash === '#op-' + o.id) { ui.seg = 'lqc'; ui.lqView = 'doc'; render(); window.scrollTo(0, 0); }
    else { ui.go = 'lqdoc'; location.hash = '#op-' + o.id; } // el cambio de pantalla abre la liquidación
  }
  else if (a.dataset.a === 'pvWa') { // arma el enlace con el monto escrito justo antes de abrir WhatsApp
    const o = S.ops.find(x => x.id === id), m = money($('#pv-m').value);
    if (!m) { e.preventDefault(); return toast('Ingresá el monto a solicitar'); }
    a.href = `https://wa.me/${waNum(cliente(o.cl).tel)}?text=${encodeURIComponent(provTxt(o, m))}`;
    o.prov = (o.prov || []).concat([{ f:iso(new Date()), m }]); save(); setTimeout(() => { render(); toast('Pedido de provisión registrado'); }, 400);
  }
  else if (a.dataset.a === 'backup') {
    const f = iso(new Date()); S.cfg.backup = f; save();
    descargar(`pecomex-respaldo-${f}.json`, JSON.stringify({ app:'pecomex', version:1, fecha:new Date().toISOString(), datos:S }, null, 1), 'application/json');
    render(); toast('Respaldo descargado');
  }
  else if (a.dataset.a === 'csv') { descargar(`pecomex-operaciones-${iso(new Date())}.csv`, csvOps(), 'text/csv;charset=utf-8'); toast('Archivo para Excel descargado'); }
  else if (a.dataset.a === 'wa') { registrar(cliente(id), 'Enviado por WhatsApp'); setTimeout(render, 400); } // el enlace se abre solo
  else if (a.dataset.a === 'print') { registrar(cliente(id), 'Impreso o guardado en PDF'); render(); setTimeout(() => window.print(), 50); }
  else if (a.dataset.a === 'doc') { const o = S.ops.find(x => x.id === id); o.docs[v] = !o.docs[v]; save(); render(); }
  else if (a.dataset.a === 'cerrar') {
    const o = S.ops.find(x => x.id === id);
    if (!confirm('¿Terminar el despacho? La operación pasa a cerrada y se arma la liquidación de gastos para el cliente.')) return;
    o.estado = 'Cerrada'; o.cierre = iso(new Date()); if (!o.lq) armarLiq(o);
    ui.seg = 'lqc'; ui.lqView = 'edit'; save(); render(); window.scrollTo(0, 0); toast(`Despacho terminado · liquidación N° ${o.lq.nro} lista para completar`);
  }
  else if (a.dataset.a === 'impCancel') { ui.imp = null; render(); }
  else if (a.dataset.a === 'reset') { S = seed(); S.cfg = cfg0(); save(); render(); toast('Datos de ejemplo restablecidos'); }
  else if (a.dataset.a === 'copiar') {
    const ta = $('#estado-txt'); const fallback = () => { ta.closest('details').open = true; ta.focus(); ta.select(); toast('Texto seleccionado, copialo manualmente'); };
    const ok = () => { registrar(cliente(id), 'Texto copiado'); render(); toast('Estado de cuenta copiado'); };
    try { navigator.clipboard.writeText(ta.value).then(ok, fallback); } catch (err) { fallback(); }
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'impFile' && e.target.files[0]) onFile(e.target.files[0]);
  if (e.target.id === 'restoreFile' && e.target.files[0]) {
    e.target.files[0].text().then(t => {
      const r = JSON.parse(t), d = r && r.datos;
      if (!d || !Array.isArray(d.clientes) || !Array.isArray(d.ops)) throw new Error('formato');
      if (!confirm(`¿Reemplazar todos los datos de este dispositivo por el respaldo del ${fdt(r.fecha)}?\n(${d.clientes.length} clientes, ${d.ops.length} operaciones). Lo que no esté en el respaldo se pierde.`)) return;
      S = d; S.cfg = S.cfg || cfg0(); save(); location.hash = '#inicio'; render(); toast('Respaldo restaurado');
    }).catch(() => toast('Ese archivo no es un respaldo de Pecomex'));
    e.target.value = '';
  }
  if (e.target.id === 'logoFile' && e.target.files[0]) cargarLogo(e.target.files[0]);
  if (e.target.classList.contains('lxfile') && e.target.files[0]) { onXlsx(e.target.files[0], +e.target.dataset.op || null); e.target.value = ''; }
  if (e.target.id === 'pv-m') { const m = money(e.target.value); e.target.value = m ? dots(m) : ''; }
  if (e.target.classList.contains('lq-m')) { const m = money(e.target.value); e.target.value = m ? dots(m) : ''; } // formato 1.234.567 al salir del campo
});
document.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target;
  if (f.id === 'impForm') {
    const d = ui.imp && ui.imp.data; if (!d) return;
    const hon = money($('#i-hon').value), est = money($('#i-est').value); if (!hon) return toast('Ingresá el honorario');
    const id = crearDesdeHoja(d, hon, est); ui.imp = null; save(); location.hash = '#op-' + id; toast('Operación creada desde la hoja');
  } else if (f.id === 'movForm') {
    const o = S.ops.find(x => x.id === +f.dataset.op), m = money($('#mv-m').value); if (!m) return toast('Ingresá un monto');
    o.movs.push({ id:Date.now(), f:iso(new Date()), t:$('#mv-t').value, c:$('#mv-c').value.trim(), m }); save(); render(); toast('Movimiento agregado');
  } else if (f.id === 'movEdit') {
    const o = S.ops.find(x => x.id === +f.dataset.op), mv = o.movs.find(x => x.id === +f.dataset.mv), m = money($('#me-m').value); if (!m) return toast('Ingresá un monto');
    Object.assign(mv, { t:$('#me-t').value, c:$('#me-c').value.trim(), m, f:$('#me-f').value || mv.f }); ui.editMov = null; save(); render(); toast('Movimiento actualizado');
  } else if (f.id === 'opEdit') {
    const o = S.ops.find(x => x.id === +f.dataset.op), ref = $('#e-ref').value.trim();
    if (S.ops.some(x => x.id !== o.id && x.ref === ref)) return toast('Ya hay otra operación con ese número');
    const estado = $('#e-estado').value;
    Object.assign(o, { cl:+$('#e-cl').value, desc:$('#e-desc').value.trim(), ref, hon:money($('#e-hon').value), estG:money($('#e-est').value), estado, fecha:$('#e-fecha').value || o.fecha,
      cierre:estado === 'Cerrada' ? ($('#e-cierre').value || o.cierre || iso(new Date())) : null });
    save(); render(); toast('Operación actualizada');
  } else if (f.id === 'cliEdit') {
    const c = cliente(+f.dataset.id), ruc = $('#ce-r').value.trim();
    if (S.clientes.some(x => x.id !== c.id && rucKey(x.ruc) === rucKey(ruc))) return toast('Ya hay otro cliente con ese RUC');
    Object.assign(c, { nombre:$('#ce-n').value.trim(), ruc, tel:$('#ce-t').value.trim() }); save(); render(); toast('Cliente actualizado');
  } else if (f.id === 'newOp') {
    const id = Math.max(0, ...S.ops.map(o => o.id)) + 1;
    S.ops.push({ id, cl:+$('#n-cl').value, ref:'26003-NUEVA-' + id, reg:'Por definir', aduana:'Por definir', desc:$('#n-desc').value.trim(), estado:'Abierta', fecha:iso(new Date()), cierre:null, estG:money($('#n-est').value), hon:money($('#n-hon').value), docs:{ factura:false, crt:false, packing:false, mandato:false, hoja:false }, movs:[] });
    save(); location.hash = '#op-' + id; toast('Operación creada');
  } else if (f.id === 'newCli') {
    if (S.clientes.some(x => rucKey(x.ruc) === rucKey($('#c-r').value))) return toast('Ya existe un cliente con ese RUC');
    const id = Math.max(0, ...S.clientes.map(c => c.id)) + 1; S.clientes.push({ id, nombre:$('#c-n').value.trim(), ruc:$('#c-r').value.trim() }); save(); location.hash = '#cliente-' + id; toast('Cliente agregado');
  }
});
render();
})();
