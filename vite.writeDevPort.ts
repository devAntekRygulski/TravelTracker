import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const PORT_FILE = resolve(process.cwd(), '.vite-dev-port');

/** Writes the real Vite port so `npm run tunnel` can target the same process. */
export function writeDevPortPlugin(): Plugin {
  return {
    name: 'write-dev-port',
    configureServer(server) {
      const clear = () => {
        if (existsSync(PORT_FILE)) {
          unlinkSync(PORT_FILE);
        }
      };

      process.once('exit', clear);
      process.once('SIGINT', clear);
      process.once('SIGTERM', clear);

      server.httpServer?.once('listening', () => {
        const address = server.httpServer?.address();
        const port =
          typeof address === 'object' && address ? address.port : 5173;
        writeFileSync(PORT_FILE, `${port}\n`, 'utf8');
        console.log(`[write-dev-port] Vite is on ${port} (saved to .vite-dev-port)`);
      });
    },
  };
}
