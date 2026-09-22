import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { fileURLToPath } from 'url';

// STORAGE_DRIVER is read when storage.js loads, so pin the local driver first.
process.env.STORAGE_DRIVER = 'local';

const {
  createUploadMiddleware,
  deleteStoredFile,
  readMagicBytes,
  isValidAudioSignature,
  safeAudioExtension,
  SAFE_AUDIO_EXTENSIONS
} = await import('../storage.js');

// The local driver reads/writes under <repo>/uploads. Test files go in
// uploads/audio, which is git-ignored, under uuid names the app itself
// generates (they are cleaned up afterwards, same as storage.local.test.js
// conventions elsewhere in this repo).
const UPLOADS_ROOT = fileURLToPath(new URL('../../../uploads', import.meta.url));
const AUDIO_DIR = path.join(UPLOADS_ROOT, 'audio');

const WAV_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]), // chunk size (arbitrary)
  Buffer.from('WAVE', 'ascii'),
  Buffer.from('fmt sample data......', 'ascii')
]);
const OGG_BYTES = Buffer.concat([Buffer.from('OggS', 'ascii'), Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])]);
const WEBM_BYTES = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('some webm-ish payload')]);
const HTML_BYTES = Buffer.from('<html><body><script>alert(document.cookie)</script></body></html>', 'utf-8');

describe('SAFE_AUDIO_EXTENSIONS / safeAudioExtension (local driver)', () => {
  test('maps every allowed audio mimetype to a fixed, safe extension', () => {
    expect(SAFE_AUDIO_EXTENSIONS).toEqual({
      'audio/wav': '.wav',
      'audio/wave': '.wav',
      'audio/x-wav': '.wav',
      'audio/webm': '.webm',
      'audio/ogg': '.ogg'
    });
  });

  test('never derives the extension from file.originalname', () => {
    expect(safeAudioExtension({ mimetype: 'audio/wav', originalname: 'evil.html' })).toBe('.wav');
    expect(safeAudioExtension({ mimetype: 'audio/ogg', originalname: 'x.exe' })).toBe('.ogg');
    expect(safeAudioExtension({ mimetype: 'audio/webm', originalname: 'no-extension-at-all' })).toBe('.webm');
  });

  test('falls back to a safe, non-executable default for an unrecognised mimetype', () => {
    expect(safeAudioExtension({ mimetype: 'text/html', originalname: 'evil.html' })).toBe('.bin');
    expect(safeAudioExtension({ mimetype: undefined, originalname: 'x.wav' })).toBe('.bin');
  });
});

describe('isValidAudioSignature', () => {
  test('accepts a real WAV (RIFF....WAVE) for every WAV mimetype alias', () => {
    for (const mimetype of ['audio/wav', 'audio/wave', 'audio/x-wav']) {
      expect(isValidAudioSignature(mimetype, WAV_BYTES)).toBe(true);
    }
  });

  test('accepts a real OGG (OggS) for audio/ogg', () => {
    expect(isValidAudioSignature('audio/ogg', OGG_BYTES)).toBe(true);
  });

  test('accepts a real WebM (EBML header) for audio/webm', () => {
    expect(isValidAudioSignature('audio/webm', WEBM_BYTES)).toBe(true);
  });

  test('rejects HTML content regardless of the declared mimetype', () => {
    expect(isValidAudioSignature('audio/wav', HTML_BYTES)).toBe(false);
    expect(isValidAudioSignature('audio/ogg', HTML_BYTES)).toBe(false);
    expect(isValidAudioSignature('audio/webm', HTML_BYTES)).toBe(false);
  });

  test('rejects a signature that does not match the declared mimetype (cross-format)', () => {
    expect(isValidAudioSignature('audio/wav', OGG_BYTES)).toBe(false);
    expect(isValidAudioSignature('audio/ogg', WAV_BYTES)).toBe(false);
    expect(isValidAudioSignature('audio/webm', WAV_BYTES)).toBe(false);
  });

  test('rejects an unsupported/unknown mimetype outright', () => {
    expect(isValidAudioSignature('text/html', WAV_BYTES)).toBe(false);
    expect(isValidAudioSignature('application/octet-stream', WAV_BYTES)).toBe(false);
  });

  test.each([
    [Buffer.alloc(0)],
    [Buffer.from([0x52])],
    [Buffer.from('RIFF')],
    [Buffer.from('RIFFxxxx')] // 8 bytes: has RIFF but too short to hold the WAVE marker
  ])('does not crash on a short/truncated buffer (%p) — treated as a mismatch', (buffer) => {
    expect(() => isValidAudioSignature('audio/wav', buffer)).not.toThrow();
    expect(isValidAudioSignature('audio/wav', buffer)).toBe(false);
  });

  test('non-buffer input is treated as a mismatch, not a crash', () => {
    expect(isValidAudioSignature('audio/wav', undefined)).toBe(false);
    expect(isValidAudioSignature('audio/wav', null)).toBe(false);
  });
});

