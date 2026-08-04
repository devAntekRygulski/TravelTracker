import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import os from 'node:os';

const VIRTUAL_ADAPTER_RE =
  /vmware|vmnet|virtualbox|vbox|hyper-v|vethernet|wsl|loopback|tunnel|tap|tun|npcap|bluetooth/i;

const TUNNEL_URL_FILE = resolve(process.cwd(), '.tunnel-url');

interface NetworkCandidate {
  name: string;
  address: string;
}

/**
 * Pick a LAN IPv4 the phone can reach. Skips loopback, link-local, virtual
 * switch adapters, and common gateway addresses on virtual networks.
 */
function listLanIPv4Candidates(): NetworkCandidate[] {
  const nets = os.networkInterfaces();
  const candidates: NetworkCandidate[] = [];

  for (const [name, entries] of Object.entries(nets)) {
    if (VIRTUAL_ADAPTER_RE.test(name)) continue;

    for (const net of entries ?? []) {
      const isV4 = net.family === 'IPv4' || (net.family as unknown) === 4;
      if (!isV4 || net.internal) continue;
      if (net.address.startsWith('169.254.')) continue;
      candidates.push({ name, address: net.address });
    }
  }

  return candidates;
}

function pickBestLanIPv4(candidates: NetworkCandidate[]): string | null {
  if (candidates.length === 0) return null;

  const byName = candidates.find((candidate) =>
    /wi-?fi|wlan|wireless|ethernet|eth|en0|en1/i.test(candidate.name),
  );
  if (byName) return byName.address;

  const homeLan = candidates.find(
    (candidate) =>
      candidate.address.startsWith('192.168.') &&
      !candidate.address.endsWith('.1'),
  );
  if (homeLan) return homeLan.address;

  const privateLan = candidates.find(
    (candidate) =>
      (candidate.address.startsWith('192.168.') ||
        candidate.address.startsWith('10.') ||
        candidate.address.startsWith('172.')) &&
      !candidate.address.endsWith('.1'),
  );
  if (privateLan) return privateLan.address;

  return candidates[0]?.address ?? null;
}

function isLoopbackUrl(url: string): boolean {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url);
}

function isPublicHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) && !isLoopbackUrl(url);
}

/** Always return a URL with an explicit http(s) scheme for QR codes. */
export function normalizeClientUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

/** Live tunnel URL written by `npm run tunnel` (re-read every call). */
function readTunnelUrlFile(): string | null {
  try {
    if (!existsSync(TUNNEL_URL_FILE)) return null;
    const raw = readFileSync(TUNNEL_URL_FILE, 'utf8').trim();
    if (!raw) return null;
    return normalizeClientUrl(raw);
  } catch {
    return null;
  }
}

/**
 * Base URL written into QR codes.
 *
 * Priority:
 * 1. CLIENT_PUBLIC_URL / CLIENT_LAN_URL (deployed or forced public URL)
 * 2. Active Cloudflare tunnel (.tunnel-url from `npm run tunnel`)
 * 3. Non-loopback CLIENT_URL
 * 4. Auto-detected LAN IP (same Wi‑Fi only)
 * 5. localhost (phones cannot use this)
 */
export function getClientBaseUrl(): string {
  const configured = normalizeClientUrl(
    process.env.CLIENT_URL ?? 'http://localhost:5173',
  );
  const explicitPublic = (
    process.env.CLIENT_PUBLIC_URL ??
    process.env.CLIENT_LAN_URL ??
    ''
  ).trim();

  if (explicitPublic) {
    return normalizeClientUrl(explicitPublic);
  }

  const tunnelUrl = readTunnelUrlFile();
  if (tunnelUrl) {
    return tunnelUrl;
  }

  if (!isLoopbackUrl(configured)) {
    return configured;
  }

  const lanIp = pickBestLanIPv4(listLanIPv4Candidates());
  if (lanIp) {
    const portMatch = configured.match(/:(\d+)(?:\/|$)/);
    const port = portMatch?.[1] ?? process.env.CLIENT_PORT ?? '5173';
    return `http://${lanIp}:${port}`;
  }

  return configured;
}

export function getNetworkDiagnostics() {
  const candidates = listLanIPv4Candidates();
  const selected = getClientBaseUrl();
  const usingPublicLink = isPublicHttpUrl(selected);

  return {
    clientBaseUrl: selected,
    candidates,
    usingPublicLink,
    tips: usingPublicLink
      ? [
          'QR codes use a public HTTPS link — phone can use any Wi‑Fi or mobile data.',
          'Keep npm run tunnel open while testing; generate a new QR after the tunnel starts.',
          'For production, set CLIENT_PUBLIC_URL=https://yourapp.com instead of using a tunnel.',
        ]
      : [
          'Connect your phone to the same Wi‑Fi as this computer, or run npm run tunnel for a public link.',
          'Scan the QR code or open the full link starting with http:// (never add www).',
          'If it still fails on public Wi‑Fi, run: npm run tunnel',
        ],
  };
}
