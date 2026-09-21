import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { query } from '../db/index.js';
import { authenticateExportRead } from '../middleware/exportAuth.js';
import { parseId } from '../utils/params.js';
import { computeSpeakerId } from '../utils/speakerId.js';
import { getFileStream } from '../utils/storage.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Minimum validations and score threshold for export
const MIN_VALIDATIONS = 2;
const MIN_SCORE_THRESHOLD = 4.0;

// The GET routes below accept an admin JWT or the read-only EXPORT_API_TOKEN.
// The token grants the validated export only, so it is refused include_all=true.
const INCLUDE_ALL_DENIED = {
  error: 'include_all=true requires an admin login; the export token only grants the validated export'
};

// Where a consumer fetches a recording's audio (GET /export/audio/:recordingId below).
const audioUrlFor = (recordingId) => `/api/export/audio/${recordingId}`;

// GET /export - Export dataset for a corpus
router.get('/', authenticateExportRead, async (req, res, next) => {
  try {
    const corpusId = parseId(req.query.corpus_id);
    const format = req.query.format || 'csv'; // csv or json
    const includeAll = req.query.include_all === 'true'; // Include non-validated

    // Deny loudly (not silently ignore) so a misconfigured client notices.
    if (includeAll && req.exportTokenAuth) {
      return res.status(403).json(INCLUDE_ALL_DENIED);
    }

    if (!corpusId) {
      return res.status(400).json({ error: 'A valid corpus_id is required' });
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
        u.email AS user_email,
        (SELECT COUNT(*) FROM validations WHERE recording_id = r.id) as validation_count
      FROM recordings r
      JOIN prompts p ON r.prompt_id = p.id
      LEFT JOIN users u ON u.id = r.user_id
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

    // Format the export data.
    // speaker_id is a salted double-hash of the contributor's email (never the
    // email itself) — present on JSON rows so downstream training pipelines can
    // do a speaker-disjoint split. Deliberately left out of the CSV format,
    // which stays the exact `file,text,duration,quality_score` Whisper-compatible
    // shape existing external consumers expect.
    // recording_id is the stable identifier (`file` shifts between calls) and
    // audio_url is what consumers should fetch; original_path is the raw stored
    // value (a storage key or a legacy /uploads path), kept as it was.
    const exportData = result.rows.map((row, index) => {
      const filename = `${String(index + 1).padStart(4, '0')}.wav`;
      return {
        file: filename,
        recording_id: row.id,
        original_path: row.file_path,
        audio_url: audioUrlFor(row.id),
        text: corpus.type === 'music' ? undefined : row.text,
        notation: corpus.type === 'music' ? row.text : undefined,
        duration: row.duration,
        quality_score: row.quality_score,
        validation_count: parseInt(row.validation_count),
        speaker_id: computeSpeakerId(row.user_email)
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
        const escapedContent = `"${content.replace(/"/g, '""').replace(/\r/g, '').replace(/\n/g, '\\n')}"`;
        return `${row.file},${escapedContent},${row.duration || ''},${row.quality_score || ''}`;
      });

      const csv = [header, ...csvRows].join('\n');

      // Header values must be ASCII; replace anything else in the corpus name
      const safeName = corpus.name.replace(/[^\w.-]+/g, '_') || 'corpus';

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}-dataset.csv"`);
      res.send(csv);
    }
  } catch (error) {
    next(error);
  }
});

// GET /export/manifest - Get export manifest with file paths
router.get('/manifest', authenticateExportRead, async (req, res, next) => {
  try {
    const corpusId = parseId(req.query.corpus_id);

    if (!corpusId) {
      return res.status(400).json({ error: 'A valid corpus_id is required' });
    }

    const result = await query(`
      SELECT
        r.id,
        r.file_path,
        p.text,
        u.email AS user_email
      FROM recordings r
      JOIN prompts p ON r.prompt_id = p.id
      LEFT JOIN users u ON u.id = r.user_id
      WHERE p.corpus_id = $1
        AND r.quality_score >= $2
        AND (SELECT COUNT(*) FROM validations WHERE recording_id = r.id) >= $3
      ORDER BY r.id
    `, [corpusId, MIN_SCORE_THRESHOLD, MIN_VALIDATIONS]);

    res.json({
      total: result.rows.length,
      // source_path is the raw stored value; audio_url is what consumers should fetch.
      files: result.rows.map((row, index) => ({
        id: row.id,
        recording_id: row.id,
        source_path: row.file_path,
        audio_url: audioUrlFor(row.id),
        export_name: `${String(index + 1).padStart(4, '0')}.wav`,
        text: row.text,
        speaker_id: computeSpeakerId(row.user_email)
      }))
    });
  } catch (error) {
    next(error);
  }
});

