import { jest } from '@jest/globals';
import http from 'http';
import { once } from 'events';
import { PassThrough, Readable } from 'stream';
import express from 'express';
import request from 'supertest';

// Route-level tests: the real export router and auth middleware run against a
// mocked database and a mocked storage layer, so no Postgres, disk or S3 is needed.
jest.unstable_mockModule('../../db/index.js', () => ({
  query: jest.fn()
}));
jest.unstable_mockModule('../../utils/storage.js', () => ({
  getFileStream: jest.fn()
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

const { query } = await import('../../db/index.js');
const { getFileStream } = await import('../../utils/storage.js');
const { default: logger } = await import('../../utils/logger.js');
const { generateToken } = await import('../../middleware/auth.js');
const { computeSpeakerId } = await import('../../utils/speakerId.js');
const { default: exportRoutes } = await import('../export.js');

const SPEAKER_SALT = 'route-test-speaker-salt-0123456789';
const EXPORT_TOKEN = 'route-test-export-token-0123456789abcdef';

// Mirrors the mounting in server/index.js
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/export', exportRoutes);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });
  return app;
};

const admin = { id: 2, email: 'admin@example.com', role: 'admin' };
const regularUser = { id: 1, email: 'user@example.com', role: 'user' };

const textCorpus = { id: 1, name: 'Test Corpus', language: 'English', type: 'text' };
const musicCorpus = { id: 2, name: 'Tunes', language: 'English', type: 'music' };

const KEY_A = 'audio/3f2b6f0e-6f3c-4c1a-9a55-000000000001.wav';
const KEY_C = 'audio/3f2b6f0e-6f3c-4c1a-9a55-000000000003.wav';
const LEGACY_B = '/uploads/audio/b.wav';

// Rows as the export query returns them (file_path is a storage key, or a legacy /uploads path)
const recordingRows = [
  { id: 11, file_path: KEY_A, duration: 2.5, quality_score: 4.5, text: 'Hello world.', type: 'text', user_email: 'singer@example.com', validation_count: '3' },
  { id: 12, file_path: LEGACY_B, duration: 3.0, quality_score: 4.0, text: 'Anonymised speaker.', type: 'text', user_email: null, validation_count: '2' },
  { id: 15, file_path: KEY_C, duration: 1.25, quality_score: 5, text: 'Another one.', type: 'text', user_email: 'other@example.com', validation_count: '2' }
];

const manifestRows = recordingRows.map(({ id, file_path, text, user_email }) => ({ id, file_path, text, user_email }));

const statsRows = [
  { corpus_id: 1, corpus_name: 'Test Corpus', type: 'text', total_recordings: '3', exportable_recordings: '3', total_duration_seconds: 6.75 }
];

// Recordings the audio route can look up by id (all belong to a prompt).
const audioRecordings = {
  11: { file_path: KEY_A, quality_score: 4.5, validation_count: 3 }, // qualifies
  12: { file_path: 'audio/only-one-validation.wav', quality_score: 4.8, validation_count: 1 }, // too few validations
  13: { file_path: 'audio/low-score.wav', quality_score: 3.9, validation_count: 5 }, // score too low
  14: { file_path: 'audio/on-the-boundary.wav', quality_score: 4.0, validation_count: 2 }, // exactly at both thresholds
  16: { file_path: 'audio/never-scored.wav', quality_score: null, validation_count: 0 } // no score yet
};

// Every byte value, more than one stream chunk, so exactness is really checked
const AUDIO_BYTES = Buffer.from(Array.from({ length: 200000 }, (_, i) => i % 256));

const NOT_FOUND_BODY = { error: 'Recording not found' };

const binaryParser = (res, cb) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const storageError = (code) => Object.assign(new Error(`internal detail: ${code} C:\\srv\\uploads\\secret-bucket\\x.wav`), { code });

describe('Export routes', () => {
  const originalEnv = {
    SPEAKER_ID_SALT: process.env.SPEAKER_ID_SALT,
    EXPORT_API_TOKEN: process.env.EXPORT_API_TOKEN
  };
  let app;
  let currentCorpus;
  let currentUser;
  let audioFixtures;

  const sqlCalls = (fragment) => query.mock.calls.filter(([sql]) => sql.includes(fragment));
  const audioLookups = () => sqlCalls('WHERE r.id = $1');

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    process.env.SPEAKER_ID_SALT = SPEAKER_SALT;
    process.env.EXPORT_API_TOKEN = EXPORT_TOKEN;

    currentCorpus = textCorpus;
    currentUser = admin;
    audioFixtures = audioRecordings;

    query.mockReset();
    query.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM users WHERE id')) return { rows: [currentUser] };
      if (sql.includes('SELECT * FROM corpora')) return { rows: [currentCorpus] };
      if (sql.includes('WHERE r.id = $1')) {
        const recording = audioFixtures[params[0]];
        if (!recording) return { rows: [] };
        // Behave like Postgres for the qualification clause (NULL >= x is not true)
        if (sql.includes('r.quality_score >= $2')) {
          const ok = recording.quality_score !== null
            && recording.quality_score >= params[1]
            && recording.validation_count >= params[2];
          if (!ok) return { rows: [] };
        }
        return { rows: [{ id: params[0], file_path: recording.file_path }] };
      }
      // Only the full export query selects r.duration; the manifest query does not
      if (sql.includes('FROM recordings r')) {
        return { rows: sql.includes('r.duration') ? recordingRows : manifestRows };
      }
      if (sql.includes('FROM corpora c')) return { rows: statsRows };
      return { rows: [] };
    });

    getFileStream.mockReset();
    getFileStream.mockImplementation(async () => ({
      stream: Readable.from([AUDIO_BYTES.subarray(0, 70000), AUDIO_BYTES.subarray(70000)], { objectMode: false }),
      contentLength: AUDIO_BYTES.length
    }));

    logger.warn.mockClear();
    logger.error.mockClear();
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const asAdmin = (req) => req.set('Authorization', `Bearer ${generateToken(admin.id)}`);
  const withToken = (req) => req.set('Authorization', `Bearer ${EXPORT_TOKEN}`);

  describe('GET /api/export?format=json', () => {
    test('adds recording_id and audio_url; keeps every existing field including speaker_id', async () => {
      const res = await asAdmin(request(app).get('/api/export?corpus_id=1&format=json'));

      expect(res.status).toBe(200);
      expect(res.body.corpus).toEqual({ id: 1, name: 'Test Corpus', language: 'English', type: 'text' });
      expect(res.body.total_recordings).toBe(3);
      expect(res.body.recordings[0]).toEqual({
        file: '0001.wav',
        recording_id: 11,
        original_path: KEY_A,
        audio_url: '/api/export/audio/11',
        text: 'Hello world.',
        duration: 2.5,
        quality_score: 4.5,
        validation_count: 3,
        speaker_id: computeSpeakerId('singer@example.com')
      });
    });

    test('recording_id is the database id, not the positional file number', async () => {
      const res = await asAdmin(request(app).get('/api/export?corpus_id=1&format=json'));

      expect(res.body.recordings.map((r) => r.file)).toEqual(['0001.wav', '0002.wav', '0003.wav']);
      expect(res.body.recordings.map((r) => r.recording_id)).toEqual([11, 12, 15]);
      for (const rec of res.body.recordings) {
        expect(Number.isInteger(rec.recording_id)).toBe(true);
      }
    });

    test('audio_url points at the audio route for every row, whatever the stored path looks like', async () => {
      const res = await asAdmin(request(app).get('/api/export?corpus_id=1&format=json'));

      expect(res.body.recordings.map((r) => r.audio_url)).toEqual([
        '/api/export/audio/11',
        '/api/export/audio/12',
        '/api/export/audio/15'
      ]);
    });

    test('original_path is still the raw stored value (storage key or legacy path)', async () => {
      const res = await asAdmin(request(app).get('/api/export?corpus_id=1&format=json'));

      expect(res.body.recordings.map((r) => r.original_path)).toEqual([KEY_A, LEGACY_B, KEY_C]);
    });

    test('speaker_id is computeSpeakerId(email) and null for an anonymised recording', async () => {
      const res = await asAdmin(request(app).get('/api/export?corpus_id=1&format=json'));
      const [first, anonymised, third] = res.body.recordings;

      expect(first.speaker_id).toBe(computeSpeakerId('singer@example.com'));
      expect(first.speaker_id).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.keys(anonymised)).toContain('speaker_id');
      expect(anonymised.speaker_id).toBeNull();
      expect(third.speaker_id).toBe(computeSpeakerId('other@example.com'));
      expect(first.speaker_id).not.toBe(third.speaker_id);
    });

    test('exposes no personal data: no email, no user id, no fields beyond the contract', async () => {
      const res = await asAdmin(request(app).get('/api/export?corpus_id=1&format=json'));

      for (const rec of res.body.recordings) {
        expect(Object.keys(rec).sort()).toEqual([
          'audio_url', 'duration', 'file', 'original_path', 'quality_score',
          'recording_id', 'speaker_id', 'text', 'validation_count'
        ]);
      }
      expect(JSON.stringify(res.body)).not.toContain('user_id');
      expect(JSON.stringify(res.body)).not.toContain('@');
    });

    test('music corpora keep `notation` and also get the new fields', async () => {
      currentCorpus = musicCorpus;

      const res = await asAdmin(request(app).get('/api/export?corpus_id=2&format=json'));

      expect(res.body.recordings[0]).toEqual(expect.objectContaining({
        recording_id: 11,
        audio_url: '/api/export/audio/11',
        speaker_id: computeSpeakerId('singer@example.com'),
        notation: 'Hello world.'
      }));
      expect(res.body.recordings[0]).not.toHaveProperty('text');
    });

    test('leaves the qualification filter and ordering unchanged', async () => {
      await asAdmin(request(app).get('/api/export?corpus_id=1&format=json'));

      const [[sql, params]] = sqlCalls('FROM recordings r');
      expect(sql).toContain('r.quality_score >= $2');
      expect(sql).toContain('(SELECT COUNT(*) FROM validations WHERE recording_id = r.id) >= $3');
      expect(sql).toContain('ORDER BY r.id');
      expect(params).toEqual([1, 4.0, 2]);
    });

    test('include_all=true still skips the threshold filter for an admin JWT', async () => {
      await asAdmin(request(app).get('/api/export?corpus_id=1&format=json&include_all=true'));

      const [[sql, params]] = sqlCalls('FROM recordings r');
      expect(sql).not.toContain('r.quality_score >= $2');
      expect(params).toEqual([1]);
    });
  });

  describe('GET /api/export (csv)', () => {
    test('CSV columns and rows are unchanged', async () => {
      const res = await asAdmin(request(app).get('/api/export?corpus_id=1'));

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.split('\n')).toEqual([
        'file,text,duration,quality_score',
        '0001.wav,"Hello world.",2.5,4.5',
        '0002.wav,"Anonymised speaker.",3,4',
        '0003.wav,"Another one.",1.25,5'
      ]);
      expect(res.text).not.toContain(computeSpeakerId('singer@example.com'));
      expect(res.text).not.toContain('/api/export/audio');
    });

    test('music CSV columns are unchanged', async () => {
      currentCorpus = musicCorpus;

      const res = await asAdmin(request(app).get('/api/export?corpus_id=2'));

      expect(res.text.split('\n')[0]).toBe('file,notation,duration,quality_score');
    });
  });

  describe('GET /api/export/manifest', () => {
    test('files[] gains recording_id and audio_url; keeps id, source_path, export_name, speaker_id, text', async () => {
      const res = await asAdmin(request(app).get('/api/export/manifest?corpus_id=1'));

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
      expect(res.body.files).toEqual([
        {
          id: 11, recording_id: 11, source_path: KEY_A, audio_url: '/api/export/audio/11',
          export_name: '0001.wav', text: 'Hello world.', speaker_id: computeSpeakerId('singer@example.com')
        },
        {
          id: 12, recording_id: 12, source_path: LEGACY_B, audio_url: '/api/export/audio/12',
          export_name: '0002.wav', text: 'Anonymised speaker.', speaker_id: null
        },
        {
          id: 15, recording_id: 15, source_path: KEY_C, audio_url: '/api/export/audio/15',
          export_name: '0003.wav', text: 'Another one.', speaker_id: computeSpeakerId('other@example.com')
        }
      ]);
    });

    test('exposes no personal data', async () => {
      const res = await asAdmin(request(app).get('/api/export/manifest?corpus_id=1'));

      expect(JSON.stringify(res.body)).not.toContain('user_id');
      expect(JSON.stringify(res.body)).not.toContain('@');
    });

    test('leaves the filter and ordering unchanged', async () => {
      await asAdmin(request(app).get('/api/export/manifest?corpus_id=1'));

      const [[sql, params]] = sqlCalls('FROM recordings r');
      expect(sql).toContain('ORDER BY r.id');
      expect(params).toEqual([1, 4.0, 2]);
    });
  });

  describe('export token (EXPORT_API_TOKEN) on the dataset routes', () => {
    test.each([
      ['/api/export?corpus_id=1&format=json'],
      ['/api/export?corpus_id=1'],
      ['/api/export/manifest?corpus_id=1'],
      ['/api/export/stats']
    ])('valid token is allowed on GET %s', async (url) => {
      const res = await withToken(request(app).get(url));

      expect(res.status).toBe(200);
      // No user lookup: the token is not a user session
      expect(sqlCalls('FROM users WHERE id')).toHaveLength(0);
    });

    test('token returns the same JSON body as an admin JWT', async () => {
      const viaToken = await withToken(request(app).get('/api/export?corpus_id=1&format=json'));
      const viaJwt = await asAdmin(request(app).get('/api/export?corpus_id=1&format=json'));

      expect(viaToken.body).toEqual(viaJwt.body);
    });

    test.each([
      ['/api/export?corpus_id=1&format=json'],
      ['/api/export/manifest?corpus_id=1'],
      ['/api/export/stats']
    ])('wrong token is denied (401) on GET %s', async (url) => {
      const res = await request(app).get(url).set('Authorization', 'Bearer wrong-token');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid or expired token' });
    });

    test('no credentials is denied (401)', async () => {
      const res = await request(app).get('/api/export/stats');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'No token provided' });
    });

    test('feature is off when EXPORT_API_TOKEN is unset or empty', async () => {
      delete process.env.EXPORT_API_TOKEN;
      const unset = await withToken(request(app).get('/api/export/stats'));
      process.env.EXPORT_API_TOKEN = '';
      const emptyBearer = await request(app).get('/api/export/stats').set('Authorization', 'Bearer ');

      expect(unset.status).toBe(401);
      expect(emptyBearer.status).toBe(401);
    });

    test('admin JWT still works with and without the token feature', async () => {
      const withFeature = await asAdmin(request(app).get('/api/export/stats'));
      delete process.env.EXPORT_API_TOKEN;
      const withoutFeature = await asAdmin(request(app).get('/api/export/stats'));

      expect(withFeature.status).toBe(200);
      expect(withoutFeature.status).toBe(200);
      expect(withFeature.body).toEqual(statsRows);
    });

    test('non-admin JWT is still forbidden (403)', async () => {
      currentUser = regularUser;

      const res = await request(app)
        .get('/api/export/stats')
        .set('Authorization', `Bearer ${generateToken(regularUser.id)}`);

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Admin access required' });
    });

    describe('least privilege: token grants the validated export only', () => {
      test.each([
        ['json', '/api/export?corpus_id=1&format=json&include_all=true'],
        ['csv (default format)', '/api/export?corpus_id=1&include_all=true']
      ])('token + include_all=true is denied (403) for %s and no SQL is issued', async (_label, url) => {
        const res = await withToken(request(app).get(url));

        expect(res.status).toBe(403);
        expect(res.body).toEqual({
          error: expect.stringContaining('include_all=true requires an admin login')
        });
        expect(res.body).not.toHaveProperty('recordings');
        expect(query).not.toHaveBeenCalled();
      });

      test('token without include_all works and applies the validation filter', async () => {
        const res = await withToken(request(app).get('/api/export?corpus_id=1&format=json'));

        expect(res.status).toBe(200);
        const [[sql, params]] = sqlCalls('FROM recordings r');
        expect(sql).toContain('r.quality_score >= $2');
        expect(params).toEqual([1, 4.0, 2]);
      });

      test('token + include_all=false works and still applies the validation filter', async () => {
        const res = await withToken(request(app).get('/api/export?corpus_id=1&format=json&include_all=false'));

        expect(res.status).toBe(200);
        expect(sqlCalls('FROM recordings r')[0][1]).toEqual([1, 4.0, 2]);
      });

      // The route only honours the exact string "true". Any other spelling is not
      // include_all, so the token can never reach the unfiltered SQL by a variant spelling.
      test.each(['1', 'TRUE', 'True', 'yes', ' true'])('token + include_all=%p never yields the unfiltered query', async (value) => {
        const res = await withToken(
          request(app).get('/api/export').query({ corpus_id: 1, format: 'json', include_all: value })
        );

        expect(res.status).toBe(200);
        const [[sql, params]] = sqlCalls('FROM recordings r');
        expect(sql).toContain('r.quality_score >= $2');
        expect(params).toEqual([1, 4.0, 2]);
      });

      test('token + include_all given twice never yields the unfiltered query', async () => {
        const res = await withToken(request(app).get('/api/export?corpus_id=1&format=json&include_all=true&include_all=true'));

        // Repeated params parse to an array, which the route does not treat as "true"
        expect(res.status).toBe(200);
        expect(sqlCalls('FROM recordings r')[0][1]).toEqual([1, 4.0, 2]);
      });

      test('the deny cannot be dodged by spoofing the mark via headers, query or body', async () => {
        const res = await withToken(
          request(app)
            .get('/api/export?corpus_id=1&format=json&include_all=true&exportTokenAuth=false&req.exportTokenAuth=false')
            .set('X-Export-Token-Auth', 'false')
            .set('exportTokenAuth', 'false')
            .send({ exportTokenAuth: false })
        );

        expect(res.status).toBe(403);
        expect(query).not.toHaveBeenCalled();
      });

      test('admin JWT + include_all=true is unchanged: 200 and the unfiltered query', async () => {
        const res = await asAdmin(request(app).get('/api/export?corpus_id=1&format=json&include_all=true'));

        expect(res.status).toBe(200);
        expect(res.body.recordings).toHaveLength(3);
        const [[sql, params]] = sqlCalls('FROM recordings r');
        expect(sql).not.toContain('r.quality_score >= $2');
        expect(params).toEqual([1]);
      });

      test('admin JWT cannot be downgraded by sending the mark itself', async () => {
        const res = await asAdmin(
          request(app)
            .get('/api/export?corpus_id=1&format=json&include_all=true&exportTokenAuth=true')
            .set('X-Export-Token-Auth', 'true')
            .send({ exportTokenAuth: true })
        );

        expect(res.status).toBe(200);
        expect(sqlCalls('FROM recordings r')[0][1]).toEqual([1]);
      });

      test('manifest ignores include_all: token still gets the filtered set only', async () => {
        const res = await withToken(request(app).get('/api/export/manifest?corpus_id=1&include_all=true'));

        expect(res.status).toBe(200);
        expect(sqlCalls('FROM recordings r')[0][1]).toEqual([1, 4.0, 2]);
      });
    });

    test('token does not work for non-GET methods on export paths', async () => {
      const res = await withToken(request(app).post('/api/export/manifest?corpus_id=1'));

      expect(res.status).toBe(404);
      const audio = await withToken(request(app).delete('/api/export/audio/11'));
      expect(audio.status).toBe(404);
    });
  });

  describe('GET /api/export/audio/:recordingId', () => {
    describe('serving a validated recording', () => {
      test('token + validated recording -> 200 with the exact bytes and the right headers', async () => {
        const res = await withToken(request(app).get('/api/export/audio/11')).buffer(true).parse(binaryParser);

        expect(res.status).toBe(200);
        expect(Buffer.isBuffer(res.body)).toBe(true);
        expect(res.body.length).toBe(AUDIO_BYTES.length);
        expect(res.body.equals(AUDIO_BYTES)).toBe(true);
        expect(res.headers['content-type']).toBe('audio/wav');
        expect(res.headers['content-length']).toBe(String(AUDIO_BYTES.length));
        expect(res.headers['cache-control']).toBe('private, no-store');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
      });

      test('streams the file named by the stored file_path (storage key) and nothing from the request', async () => {
        await withToken(request(app).get('/api/export/audio/11?file=../../etc/passwd&path=/etc/passwd'));

        expect(getFileStream).toHaveBeenCalledTimes(1);
        expect(getFileStream).toHaveBeenCalledWith(KEY_A);
      });

      test('a recording exactly on both thresholds (score 4.0, 2 validations) is served', async () => {
        const res = await withToken(request(app).get('/api/export/audio/14')).buffer(true).parse(binaryParser);

        expect(res.status).toBe(200);
        expect(res.body.equals(AUDIO_BYTES)).toBe(true);
      });

      test('admin JWT + validated recording -> 200 with the same bytes and headers', async () => {
        const res = await asAdmin(request(app).get('/api/export/audio/11')).buffer(true).parse(binaryParser);

        expect(res.status).toBe(200);
        expect(res.body.equals(AUDIO_BYTES)).toBe(true);
        expect(res.headers['content-type']).toBe('audio/wav');
        expect(res.headers['cache-control']).toBe('private, no-store');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
      });

      test('token and admin JWT do not touch users/corpora beyond the JWT lookup', async () => {
        await withToken(request(app).get('/api/export/audio/11'));

        expect(sqlCalls('FROM users WHERE id')).toHaveLength(0);
        expect(query).toHaveBeenCalledTimes(1);
      });

      test.each([
        ['audio/a.wav', 'audio/wav'],
        ['audio/a.WAV', 'audio/wav'],
        ['/uploads/audio/a.wav', 'audio/wav'],
        ['audio/a.ogg', 'audio/ogg'],
        ['audio/a.webm', 'audio/webm'],
        ['audio/a.mp3', 'audio/mpeg'],
        ['audio/a.m4a', 'audio/mp4'],
        ['audio/a.flac', 'application/octet-stream'],
        ['audio/no-extension', 'application/octet-stream']
      ])('Content-Type for %s is %s', async (filePath, contentType) => {
        audioFixtures = { 11: { file_path: filePath, quality_score: 5, validation_count: 9 } };

        const res = await withToken(request(app).get('/api/export/audio/11')).buffer(true).parse(binaryParser);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe(contentType);
        expect(getFileStream).toHaveBeenCalledWith(filePath);
      });

      test('omits Content-Length (chunked) when the driver does not know the size', async () => {
        getFileStream.mockResolvedValue({ stream: Readable.from([Buffer.from('abc')]) });

        const res = await withToken(request(app).get('/api/export/audio/11')).buffer(true).parse(binaryParser);

        expect(res.status).toBe(200);
        expect(res.body.toString()).toBe('abc');
        expect(res.headers['content-length']).toBeUndefined();
        expect(res.headers['transfer-encoding']).toBe('chunked');
      });
    });

    describe('qualification (SQL and behaviour)', () => {
      test('token request: the lookup joins prompts and applies the export qualification', async () => {
        await withToken(request(app).get('/api/export/audio/11'));

        const [[sql, params]] = audioLookups();
        expect(sql).toContain('JOIN prompts p ON r.prompt_id = p.id');
        expect(sql).toContain('r.quality_score >= $2');
        expect(sql).toContain('(SELECT COUNT(*) FROM validations WHERE recording_id = r.id) >= $3');
        expect(params).toEqual([11, 4.0, 2]);
      });

      test('the lookup selects only the id and the stored path (no personal data)', async () => {
        await withToken(request(app).get('/api/export/audio/11'));

        const [[sql]] = audioLookups();
        expect(sql).not.toContain('users');
        expect(sql).not.toContain('email');
      });

      test.each([
        ['does not exist', 999],
        ['has too few validations', 12],
        ['has a score below 4.0', 13],
        ['has never been scored', 16]
      ])('token + recording that %s -> the same 404 JSON, and no file is opened', async (_label, id) => {
        const res = await withToken(request(app).get(`/api/export/audio/${id}`));

        expect(res.status).toBe(404);
        expect(res.body).toEqual(NOT_FOUND_BODY);
        expect(getFileStream).not.toHaveBeenCalled();
      });

      test('missing, unvalidated and low-score recordings are indistinguishable byte for byte', async () => {
        const responses = await Promise.all(
          [999, 12, 13, 16].map((id) => withToken(request(app).get(`/api/export/audio/${id}`)))
        );

        for (const res of responses) {
          expect(res.status).toBe(404);
          expect(res.text).toBe(responses[0].text);
          expect(res.headers['content-type']).toBe(responses[0].headers['content-type']);
        }
      });

      test('admin JWT without include_all gets the same qualification and 404 for unvalidated', async () => {
        const res = await asAdmin(request(app).get('/api/export/audio/12'));

        expect(res.status).toBe(404);
        expect(res.body).toEqual(NOT_FOUND_BODY);
        expect(audioLookups()[0][1]).toEqual([12, 4.0, 2]);
        expect(getFileStream).not.toHaveBeenCalled();
      });

      test('admin JWT + include_all=true serves an unvalidated recording (unfiltered lookup)', async () => {
        const res = await asAdmin(request(app).get('/api/export/audio/12?include_all=true')).buffer(true).parse(binaryParser);

        expect(res.status).toBe(200);
        expect(res.body.equals(AUDIO_BYTES)).toBe(true);
        const [[sql, params]] = audioLookups();
        expect(sql).not.toContain('r.quality_score');
        expect(params).toEqual([12]);
        expect(getFileStream).toHaveBeenCalledWith('audio/only-one-validation.wav');
      });

      test('admin JWT + include_all=true still 404s for a recording that does not exist', async () => {
        const res = await asAdmin(request(app).get('/api/export/audio/999?include_all=true'));

        expect(res.status).toBe(404);
        expect(res.body).toEqual(NOT_FOUND_BODY);
      });

      test.each(['1', 'TRUE', 'yes', ' true'])('admin JWT + include_all=%p is not include_all: qualification applies', async (value) => {
        const res = await asAdmin(request(app).get('/api/export/audio/12').query({ include_all: value }));

        expect(res.status).toBe(404);
        expect(audioLookups()[0][1]).toEqual([12, 4.0, 2]);
      });
    });

    describe('token + include_all=true', () => {
      test('is denied (403) like /api/export, before any query or file access', async () => {
        const res = await withToken(request(app).get('/api/export/audio/12?include_all=true'));

        expect(res.status).toBe(403);
        expect(res.body).toEqual({
          error: expect.stringContaining('include_all=true requires an admin login')
        });
        expect(query).not.toHaveBeenCalled();
        expect(getFileStream).not.toHaveBeenCalled();
      });

      test('has the same body as the 403 from /api/export', async () => {
        const audio = await withToken(request(app).get('/api/export/audio/12?include_all=true'));
        const dataset = await withToken(request(app).get('/api/export?corpus_id=1&include_all=true'));

        expect(audio.status).toBe(403);
        expect(audio.body).toEqual(dataset.body);
      });

      test('cannot be dodged by spoofing the mark via headers, query or body', async () => {
        const res = await withToken(
          request(app)
            .get('/api/export/audio/12?include_all=true&exportTokenAuth=false&req.exportTokenAuth=false')
            .set('X-Export-Token-Auth', 'false')
            .set('exportTokenAuth', 'false')
            .send({ exportTokenAuth: false })
        );

        expect(res.status).toBe(403);
        expect(query).not.toHaveBeenCalled();
      });

      test.each(['1', 'TRUE', 'yes', ' true'])('include_all=%p is not include_all: the token still gets the qualified lookup only', async (value) => {
        const res = await withToken(request(app).get('/api/export/audio/12').query({ include_all: value }));

        expect(res.status).toBe(404);
        expect(audioLookups()[0][1]).toEqual([12, 4.0, 2]);
      });

      test('admin JWT cannot be downgraded by sending the mark itself', async () => {
        const res = await asAdmin(
          request(app)
            .get('/api/export/audio/12?include_all=true&exportTokenAuth=true')
            .set('X-Export-Token-Auth', 'true')
        );

        expect(res.status).toBe(200);
        expect(audioLookups()[0][1]).toEqual([12]);
      });
    });

    describe('authentication', () => {
      test('no credentials -> 401 and no query', async () => {
        const res = await request(app).get('/api/export/audio/11');

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'No token provided' });
        expect(query).not.toHaveBeenCalled();
        expect(getFileStream).not.toHaveBeenCalled();
      });

      test('wrong token -> 401', async () => {
        const res = await request(app).get('/api/export/audio/11').set('Authorization', 'Bearer wrong-token');

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: 'Invalid or expired token' });
        expect(audioLookups()).toHaveLength(0);
        expect(getFileStream).not.toHaveBeenCalled();
      });

      test('feature off (EXPORT_API_TOKEN unset): the former token is just an invalid JWT -> 401', async () => {
        delete process.env.EXPORT_API_TOKEN;

        const res = await withToken(request(app).get('/api/export/audio/11'));

        expect(res.status).toBe(401);
        expect(getFileStream).not.toHaveBeenCalled();
      });

      test('non-admin JWT -> 403 (unchanged) and no lookup', async () => {
        currentUser = regularUser;

        const res = await request(app)
          .get('/api/export/audio/11')
          .set('Authorization', `Bearer ${generateToken(regularUser.id)}`);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Admin access required' });
        expect(audioLookups()).toHaveLength(0);
        expect(getFileStream).not.toHaveBeenCalled();
      });

      test('admin JWT -> 200 (unchanged)', async () => {
        const res = await asAdmin(request(app).get('/api/export/audio/11')).buffer(true).parse(binaryParser);

        expect(res.status).toBe(200);
      });

      test('authentication is checked before the id is validated', async () => {
        const res = await request(app).get('/api/export/audio/not-a-number');

        expect(res.status).toBe(401);
      });
    });

    describe('invalid ids', () => {
      test.each([
        ['non-numeric', 'abc'],
        ['zero', '0'],
        ['negative', '-5'],
        ['decimal', '1.5'],
        ['exponent', '1e3'],
        ['hex', '0x10'],
        ['padded with spaces', '%2011'],
        ['plus sign', '%2B11'],
        ['larger than a Postgres integer', '2147483648'],
        ['far larger than a Postgres integer', '99999999999999999999']
      ])('%s id (%s) -> 400 JSON and no query', async (_label, id) => {
        const res = await withToken(request(app).get(`/api/export/audio/${id}`));

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: 'A valid recording id is required' });
        expect(query).not.toHaveBeenCalled();
        expect(getFileStream).not.toHaveBeenCalled();
      });

      test('the largest Postgres integer is a valid id (404 when absent)', async () => {
        const res = await withToken(request(app).get('/api/export/audio/2147483647'));

        expect(res.status).toBe(404);
        expect(audioLookups()[0][1][0]).toBe(2147483647);
      });

      test('a missing id is not this route (404 from the router, not a file)', async () => {
        const res = await withToken(request(app).get('/api/export/audio/'));

        expect(res.status).toBe(404);
        expect(getFileStream).not.toHaveBeenCalled();
      });
    });

    describe('missing or unreadable files', () => {
      test('file missing in storage (STORAGE_NOT_FOUND) -> the same 404 JSON', async () => {
        getFileStream.mockRejectedValue(storageError('STORAGE_NOT_FOUND'));

        const res = await withToken(request(app).get('/api/export/audio/11'));

        expect(res.status).toBe(404);
        expect(res.body).toEqual(NOT_FOUND_BODY);
        expect(logger.error).not.toHaveBeenCalled();
      });

      test('storage key that escapes the uploads root (INVALID_STORAGE_KEY) -> the same 404 JSON, logged as a warning', async () => {
        getFileStream.mockRejectedValue(storageError('INVALID_STORAGE_KEY'));

        const res = await withToken(request(app).get('/api/export/audio/11'));

        expect(res.status).toBe(404);
        expect(res.body).toEqual(NOT_FOUND_BODY);
        expect(logger.warn).toHaveBeenCalledWith({ recordingId: 11 }, expect.any(String));
      });

      test('the missing-file 404 is identical to the not-qualified 404', async () => {
        getFileStream.mockRejectedValue(storageError('STORAGE_NOT_FOUND'));

        const missingFile = await withToken(request(app).get('/api/export/audio/11'));
        const notQualified = await withToken(request(app).get('/api/export/audio/13'));

        expect(missingFile.status).toBe(notQualified.status);
        expect(missingFile.text).toBe(notQualified.text);
      });

      test('unexpected storage error -> 500 JSON that leaks no path, bucket or message', async () => {
        getFileStream.mockRejectedValue(storageError('EACCES'));

        const res = await withToken(request(app).get('/api/export/audio/11'));

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Internal server error' });
        expect(res.text).not.toContain('secret-bucket');
        expect(res.text).not.toContain('uploads');
        expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ recordingId: 11 }), expect.any(String));
      });

      test('database failure -> 500 JSON without the error message', async () => {
        query.mockImplementation(async (sql) => {
          if (sql.includes('WHERE r.id = $1')) throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2');
          return { rows: [] };
        });

        const res = await withToken(request(app).get('/api/export/audio/11'));

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Internal server error' });
        expect(res.text).not.toContain('hunter2');
      });
    });

    describe('stream failures and aborts', () => {
      // Real socket: supertest hides how a connection ends, and these tests are about that.
      const withServer = async (fn) => {
        const server = app.listen(0, '127.0.0.1');
        await once(server, 'listening');
        try {
          return await fn(server.address().port);
        } finally {
          server.close();
          server.closeAllConnections();
        }
      };

      const download = (port, id, { onData } = {}) => new Promise((resolve) => {
        const chunks = [];
        const req = http.get({
          host: '127.0.0.1',
          port,
          path: `/api/export/audio/${id}`,
          headers: { Authorization: `Bearer ${EXPORT_TOKEN}` }
        }, (res) => {
          res.on('data', (chunk) => {
            chunks.push(chunk);
            if (onData) onData(req);
          });
          res.on('error', () => {});
          res.on('close', () => {
            clearTimeout(giveUp);
            resolve({
              status: res.statusCode,
              complete: res.complete,
              headers: res.headers,
              body: Buffer.concat(chunks),
              timedOut: false
            });
          });
        });
        req.on('error', () => {});
        // A connection the server never closes must fail the test, not hang it
        const giveUp = setTimeout(() => {
          req.destroy();
          resolve({ timedOut: true, complete: false, body: Buffer.concat(chunks) });
        }, 2000);
      });

      test('stream that fails before any byte -> 500 JSON, not audio, and the source is destroyed', async () => {
        const source = new Readable({ read() {} });
        getFileStream.mockResolvedValue({ stream: source, contentLength: 1000 });
        setTimeout(() => source.destroy(new Error('read failed at C:\\srv\\uploads\\secret.wav')), 10);

        const res = await withToken(request(app).get('/api/export/audio/11'));

        expect(res.status).toBe(500);
        expect(res.headers['content-type']).toContain('application/json');
        expect(res.body).toEqual({ error: 'Internal server error' });
        expect(res.text).not.toContain('secret.wav');
        expect(source.destroyed).toBe(true);
        expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ recordingId: 11 }), expect.any(String));
      });

      test('stream that fails after the first bytes -> connection is cut, no JSON is appended to the audio', async () => {
        const source = new Readable({ read() {} });
        const firstChunk = Buffer.alloc(512, 7);
        getFileStream.mockResolvedValue({ stream: source, contentLength: 100000 });
        source.push(firstChunk);
        setTimeout(() => source.destroy(new Error('read failed at C:\\srv\\uploads\\secret.wav')), 50);

        const result = await withServer((port) => download(port, 11));

        expect(result.status).toBe(200);
        expect(result.complete).toBe(false);
        expect(result.body.equals(firstChunk)).toBe(true);
        expect(result.body.toString('latin1')).not.toContain('error');
        expect(source.destroyed).toBe(true);
      });

      test('client hangs up mid-download -> the source stream is destroyed (no leaked handle)', async () => {
        const source = new Readable({ read() {} });
        getFileStream.mockResolvedValue({ stream: source, contentLength: 100000 });
        source.push(Buffer.alloc(512, 1));

        await withServer(async (port) => {
          const closed = once(source, 'close');
          await download(port, 11, { onData: (req) => req.destroy() });
          // Bounded, so a regression fails this test instead of leaving the server open
          let timer;
          const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('source stream was not destroyed after the client hung up')), 2000);
          });
          try {
            await Promise.race([closed, timeout]);
          } finally {
            clearTimeout(timer);
          }
        });

        expect(source.destroyed).toBe(true);
      });

      test('a completed download does not destroy the source before it ends', async () => {
        const source = new PassThrough();
        getFileStream.mockResolvedValue({ stream: source, contentLength: 6 });
        source.write('abc');
        setTimeout(() => source.end('def'), 20);

        const result = await withServer((port) => download(port, 11));

        expect(result.complete).toBe(true);
        expect(result.body.toString()).toBe('abcdef');
      });
    });
  });
});
