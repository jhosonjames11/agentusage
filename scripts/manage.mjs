import { spawn } from 'node:child_process';
import { mkdir, open, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.USAGE_DASHBOARD_PORT ?? 4320);
const address = `http://127.0.0.1:${port}`;
const action = process.argv[2] ?? 'start';
const noOpen = process.argv.includes('--no-open');

async function health() {
  try {
    const response = await fetch(`${address}/api/health`, { signal: AbortSignal.timeout(1000) });
    if (!response.ok) return null;
    const data = await response.json();
    return ['agentusage', 'usage-ledger', 'codex-hermes-usage-dashboard'].includes(data.application) ? data : null;
  } catch { return null; }
}

const existing = await health();
if (action === 'stop') {
  if (!existing) console.log('Dashboard is not running.');
  else { process.kill(existing.pid, 'SIGTERM'); console.log('Dashboard service stopped.'); }
} else if (action === 'status') {
  console.log(existing ? `Dashboard is running: ${address}` : 'Dashboard is not running.');
} else if (action === 'start') {
  if (!existing) {
    try { await access(path.join(root, 'dist', 'index.html')); await access(path.join(root, 'node_modules', 'ccusage', 'src', 'cli.js')); }
    catch { console.error('Run npm install and npm run build in the project directory first.'); process.exit(1); }
    const dataDir = path.join(root, '.data');
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const log = await open(path.join(dataDir, 'server.log'), 'a', 0o600);
    const child = spawn(process.execPath, [path.join(root, 'server', 'index.mjs')], {
      cwd: root, detached: true, stdio: ['ignore', log.fd, log.fd],
      env: { ...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH ?? ''}` },
    });
    child.unref();
    await log.close();
    let ready = null;
    for (let attempt = 0; attempt < 20 && !ready; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 250));
      ready = await health();
    }
    if (!ready) { console.error(`Startup failed. Check .data/server.log and whether port ${port} is occupied.`); process.exit(1); }
  }
  console.log(`Dashboard is running: ${address}\nCollection continues every 20 minutes after you close the browser or terminal. Stop: npm run stop`);
  if (!noOpen) {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
    const opener = spawn(command, [address], { detached: true, stdio: 'ignore' });
    opener.on('error', () => console.log(`Open manually: ${address}`));
    opener.unref();
  }
} else { console.error('Usage:node scripts/manage.mjs start|stop|status [--no-open]'); process.exitCode = 1; }
