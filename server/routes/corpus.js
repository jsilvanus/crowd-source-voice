import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { body, validationResult } from 'express-validator';
import { query } from '../db/index.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { splitCorpus, detectFormat } from '../utils/corpusSplitter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for corpus file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/corpora');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.txt', '.json', '.csv', '.abc'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: .txt, .json, .csv, .abc'));
    }
  }
});

// POST /corpus - Create a new corpus (admin only)
router.post('/', authenticate, requireAdmin, [
  body('name').notEmpty().trim(),
  body('language').notEmpty().trim(),
  body('type').isIn(['text', 'music']),
  body('description').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, language, type, description } = req.body;

    const result = await query(
      'INSERT INTO corpora (name, language, type, description) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, language, type, description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /corpus/:id/upload - Upload corpus source file (admin only)
router.post('/:id/upload', authenticate, requireAdmin, upload.single('file'), async (req, res, next) => {
  try {
    const corpusId = parseInt(req.params.id);

    // Verify corpus exists
    const corpusResult = await query('SELECT * FROM corpora WHERE id = $1', [corpusId]);
    if (corpusResult.rows.length === 0) {
      return res.status(404).json({ error: 'Corpus not found' });
    }

    const corpus = corpusResult.rows[0];

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read and process the file
    const content = await fs.readFile(req.file.path, 'utf-8');
    const format = detectFormat(req.file.originalname, content);
    const prompts = splitCorpus(content, corpus.type, format);

    if (prompts.length === 0) {
      return res.status(400).json({ error: 'No valid prompts found in the file' });
    }

    // Insert prompts into database
    const insertPromises = prompts.map(text =>
      query(
        'INSERT INTO prompts (corpus_id, type, text) VALUES ($1, $2, $3) RETURNING id',
        [corpusId, corpus.type, text]
      )
    );

    await Promise.all(insertPromises);

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    res.json({
      message: 'Corpus file processed successfully',
      promptsCreated: prompts.length
    });
  } catch (error) {
    next(error);
  }
});

// GET /corpus - Get all corpora with stats
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await query(`
      SELECT
        c.*,
        COUNT(DISTINCT p.id) as prompt_count,
        COUNT(DISTINCT r.id) as recording_count,
        COUNT(DISTINCT CASE WHEN r.quality_score >= 4.0 THEN r.id END) as validated_count
      FROM corpora c
      LEFT JOIN prompts p ON c.id = p.corpus_id
      LEFT JOIN recordings r ON p.id = r.prompt_id
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /corpus/:id - Get single corpus with details
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const corpusId = parseInt(req.params.id);

    const corpusResult = await query(`
      SELECT
        c.*,
        COUNT(DISTINCT p.id) as prompt_count,
        COUNT(DISTINCT r.id) as recording_count,
        COUNT(DISTINCT CASE WHEN r.quality_score >= 4.0 THEN r.id END) as validated_count
      FROM corpora c
      LEFT JOIN prompts p ON c.id = p.corpus_id
      LEFT JOIN recordings r ON p.id = r.prompt_id
      WHERE c.id = $1
      GROUP BY c.id
    `, [corpusId]);

    if (corpusResult.rows.length === 0) {
      return res.status(404).json({ error: 'Corpus not found' });
    }

    res.json(corpusResult.rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /corpus/:id/skipped - Get skipped prompts for admin review
router.get('/:id/skipped', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const corpusId = parseInt(req.params.id);
    const threshold = parseInt(req.query.threshold) || 3;

    const result = await query(`
      SELECT p.*, COUNT(r.id) as recording_count
      FROM prompts p
      LEFT JOIN recordings r ON p.id = r.prompt_id
      WHERE p.corpus_id = $1 AND p.skipped_count >= $2
      GROUP BY p.id
      ORDER BY p.skipped_count DESC
    `, [corpusId, threshold]);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// DELETE /corpus/:id - Delete a corpus (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res, next) => {
  try {
    const corpusId = parseInt(req.params.id);

    const result = await query('DELETE FROM corpora WHERE id = $1 RETURNING id', [corpusId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Corpus not found' });
    }

    res.json({ message: 'Corpus deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
