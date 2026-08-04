import 'dotenv/config';
import { createApp } from './app.js';
import { getNetworkDiagnostics } from './lib/clientUrl.js';

// Local / non-Vercel only. On Vercel the SPA is static (`dist/`) and `/api`
// is served by `api/index.ts`. Avoid exporting this module as an Express
// entry — that makes Vercel route every request through a serverless function.
if (!process.env.VERCEL) {
  const app = createApp();
  const port = Number(process.env.PORT ?? 3001);

  app.listen(port, () => {
    const diagnostics = getNetworkDiagnostics();

    console.log(`API server running on http://localhost:${port}`);
    console.log(`QR upload links use ${diagnostics.clientBaseUrl}`);

    if (diagnostics.candidates.length > 0) {
      console.log('Detected network addresses:');
      for (const candidate of diagnostics.candidates) {
        console.log(`  - ${candidate.name}: ${candidate.address}`);
      }
    }

    console.log('Phone upload tips:');
    for (const tip of diagnostics.tips) {
      console.log(`  • ${tip}`);
    }
  });
}
