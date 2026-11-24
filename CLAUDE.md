# Pecomex — contexto del proyecto (para Claude Code)

## Qué es
Startup de un estudiante paraguayo de ingeniería de negocios (intercambio en SRH Heidelberg). Busca llevar innovación digital al comercio exterior de Paraguay, en un nicho con poca competencia, validando con un MVP. **Producto actual: control financiero para agencias de despacho aduanero.** Por cliente/RUC: documentos, gastos por cuenta del cliente, costos propios, estimado vs real, cuentas por cobrar con antigüedad (0-30, 31-60, 60+), margen y estado de cuenta para enviar por WhatsApp. A largo plazo, puerta de entrada a una "torre de control" de costos y rutas.
- El usuario programa poco: explicá simple, sin librerías ni plugins innecesarios. **Responder siempre en español.**
- Contactos propios: un despachante de aduana (validará la idea), una gomería, el gerente de un hotel.

## Estado actual
Prototipo en HTML/CSS/JS puro (sin framework), datos de ejemplo ficticios, guardado en `localStorage` (clave `pecomex-demo-v1`). PWA instalable en iPhone, responsive (barra inferior en móvil, barra lateral y dos columnas desde 900 px), tema claro/oscuro.
- Repo: `rafaescob/STARTUP-PROTOTIPO-1-PECOMEX`, rama `main`. Se publica con GitHub Pages (hay que activarlo en Settings > Pages).
- Archivos: `index.html`, `style.css`, `app.js` (incluye el lector de PDF al inicio), `manifest.webmanifest`, `sw.js` (red primero, caché `pecomex-vN`), `icons/`, `vendor/` (pdf.js, Apache 2.0).
- Al cambiar `style.css` o `app.js`, subir el número `?v=` en `index.html` y la versión de caché en `sw.js`.
- Pantallas: Inicio (con gráfico de cobros de los últimos 6 meses), Operaciones (lista, importar PDF, nueva operación), Operación (Resumen con "Editar operación", Hoja de despacho, Gastos y cobros —tocar un movimiento para editarlo o borrarlo—, Documentos), Clientes, Cliente (estado de cuenta tipo documento, imprimir/PDF, registro de envíos, "Editar cliente"), Cobros.
- Cliente: `{id, nombre, ruc, tel?, envios?}`. `tel` se usa para abrir WhatsApp directo (0981… → 595981…). `envios` = `[{f (ISO), via, saldo}]`, máximo 20. Un cliente con operaciones no se puede borrar. Borrar pide confirmación.
- Las fechas de "hoy" se calculan en hora local (`iso()`), no UTC.

## Flujo de una operación
1. **Abierta:** en Resumen, "Provisión de fondos": tributos y gastos estimados (máx. entre `estG` y `trib`) + honorario con IVA − cobros = falta recibir. Se pide por WhatsApp con monto editable y datos bancarios (`S.cfg.banco`); cada pedido queda en `o.prov = [{f, m}]`. Inicio alerta cuando la agencia está financiando (gastos > cobros).
2. **"Terminar despacho y liquidar":** cierra la operación (fecha de cierre = hoy), arma la liquidación y abre la pestaña.
3. **Cerrada:** recién ahí aparece la pestaña "Liquidación" (o si ya existe `o.lq`). Inicio alerta si una operación cerrada hace ≤ 30 días no tiene la liquidación emitida.

## Respaldo (tarjeta "Tus datos" en Inicio, ancla `#datos`)
Descargar respaldo JSON `{app, version, fecha, datos:S}` (guarda `S.cfg.backup`), restaurar (valida `clientes` y `ops`, pide confirmación) y exportar operaciones a CSV con `;` y BOM para Excel en español. Inicio alerta si no hay respaldo hace más de 7 días. Inicio muestra máximo 6 alertas, primero las urgentes.

