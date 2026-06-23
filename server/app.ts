import cors from 'cors';
import express, { type Express } from 'express';
import authRoutes from './routes/auth.js';
import visitedCountriesRoutes from './routes/visitedCountries.js';

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

  app.use((_req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });

  return app;
}
