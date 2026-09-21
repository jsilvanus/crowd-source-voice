import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// The export token (EXPORT_API_TOKEN) must grant nothing beyond the read-only
// export GET routes. This mounts every real router exactly as server/index.js
// does, against a mocked database, and checks the token is refused everywhere else.
jest.unstable_mockModule('../../db/index.js', () => ({
  query: jest.fn(),
  withTransaction: jest.fn()
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const { query } = await import('../../db/index.js');
const { authenticate, requireAdmin } = await import('../../middleware/auth.js');
const { getDiskSpaceStatus } = await import('../../middleware/diskSpace.js');
const { default: authRoutes } = await import('../auth.js');
const { default: corpusRoutes } = await import('../corpus.js');
const { default: promptRoutes } = await import('../prompt.js');
const { default: recordingRoutes } = await import('../recording.js');
const { default: validationRoutes } = await import('../validation.js');
const { default: userRoutes } = await import('../user.js');
const { default: exportRoutes } = await import('../export.js');
const { default: adminRoutes } = await import('../admin.js');

const EXPORT_TOKEN = 'route-test-export-token-0123456789abcdef';

// Mirrors the mounting in server/index.js
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/corpus', corpusRoutes);
  app.use('/api/prompt', promptRoutes);
  app.use('/api/recording', recordingRoutes);
  app.use('/api/validation', validationRoutes);
  app.use('/api/me', userRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/admin', adminRoutes);
  app.get('/api/disk-space', authenticate, requireAdmin, getDiskSpaceStatus);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });
  return app;
};

describe('Export token is confined to the export routes', () => {
  const originalToken = process.env.EXPORT_API_TOKEN;
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    process.env.EXPORT_API_TOKEN = EXPORT_TOKEN;
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.EXPORT_API_TOKEN;
    else process.env.EXPORT_API_TOKEN = originalToken;
  });

  const withToken = (req) => req.set('Authorization', `Bearer ${EXPORT_TOKEN}`);

  // Every authenticated route except the export ones (register/login are public).
  test.each([
    ['get', '/api/admin/stats'],
    ['get', '/api/admin/users'],
    ['get', '/api/admin/users/1'],
    ['put', '/api/admin/users/1/role'],
    ['delete', '/api/admin/users/1'],
    ['get', '/api/disk-space'],
    ['get', '/api/auth/me'],
    ['post', '/api/auth/logout'],
    ['get', '/api/corpus'],
    ['get', '/api/corpus/1'],
    ['post', '/api/corpus'],
    ['post', '/api/corpus/1/upload'],
    ['get', '/api/corpus/1/skipped'],
    ['get', '/api/corpus/1/source'],
    ['post', '/api/corpus/1/reprocess'],
    ['delete', '/api/corpus/1'],
    ['get', '/api/prompt?corpus_id=1'],
    ['get', '/api/prompt/1'],
    ['post', '/api/prompt/1/skip'],
    ['get', '/api/prompt/stats/1'],
    ['get', '/api/recording/1'],
    ['post', '/api/recording'],
    ['delete', '/api/recording/1'],
    ['get', '/api/validation'],
    ['post', '/api/validation'],
    ['get', '/api/validation/stats'],
    ['get', '/api/validation/flagged'],
    ['get', '/api/me/recordings'],
    ['get', '/api/me/stats'],
    ['get', '/api/me/export'],
    ['post', '/api/me/consent/recording'],
    ['delete', '/api/me/consent/recording'],
    ['delete', '/api/me'],
    ['post', '/api/me/anonymize']
  ])('valid token is denied (401) on %s %s', async (method, url) => {
    const res = await withToken(request(app)[method](url));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
    // Nothing was read or written on behalf of the token
    expect(query).not.toHaveBeenCalled();
  });

  test('the same token is accepted on the export routes (control: the app really is wired up)', async () => {
    const res = await withToken(request(app).get('/api/export/stats'));

    expect(res.status).toBe(200);
  });

  test('the audio route accepts the token only for GET', async () => {
    const res = await withToken(request(app).post('/api/export/audio/1'));

    expect(res.status).toBe(404);
    expect(query).not.toHaveBeenCalled();
  });
});
