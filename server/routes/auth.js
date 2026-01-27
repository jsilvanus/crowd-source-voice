import express from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { query } from '../db/index.js';
import { generateToken, authenticate } from '../middleware/auth.js';

const router = express.Router();

// POST /auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('acceptTerms').isBoolean().equals('true')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, acceptTerms } = req.body;

    if (!acceptTerms) {
      return res.status(400).json({ error: 'You must accept the Terms of Service and Privacy Policy' });
    }

    // Check if user exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user with terms acceptance timestamp
    const result = await query(
      'INSERT INTO users (email, password_hash, terms_accepted_at) VALUES ($1, $2, NOW()) RETURNING id, email, role, terms_accepted_at, recording_consent_at',
      [email, passwordHash]
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        termsAcceptedAt: user.terms_accepted_at,
        recordingConsentAt: user.recording_consent_at
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user
    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        termsAcceptedAt: user.terms_accepted_at,
        recordingConsentAt: user.recording_consent_at
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/logout
router.post('/logout', authenticate, (req, res) => {
  // JWT is stateless, logout is handled client-side by removing the token
  res.json({ message: 'Logged out successfully' });
});

// GET /auth/me - Get current user
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
