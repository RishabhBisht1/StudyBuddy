import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import Subject from '../models/Subject.js';

const router = Router();

// Get all subjects
router.get('/', protect, async (req, res, next) => {
  try {
    const subjects = await Subject.find().populate('owner', 'name');
    res.json({ success: true, subjects });
  } catch (err) {
    next(err);
  }
});

// Create a new subject
router.post('/', protect, async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const subject = await Subject.create({
      name,
      description,
      owner: req.user._id,
      members: [{ user: req.user._id }]
    });
    res.status(201).json({ success: true, subject });
  } catch (err) {
    next(err);
  }
});

export default router;