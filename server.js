require('express');

const fs = require('fs');
const path = require('path');

const entrypoint = path.join(__dirname, 'dist', 'index.js');

if (!fs.existsSync(entrypoint)) {
  console.error('No se encontro dist/index.js. Ejecuta "npm run build" antes de iniciar la app.');
  process.exit(1);
}

require(entrypoint);
