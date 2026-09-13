import express from 'express';
import { query } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { checkDiskSpace } from '../middleware/diskSpace.js';
import { parseId } from '../utils/params.js';
import { createUploadMiddleware, deleteStoredFile, attachFileUrl } from '../utils/storage.js';

const router = express.Router();

const upload = createUploadMiddleware({
  subdir: 'audio',
  maxFileSize: 20 * 1024 * 1024, // 20MB limit
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
    const prompt_id = parseId(req.body.prompt_id);
    const { duration } = req.body;

    if (!prompt_id) {
      // Clean up the already-saved upload before rejecting
      if (req.file) {
        await deleteStoredFile(req.file.storageKey);
      }
      return res.status(400).json({ error: 'A valid prompt_id is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    // Verify prompt exists
    const promptResult = await query('SELECT id FROM prompts WHERE id = $1', [prompt_id]);
    if (promptResult.rows.length === 0) {
      // Clean up uploaded file
      await deleteStoredFile(req.file.storageKey);
      return res.status(404).json({ error: 'Prompt not found' });
    }

    // Check if user already recorded this prompt
    const existingResult = await query(
      'SELECT id FROM recordings WHERE prompt_id = $1 AND user_id = $2',
      [prompt_id, req.user.id]
    );
    if (existingResult.rows.length > 0) {
      // Clean up uploaded file
      await deleteStoredFile(req.file.storageKey);
      return res.status(400).json({ error: 'You have already recorded this prompt' });
    }

    // Insert recording
    const result = await query(
      `INSERT INTO recordings (prompt_id, user_id, file_path, duration)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [prompt_id, req.user.id, req.file.storageKey, duration || null]
    );

    res.status(201).json(await attachFileUrl(result.rows[0]));
  } catch (error) {
    // Clean up file on error
    if (req.file) {
      await deleteStoredFile(req.file.storageKey);
    }
    next(error);
  }
});

// GET /recording/:id - Get a specific recording
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const recordingId = parseId(req.params.id);
    if (!recordingId) {
      return res.status(400).json({ error: 'Invalid recording id' });
    }

    const result = await query(`
      SELECT r.*, p.text as prompt_text, p.type as prompt_type
      FROM recordings r
      JOIN prompts p ON r.prompt_id = p.id
      WHERE r.id = $1
    `, [recordingId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recording not found' });
    }

    res.json(await attachFileUrl(result.rows[0]));
  } catch (error) {
    next(error);
  }
});

// DELETE /recording/:id - Delete own recording
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const recordingId = parseId(req.params.id);
    if (!recordingId) {
      return res.status(400).json({ error: 'Invalid recording id' });
    }

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
    await deleteStoredFile(recording.file_path);

    // Delete from database
    await query('DELETE FROM recordings WHERE id = $1', [recordingId]);

    res.json({ message: 'Recording deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
