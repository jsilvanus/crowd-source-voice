import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { query } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// GET /me/recordings - Get user's own recordings
router.get('/recordings', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        r.*,
        p.text as prompt_text,
        p.type as prompt_type,
        c.id as corpus_id,
        c.name as corpus_name,
        c.language,
        (SELECT COUNT(*) FROM validations WHERE recording_id = r.id) as validation_count
      FROM recordings r
      JOIN prompts p ON r.prompt_id = p.id
      JOIN corpora c ON p.corpus_id = c.id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
    `, [req.user.id]);

    // NOTE: quality_score is returned but UI should not show individual scores
    // to prevent gaming the system

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// POST /me/consent/recording - Give consent for recording
router.post('/consent/recording', authenticate, async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE users SET recording_consent_at = NOW() WHERE id = $1 RETURNING recording_consent_at',
      [req.user.id]
    );

    res.json({
      message: 'Recording consent given',
      recordingConsentAt: result.rows[0].recording_consent_at
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /me/consent/recording - Withdraw recording consent
router.delete('/consent/recording', authenticate, async (req, res, next) => {
  try {
    await query(
      'UPDATE users SET recording_consent_at = NULL WHERE id = $1',
      [req.user.id]
    );

    res.json({ message: 'Recording consent withdrawn' });
  } catch (error) {
    next(error);
  }
});

// GET /me/export - Export all personal data (GDPR)
router.get('/export', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get user profile
    const userResult = await query(
      'SELECT id, email, role, terms_accepted_at, recording_consent_at, created_at FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    // Get user's recordings
    const recordingsResult = await query(`
      SELECT
        r.id, r.file_path, r.duration, r.quality_score, r.created_at,
        p.text as prompt_text, p.type as prompt_type,
        c.name as corpus_name, c.language
      FROM recordings r
      JOIN prompts p ON r.prompt_id = p.id
      JOIN corpora c ON p.corpus_id = c.id
      WHERE r.user_id = $1
      ORDER BY r.created_at
    `, [userId]);

    // Get user's validations
    const validationsResult = await query(`
      SELECT
        v.id, v.score, v.created_at,
        r.id as recording_id, p.text as prompt_text
      FROM validations v
      JOIN recordings r ON v.recording_id = r.id
      JOIN prompts p ON r.prompt_id = p.id
      WHERE v.validator_id = $1
      ORDER BY v.created_at
    `, [userId]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        termsAcceptedAt: user.terms_accepted_at,
        recordingConsentAt: user.recording_consent_at,
        accountCreatedAt: user.created_at
      },
      recordings: recordingsResult.rows.map(r => ({
        id: r.id,
        prompt: r.prompt_text,
        promptType: r.prompt_type,
        corpus: r.corpus_name,
        language: r.language,
        duration: r.duration,
        qualityScore: r.quality_score,
        createdAt: r.created_at
      })),
      validations: validationsResult.rows.map(v => ({
        id: v.id,
        recordingId: v.recording_id,
        prompt: v.prompt_text,
        score: v.score,
        createdAt: v.created_at
      })),
      summary: {
        totalRecordings: recordingsResult.rows.length,
        totalValidations: validationsResult.rows.length
      }
    };

    res.setHeader('Content-Disposition', `attachment; filename="my-data-export-${Date.now()}.json"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (error) {
    next(error);
  }
});

// GET /me/stats - Get user's statistics
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const recordingStats = await query(`
      SELECT
        COUNT(*) as total_recordings,
        COUNT(DISTINCT p.corpus_id) as corpora_contributed
      FROM recordings r
      JOIN prompts p ON r.prompt_id = p.id
      WHERE r.user_id = $1
    `, [req.user.id]);

    const validationStats = await query(`
      SELECT COUNT(*) as total_validations
      FROM validations
      WHERE validator_id = $1
    `, [req.user.id]);

    res.json({
      ...recordingStats.rows[0],
      ...validationStats.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /me - Delete user account and all associated data (GDPR)
router.delete('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Get all user's recordings to delete the files
    const recordingsResult = await query(
      'SELECT file_path FROM recordings WHERE user_id = $1',
      [userId]
    );

    // Delete audio files
    for (const recording of recordingsResult.rows) {
      const filePath = path.join(__dirname, '../..', recording.file_path);
      await fs.unlink(filePath).catch(() => {
        // File might not exist, that's okay
      });
    }

    // Delete all user's validations
    await query('DELETE FROM validations WHERE validator_id = $1', [userId]);

    // Delete all user's recordings
    await query('DELETE FROM recordings WHERE user_id = $1', [userId]);

    // Delete user account
    await query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ message: 'Account and all associated data deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// POST /me/anonymize - Anonymize recordings instead of deleting
// This keeps the recordings for the dataset but removes the user link
router.post('/anonymize', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;

    // Anonymize recordings by setting user_id to NULL
    await query('UPDATE recordings SET user_id = NULL WHERE user_id = $1', [userId]);

    // Delete validations
    await query('DELETE FROM validations WHERE validator_id = $1', [userId]);

    // Delete user account
    await query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({
      message: 'Account deleted. Recordings have been anonymized and retained for the dataset.'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
