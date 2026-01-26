import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { query } from '../db/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Minimum validations and score threshold for export
const MIN_VALIDATIONS = 2;
const MIN_SCORE_THRESHOLD = 4.0;

// GET /export - Export dataset for a corpus
router.get('/', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const corpusId = req.query.corpus_id;
    const format = req.query.format || 'csv'; // csv or json
    const includeAll = req.query.include_all === 'true'; // Include non-validated

    if (!corpusId) {
      return res.status(400).json({ error: 'corpus_id is required' });
    }

    // Get corpus info
    const corpusResult = await query('SELECT * FROM corpora WHERE id = $1', [corpusId]);
    if (corpusResult.rows.length === 0) {
      return res.status(404).json({ error: 'Corpus not found' });
    }

    const corpus = corpusResult.rows[0];

    // Build query for recordings
    let queryText = `
      SELECT
        r.id,
        r.file_path,
        r.duration,
        r.quality_score,
        p.text,
        p.type,
        (SELECT COUNT(*) FROM validations WHERE recording_id = r.id) as validation_count
      FROM recordings r
      JOIN prompts p ON r.prompt_id = p.id
      WHERE p.corpus_id = $1
    `;

    if (!includeAll) {
      queryText += `
        AND r.quality_score >= $2
        AND (SELECT COUNT(*) FROM validations WHERE recording_id = r.id) >= $3
      `;
    }

    queryText += ' ORDER BY r.id';

    const params = includeAll
      ? [corpusId]
      : [corpusId, MIN_SCORE_THRESHOLD, MIN_VALIDATIONS];

    const result = await query(queryText, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No recordings found for export' });
    }

    // Format the export data
    const exportData = result.rows.map((row, index) => {
      const filename = `${String(index + 1).padStart(4, '0')}.wav`;
      return {
        file: filename,
        original_path: row.file_path,
        text: corpus.type === 'music' ? undefined : row.text,
        notation: corpus.type === 'music' ? row.text : undefined,
        duration: row.duration,
        quality_score: row.quality_score,
        validation_count: parseInt(row.validation_count)
      };
    });

    if (format === 'json') {
      res.json({
        corpus: {
          id: corpus.id,
          name: corpus.name,
          language: corpus.language,
          type: corpus.type
        },
        total_recordings: exportData.length,
        recordings: exportData
      });
    } else {
      // CSV format (Whisper-compatible)
      const header = corpus.type === 'music'
        ? 'file,notation,duration,quality_score'
        : 'file,text,duration,quality_score';

      const csvRows = exportData.map(row => {
        const content = corpus.type === 'music' ? row.notation : row.text;
        // Escape quotes and newlines in content
        const escapedContent = `"${content.replace(/"/g, '""').replace(/\n/g, '\\n')}"`;
        return `${row.file},${escapedContent},${row.duration || ''},${row.quality_score || ''}`;
      });

      const csv = [header, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${corpus.name}-dataset.csv"`);
      res.send(csv);
    }
  } catch (error) {
    next(error);
  }
});

// GET /export/manifest - Get export manifest with file paths
router.get('/manifest', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const corpusId = req.query.corpus_id;

    if (!corpusId) {
      return res.status(400).json({ error: 'corpus_id is required' });
    }

    const result = await query(`
      SELECT
        r.id,
        r.file_path,
        p.text
      FROM recordings r
      JOIN prompts p ON r.prompt_id = p.id
      WHERE p.corpus_id = $1
        AND r.quality_score >= $2
        AND (SELECT COUNT(*) FROM validations WHERE recording_id = r.id) >= $3
      ORDER BY r.id
    `, [corpusId, MIN_SCORE_THRESHOLD, MIN_VALIDATIONS]);

    res.json({
      total: result.rows.length,
      files: result.rows.map((row, index) => ({
        id: row.id,
        source_path: row.file_path,
        export_name: `${String(index + 1).padStart(4, '0')}.wav`,
        text: row.text
      }))
    });
  } catch (error) {
    next(error);
  }
});

// GET /export/stats - Get export statistics
router.get('/stats', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const corpusId = req.query.corpus_id;

    let queryText = `
      SELECT
        c.id as corpus_id,
        c.name as corpus_name,
        c.type,
        COUNT(DISTINCT r.id) as total_recordings,
        COUNT(DISTINCT CASE
          WHEN r.quality_score >= $1
            AND (SELECT COUNT(*) FROM validations WHERE recording_id = r.id) >= $2
          THEN r.id
        END) as exportable_recordings,
        SUM(r.duration) FILTER (
          WHERE r.quality_score >= $1
            AND (SELECT COUNT(*) FROM validations WHERE recording_id = r.id) >= $2
        ) as total_duration_seconds
      FROM corpora c
      LEFT JOIN prompts p ON c.id = p.corpus_id
      LEFT JOIN recordings r ON p.id = r.prompt_id
    `;

    const params = [MIN_SCORE_THRESHOLD, MIN_VALIDATIONS];

    if (corpusId) {
      queryText += ' WHERE c.id = $3';
      params.push(corpusId);
    }

    queryText += ' GROUP BY c.id ORDER BY c.name';

    const result = await query(queryText, params);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

export default router;
