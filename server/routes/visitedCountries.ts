import { Router, type Response } from 'express';
import { connectDB } from '../config/db.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { User } from '../models/User.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await connectDB();

    res.json({
      visitedCountries: req.user!.visitedCountries,
    });
  } catch (error) {
    console.error('Get visited countries error:', error);
    res.status(500).json({ message: 'Failed to fetch visited countries' });
  }
});

router.put('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await connectDB();

    const visitedCountries = Array.isArray(req.body.visitedCountries)
      ? [...new Set(
          req.body.visitedCountries.filter(
            (id: unknown): id is string => typeof id === 'string',
          ),
        )]
      : null;

    if (!visitedCountries) {
      res.status(400).json({ message: 'visitedCountries must be an array' });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.user!._id,
      { visitedCountries },
      { new: true },
    ).select('-password');

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json({
      visitedCountries: user.visitedCountries,
    });
  } catch (error) {
    console.error('Update visited countries error:', error);
    res.status(500).json({ message: 'Failed to update visited countries' });
  }
});

export default router;
