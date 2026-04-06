import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Meeting from '../models/Meeting.js';

/**
 * In-memory store for live room state.
 * Structure: { [roomId]: RoomState }
 */
const rooms = new Map();

const getRoomOrCreate = (roomId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      participants: new Map(), // socketId -> { userId, name, avatar, isCaptain }
      studyMode: 'discussion',
      timer: {
        isRunning: false,
        intervalRef: null,
        remaining: 25 * 60,  // 25 minutes in seconds
        duration: 25 * 60,
        phase: 'focus',
      },
      kickVotes: new Map(), // targetUserId -> Set of voterUserIds
    });
  }
  return rooms.get(roomId);
};

// ── JWT Auth Middleware for Socket.io ─────────────────────────────
const socketAuthMiddleware = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) throw new Error('No token provided');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('name avatar email');
    if (!user) throw new Error('User not found');

    socket.user = user;
    next();
  } catch (err) {
    next(new Error(`Authentication error: ${err.message}`));
  }
};

export const initSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  // Apply auth middleware to all socket connections
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id} (User: ${socket.user.name})`);

    // ══════════════════════════════════════════════════════════════
    // EVENT: join-room
    // Emitted by client when entering a meeting room
    // ══════════════════════════════════════════════════════════════
    socket.on('join-room', async ({ roomId }, callback) => {
      try {
        const meeting = await Meeting.findOne({ roomId })
          .populate('captain', '_id name');

        if (!meeting) {
          return callback?.({ error: 'Meeting room not found.' });
        }

        if (meeting.status === 'ended') {
          return callback?.({ error: 'This meeting has ended.' });
        }

        const room = getRoomOrCreate(roomId);
        const isCaptain = meeting.captain._id.toString() === socket.user._id.toString();

        // Store participant in memory
        const participantData = {
          userId: socket.user._id.toString(),
          name: socket.user.name,
          avatar: socket.user.avatar,
          isCaptain,
          socketId: socket.id,
        };

        room.participants.set(socket.id, participantData);

        // Join Socket.io room
        await socket.join(roomId);
        socket.currentRoom = roomId;

        // Update DB status to live on first join
        if (meeting.status === 'scheduled') {
          await Meeting.findByIdAndUpdate(meeting._id, { status: 'live' });
        }

        // Notify all others in room
        socket.to(roomId).emit('user-joined', {
          socketId: socket.id,
          ...participantData,
        });

        // Send current room state to the joining user
        const participantsList = Array.from(room.participants.entries()).map(
          ([sid, p]) => ({ socketId: sid, ...p })
        );

        callback?.({
          success: true,
          participants: participantsList,
          studyMode: room.studyMode,
          timer: {
            isRunning: room.timer.isRunning,
            remaining: room.timer.remaining,
            phase: room.timer.phase,
          },
          isCaptain,
        });

        console.log(`👤 ${socket.user.name} joined room: ${roomId}`);
      } catch (err) {
        console.error('join-room error:', err);
        callback?.({ error: 'Failed to join room.' });
      }
    });

    // ══════════════════════════════════════════════════════════════
    // WebRTC SIGNALING EVENTS
    // These relay SDP and ICE data between peers — server never
    // inspects or decodes the media content itself.
    // ══════════════════════════════════════════════════════════════

    // Initiator sends offer to a specific peer
    socket.on('webrtc:offer', ({ targetSocketId, offer }) => {
      io.to(targetSocketId).emit('webrtc:offer', {
        fromSocketId: socket.id,
        fromUser: {
          name: socket.user.name,
          avatar: socket.user.avatar,
        },
        offer,
      });
    });

    // Answerer responds with their SDP answer
    socket.on('webrtc:answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('webrtc:answer', {
        fromSocketId: socket.id,
        answer,
      });
    });

    // ICE candidates relay (trickle ICE)
    socket.on('webrtc:ice-candidate', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('webrtc:ice-candidate', {
        fromSocketId: socket.id,
        candidate,
      });
    });

    // ══════════════════════════════════════════════════════════════
    // STUDY MODE CHANGE (Captain only)
    // ══════════════════════════════════════════════════════════════
    socket.on('study-mode:change', async ({ roomId, mode }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      if (!participant?.isCaptain) {
        return socket.emit('error', { message: 'Only the captain can change study mode.' });
      }

      if (!['silent', 'discussion'].includes(mode)) return;

      room.studyMode = mode;

      // Update DB
      await Meeting.findOneAndUpdate({ roomId }, { studyMode: mode });

      io.to(roomId).emit('study-mode:changed', { mode, changedBy: socket.user.name });
    });

    // ══════════════════════════════════════════════════════════════
    // STUDY TIMER (Synchronized via server — Captain controls)
    // ══════════════════════════════════════════════════════════════

    socket.on('timer:start', ({ roomId, duration }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      if (!participant?.isCaptain) {
        return socket.emit('error', { message: 'Only the captain can control the timer.' });
      }

      // Clear any existing interval
      if (room.timer.intervalRef) {
        clearInterval(room.timer.intervalRef);
      }

      room.timer.isRunning = true;
      room.timer.remaining = duration || room.timer.duration;
      room.timer.startedAt = Date.now();

      io.to(roomId).emit('timer:started', {
        remaining: room.timer.remaining,
        phase: room.timer.phase,
      });

      // Server-side tick — broadcasts to all clients for perfect sync
      room.timer.intervalRef = setInterval(() => {
        room.timer.remaining -= 1;

        io.to(roomId).emit('timer:tick', {
          remaining: room.timer.remaining,
          phase: room.timer.phase,
        });

        if (room.timer.remaining <= 0) {
          clearInterval(room.timer.intervalRef);
          room.timer.isRunning = false;

          // Toggle between focus and break phases
          const wasBreak = room.timer.phase === 'break';
          room.timer.phase = wasBreak ? 'focus' : 'break';
          room.timer.remaining = wasBreak ? 25 * 60 : 5 * 60;

          io.to(roomId).emit('timer:ended', {
            nextPhase: room.timer.phase,
            nextDuration: room.timer.remaining,
          });
        }
      }, 1000);
    });

    socket.on('timer:pause', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      if (!participant?.isCaptain) return;

      if (room.timer.intervalRef) {
        clearInterval(room.timer.intervalRef);
        room.timer.intervalRef = null;
      }
      room.timer.isRunning = false;

      io.to(roomId).emit('timer:paused', { remaining: room.timer.remaining });
    });

    socket.on('timer:reset', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      if (!participant?.isCaptain) return;

      if (room.timer.intervalRef) {
        clearInterval(room.timer.intervalRef);
        room.timer.intervalRef = null;
      }

      room.timer.isRunning = false;
      room.timer.remaining = room.timer.duration;
      room.timer.phase = 'focus';

      io.to(roomId).emit('timer:reset', { remaining: room.timer.remaining });
    });

    // ══════════════════════════════════════════════════════════════
    // MAJORITY VOTE TO KICK
    // Flow: Any user initiates → others vote → threshold met → kicked
    // Threshold: majority of current participants (min 2)
    // ══════════════════════════════════════════════════════════════

    socket.on('kick:initiate', ({ roomId, targetSocketId }) => {
      const room = rooms.get(roomId);
      if (!room) return;

      const initiator = room.participants.get(socket.id);
      const target = room.participants.get(targetSocketId);

      if (!initiator || !target) {
        return socket.emit('error', { message: 'Invalid kick target.' });
      }

      // Captain cannot be kicked by vote
      if (target.isCaptain) {
        return socket.emit('error', { message: 'The captain cannot be voted out.' });
      }

      // Cannot vote to kick yourself
      if (targetSocketId === socket.id) {
        return socket.emit('error', { message: 'You cannot vote to kick yourself.' });
      }

      const voteKey = target.userId;

      // Initialize or get existing vote pool
      if (!room.kickVotes.has(voteKey)) {
        room.kickVotes.set(voteKey, {
          targetSocketId,
          targetName: target.name,
          voters: new Set(),
          initiatedBy: initiator.name,
          expiresAt: Date.now() + 60000, // 60s window
        });
      }

      const voteData = room.kickVotes.get(voteKey);
      voteData.voters.add(socket.user._id.toString());

      const totalParticipants = room.participants.size;
      const requiredVotes = Math.max(2, Math.ceil(totalParticipants / 2));
      const currentVotes = voteData.voters.size;

      // Broadcast vote status to room
      io.to(roomId).emit('kick:vote-update', {
        targetSocketId,
        targetName: target.name,
        currentVotes,
        requiredVotes,
        initiatedBy: voteData.initiatedBy,
        voterName: initiator.name,
      });

      // Check if threshold met
      if (currentVotes >= requiredVotes) {
        room.kickVotes.delete(voteKey);

        // Notify the kicked user
        io.to(targetSocketId).emit('kick:you-were-kicked', {
          reason: `Voted out by ${currentVotes} participants.`,
        });

        // Notify room
        io.to(roomId).emit('kick:user-kicked', {
          socketId: targetSocketId,
          name: target.name,
          votes: currentVotes,
        });

        // Remove from room data
        room.participants.delete(targetSocketId);

        // Force disconnect of the kicked socket from the room
        const kickedSocket = io.sockets.sockets.get(targetSocketId);
        if (kickedSocket) {
          kickedSocket.leave(roomId);
        }
      }

      // Auto-clean expired votes
      for (const [key, vote] of room.kickVotes.entries()) {
        if (Date.now() > vote.expiresAt) {
          room.kickVotes.delete(key);
          io.to(roomId).emit('kick:vote-expired', { targetName: vote.targetName });
        }
      }
    });

    // ══════════════════════════════════════════════════════════════
    // DISCONNECT HANDLING
    // ══════════════════════════════════════════════════════════════
    socket.on('disconnect', async () => {
      const roomId = socket.currentRoom;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const participant = room.participants.get(socket.id);
      room.participants.delete(socket.id);

      // Notify room
      socket.to(roomId).emit('user-left', {
        socketId: socket.id,
        name: participant?.name,
      });

      // If room is now empty, cleanup
      if (room.participants.size === 0) {
        if (room.timer.intervalRef) clearInterval(room.timer.intervalRef);
        rooms.delete(roomId);

        // Mark meeting as ended in DB
        await Meeting.findOneAndUpdate(
          { roomId },
          { status: 'ended', endedAt: new Date() }
        );
        console.log(`🔴 Room ${roomId} closed — no participants.`);
      }

      console.log(`🔌 Socket disconnected: ${socket.id} (${participant?.name})`);
    });
  });

  return io;
};