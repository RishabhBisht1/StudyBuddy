import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { signToken, sendTokenResponse } from '../utils/jwt.js';
import sendEmail from '../utils/sendEmail.js';

// ── REGISTER ─────────────────────────────────────────────────────
export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const user = await User.create({ name, email, password });
    sendTokenResponse(user, 201, res);
  } catch (err) {
    next(err);
  }
};

// ── LOGIN ────────────────────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    // +password because select: false in schema
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user || !user.password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. (Note: this account may use Google login)',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// ── LOGOUT ───────────────────────────────────────────────────────
export const logout = (req, res) => {
  res.cookie('accessToken', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
};

// ── GET ME ───────────────────────────────────────────────────────
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.status(200).json({ success: true, user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// ── CHANGE PASSWORD ──────────────────────────────────────────────
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both password fields are required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }

    const user = await User.findById(req.user._id).select('+password');

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'This account uses Google login. Password cannot be changed here.',
      });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    user.password = newPassword; // Pre-save hook hashes this
    await user.save();

    sendTokenResponse(user, 200, res);
  } catch (err) {
    next(err);
  }
};

// ── GOOGLE OAUTH CALLBACK ────────────────────────────────────────
// Called by Passport after successful Google auth
export const googleCallback = (req, res) => {
  const token = signToken(req.user._id);

  // Redirect to frontend with token (frontend stores in memory/cookie)
  res.redirect(
    `${process.env.FRONTEND_URL}/auth/google/success?token=${token}`
  );
};

// ── FORGOT PASSWORD ──────────────────────────────────────────────
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    // Security: Always return generic success message to prevent account enumeration
    const genericResponse = { 
      success: true, 
      message: 'If an account exists with that email, a password reset link has been sent.' 
    };

    if (!user || !user.password) {
      // Return success even if user not found or is a Google-only user
      return res.status(200).json(genericResponse);
    }

    // Generate a one-time use token valid for 15 minutes
    // The secret is unique to this user and their current password hash
    const resetSecret = process.env.JWT_SECRET + user.password;
    const resetToken = jwt.sign({ id: user._id }, resetSecret, { expiresIn: '15m' });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const message = `You requested a password reset. Please use the following link to reset your password (valid for 15 minutes):\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`;

    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset Request',
        message,
      });

      res.status(200).json(genericResponse);
    } catch (err) {
      console.error('Email could not be sent:', err);
      // In production, you might not want to disclose email failure
      res.status(200).json(genericResponse);
    }
  } catch (err) {
    next(err);
  }
};

// ── RESET PASSWORD ───────────────────────────────────────────────
export const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }

    // 1) Decode token (without verifying yet) to get user ID
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.id) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
    }

    // 2) Find user and get their current password hash
    const user = await User.findById(decoded.id).select('+password');
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
    }

    // 3) Verify JWT with the one-time secret (Secret + old Password Hash)
    const resetSecret = process.env.JWT_SECRET + user.password;
    try {
      jwt.verify(token, resetSecret);
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
    }

    // 4) Update password (the pre-save hook in User model hashes this)
    user.password = password;
    await user.save();

    res.status(200).json({ success: true, message: 'Password has been reset successfully.' });
  } catch (err) {
    next(err);
  }
};