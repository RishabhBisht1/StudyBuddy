import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import Meeting from '../models/Meeting.js';
import Subject from '../models/Subject.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Get meetings for a subject
router.get('/subject/:subjectId', protect, async (req, res, next) => {
  try {
    const meetings = await Meeting.find({ subject: req.params.subjectId })
      .populate('captain', 'name avatar')
      .populate('participants.user', 'name avatar')
      .sort({ scheduledAt: 1 });

    res.json({ success: true, meetings });
  } catch (err) {
    next(err);
  }
});

// Create a meeting
router.post('/', protect, async (req, res, next) => {
  try {
    const { title, subjectId, scheduledAt, duration, studyMode, maxParticipants } = req.body;

    const subject = await Subject.findById(subjectId);
    if (!subject) return res.status(404).json({ success: false, message: 'Subject not found.' });

    const meeting = await Meeting.create({
      title,
      subject: subjectId,
      captain: req.user._id,
      roomId: uuidv4(),
      scheduledAt: new Date(scheduledAt),
      duration: duration || 60,
      studyMode: studyMode || 'discussion',
      maxParticipants: maxParticipants || 8,
      participants: [{ user: req.user._id, isCaptain: true }],
    });

    res.status(201).json({ success: true, meeting });
  } catch (err) {
    next(err);
  }
});

// Get single meeting by roomId
router.get('/room/:roomId', protect, async (req, res, next) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId })
      .populate('captain', 'name avatar')
      .populate('subject', 'name color')
      .populate('participants.user', 'name avatar');

    if (!meeting) return res.status(404).json({ success: false, message: 'Room not found.' });

    res.json({ success: true, meeting });
  } catch (err) {
    next(err);
  }
});

export default router;