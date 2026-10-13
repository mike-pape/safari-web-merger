import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const out = join(root, 'public', 'ffmpeg');
mkdirSync(out, { recursive: true });
// ESM worker imports ./const.js and ./errors.js. Serve all from SAME ORIGIN.
const specs = [
  ['@ffmpeg/ffmpeg/dist/esm/worker.js', 'worker.js'],
  ['@ffmpeg/ffmpeg/dist/esm/const.js', 'const.js'],
  ['@ffmpeg/ffmpeg/dist/esm/errors.js', 'errors.js'],
  ['@ffmpeg/core/dist/esm/ffmpeg-core.js', 'ffmpeg-core.js'],
  ['@ffmpeg/core/dist/esm/ffmpeg-core.wasm', 'ffmpeg-core.wasm'],
];
for (const [from, to] of specs) {
  const source = join(root, 'node_modules', from);
  if (!existsSync(source)) throw new Error(`Missing dependency asset: ${source}`);
  cpSync(source, join(out, to));
  console.log('Copied', to);
}
const src = readFileSync(join(out, 'worker.js'), 'utf8');
if (!src.includes('import(')) throw new Error('Unexpected worker.js version; audit before deployment');
console.log('Prepared same-origin ESM worker and single-thread core.');
