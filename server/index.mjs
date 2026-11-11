import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createCollector } from './collector.mjs';
import { parseSupportedAgents } from '../src/domain/agents.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataDir = path.join(root, '.data');
const snapshotPath = path.join(dataDir, 'usage.json');
const bin = path.join(root, 'node_modules', 'ccusage', 'src', 'cli.js');
const run = promisify(execFile);
const port = Number(process.env.USAGE_DASHBOARD_PORT ?? 4320);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('USAGE_DASHBOARD_PORT must be between 1024 and 65535.');

let previous;
try {
  const saved = JSON.parse(await readFile(snapshotPath, 'utf8'));
  if ([1, 2].includes(saved.version) && saved.sources && typeof saved.sources === 'object') previous = saved;
} catch { /* First launch or unreadable snapshot: rebuild from the original logs. */ }

const collector = createCollector({
  previous,
  async discoverAgents() {
    const { stdout } = await run(process.execPath, [bin, '--help'], { cwd: root, timeout: 30_000, maxBuffer: 1024 * 1024 });
    return parseSupportedAgents(stdout);
  },
  async loadReport() {
    try {
      const { stdout, stderr } = await run(process.execPath, [bin, 'daily', '--by-agent', '--json', '--offline', '--timezone', 'Asia/Hong_Kong'], {
        cwd: root, timeout: 180_000, maxBuffer: 64 * 1024 * 1024,
      });
      return { ...JSON.parse(stdout), _ccusageWarning: Boolean(stderr.trim()) };
    } catch (error) {
      const code = error.code === 'ENOENT' ? 'ccusage_missing' : error.killed ? 'collection_timeout' : error instanceof SyntaxError ? 'report_invalid' : 'collection_failed';
      // Never send CLI stderr to the browser: it may include local paths or metadata.
      throw Object.assign(new Error(code), { code });
    }
  },
  async persist(snapshot) {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    await writeFile(`${snapshotPath}.tmp`, JSON.stringify(snapshot), { mode: 0o600 });
    await rename(`${snapshotPath}.tmp`, snapshotPath);
  },
});

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  const host = req.headers.host;
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  const origin = req.headers.origin;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (!allowed.includes(host) || (origin && !allowed.some(value => origin === `http://${value}`))) {
    return json(403, { error: 'Local access only.' });
  }
  try {
    const pathname = new URL(req.url, `http://${host}`).pathname;
    if (pathname === '/api/health' && req.method === 'GET') return json(200, { application: 'agentusage', pid: process.pid });
    if (pathname === '/api/usage' && req.method === 'GET') return json(200, collector.snapshot());
    if (pathname === '/api/refresh' && req.method === 'POST') return json(200, await collector.refresh());
    if (pathname.startsWith('/api/')) return json(405, { error: 'Unsupported request.' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'Unsupported request.' });
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (file !== 'index.html' && file !== 'favicon.svg' && !/^assets\/[a-zA-Z0-9_.-]+$/.test(file)) return json(404, { error: 'Not found.' });
    const contents = await readFile(path.join(root, 'dist', file));
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': file.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch (error) {
    if (error.code === 'ENOENT') return json(404, { error: 'Build the dashboard with npm run build.' });
    json(500, { error: 'Request failed. Please try again.' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Agent Usage: http://127.0.0.1:${port}`);
  console.log('Collects all ccusage agents every 20 minutes. Press Ctrl+C to stop.');
  void collector.refresh().then(() => collector.start());
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Open http://127.0.0.1:${port} or set USAGE_DASHBOARD_PORT.` : error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  collector.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
});
