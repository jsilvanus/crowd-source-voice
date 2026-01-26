import express from 'express';
import { query } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// GET /prompt - Get a prompt for recording
// Prioritizes prompts with fewer recordings and lower skipped_count
router.get('/', authenticate, async (req, res, next) => {
  try {
    const corpusId = req.query.corpus_id;

    if (!corpusId) {
      return res.status(400).json({ error: 'corpus_id is required' });
    }

    // Get a prompt that:
    // 1. The user hasn't recorded yet
    // 2. Has fewer recordings (to balance coverage)
    // 3. Has lower skipped_count (to avoid problematic prompts)
    // 4. Random selection among candidates
    const result = await query(`
      SELECT p.*, c.name as corpus_name, c.language, c.type as corpus_type
      FROM prompts p
      JOIN corpora c ON p.corpus_id = c.id
      WHERE p.corpus_id = $1
        AND p.id NOT IN (
          SELECT prompt_id FROM recordings WHERE user_id = $2
        )
      ORDER BY
        p.skipped_count ASC,
        (SELECT COUNT(*) FROM recordings WHERE prompt_id = p.id) ASC,
        RANDOM()
      LIMIT 1
    `, [corpusId, req.user.id]);

    if (result.rows.length === 0) {
      return res.json({
        message: 'No more prompts available',
        prompt: null
      });
    }

    res.json({ prompt: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// GET /prompt/:id - Get a specific prompt
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const promptId = parseInt(req.params.id);

    const result = await query(`
      SELECT p.*, c.name as corpus_name, c.language, c.type as corpus_type
      FROM prompts p
      JOIN corpora c ON p.corpus_id = c.id
      WHERE p.id = $1
    `, [promptId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /prompt/:id/skip - Skip a prompt
router.post('/:id/skip', authenticate, async (req, res, next) => {
  try {
    const promptId = parseInt(req.params.id);

    const result = await query(`
      UPDATE prompts
      SET skipped_count = skipped_count + 1
      WHERE id = $1
      RETURNING *
    `, [promptId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    res.json({
      message: 'Prompt skipped',
      prompt: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

// GET /prompt/stats/:corpus_id - Get prompt statistics for a corpus
router.get('/stats/:corpus_id', authenticate, async (req, res, next) => {
  try {
    const corpusId = parseInt(req.params.corpus_id);

    const result = await query(`
      SELECT
        COUNT(*) as total_prompts,
        COUNT(DISTINCT r.prompt_id) as prompts_with_recordings,
        SUM(CASE WHEN p.skipped_count > 0 THEN 1 ELSE 0 END) as skipped_prompts,
        AVG(p.skipped_count) as avg_skip_count
      FROM prompts p
      LEFT JOIN recordings r ON p.id = r.prompt_id
      WHERE p.corpus_id = $1
    `, [corpusId]);

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
