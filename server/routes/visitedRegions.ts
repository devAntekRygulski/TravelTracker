import { Router, type Response } from 'express';
import { connectDB } from '../config/db.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { User } from '../models/User.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await connectDB();

    res.json({
      visitedRegions: req.user!.visitedRegions,
    });
  } catch (error) {
    console.error('Get visited regions error:', error);
    res.status(500).json({ message: 'Failed to fetch visited regions' });
  }
});

router.put('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await connectDB();

    const visitedRegions = Array.isArray(req.body.visitedRegions)
      ? [...new Set(
          req.body.visitedRegions.filter(
            (id: unknown): id is string => typeof id === 'string',
          ),
        )]
      : null;

    if (!visitedRegions) {
      res.status(400).json({ message: 'visitedRegions must be an array' });
      return;
    }

    const user = await User.findByIdAndUpdate(
      req.user!._id,
      { visitedRegions },
      { new: true },
    ).select('-password');

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.json({
      visitedRegions: user.visitedRegions,
    });
  } catch (error) {
    console.error('Update visited regions error:', error);
    res.status(500).json({ message: 'Failed to update visited regions' });
  }
});

export default router;
