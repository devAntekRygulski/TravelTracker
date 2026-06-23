import { Router, type Response } from 'express';
import { connectDB } from '../config/db.js';
import { signToken, requireAuth, type AuthRequest } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { getDatabaseErrorMessage } from '../utils/errors.js';

const router = Router();

router.post('/register', async (req, res: Response) => {
  try {
    await connectDB();

    const email = String(req.body.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(req.body.password ?? '');
    const visitedCountries = Array.isArray(req.body.visitedCountries)
      ? req.body.visitedCountries.filter((id: unknown): id is string => typeof id === 'string')
      : [];

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' });
      return;
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      res.status(409).json({ message: 'An account with this email already exists' });
      return;
    }

    const user = await User.create({
      email,
      password,
      visitedCountries,
    });

    const token = signToken(String(user._id));

    res.status(201).json({
      token,
      user: {
        id: String(user._id),
        email: user.email,
        visitedCountries: user.visitedCountries,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      message: getDatabaseErrorMessage(error, 'Failed to create account'),
    });
  }
});

router.post('/login', async (req, res: Response) => {
  try {
    await connectDB();

    const email = String(req.body.email ?? '')
      .trim()
      .toLowerCase();
    const password = String(req.body.password ?? '');

    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }

    const user = await User.findOne({ email });

    if (!user || !(await user.comparePassword(password))) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const token = signToken(String(user._id));

    res.json({
      token,
      user: {
        id: String(user._id),
        email: user.email,
        visitedCountries: user.visitedCountries,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      message: getDatabaseErrorMessage(error, 'Failed to log in'),
    });
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await connectDB();

    const user = req.user!;

    res.json({
      user: {
        id: String(user._id),
        email: user.email,
        visitedCountries: user.visitedCountries,
      },
    });
  } catch (error) {
    console.error('Me error:', error);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

export default router;
