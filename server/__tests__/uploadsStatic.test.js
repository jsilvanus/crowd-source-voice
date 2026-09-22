import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { fileURLToPath } from 'url';

// server/index.js itself calls app.listen(...) at import time and opens a
// real DB pool, so it is not imported directly in tests (matching the rest
// of this repo: it is excluded from jest.config.js's coverage collection
// too). This test instead mirrors its /uploads mount verbatim —
//   app.use('/uploads', express.static(uploadsDir, { setHeaders: ... }))
// — so a drift between the two would need to be introduced deliberately in
// one place and not the other.
const UPLOADS_ROOT = fileURLToPath(new URL('../../uploads', import.meta.url));
const AUDIO_DIR = path.join(UPLOADS_ROOT, 'audio');

const buildApp = () => {
  const app = express();
  app.use('/uploads', express.static(UPLOADS_ROOT, {
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
  }));
  return app;
};

describe('/uploads static mount', () => {
  const fileName = `nosniff-test-${Math.random().toString(36).slice(2)}.wav`;
  const filePath = path.join(AUDIO_DIR, fileName);

  beforeAll(async () => {
    await fs.mkdir(AUDIO_DIR, { recursive: true });
    await fs.writeFile(filePath, Buffer.from('RIFF....WAVEfake'));
  });

  afterAll(async () => {
    await fs.rm(filePath, { force: true });
  });

  test('a real stored file is served with X-Content-Type-Options: nosniff', async () => {
    const app = buildApp();

    const res = await request(app).get(`/uploads/audio/${fileName}`);

    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
