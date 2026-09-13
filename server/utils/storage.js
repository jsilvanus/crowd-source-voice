import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
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
    const ext = path.extname(file.originalname) || '';
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
      const ext = path.extname(file.originalname) || '';
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
  getFileUrl,
  attachFileUrl,
  attachFileUrls,
  isS3Driver
};
