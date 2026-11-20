import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync, spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = { seed: 42, duration: 30, out: 'bench.json' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') args.seed = Number(argv[++i]);
    else if (argv[i] === '--duration') args.duration = Number(argv[++i]);
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

function findChrome() {
  const candidates = [
    'google-chrome',
    'chromium',
    'chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const bin of candidates) {
    const res = spawnSync('which', [bin], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout.trim()) return res.stdout.trim();
    if (fs.existsSync(bin)) return bin;
  }
  return null;
}

const args = parseArgs(process.argv.slice(2));
const distDir = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(distDir)) {
  process.stderr.write('dist/ not found. Run npm run build first.\n');
  process.exit(1);
}

const chromeBin = findChrome();
if (!chromeBin) {
  process.stderr.write(
    'No Chrome/Chromium binary found for WebGL 1280x720 benchmark. ' +
    'Install Google Chrome / Chromium or Playwright on the benchmark machine.\n'
  );
  process.exit(1);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

let server;
let benchPayload = null;

server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/api/bench-done' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      benchPayload = JSON.parse(body);
      res.writeHead(200);
      res.end('ok');
      server.close();
    });
    return;
  }
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(distDir, rel);
  if (!filePath.startsWith(distDir) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/?bench=1&seed=${args.seed}&duration=${args.duration}`;
  const res = spawnSync(
    chromeBin,
    [
      '--headless=new',
      '--window-size=1280,720',
      '--disable-gpu-vsync',
      '--use-gl=angle',
      '--enable-webgl',
      '--no-sandbox',
      url,
    ],
    { timeout: (args.duration + 25) * 1000 }
  );
  if (!benchPayload) {
    process.stderr.write(`Benchmark did not complete (chrome exit=${res.status})\n`);
    process.exit(1);
  }
  const output = {
    contract_version: '1.3',
    ...benchPayload,
    peak_mem_mb: null,
    vsync_off: true,
    renderer: 'Three.js WebGLRenderer (r170)',
    os: `${os.platform()} ${os.release()}`,
  };
  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(output, null, 2) + '\n', 'utf8');
  process.exit(0);
});
