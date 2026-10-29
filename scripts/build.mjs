import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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

// Keep a newly deployed UI and its calculation module on the same version,
// including when a returning visitor still has earlier modules in HTTP cache.
const sourceFiles = (await readdir(path.join(root, 'src'))).filter(file => /\.(?:js|css)$/.test(file)).sort();
const hash = createHash('sha256');
hash.update(await readFile(path.join(root, 'index.html')));
for (const file of sourceFiles) hash.update(await readFile(path.join(root, 'src', file)));
const revision = hash.digest('hex').slice(0, 12);
const htmlPath = path.join(output, 'index.html');
const html = await readFile(htmlPath, 'utf8');
await writeFile(htmlPath, html.replace(/((?:src|href)=["'])(\.\/(?:src\/[^"']+\.(?:js|css)|vendor\/katex\/katex\.min\.css))(["'])/g,
  (_, prefix, url, quote) => `${prefix}${url}?v=${revision}${quote}`));
for (const file of sourceFiles.filter(file => file.endsWith('.js'))) {
  const modulePath = path.join(output, 'src', file);
  const source = await readFile(modulePath, 'utf8');
  await writeFile(modulePath, source.replace(/(\bfrom\s*["'])(\.\.?\/[^"']+\.m?js)(["'])/g,
    (_, prefix, url, quote) => `${prefix}${url}?v=${revision}${quote}`));
}
const vendor = path.join(output, 'vendor/katex');
await mkdir(vendor, { recursive: true });
for (const file of ['katex.mjs', 'katex.min.css']) {
  await cp(path.join(root, 'node_modules/katex/dist', file), path.join(vendor, file));
}
await cp(path.join(root, 'node_modules/katex/dist/fonts'), path.join(vendor, 'fonts'), { recursive: true });
await cp(path.join(root, 'node_modules/katex/LICENSE'), path.join(vendor, 'LICENSE'));
await writeFile(path.join(output, '.nojekyll'), '');
console.log('Built static GitHub Pages site in docs/.');
