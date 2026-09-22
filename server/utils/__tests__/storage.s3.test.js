import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

// STORAGE_DRIVER and the bucket are read when storage.js loads / on first use.
process.env.STORAGE_DRIVER = 's3';
process.env.S3_BUCKET = 'csv-test-bucket';
process.env.S3_REGION = 'us-east-1';

// The S3 upload path goes through @aws-sdk/lib-storage's Upload class, not
// S3Client.send directly. Mock it at the module boundary storage.js actually
// calls, the same way the repo's existing S3 tests mock S3Client.prototype.send
// for the S3Client-driven paths (readMagicBytes, below). The mock still drains
// the incoming file stream (as the real Upload would) so multer/busboy can
// finish parsing the multipart request instead of hanging.
const capturedUploads = [];
const uploadCtor = jest.fn().mockImplementation((opts) => ({
  done: async () => {
    const chunks = [];
    for await (const chunk of opts.params.Body) chunks.push(chunk);
    capturedUploads.push({
      key: opts.params.Key,
      contentType: opts.params.ContentType,
      body: Buffer.concat(chunks)
    });
    return {};
  }
}));
jest.unstable_mockModule('@aws-sdk/lib-storage', () => ({ Upload: uploadCtor }));

// No network for the GetObject (readMagicBytes) path: every S3 call goes
// through the (mocked) client's send().
const send = jest.spyOn(S3Client.prototype, 'send');

const {
  createUploadMiddleware,
  readMagicBytes,
  SAFE_AUDIO_EXTENSIONS
} = await import('../storage.js');

const WAV_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WAVE', 'ascii'),
  Buffer.from('fmt sample data......', 'ascii')
]);
const OGG_BYTES = Buffer.concat([Buffer.from('OggS', 'ascii'), Buffer.alloc(12)]);
const WEBM_BYTES = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('webm payload')]);

describe('S3 upload extension safety (S3StorageEngine, mocked Upload)', () => {
  beforeEach(() => {
    capturedUploads.length = 0;
    uploadCtor.mockClear();
  });

  const buildApp = () => {
    const upload = createUploadMiddleware({
      subdir: 'audio',
      maxFileSize: 1024 * 1024,
      fileFilter: (req, file, cb) => cb(null, true)
    });
    const app = express();
    app.post('/upload', upload.single('audio'), (req, res) => {
      res.json({ storageKey: req.file.storageKey, mimetype: req.file.mimetype });
    });
    app.use((err, req, res, next) => res.status(400).json({ error: err.message }));
    return app;
  };

  test('a file named evil.html with mimetype audio/wav is uploaded to a key ending in .wav, never .html', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/upload')
      .attach('audio', WAV_BYTES, { filename: 'evil.html', contentType: 'audio/wav' });

    expect(res.status).toBe(200);
    expect(res.body.storageKey).toMatch(/^audio\/.+\.wav$/);
    expect(res.body.storageKey).not.toMatch(/\.html/);
    expect(capturedUploads).toHaveLength(1);
    expect(capturedUploads[0].key).toBe(res.body.storageKey);
    expect(capturedUploads[0].body.equals(WAV_BYTES)).toBe(true);
  });

  test('a file named x.exe with mimetype audio/ogg is uploaded to a key ending in .ogg', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/upload')
      .attach('audio', OGG_BYTES, { filename: 'x.exe', contentType: 'audio/ogg' });

    expect(res.status).toBe(200);
    expect(res.body.storageKey).toMatch(/\.ogg$/);
  });

  test('a file named clip with mimetype audio/webm is uploaded to a key ending in .webm', async () => {
    const app = buildApp();

    const res = await request(app)
      .post('/upload')
      .attach('audio', WEBM_BYTES, { filename: 'clip', contentType: 'audio/webm' });

    expect(res.status).toBe(200);
    expect(res.body.storageKey).toMatch(/\.webm$/);
  });

  test('every SAFE_AUDIO_EXTENSIONS mimetype is honoured through the real S3StorageEngine key construction', async () => {
    const app = buildApp();

    for (const [mimetype, ext] of Object.entries(SAFE_AUDIO_EXTENSIONS)) {
      const res = await request(app)
        .post('/upload')
        .attach('audio', WAV_BYTES, { filename: 'whatever.dat', contentType: mimetype });

      expect(res.body.storageKey.endsWith(ext)).toBe(true);
    }
  });
});

describe('readMagicBytes (s3 driver, mocked client)', () => {
  beforeEach(() => {
    send.mockReset();
  });

  afterAll(() => {
    send.mockRestore();
  });

  test('issues a ranged GetObject (bytes=0-15 by default) and returns the header bytes', async () => {
    send.mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array(WAV_BYTES.subarray(0, 16)) }
    });

    const result = await readMagicBytes('audio/abc.wav');

    expect(send).toHaveBeenCalledTimes(1);
    const [command] = send.mock.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: 'csv-test-bucket', Key: 'audio/abc.wav', Range: 'bytes=0-15' });
    expect(result.equals(WAV_BYTES.subarray(0, 16))).toBe(true);
  });

  test('a custom length changes the requested range', async () => {
    send.mockResolvedValue({ Body: { transformToByteArray: async () => new Uint8Array(Buffer.from('RIFF')) } });

    await readMagicBytes('audio/abc.wav', 4);

    const [command] = send.mock.calls[0];
    expect(command.input.Range).toBe('bytes=0-3');
  });

  test('an S3 error (e.g. object not found) is treated as no signature, not a crash', async () => {
    send.mockRejectedValue(Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }));

    const result = await readMagicBytes('audio/gone.wav');

    expect(result).toEqual(Buffer.alloc(0));
  });
});
