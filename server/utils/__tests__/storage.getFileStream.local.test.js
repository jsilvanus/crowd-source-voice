import { jest } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

// STORAGE_DRIVER is read when storage.js loads, so pin the local driver first.
process.env.STORAGE_DRIVER = 'local';

const { getFileStream, resolveUploadPath } = await import('../storage.js');

// The local driver reads from <repo>/uploads. Test files go in uploads/audio,
// which is git-ignored, under names that cannot collide with real uploads.
const UPLOADS_ROOT = fileURLToPath(new URL('../../../uploads', import.meta.url));
const AUDIO_DIR = path.join(UPLOADS_ROOT, 'audio');
const FILE_NAME = `storage-test-${randomUUID()}.wav`;
const FILE_PATH = path.join(AUDIO_DIR, FILE_NAME);
const FILE_BYTES = Buffer.from(Array.from({ length: 150000 }, (_, i) => (i * 7) % 256));

const readAll = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

describe('getFileStream (local driver)', () => {
  beforeAll(async () => {
    await fs.mkdir(AUDIO_DIR, { recursive: true });
    await fs.writeFile(FILE_PATH, FILE_BYTES);
  });

  afterAll(async () => {
    await fs.rm(FILE_PATH, { force: true });
  });

  test('streams the stored file: exact bytes and its size as contentLength', async () => {
    const { stream, contentLength } = await getFileStream(`audio/${FILE_NAME}`);

    expect(contentLength).toBe(FILE_BYTES.length);
    expect((await readAll(stream)).equals(FILE_BYTES)).toBe(true);
  });

  test('normalises a legacy leading /uploads/ to the same file', async () => {
    const { stream, contentLength } = await getFileStream(`/uploads/audio/${FILE_NAME}`);

    expect(contentLength).toBe(FILE_BYTES.length);
    expect((await readAll(stream)).equals(FILE_BYTES)).toBe(true);
  });

  test('a path that wanders but stays inside the root is fine', async () => {
    const { stream } = await getFileStream(`audio/../audio/${FILE_NAME}`);

    expect((await readAll(stream)).equals(FILE_BYTES)).toBe(true);
  });

  test('a missing file rejects with STORAGE_NOT_FOUND', async () => {
    await expect(getFileStream(`audio/${randomUUID()}.wav`)).rejects.toMatchObject({
      code: 'STORAGE_NOT_FOUND'
    });
    await expect(getFileStream(`/uploads/audio/${randomUUID()}.wav`)).rejects.toMatchObject({
      code: 'STORAGE_NOT_FOUND'
    });
  });

  test('a directory is not a file: STORAGE_NOT_FOUND', async () => {
    await expect(getFileStream('audio')).rejects.toMatchObject({ code: 'STORAGE_NOT_FOUND' });
  });

  test.each([undefined, null, ''])('an empty key (%p) rejects with STORAGE_NOT_FOUND', async (key) => {
    await expect(getFileStream(key)).rejects.toMatchObject({ code: 'STORAGE_NOT_FOUND' });
  });

  describe('path traversal', () => {
    // Targets that really exist outside the uploads root, so a bug would serve them.
    const repoPackageJson = path.resolve(UPLOADS_ROOT, '../package.json');

    test.each([
      ['parent directory', '../package.json'],
      ['two levels up', '../../package.json'],
      ['up from inside audio/', 'audio/../../package.json'],
      ['legacy prefix then up', '/uploads/../package.json'],
      ['legacy prefix then up from audio/', '/uploads/audio/../../package.json'],
      ['bare ..', '..'],
      ['legacy prefix then bare ..', '/uploads/..'],
      ['absolute POSIX path', '/etc/passwd'],
      ['legacy prefix then absolute path', '/uploads//etc/passwd'],
      ['Windows drive path', 'C:\\Windows\\win.ini'],
      ['Windows drive path with forward slashes', 'C:/Windows/win.ini'],
      ['UNC path', '\\\\server\\share\\x.wav'],
      ['NUL byte', `audio/${FILE_NAME}\0.txt`]
    ])('%s (%j) is rejected with INVALID_STORAGE_KEY', async (_label, key) => {
      await expect(getFileStream(key)).rejects.toMatchObject({ code: 'INVALID_STORAGE_KEY' });
    });

    test('an absolute path to a real file outside the root is rejected', async () => {
      await fs.access(repoPackageJson); // sanity: the target exists
      await expect(getFileStream(repoPackageJson)).rejects.toMatchObject({ code: 'INVALID_STORAGE_KEY' });
    });

    test('an absolute path to a real file INSIDE the root is still rejected (keys are relative)', async () => {
      await expect(getFileStream(FILE_PATH)).rejects.toMatchObject({ code: 'INVALID_STORAGE_KEY' });
    });

    test('a traversal that would reach a real file never yields a stream', async () => {
      await fs.access(repoPackageJson);
      let result;
      try {
        result = await getFileStream('../package.json');
      } catch {
        // expected
      }
      expect(result).toBeUndefined();
    });

    test('backslash traversal never escapes the root on any platform', async () => {
      // On Windows `..\` is a separator (rejected); on POSIX it is an odd but harmless file name (not found).
      await expect(getFileStream('..\\package.json')).rejects.toMatchObject({
        code: expect.stringMatching(/^(INVALID_STORAGE_KEY|STORAGE_NOT_FOUND)$/)
      });
    });
  });

  describe('stream lifecycle', () => {
    test('destroying the stream releases the file (it can be deleted afterwards, even on Windows)', async () => {
      const name = `storage-test-${randomUUID()}.wav`;
      const filePath = path.join(AUDIO_DIR, name);
      await fs.writeFile(filePath, FILE_BYTES);

      const { stream } = await getFileStream(`audio/${name}`);
      await new Promise((resolve) => {
        stream.once('data', () => {
          stream.once('close', resolve);
          stream.destroy();
        });
      });

      await expect(fs.unlink(filePath)).resolves.toBeUndefined();
    });

    test('a fully read stream releases the file too', async () => {
      const name = `storage-test-${randomUUID()}.wav`;
      const filePath = path.join(AUDIO_DIR, name);
      await fs.writeFile(filePath, FILE_BYTES);

      const { stream } = await getFileStream(`audio/${name}`);
      await readAll(stream);
      await new Promise((resolve) => (stream.closed ? resolve() : stream.once('close', resolve)));

      await expect(fs.unlink(filePath)).resolves.toBeUndefined();
    });
  });
});

