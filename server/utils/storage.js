import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_ROOT = path.join(__dirname, '../../uploads');
const DRIVER = process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local';
const SIGNED_URL_TTL_SECONDS = 15 * 60;

// The ONLY source of truth for what extension a stored audio file gets.
// Client-controlled input (file.originalname, and therefore path.extname of
// it) must never influence the stored key or extension: a forged
// Content-Type/extension pairing (e.g. an HTML file named "x.wav", or named
// "x.html" with a forged audio Content-Type) must not be able to make it to
// disk/S3 with a browser-executable extension. The extension is derived only
// from the file's (fileFilter-verified) mimetype.
export const SAFE_AUDIO_EXTENSIONS = {
  'audio/wav': '.wav',
  'audio/wave': '.wav',
  'audio/x-wav': '.wav',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg'
};

/**
 * Maps a multer file's (already fileFilter-verified) mimetype to a safe,
 * fixed extension. Never derived from file.originalname. The '.bin' fallback
 * is defensive only — every caller in this codebase runs behind a fileFilter
 * that already restricts mimetype to a SAFE_AUDIO_EXTENSIONS key, so it
 * should never actually be hit for audio uploads.
 */
export function safeAudioExtension(file) {
  return SAFE_AUDIO_EXTENSIONS[file.mimetype] || '.bin';
}

let s3Client;
function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.S3_REGION,
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: process.env.S3_ACCESS_KEY_ID
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
          }
        : undefined
    });
  }
  return s3Client;
}

function getBucket() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    throw new Error('S3_BUCKET must be set when STORAGE_DRIVER=s3');
  }
  return bucket;
}

/**
 * A minimal custom multer StorageEngine that streams uploads straight to S3
 * (via @aws-sdk/lib-storage) instead of buffering to a local temp file.
 */
class S3StorageEngine {
  constructor(subdir) {
    this.subdir = subdir;
  }

  _handleFile(req, file, cb) {
    const ext = safeAudioExtension(file);
    const key = `${this.subdir}/${uuidv4()}${ext}`;

    const upload = new Upload({
      client: getS3Client(),
      params: {
        Bucket: getBucket(),
        Key: key,
        Body: file.stream,
        ContentType: file.mimetype
      }
    });

    upload.done()
      .then(() => cb(null, { storageKey: key, size: undefined }))
      .catch(cb);
  }

  _removeFile(req, file, cb) {
    deleteStoredFile(file.storageKey).then(() => cb(null)).catch(cb);
  }
}

/**
 * Returns a configured multer instance for the given upload subdirectory
 * ('audio' or 'corpora'), driver-agnostic. Route code should read the
 * resulting key off `req.file.storageKey` rather than `req.file.path`.
 */
export function createUploadMiddleware({ subdir, maxFileSize, fileFilter }) {
  if (DRIVER === 's3') {
    return multer({
      storage: new S3StorageEngine(subdir),
      limits: { fileSize: maxFileSize },
      fileFilter
    });
  }

  const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadDir = path.join(UPLOADS_ROOT, subdir);
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const ext = safeAudioExtension(file);
      const filename = `${uuidv4()}${ext}`;
      cb(null, filename);
    }
  });

  return multer({
    storage: {
      _handleFile(req, file, cb) {
        storage._handleFile(req, file, (err, info) => {
          if (err) return cb(err);
          cb(null, { ...info, storageKey: `${subdir}/${info.filename}` });
        });
      },
      _removeFile(req, file, cb) {
        storage._removeFile(req, file, cb);
      }
    },
    limits: { fileSize: maxFileSize },
    fileFilter
  });
}

/** Deletes a previously stored file. Swallows "not found" errors. */
export async function deleteStoredFile(storageKey) {
  if (!storageKey) return;

  if (DRIVER === 's3') {
    try {
      await getS3Client().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: storageKey }));
    } catch {
      // best-effort cleanup, matches the existing fs.unlink().catch(() => {}) pattern
    }
    return;
  }

  await fs.unlink(path.join(UPLOADS_ROOT, storageKey)).catch(() => {});
}

/** Reads a stored file's content as UTF-8 text (used once, right after a corpus upload). */
export async function readStoredFile(storageKey) {
  if (DRIVER === 's3') {
    const response = await getS3Client().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: storageKey })
    );
    return response.Body.transformToString('utf-8');
  }

  return fs.readFile(path.join(UPLOADS_ROOT, storageKey), 'utf-8');
}

const LEGACY_KEY_PREFIX = '/uploads/';

function storageError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * Maps a stored key to an absolute path inside the uploads root, or returns null
 * when the key is not a safe relative path: empty, containing a NUL byte,
 * absolute (POSIX, Windows drive or UNC), or resolving outside the root
 * (`..` segments). A legacy leading `/uploads/` (rows written before storage
 * keys existed) is stripped first. `root` is a parameter for tests only.
 */
export function resolveUploadPath(storageKey, root = UPLOADS_ROOT) {
  if (typeof storageKey !== 'string' || storageKey === '' || storageKey.includes('\0')) {
    return null;
  }

  const key = storageKey.startsWith(LEGACY_KEY_PREFIX)
    ? storageKey.slice(LEGACY_KEY_PREFIX.length)
    : storageKey;
  if (key === '' || path.posix.isAbsolute(key) || path.win32.isAbsolute(key)) {
    return null;
  }

  const rootDir = path.resolve(root);
  const resolved = path.resolve(rootDir, key);
  const relative = path.relative(rootDir, resolved);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return resolved;
}

