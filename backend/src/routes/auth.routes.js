import { Router } from 'express';
import passport from 'passport';
import {
  register,
  login,
  logout,
  getMe,
  changePassword,
  googleCallback,
  forgotPassword,
  resetPassword,
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = Router();

// Email/Password Auth
router.post('/register', register);
router.post('/login', login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.patch('/change-password', protect, changePassword);

// Password Reset (Public)
// TODO: Implement rate limiting for /forgot-password
// const resetLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }); 
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Google OAuth
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_failed`,
    session: false,
  }),
  googleCallback
);

export default router;