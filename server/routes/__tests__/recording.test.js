import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import multer from 'multer';
import request from 'supertest';
import { fileURLToPath } from 'url';

// Route-level tests: the real recording router, real auth middleware, real
// multer/diskStorage upload pipeline and real magic-byte check run against a
// mocked database only, matching the repo's existing route-test convention
// (see server/routes/__tests__/export.test.js on the export-audio-route
// branch: mock the DB, use the real storage layer / a temp uploads dir).
process.env.STORAGE_DRIVER = 'local';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.unstable_mockModule('../../db/index.js', () => ({
  query: jest.fn()
}));

const { query } = await import('../../db/index.js');
const { generateToken } = await import('../../middleware/auth.js');
const { default: recordingRoutes } = await import('../recording.js');

const UPLOADS_ROOT = fileURLToPath(new URL('../../../uploads', import.meta.url));
const AUDIO_DIR = path.join(UPLOADS_ROOT, 'audio');

const WAV_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WAVE', 'ascii'),
  Buffer.from('fmt sample data......', 'ascii')
]);
const OGG_BYTES = Buffer.concat([Buffer.from('OggS', 'ascii'), Buffer.alloc(12)]);
const WEBM_BYTES = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('webm payload')]);
const HTML_BYTES = Buffer.from('<html><body><script>alert(document.cookie)</script></body></html>', 'utf-8');
const TINY_BYTES = Buffer.from([0x52, 0x49]); // 2 bytes — shorter than any signature check needs

// Mirrors the mounting + error handling in server/index.js
const buildApp = () => {
  const app = express();
  app.use('/api/recording', recordingRoutes);
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ error: err.message, code: err.code });
    }
    if (err.message && err.message.startsWith('Invalid file type')) {
      return res.status(400).json({ error: err.message });
    }
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });
  return app;
};

const user = { id: 1, email: 'singer@example.com', role: 'user', terms_accepted_at: null, recording_consent_at: null };
const token = generateToken(user.id);
const PROMPT_ID = 42;

describe('POST /api/recording (upload)', () => {
  let app;
  const createdKeys = [];

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM users WHERE id')) return { rows: [user] };
      if (sql.includes('FROM prompts WHERE id')) {
        return params[0] === PROMPT_ID ? { rows: [{ id: PROMPT_ID }] } : { rows: [] };
      }
      if (sql.includes('FROM recordings WHERE prompt_id')) return { rows: [] };
      if (sql.startsWith('INSERT INTO recordings')) {
        const [prompt_id, user_id, file_path, duration] = params;
        return { rows: [{ id: 999, prompt_id, user_id, file_path, duration, quality_score: null, created_at: new Date().toISOString() }] };
      }
      return { rows: [] };
    });
  });

  afterAll(async () => {
    await Promise.all(createdKeys.map((key) => fs.rm(path.join(UPLOADS_ROOT, key), { force: true })));
  });

  const listAudioDir = () => fs.readdir(AUDIO_DIR).catch(() => []);
  const insertCalls = () => query.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO recordings'));

  test('a file named x.html with a forged mimetype audio/wav but real HTML content is rejected end-to-end', async () => {
    const before = await listAudioDir();

    const res = await request(app)
      .post('/api/recording')
      .set('Authorization', `Bearer ${token}`)
      .field('prompt_id', String(PROMPT_ID))
      .attach('audio', HTML_BYTES, { filename: 'x.html', contentType: 'audio/wav' });

    expect(res.status).toBe(400);
    expect(insertCalls()).toHaveLength(0);

    // Nothing is left behind in storage with a non-audio (or any) extension.
    const after = await listAudioDir();
    expect(after.sort()).toEqual(before.sort());

    // The error must not leak the storage key or a filesystem path.
    expect(JSON.stringify(res.body)).not.toMatch(/\.wav|uploads[\\/]audio|C:\\|\/audio\//);
  });

  test('a file named x.wav but mimetype text/html is rejected (the OR-bypass is gone)', async () => {
    const before = await listAudioDir();

    const res = await request(app)
      .post('/api/recording')
      .set('Authorization', `Bearer ${token}`)
      .field('prompt_id', String(PROMPT_ID))
      .attach('audio', HTML_BYTES, { filename: 'x.wav', contentType: 'text/html' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid file type/);
    expect(insertCalls()).toHaveLength(0);

    const after = await listAudioDir();
    expect(after.sort()).toEqual(before.sort());
  });

  test('a real WAV named evil.html with mimetype audio/wav is accepted, and stored with a .wav extension', async () => {
    const res = await request(app)
      .post('/api/recording')
      .set('Authorization', `Bearer ${token}`)
      .field('prompt_id', String(PROMPT_ID))
      .attach('audio', WAV_BYTES, { filename: 'evil.html', contentType: 'audio/wav' });

    expect(res.status).toBe(201);
    expect(res.body.file_path).toMatch(/\.wav$/);
    expect(res.body.file_path).not.toMatch(/\.html/);
    expect(insertCalls()).toHaveLength(1);

    const [, , storedPath] = insertCalls()[0][1];
    createdKeys.push(storedPath);
  });

  test('a real OGG with mimetype audio/ogg is accepted and stored with a .ogg extension', async () => {
    const res = await request(app)
      .post('/api/recording')
      .set('Authorization', `Bearer ${token}`)
      .field('prompt_id', String(PROMPT_ID))
      .attach('audio', OGG_BYTES, { filename: 'x.exe', contentType: 'audio/ogg' });

    expect(res.status).toBe(201);
    expect(res.body.file_path).toMatch(/\.ogg$/);

    createdKeys.push(insertCalls()[0][1][2]);
  });

  test('a real WebM with mimetype audio/webm is accepted and stored with a .webm extension', async () => {
    const res = await request(app)
      .post('/api/recording')
      .set('Authorization', `Bearer ${token}`)
      .field('prompt_id', String(PROMPT_ID))
      .attach('audio', WEBM_BYTES, { filename: 'x.exe', contentType: 'audio/webm' });

    expect(res.status).toBe(201);
    expect(res.body.file_path).toMatch(/\.webm$/);

    createdKeys.push(insertCalls()[0][1][2]);
  });

  test('a truncated (< 16 byte) upload is rejected with 400, not a crash', async () => {
    const before = await listAudioDir();

    const res = await request(app)
      .post('/api/recording')
      .set('Authorization', `Bearer ${token}`)
      .field('prompt_id', String(PROMPT_ID))
      .attach('audio', TINY_BYTES, { filename: 'tiny.wav', contentType: 'audio/wav' });

    expect(res.status).toBe(400);
    expect(insertCalls()).toHaveLength(0);

    const after = await listAudioDir();
    expect(after.sort()).toEqual(before.sort());
  });
});