async function openLocalStream(filePath) {
  let handle;
  try {
    handle = await fs.open(filePath, 'r');
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw storageError('STORAGE_NOT_FOUND', 'Stored file not found');
    }
    // The stream owns the descriptor: autoClose releases it when the stream
    // ends, errors or is destroyed (e.g. the client hung up).
    return { stream: handle.createReadStream(), contentLength: stats.size };
  } catch (err) {
    await handle?.close().catch(() => {});
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR' || err.code === 'EISDIR') {
      throw storageError('STORAGE_NOT_FOUND', 'Stored file not found');
    }
    throw err;
  }
}

/**
 * Opens a stored file for streaming to a client, whichever driver is active.
 * Resolves `{ stream, contentLength }` where `stream` is a Node Readable the
 * caller must consume or destroy, and `contentLength` is undefined when unknown.
 *
 * Rejects with `err.code === 'STORAGE_NOT_FOUND'` when the file does not exist
 * (local ENOENT or S3 NoSuchKey) and `'INVALID_STORAGE_KEY'` when a local key
 * would resolve outside the uploads root. Any other error is unexpected and
 * may carry paths or bucket names in its message: do not send it to clients.
 *
 * Legacy `/uploads/...` keys always live on local disk (as with getFileUrl,
 * nothing was ever written to the bucket for them), so they are read from the
 * uploads root under either driver.
 */
export async function getFileStream(storageKey) {
  if (!storageKey) {
    throw storageError('STORAGE_NOT_FOUND', 'Stored file not found');
  }

  if (DRIVER === 's3' && !storageKey.startsWith(LEGACY_KEY_PREFIX)) {
    try {
      const response = await getS3Client().send(
        new GetObjectCommand({ Bucket: getBucket(), Key: storageKey })
      );
      const body = response.Body;
      return {
        stream: typeof body.pipe === 'function' ? body : Readable.fromWeb(body),
        contentLength: typeof response.ContentLength === 'number' ? response.ContentLength : undefined
      };
    } catch (err) {
      if (err?.name === 'NoSuchKey') {
        throw storageError('STORAGE_NOT_FOUND', 'Stored file not found');
      }
      throw err;
    }
  }

  const filePath = resolveUploadPath(storageKey);
  if (!filePath) {
    throw storageError('INVALID_STORAGE_KEY', 'Invalid storage key');
  }
  return openLocalStream(filePath);
}

/**
 * Reads just the first `length` bytes of a stored file — enough to check a
 * magic-byte signature without buffering or re-reading the whole upload.
 * Local: opens the file and reads a slice. S3: a ranged GetObject
 * (Range: bytes=0-<length-1>). Returns a Buffer that may be shorter than
 * `length` (never throws) when the stored file itself is smaller.
 */
export async function readMagicBytes(storageKey, length = 16) {
  if (DRIVER === 's3') {
    try {
      const response = await getS3Client().send(
        new GetObjectCommand({ Bucket: getBucket(), Key: storageKey, Range: `bytes=0-${length - 1}` })
      );
      return Buffer.from(await response.Body.transformToByteArray());
    } catch {
      // A store that ignores Range (or a zero-byte object) leaves us unable
      // to confirm a signature — treat that the same as "no valid signature".
      return Buffer.alloc(0);
    }
  }

  const handle = await fs.open(path.join(UPLOADS_ROOT, storageKey), 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

const WAV_MIME_TYPES = new Set(['audio/wav', 'audio/wave', 'audio/x-wav']);

/**
 * Checks the first bytes of a file against the magic-byte signature expected
 * for the declared (fileFilter-verified) mimetype. Never throws, including on
 * a buffer shorter than the signature it needs to check — that is simply
 * treated as a mismatch.
 *   WAV:   'RIFF' at bytes 0-3 and 'WAVE' at bytes 8-11
 *   OGG:   'OggS' at bytes 0-3
 *   WebM:  EBML header 0x1A 0x45 0xDF 0xA3 at bytes 0-3
 */
export function isValidAudioSignature(mimetype, buffer) {
  if (!Buffer.isBuffer(buffer)) return false;

  if (WAV_MIME_TYPES.has(mimetype)) {
    return buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WAVE';
  }

  if (mimetype === 'audio/ogg') {
    return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OggS';
  }

  if (mimetype === 'audio/webm') {
    return buffer.length >= 4 &&
      buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  }

  return false;
}

/**
 * Returns a URL the client can fetch the file from directly.
 * Local: a relative path served by the express.static /uploads mount.
 * S3: a short-lived presigned GET URL, computed fresh on every call.
 */
export async function getFileUrl(storageKey) {
  if (!storageKey) return storageKey;

  if (DRIVER === 'local') {
    return storageKey.startsWith('/uploads/') ? storageKey : `/uploads/${storageKey}`;
  }

  // Legacy rows written before the S3 migration store a local-style path;
  // there's nothing in the bucket for those, so return as-is.
  if (storageKey.startsWith('/uploads/')) {
    return storageKey;
  }

  const command = new GetObjectCommand({ Bucket: getBucket(), Key: storageKey });
  return getSignedUrl(getS3Client(), command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}

/** Resolves `row[field]` (a storage key) to a fetchable URL, for a single row. */
export async function attachFileUrl(row, field = 'file_path') {
  if (row && row[field]) {
    row[field] = await getFileUrl(row[field]);
  }
  return row;
}

/** Resolves `row[field]` on every row of an array, in place. */
export async function attachFileUrls(rows, field = 'file_path') {
  await Promise.all(rows.map((row) => attachFileUrl(row, field)));
  return rows;
}

export function isS3Driver() {
  return DRIVER === 's3';
}

export default {
  createUploadMiddleware,
  deleteStoredFile,
  readStoredFile,
  getFileStream,
  readMagicBytes,
  isValidAudioSignature,
  safeAudioExtension,
  SAFE_AUDIO_EXTENSIONS,
  getFileUrl,
  attachFileUrl,
  attachFileUrls,
  isS3Driver
};