// GET /export/stats - Get export statistics
router.get('/stats', authenticateExportRead, async (req, res, next) => {
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

    if (corpusId !== undefined) {
      const parsedCorpusId = parseId(corpusId);
      if (!parsedCorpusId) {
        return res.status(400).json({ error: 'Invalid corpus_id' });
      }
      queryText += ' WHERE c.id = $3';
      params.push(parsedCorpusId);
    }

    queryText += ' GROUP BY c.id ORDER BY c.name';

    const result = await query(queryText, params);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

const AUDIO_CONTENT_TYPES = {
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4'
};

const MAX_RECORDING_ID = 2147483647; // recordings.id is a Postgres integer

// GET /export/audio/:recordingId - Stream a recording's audio from the active
// storage driver (local disk or S3), so export consumers need only this API and
// one bearer token rather than direct access to the uploads dir or the bucket.
router.get('/audio/:recordingId', authenticateExportRead, async (req, res) => {
  const log = req.log || logger;
  let recordingId = null;

  // One 404 for every reason audio is unavailable (no such recording, not
  // validated, score too low, file gone), so the response never reveals which.
  const notFound = () => res.status(404).json({ error: 'Recording not found' });

  try {
    const includeAll = req.query.include_all === 'true';
    if (includeAll && req.exportTokenAuth) {
      return res.status(403).json(INCLUDE_ALL_DENIED);
    }

    const idParam = req.params.recordingId;
    recordingId = /^\d+$/.test(idParam) ? parseId(idParam) : null;
    if (!recordingId || recordingId > MAX_RECORDING_ID) {
      return res.status(400).json({ error: 'A valid recording id is required' });
    }

    // Same qualification as the export. The token never gets more than the
    // validated set; only an admin JWT with include_all=true skips it.
    const validatedOnly = req.exportTokenAuth === true || !includeAll;
    let queryText = `
      SELECT
        r.id,
        r.file_path
      FROM recordings r
      JOIN prompts p ON r.prompt_id = p.id
      WHERE r.id = $1
    `;
    const params = [recordingId];

    if (validatedOnly) {
      queryText += `
        AND r.quality_score >= $2
        AND (SELECT COUNT(*) FROM validations WHERE recording_id = r.id) >= $3
      `;
      params.push(MIN_SCORE_THRESHOLD, MIN_VALIDATIONS);
    }

    const result = await query(queryText, params);
    if (result.rows.length === 0) {
      return notFound();
    }

    const filePath = result.rows[0].file_path;
    const { stream, contentLength } = await getFileStream(filePath);

    res.status(200);
    res.setHeader(
      'Content-Type',
      AUDIO_CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    );
    if (contentLength !== undefined) {
      res.setHeader('Content-Length', contentLength);
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Client hung up mid-download: release the file descriptor / S3 socket.
    res.on('close', () => {
      if (!res.writableFinished) stream.destroy();
    });
    stream.on('error', (err) => {
      log.error({ err, recordingId }, 'Export audio stream failed');
      stream.destroy();
      if (res.headersSent) {
        // Part of the audio is already out; a JSON body would corrupt it, so
        // cut the connection and let the client see the truncated download.
        res.destroy();
        return;
      }
      res.removeHeader('Content-Type');
      res.removeHeader('Content-Length');
      res.status(500).json({ error: 'Internal server error' });
    });
    stream.pipe(res);
  } catch (err) {
    if (err?.code === 'STORAGE_NOT_FOUND') {
      return notFound();
    }
    if (err?.code === 'INVALID_STORAGE_KEY') {
      log.warn({ recordingId }, 'Export audio: recording has an invalid storage key');
      return notFound();
    }
    // Never send err.message: fs/S3 errors can carry paths or bucket names.
    log.error({ err, recordingId }, 'Export audio failed');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
