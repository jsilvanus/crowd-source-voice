import express from 'express';
import { query } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { checkDiskSpace } from '../middleware/diskSpace.js';
import { parseId } from '../utils/params.js';
import {
  createUploadMiddleware,
  deleteStoredFile,
  attachFileUrl,
  readMagicBytes,
  isValidAudioSignature,
  SAFE_AUDIO_EXTENSIONS
} from '../utils/storage.js';

const router = express.Router();

// Single source of truth for which audio mimetypes are accepted, shared with
// storage.js's SAFE_AUDIO_EXTENSIONS so the allow-list can't drift from the
// set of types storage.js knows how to map to a safe extension.
const ALLOWED_AUDIO_MIME_TYPES = Object.keys(SAFE_AUDIO_EXTENSIONS);

const upload = createUploadMiddleware({
  subdir: 'audio',
  maxFileSize: 20 * 1024 * 1024, // 20MB limit
  fileFilter: (req, file, cb) => {
    // Declared mimetype only — file.originalname is client-controlled and
    // must never be able to bypass this filter (it previously could, via
    // `.endsWith('.wav')`, regardless of the declared Content-Type).
    if (ALLOWED_AUDIO_MIME_TYPES.includes(file.mimetype)) {
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

    // The declared mimetype was already checked by fileFilter, but it (like
    // the rest of the multipart request) is entirely client-controlled and
    // never verified against the actual bytes until now. Confirm the stored
    // file's real content matches before it can become a visible/exportable
    // recording. Cheap: reads 16 bytes, never the whole file.
    const magicBytes = await readMagicBytes(req.file.storageKey);
    if (!isValidAudioSignature(req.file.mimetype, magicBytes)) {
      await deleteStoredFile(req.file.storageKey);
      return res.status(400).json({ error: 'Uploaded file content does not match a supported audio format (WAV, WebM, or OGG)' });
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
