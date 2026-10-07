const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
for (const name of ['jsons', 'mapas_source']) {
  const source = path.join(root, 'src', name);
  if (!fs.existsSync(source)) throw new Error(`Missing required build assets: ${name}`);
  fs.cpSync(source, path.join(dist, name), { recursive: true });
}
console.log('API assets copied to dist/');
