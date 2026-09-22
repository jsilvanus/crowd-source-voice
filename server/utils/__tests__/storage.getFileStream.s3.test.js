import { jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { S3Client, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';

// STORAGE_DRIVER and the bucket are read when storage.js loads / on first use.
process.env.STORAGE_DRIVER = 's3';
process.env.S3_BUCKET = 'csv-test-bucket';
process.env.S3_REGION = 'us-east-1';

// No network: every S3 call goes through the (mocked) client's send().
const send = jest.spyOn(S3Client.prototype, 'send');

const { getFileStream } = await import('../storage.js');

const readAll = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

describe('getFileStream (s3 driver, mocked client)', () => {
  beforeEach(() => {
    send.mockReset();
  });

  afterAll(() => {
    send.mockRestore();
  });

  test('issues a GetObject for the key and returns the body stream and content length', async () => {
    const bytes = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256));
    send.mockResolvedValue({ Body: Readable.from([bytes], { objectMode: false }), ContentLength: bytes.length });

    const { stream, contentLength } = await getFileStream('audio/abc.wav');

    expect(send).toHaveBeenCalledTimes(1);
    const [command] = send.mock.calls[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: 'csv-test-bucket', Key: 'audio/abc.wav' });
    expect(contentLength).toBe(bytes.length);
    expect(typeof stream.pipe).toBe('function');
    expect((await readAll(stream)).equals(bytes)).toBe(true);
  });

  test('the body is returned as is when it already is a Node Readable', async () => {
    const body = Readable.from([Buffer.from('x')], { objectMode: false });
    send.mockResolvedValue({ Body: body, ContentLength: 1 });

    const { stream } = await getFileStream('audio/abc.wav');

    expect(stream).toBe(body);
  });

  test('a web ReadableStream body is converted to a Node Readable', async () => {
    const web = Readable.toWeb(Readable.from([Buffer.from('web body')], { objectMode: false }));
    send.mockResolvedValue({ Body: web, ContentLength: 8 });

    const { stream } = await getFileStream('audio/abc.wav');

    expect(typeof stream.pipe).toBe('function');
    expect((await readAll(stream)).toString()).toBe('web body');
  });

  test('contentLength is undefined when S3 does not report one', async () => {
    send.mockResolvedValue({ Body: Readable.from([Buffer.from('x')], { objectMode: false }) });

    const { contentLength } = await getFileStream('audio/abc.wav');

    expect(contentLength).toBeUndefined();
  });

  test('NoSuchKey rejects with STORAGE_NOT_FOUND', async () => {
    send.mockRejectedValue(new NoSuchKey({ message: 'The specified key does not exist.', $metadata: {} }));

    await expect(getFileStream('audio/gone.wav')).rejects.toMatchObject({ code: 'STORAGE_NOT_FOUND' });
  });

  test('the not-found error does not carry the bucket name or key', async () => {
    send.mockRejectedValue(new NoSuchKey({ message: 'no key csv-test-bucket/audio/gone.wav', $metadata: {} }));

    const error = await getFileStream('audio/gone.wav').catch((err) => err);

    expect(error.message).not.toContain('csv-test-bucket');
    expect(error.message).not.toContain('gone.wav');
  });

  test('other S3 errors are not mapped to not-found (they surface as unexpected)', async () => {
    const denied = Object.assign(new Error('Access Denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
    send.mockRejectedValue(denied);

    const error = await getFileStream('audio/abc.wav').catch((err) => err);

    expect(error).toBe(denied);
    expect(error.code).not.toBe('STORAGE_NOT_FOUND');
  });

  test('a missing bucket (404 but not NoSuchKey) is not reported as a missing recording', async () => {
    const noBucket = Object.assign(new Error('The specified bucket does not exist'), {
      name: 'NoSuchBucket',
      $metadata: { httpStatusCode: 404 }
    });
    send.mockRejectedValue(noBucket);

    const error = await getFileStream('audio/abc.wav').catch((err) => err);

    expect(error).toBe(noBucket);
  });

  test.each([undefined, null, ''])('an empty key (%p) rejects with STORAGE_NOT_FOUND without calling S3', async (key) => {
    await expect(getFileStream(key)).rejects.toMatchObject({ code: 'STORAGE_NOT_FOUND' });
    expect(send).not.toHaveBeenCalled();
  });

  describe('legacy /uploads/ keys', () => {
    // As with getFileUrl, nothing was ever written to the bucket for these: they
    // are local files, so they are read from the uploads root and S3 is not asked.
    const UPLOADS_ROOT = fileURLToPath(new URL('../../../uploads', import.meta.url));
    const AUDIO_DIR = path.join(UPLOADS_ROOT, 'audio');
    const FILE_NAME = `storage-s3-test-${randomUUID()}.wav`;
    const FILE_PATH = path.join(AUDIO_DIR, FILE_NAME);

    beforeAll(async () => {
      await fs.mkdir(AUDIO_DIR, { recursive: true });
      await fs.writeFile(FILE_PATH, 'legacy local bytes');
    });

    afterAll(async () => {
      await fs.rm(FILE_PATH, { force: true });
    });

    test('are served from local disk under the s3 driver, without an S3 request', async () => {
      const { stream, contentLength } = await getFileStream(`/uploads/audio/${FILE_NAME}`);

      expect(send).not.toHaveBeenCalled();
      expect(contentLength).toBe('legacy local bytes'.length);
      expect((await readAll(stream)).toString()).toBe('legacy local bytes');
    });

    test('a missing legacy file rejects with STORAGE_NOT_FOUND, still without an S3 request', async () => {
      await expect(getFileStream(`/uploads/audio/${randomUUID()}.wav`)).rejects.toMatchObject({
        code: 'STORAGE_NOT_FOUND'
      });
      expect(send).not.toHaveBeenCalled();
    });

    test('a legacy key cannot traverse out of the uploads root', async () => {
      await expect(getFileStream('/uploads/../package.json')).rejects.toMatchObject({
        code: 'INVALID_STORAGE_KEY'
      });
      expect(send).not.toHaveBeenCalled();
    });
  });
});
