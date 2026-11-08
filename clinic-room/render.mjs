// Render the scene headlessly and save a PNG.
// Usage: node render.mjs [preview|final] [out.png] [extra query, e.g. "samples=800&scale=0.5"]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // CJS require honors global NODE_PATH
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] || 'preview';
const out = path.resolve(process.argv[3] || path.join(root, 'renders', `${mode}.png`));
const extra = process.argv[4] || '';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream', '.bin': 'application/octet-stream', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 1200 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/index.html?mode=${mode}&${extra}`);

let last = '';
const t0 = Date.now();
while (true) {
  const st = await page.evaluate(() => ({ s: window.__status, done: window.__renderDone, err: window.__renderError }));
  if (st.s !== last && (Date.now() - t0) > 0) { console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`, st.s); last = st.s; }
  if (st.err) { console.log(st.err); break; }
  if (st.done) break;
  await new Promise((r) => setTimeout(r, 2000));
}
const data = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
console.log('saved', out);
await browser.close();
server.close();
