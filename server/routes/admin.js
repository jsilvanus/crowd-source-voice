import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { query } from '../db/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { getDiskSpace } from '../middleware/diskSpace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// All routes require admin
router.use(authenticate, requireAdmin);

// GET /admin/stats - Get platform statistics
router.get('/stats', async (req, res, next) => {
  try {
    // Total counts
    const usersResult = await query('SELECT COUNT(*) as count FROM users');
    const recordingsResult = await query('SELECT COUNT(*) as count FROM recordings');
    const validationsResult = await query('SELECT COUNT(*) as count FROM validations');
    const corporaResult = await query('SELECT COUNT(*) as count FROM corpora');

    // Per-corpus stats
    const corporaStats = await query(`
      SELECT
        c.id, c.name, c.language, c.type,
        COUNT(DISTINCT p.id) as prompt_count,
        COUNT(DISTINCT r.id) as recording_count,
        COUNT(DISTINCT CASE WHEN r.quality_score >= 4.0 THEN r.id END) as validated_count
      FROM corpora c
      LEFT JOIN prompts p ON c.id = p.corpus_id
      LEFT JOIN recordings r ON p.id = r.prompt_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);

    // Recent recordings
    const recentRecordings = await query(`
      SELECT
        r.id, r.duration, r.created_at,
        u.email as user_email,
        c.name as corpus_name
      FROM recordings r
      LEFT JOIN users u ON r.user_id = u.id
      JOIN prompts p ON r.prompt_id = p.id
      JOIN corpora c ON p.corpus_id = c.id
      ORDER BY r.created_at DESC
      LIMIT 10
    `);

    // Disk space
    let diskSpace = null;
    try {
      const space = await getDiskSpace();
      diskSpace = {
        available: space.available,
        total: space.total,
        percentUsed: Math.round((1 - space.available / space.total) * 100),
        isLow: space.available < 200 * 1024 * 1024,
        minRequiredMB: 200
      };
    } catch (e) {
      // Disk space check failed, skip
    }

    res.json({
      totalUsers: parseInt(usersResult.rows[0].count),
      totalRecordings: parseInt(recordingsResult.rows[0].count),
      totalValidations: parseInt(validationsResult.rows[0].count),
      totalCorpora: parseInt(corporaResult.rows[0].count),
      corporaStats: corporaStats.rows,
      recentRecordings: recentRecordings.rows,
      diskSpace
    });
  } catch (error) {
    next(error);
  }
});

// GET /admin/users - Get all users with stats
router.get('/users', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        u.id, u.email, u.role, u.created_at, u.terms_accepted_at, u.recording_consent_at,
        COUNT(DISTINCT r.id) as recording_count,
        COUNT(DISTINCT v.id) as validation_count
      FROM users u
      LEFT JOIN recordings r ON u.id = r.user_id
      LEFT JOIN validations v ON u.id = v.validator_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /admin/users/:id - Get single user details
router.get('/users/:id', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);

    const userResult = await query(`
      SELECT
        u.id, u.email, u.role, u.created_at, u.terms_accepted_at, u.recording_consent_at,
        COUNT(DISTINCT r.id) as recording_count,
        COUNT(DISTINCT v.id) as validation_count
      FROM users u
      LEFT JOIN recordings r ON u.id = r.user_id
      LEFT JOIN validations v ON u.id = v.validator_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(userResult.rows[0]);
  } catch (error) {
    next(error);
  }
});

// PUT /admin/users/:id/role - Update user role
router.put('/users/:id/role', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "user" or "admin".' });
    }

    // Prevent self-demotion
    if (userId === req.user.id && role === 'user') {
      return res.status(400).json({ error: 'You cannot remove your own admin privileges.' });
    }

    const result = await query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role',
      [role, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: `User role updated to ${role}`,
      user: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /admin/users/:id - Delete a user
router.delete('/users/:id', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account from admin panel. Use Profile instead.' });
    }

    // Get user's recordings to delete files
    const recordingsResult = await query(
      'SELECT file_path FROM recordings WHERE user_id = $1',
      [userId]
    );

    // Delete audio files
    for (const recording of recordingsResult.rows) {
      const filePath = path.join(__dirname, '../..', recording.file_path);
      await fs.unlink(filePath).catch(() => {});
    }

    // Delete validations by this user
    await query('DELETE FROM validations WHERE validator_id = $1', [userId]);

    // Delete user's recordings
    await query('DELETE FROM recordings WHERE user_id = $1', [userId]);

    // Delete user
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING email', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: `User ${result.rows[0].email} and all their data have been deleted.`
    });
  } catch (error) {
    next(error);
  }
});

export default router;
