import cors from 'cors';
import express, { type Express } from 'express';
import authRoutes from './routes/auth.js';
import visitedCountriesRoutes from './routes/visitedCountries.js';
import visitedRegionsRoutes from './routes/visitedRegions.js';

export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      origin: process.env.CLIENT_URL ?? true,
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/visited-countries', visitedCountriesRoutes);
  app.use('/api/visited-regions', visitedRegionsRoutes);

  app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });

  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) {
        next(error);
        return;
      }

      if (error instanceof SyntaxError) {
        res.status(400).json({ message: 'Invalid request body' });
        return;
      }

      console.error('Unhandled API error:', error);
      res.status(500).json({ message: 'Internal server error' });
    },
  );

  return app;
}
