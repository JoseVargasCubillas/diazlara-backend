/**
 * Copy non-TS template assets (HTML / TXT) from src/templates → dist/templates
 * after `tsc` runs, so the compiled app can read them at runtime.
 */
const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '..', 'src', 'templates');
const dest = path.resolve(__dirname, '..', 'dist', 'templates');

function copyRecursive(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      copyRecursive(path.join(from, entry), path.join(to, entry));
    }
  } else {
    fs.copyFileSync(from, to);
  }
}

if (!fs.existsSync(src)) {
  console.warn(`[copy-templates] source dir not found: ${src}`);
  process.exit(0);
}

copyRecursive(src, dest);
console.log(`[copy-templates] copied ${src} → ${dest}`);