## Liquidación de gastos al cliente (pestaña "Liquidación" de la operación)
Copia el formato de la planilla Excel de la agencia. `o.lq = {nro, fecha, consignado, mercaderia, procedencia, origen, emitida, t, g, s}`; líneas `{c, m}` (la del honorario lleva `h:true`).
- `t` tributos: de la hoja importada (columna tributado, sin código); si no hay hoja, del movimiento "Tributos pagados".
- `g` gastos de terceros (sin IVA): plantilla de la agencia + movimientos `g` registrados. `s` servicios de la agencia (gastos de despacho, verificación, honorario) llevan IVA 10 %.
- Total = t + g + s + IVA(s). Anticipo = suma de cobros `c`. Saldo a cobrar o a favor del cliente. "Son guaraníes" con `letras()`. Cuadro "A facturar": cada servicio × 1,1; IVA = total a facturar / 11.
- Verificado con la planilla real (liq. 284/26): total 22.895.565, a facturar 1.283.865, IVA 116.715. La planilla original tenía el texto en letras desactualizado y celdas `#REF!`.
- `S.cfg = {agencia, liqN:{aa:n}, plantilla:{gastos:[...], servicios:[{c,m}]}}`. Numeración correlativa N/AA. "Guardar como plantilla" guarda conceptos y montos de servicios.
- Con la liquidación **emitida**, `calc()` usa su total para el saldo y el margen = servicios − costos propios.
- Control: tributos + gastos de la liquidación vs. gastos registrados en "Gastos y cobros".
- La planilla de ejemplo tiene datos reales de un cliente: **no subirla al repo**.
- Modelo de operación: `{id, cl, ref, reg, aduana, desc, estado, fecha, cierre, usd, flete, cambio, imponible, trib, gar, estG, hon, liq, items, docs, movs, meta}`. Movimientos: `g` gasto por cuenta del cliente, `p` costo propio, `c` cobro. `liq` = `[concepto, tributado, garantizado]`; `items` = `[posición, descripción, USD, imponible Gs, arancel %]`.

## Importación de la hoja de despacho (PDF del sistema SOFIA)
- pdf.js se carga con `import()` desde `vendor/`, con respaldo en jsDelivr (versión 6.2.108). Todo corre en el navegador, el PDF no sale del dispositivo.
- `parseHoja(pages)` arma filas con las coordenadas x/y de cada fragmento de texto y extrae: despacho, régimen, aduana, importador y RUC, proveedor, valor factura, flete, seguro, tipo de cambio, valor imponible, liquidación, ítems (posición arancelaria, FOB, imponible, origen, kilos), transporte, manifiestos y factura.
- Controles: suma de ítems = valor factura; suma de imponibles ≈ imponible de cabecera (tolerancia de redondeo); suma de tributos y garantizados = totales.
- Se busca el cliente por RUC (solo dígitos) y se crea si no existe. Una hoja ya cargada (mismo número de despacho) se bloquea.
- Probado con 2 hojas reales (IT04 con 13 ítems e IC04 con 2). Falta probar exportación y otros regímenes. Los PDF reales tienen datos de terceros: **no subirlos al repo**.
- Limitación: el PDF no trae tildes en las descripciones.

## Honorario (escala del despachante, aplicada sobre el valor imponible)
Tramos (de, hasta, honorario básico, % adicional): 1–10.000.000 → 50.000, 2 %; 10.000.001–50.000.000 → 250.000, 1 %; 50.000.001–100.000.000 → 750.000, 0,8 %; 100.000.001–250.000.000 → 1.550.000, 0,5 %; desde 250.000.001 → 2.800.000, 0,3 %.
**Honorario = básico del tramo + (% adicional × valor imponible completo).** Exportación: la mitad. Importación: completo.
Verificado con planillas del usuario: exportación con imponible 98.918.750 → 770.675; importación con imponible 2.180.154.302 → 9.340.463. La exportación se detecta si el régimen empieza con "E" (sin probar con una hoja real). El campo queda editable.

## Contexto de Paraguay
SOFIA/KIT/KITAPP (DNIT) son los sistemas de la aduana. Regímenes: IT04 importación temporaria, IC04 importación definitiva. "Tributado" se paga en efectivo; "garantizado" queda con garantía. Hay unos 5.000 despachantes (CDAP). La escala de honorarios mínimos viene de la Ley 220/93.

## Pendiente / ideas
- Adjuntar el PDF a la operación y poder abrirlo después.
- Probar hojas de exportación y otros regímenes (pedir 3-4 hojas con datos del cliente tachados).
- Preguntar al despachante si el sistema KIT permite exportar datos (conexión directa).
- Backend real (cuentas, base de datos compartida) cuando el prototipo se valide; hoy no hay servidor.