describe('resolveUploadPath', () => {
  const root = path.join(os.tmpdir(), 'csv-uploads-root');

  test('resolves a storage key inside the root', () => {
    expect(resolveUploadPath('audio/x.wav', root)).toBe(path.join(root, 'audio', 'x.wav'));
  });

  test('normalises a legacy /uploads/ prefix', () => {
    expect(resolveUploadPath('/uploads/audio/x.wav', root)).toBe(path.join(root, 'audio', 'x.wav'));
    expect(resolveUploadPath('/uploads/audio/x.wav', root)).toBe(resolveUploadPath('audio/x.wav', root));
  });

  test('only strips the legacy prefix once and only at the start', () => {
    expect(resolveUploadPath('uploads/audio/x.wav', root)).toBe(path.join(root, 'uploads', 'audio', 'x.wav'));
    expect(resolveUploadPath('/uploads/uploads/x.wav', root)).toBe(path.join(root, 'uploads', 'x.wav'));
  });

  test.each([
    [undefined],
    [null],
    [42],
    [''],
    ['.'],
    ['/uploads/'],
    ['/uploads/.'],
    ['..'],
    ['../x'],
    ['audio/../../x'],
    ['/uploads/../x'],
    ['/etc/passwd'],
    ['/uploads//etc/passwd'],
    ['C:\\x'],
    ['\\\\host\\share\\x'],
    ['audio/x.wav\0']
  ])('returns null for %j', (key) => {
    expect(resolveUploadPath(key, root)).toBeNull();
  });

  test('a sibling directory that merely shares the root as a prefix is outside the root', () => {
    expect(resolveUploadPath('../csv-uploads-root-evil/x.wav', root)).toBeNull();
  });
});
