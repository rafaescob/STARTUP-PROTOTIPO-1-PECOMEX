# Pecomex (prototipo 1)

Prototipo visual y navegable de un control financiero para agencias de despacho aduanero en Paraguay.
Los datos son de ejemplo, con nombres y RUC ficticios, y se guardan solo en el navegador de cada dispositivo.

## Publicar en GitHub Pages
1. Subir todos los archivos a la raíz del repositorio (rama `main`).
2. En Settings > Pages, elegir "Deploy from a branch", rama `main`, carpeta `/ (root)`.
3. Abrir la dirección `https://<usuario>.github.io/STARTUP-PROTOTIPO-1-PECOMEX/`.

## Agregar al inicio del iPhone
Abrir la dirección en Safari, tocar Compartir y elegir "Agregar a pantalla de inicio".

## Archivos
- `index.html`, `style.css`, `app.js`: la aplicación.
- `manifest.webmanifest`, `sw.js`, `icons/`: instalación y uso sin conexión.
- `vendor/`: lector de PDF (pdf.js, licencia Apache 2.0) para importar hojas de despacho sin enviar el archivo a ningún servidor.
