// backend/src/models/Meeting.js
import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now },
    leftAt: Date,
    isCaptain: { type: Boolean, default: false },
    socketId: String, // ephemeral, for kick tracking
  },
  { _id: false }
);

const voteKickSchema = new mongoose.Schema(
  {
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    requiredVotes: { type: Number, default: 2 },
    resolved: { type: Boolean, default: false },
    result: { type: String, enum: ['kicked', 'failed', 'pending'], default: 'pending' },
    createdAt: { type: Date, default: Date.now, expires: 120 }, // auto-cleanup after 2 min
  },
  { _id: true }
);

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Meeting title is required'],
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters'],
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true,
    },
    captain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    roomId: {
      type: String,
      unique: true,
      required: true,
    },
    scheduledAt: {
      type: Date,
      required: [true, 'Meeting time is required'],
    },
    duration: {
      type: Number, // in minutes
      default: 60,
      min: [5, 'Minimum 5 minutes'],
      max: [480, 'Maximum 8 hours'],
    },
    studyMode: {
      type: String,
      enum: ['silent', 'discussion'],
      default: 'discussion',
    },
    status: {
      type: String,
      enum: ['scheduled', 'live', 'ended'],
      default: 'scheduled',
    },
    participants: [participantSchema],

    // Study timer state (persisted for rejoin)
    timer: {
      isRunning: { type: Boolean, default: false },
      startedAt: Date,
      duration: { type: Number, default: 25 * 60 }, // 25 min Pomodoro in seconds
      remaining: { type: Number, default: 25 * 60 },
      phase: { type: String, enum: ['focus', 'break'], default: 'focus' },
    },

    activeKickVotes: [voteKickSchema],

    maxParticipants: {
      type: Number,
      default: 8,
      min: 2,
      max: 50,
    },
    isRecorded: {
      type: Boolean,
      default: false,
    },
    endedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// Index for listing upcoming meetings
meetingSchema.index({ subject: 1, scheduledAt: 1, status: 1 });
meetingSchema.index({ roomId: 1 }, { unique: true });

// Auto-update status based on time
meetingSchema.methods.isExpired = function () {
  const endTime = new Date(this.scheduledAt.getTime() + this.duration * 60 * 1000);
  return Date.now() > endTime.getTime();
};

const Meeting = mongoose.model('Meeting', meetingSchema);
export default Meeting;