describe('readMagicBytes (local driver)', () => {
  const files = [];
  const write = async (bytes) => {
    await fs.mkdir(AUDIO_DIR, { recursive: true });
    const name = `magic-bytes-test-${Math.random().toString(36).slice(2)}.bin`;
    const filePath = path.join(AUDIO_DIR, name);
    await fs.writeFile(filePath, bytes);
    files.push(filePath);
    return `audio/${name}`;
  };

  afterAll(async () => {
    await Promise.all(files.map((f) => fs.rm(f, { force: true })));
  });

  test('reads exactly the first 16 bytes of a longer file', async () => {
    const bytes = Buffer.concat([WAV_BYTES, Buffer.alloc(1000, 0xff)]);
    const key = await write(bytes);

    const result = await readMagicBytes(key);

    expect(result.length).toBe(16);
    expect(result.equals(bytes.subarray(0, 16))).toBe(true);
  });

  test('a custom length is honoured', async () => {
    const key = await write(WAV_BYTES);

    const result = await readMagicBytes(key, 4);

    expect(result.equals(Buffer.from('RIFF', 'ascii'))).toBe(true);
  });

  test('a file shorter than the requested length returns only the bytes that exist, without throwing', async () => {
    const tiny = Buffer.from([0x52, 0x49]); // 2 bytes
    const key = await write(tiny);

    const result = await readMagicBytes(key, 16);

    expect(result.length).toBe(2);
    expect(result.equals(tiny)).toBe(true);
  });

  test('reading never buffers or reads past the requested length', async () => {
    const bytes = Buffer.alloc(200000, 0x41); // 200KB
    const key = await write(bytes);

    const result = await readMagicBytes(key, 16);

    expect(result.length).toBe(16);
  });
});

describe('extension safety end-to-end through the real multer/diskStorage wiring', () => {
  const savedKeys = [];

  const buildApp = (fileFilter) => {
    const upload = createUploadMiddleware({ subdir: 'audio', maxFileSize: 1024 * 1024, fileFilter });
    const app = express();
    app.post('/upload', upload.single('audio'), (req, res) => {
      savedKeys.push(req.file.storageKey);
      res.json({ storageKey: req.file.storageKey, mimetype: req.file.mimetype, originalname: req.file.originalname });
    });
    app.use((err, req, res, next) => {
      res.status(400).json({ error: err.message });
    });
    return app;
  };

  const acceptAll = (req, file, cb) => cb(null, true);

  afterAll(async () => {
    await Promise.all(savedKeys.map((key) => deleteStoredFile(key)));
  });

  test('a file named evil.html with mimetype audio/wav is stored with a .wav extension, never .html', async () => {
    const app = buildApp(acceptAll);

    const res = await request(app)
      .post('/upload')
      .attach('audio', WAV_BYTES, { filename: 'evil.html', contentType: 'audio/wav' });

    expect(res.status).toBe(200);
    expect(res.body.storageKey).toMatch(/\.wav$/);
    expect(res.body.storageKey).not.toMatch(/\.html/);

    const onDisk = await fs.readFile(path.join(UPLOADS_ROOT, res.body.storageKey));
    expect(onDisk.equals(WAV_BYTES)).toBe(true);
  });

  test('a file named x.mp3 with mimetype audio/ogg is stored with a .ogg extension', async () => {
    const app = buildApp(acceptAll);

    const res = await request(app)
      .post('/upload')
      .attach('audio', OGG_BYTES, { filename: 'x.mp3', contentType: 'audio/ogg' });

    expect(res.status).toBe(200);
    expect(res.body.storageKey).toMatch(/\.ogg$/);
  });

  test('a file with no extension in its name and mimetype audio/webm is stored with a .webm extension', async () => {
    const app = buildApp(acceptAll);

    const res = await request(app)
      .post('/upload')
      .attach('audio', WEBM_BYTES, { filename: 'no-extension', contentType: 'audio/webm' });

    expect(res.status).toBe(200);
    expect(res.body.storageKey).toMatch(/\.webm$/);
  });
});
