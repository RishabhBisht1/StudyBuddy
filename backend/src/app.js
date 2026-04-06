import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import passport from './config/passport.js';

import authRoutes from './routes/auth.routes.js';
import meetingRoutes from './routes/meeting.routes.js';
import subjectRoutes from './routes/subject.routes.js';
  

const app = express();

// ── Middleware ────────────────────────────────────────────────────
app.use(morgan('dev'));
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/subjects', subjectRoutes);

// ── Global Error Handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  console.error(`[ERROR] ${status} - ${message}`);
  res.status(status).json({ success: false, message });
});

export default app;