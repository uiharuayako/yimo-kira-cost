import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = path.resolve(root, 'docs');
if (path.dirname(output) !== root || path.basename(output) !== 'docs') {
  throw new Error('Refusing to build outside the project docs directory.');
}
await readFile(path.join(root, 'index.html'));
await readFile(path.join(root, 'node_modules/katex/dist/katex.mjs'));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, 'index.html'), path.join(output, 'index.html'));
await cp(path.join(root, 'src'), path.join(output, 'src'), { recursive: true });
await cp(path.join(root, 'public'), output, { recursive: true });
await cp(path.join(root, 'data'), path.join(output, 'data'), { recursive: true });
const vendor = path.join(output, 'vendor/katex');
await mkdir(vendor, { recursive: true });
for (const file of ['katex.mjs', 'katex.min.css']) {
  await cp(path.join(root, 'node_modules/katex/dist', file), path.join(vendor, file));
}
await cp(path.join(root, 'node_modules/katex/dist/fonts'), path.join(vendor, 'fonts'), { recursive: true });
await cp(path.join(root, 'node_modules/katex/LICENSE'), path.join(vendor, 'LICENSE'));
await writeFile(path.join(output, '.nojekyll'), '');
console.log('Built static GitHub Pages site in docs/.');
