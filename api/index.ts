import { createApp } from '../server/app.js';

// Vite hosts the SPA from `dist/`. This file is only the `/api/*` serverless
// function — do not treat the repo as an Express-only Vercel app.
const app = createApp();

export default app;
