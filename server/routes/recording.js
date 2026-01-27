import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { checkDiskSpace } from '../middleware/diskSpace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for audio file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/audio');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.wav';
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/webm', 'audio/ogg'];
    if (allowedMimeTypes.includes(file.mimetype) || file.originalname.endsWith('.wav')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: WAV, WebM, OGG'));
    }
  }
});

// POST /recording - Upload a new recording
router.post('/', authenticate, checkDiskSpace, upload.single('audio'), async (req, res, next) => {
  try {
    const { prompt_id, duration } = req.body;

    if (!prompt_id) {
      return res.status(400).json({ error: 'prompt_id is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    // Verify prompt exists
    const promptResult = await query('SELECT id FROM prompts WHERE id = $1', [prompt_id]);
    if (promptResult.rows.length === 0) {
      // Clean up uploaded file
      await fs.unlink(req.file.path);
      return res.status(404).json({ error: 'Prompt not found' });
    }

    // Check if user already recorded this prompt
    const existingResult = await query(
      'SELECT id FROM recordings WHERE prompt_id = $1 AND user_id = $2',
      [prompt_id, req.user.id]
    );
    if (existingResult.rows.length > 0) {
      // Clean up uploaded file
      await fs.unlink(req.file.path);
      return res.status(400).json({ error: 'You have already recorded this prompt' });
    }

    // Store relative path for the file
    const filePath = `/uploads/audio/${req.file.filename}`;

    // Insert recording
    const result = await query(
      `INSERT INTO recordings (prompt_id, user_id, file_path, duration)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [prompt_id, req.user.id, filePath, duration || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    // Clean up file on error
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    next(error);
  }
});

// GET /recording/:id - Get a specific recording
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const recordingId = parseInt(req.params.id);

    const result = await query(`
      SELECT r.*, p.text as prompt_text, p.type as prompt_type
      FROM recordings r
      JOIN prompts p ON r.prompt_id = p.id
      WHERE r.id = $1
    `, [recordingId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// DELETE /recording/:id - Delete own recording
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const recordingId = parseInt(req.params.id);

    // Check ownership
    const recordingResult = await query(
      'SELECT * FROM recordings WHERE id = $1 AND user_id = $2',
      [recordingId, req.user.id]
    );

    if (recordingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found or not owned by you' });
    }

    const recording = recordingResult.rows[0];

    // Delete the file
    const filePath = path.join(__dirname, '../..', recording.file_path);
    await fs.unlink(filePath).catch(() => {});

    // Delete from database
    await query('DELETE FROM recordings WHERE id = $1', [recordingId]);

    res.json({ message: 'Recording deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
