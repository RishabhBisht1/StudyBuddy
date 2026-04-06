// backend/src/models/Subject.js
import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
      maxlength: [100, 'Subject name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    color: {
      // Hex color for UI display
      type: String,
      default: '#6366F1',
      match: [/^#([A-Fa-f0-9]{6})$/, 'Invalid hex color'],
    },
    icon: {
      type: String,
      default: 'BookOpen', // Lucide icon name
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    members: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
    isPublic: {
      type: Boolean,
      default: false,
    },
    tags: [{ type: String, trim: true, lowercase: true }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Virtual: total meeting count
subjectSchema.virtual('meetingCount', {
  ref: 'Meeting',
  foreignField: 'subject',
  localField: '_id',
  count: true,
});

// Compound index for fast owner+name lookups
subjectSchema.index({ owner: 1, name: 1 });

const Subject = mongoose.model('Subject', subjectSchema);
export default Subject;