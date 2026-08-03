/**
 * Opens a temporary public HTTPS tunnel to the Vite app.
 * Reads .vite-dev-port when present so the tunnel matches the real Vite port.
 *
 * Usage (with npm run dev already running):
 *   npm run tunnel
 */
import { spawn } from 'node:child_process';
import {
  writeFileSync,
  unlinkSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const tunnelFile = resolve(root, '.tunnel-url');
const portFile = resolve(root, '.vite-dev-port');
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function resolveTarget() {
  if (process.env.TUNNEL_TARGET) {
    return process.env.TUNNEL_TARGET;
  }

  if (existsSync(portFile)) {
    const port = readFileSync(portFile, 'utf8').trim();
    if (/^\d+$/.test(port)) {
      return `http://localhost:${port}`;
    }
  }

  return 'http://localhost:5173';
}

function saveUrl(url) {
  writeFileSync(tunnelFile, `${url.trim()}\n`, 'utf8');
  console.log('');
  console.log('Public upload URL ready:');
  console.log(`  ${url}`);
  console.log('');
  console.log('Keep this terminal open. With npm run dev running:');
  console.log('  1. Open guest mode on your laptop at http://localhost:5173');
  console.log('  2. Open a country and wait for the QR (or regenerate it)');
  console.log('  3. Scan with your phone — keep the country panel open on the laptop');
  console.log('');
  console.log(`Saved to ${tunnelFile}`);
}

function clearUrl() {
  if (existsSync(tunnelFile)) {
    unlinkSync(tunnelFile);
  }
}

const TARGET = resolveTarget();
clearUrl();

console.log(`Starting Cloudflare quick tunnel → ${TARGET}`);
if (TARGET.includes(':5173') === false) {
  console.log('Note: Vite is not on 5173; tunnel follows .vite-dev-port.');
}
console.log('First run may download cloudflared; wait a moment…');

const child = spawn(
  'npx',
  ['--yes', 'cloudflared@latest', 'tunnel', '--url', TARGET],
  {
    cwd: root,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, '--use-system-ca']
        .filter(Boolean)
        .join(' '),
    },
  },
);

let found = false;

function inspect(chunk) {
  const text = chunk.toString();
  process.stdout.write(text);

  if (found) return;

  const match = text.match(URL_RE);
  if (match) {
    found = true;
    saveUrl(match[0]);
  }
}

child.stdout.on('data', inspect);
child.stderr.on('data', inspect);

child.on('exit', (code) => {
  clearUrl();
  console.log('');
  console.log(`Tunnel closed (exit ${code ?? 0}). QR links fall back to LAN / localhost.`);
  process.exit(code ?? 0);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearUrl();
    child.kill('SIGTERM');
  });
}
