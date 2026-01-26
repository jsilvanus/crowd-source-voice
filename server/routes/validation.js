import express from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Minimum validations required and score threshold (configurable)
const MIN_VALIDATIONS = 2;
const MIN_SCORE_THRESHOLD = 4.0;

// GET /validation - Get a recording to validate
// Returns a recording that:
// 1. Was not recorded by the current user
// 2. Has not been validated by the current user
// 3. Has fewer validations (to balance coverage)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const corpusId = req.query.corpus_id;

    let queryText = `
      SELECT
        r.id,
        r.file_path,
        r.duration,
        r.created_at,
        p.id as prompt_id,
        p.text as prompt_text,
        p.type as prompt_type,
        c.id as corpus_id,
        c.name as corpus_name,
        c.language,
        (SELECT COUNT(*) FROM validations WHERE recording_id = r.id) as validation_count
      FROM recordings r
      JOIN prompts p ON r.prompt_id = p.id
      JOIN corpora c ON p.corpus_id = c.id
      WHERE r.user_id != $1
        AND r.id NOT IN (
          SELECT recording_id FROM validations WHERE validator_id = $1
        )
    `;

    const params = [req.user.id];

    if (corpusId) {
      queryText += ` AND c.id = $2`;
      params.push(corpusId);
    }

    queryText += `
      ORDER BY validation_count ASC, RANDOM()
      LIMIT 1
    `;

    const result = await query(queryText, params);

    if (result.rows.length === 0) {
      return res.json({
        message: 'No recordings available for validation',
        recording: null
      });
    }

    res.json({ recording: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /validation - Submit a validation score
router.post('/', authenticate, [
  body('recording_id').isInt(),
  body('score').isInt({ min: 1, max: 5 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { recording_id, score } = req.body;

    // Check if recording exists
    const recordingResult = await query(
      'SELECT user_id FROM recordings WHERE id = $1',
      [recording_id]
    );

    if (recordingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    // Check that user is not validating their own recording
    if (recordingResult.rows[0].user_id === req.user.id) {
      return res.status(400).json({ error: 'Cannot validate your own recording' });
    }

    // Check if already validated by this user
    const existingResult = await query(
      'SELECT id FROM validations WHERE recording_id = $1 AND validator_id = $2',
      [recording_id, req.user.id]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'You have already validated this recording' });
    }

    // Insert validation
    await query(
      'INSERT INTO validations (recording_id, validator_id, score) VALUES ($1, $2, $3)',
      [recording_id, req.user.id, score]
    );

    // Update recording quality_score (average of all validations)
    await query(`
      UPDATE recordings
      SET quality_score = (
        SELECT AVG(score)::FLOAT FROM validations WHERE recording_id = $1
      )
      WHERE id = $1
    `, [recording_id]);

    res.status(201).json({ message: 'Validation submitted successfully' });
  } catch (error) {
    next(error);
  }
});

// GET /validation/stats - Get validation statistics
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        COUNT(DISTINCT r.id) as total_recordings,
        COUNT(DISTINCT CASE
          WHEN (SELECT COUNT(*) FROM validations WHERE recording_id = r.id) >= $1
          THEN r.id
        END) as fully_validated,
        COUNT(DISTINCT CASE
          WHEN r.quality_score >= $2
          THEN r.id
        END) as accepted_recordings,
        COUNT(DISTINCT CASE
          WHEN r.quality_score < $2 AND r.quality_score IS NOT NULL
          THEN r.id
        END) as flagged_recordings
      FROM recordings r
    `, [MIN_VALIDATIONS, MIN_SCORE_THRESHOLD]);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /validation/flagged - Get flagged recordings for admin review
router.get('/flagged', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        r.*,
        p.text as prompt_text,
        p.type as prompt_type,
        c.name as corpus_name,
        (SELECT COUNT(*) FROM validations WHERE recording_id = r.id) as validation_count,
        (SELECT AVG(score) FROM validations WHERE recording_id = r.id) as avg_score,
        (SELECT MAX(score) - MIN(score) FROM validations WHERE recording_id = r.id) as score_variance
      FROM recordings r
      JOIN prompts p ON r.prompt_id = p.id
      JOIN corpora c ON p.corpus_id = c.id
      WHERE r.quality_score IS NOT NULL
        AND (r.quality_score < $1 OR (
          SELECT MAX(score) - MIN(score) FROM validations WHERE recording_id = r.id
        ) >= 2)
      ORDER BY r.quality_score ASC
    `, [MIN_SCORE_THRESHOLD]);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

export default router;
