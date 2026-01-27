import { statfs } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIN_FREE_SPACE_MB = 200;
const MIN_FREE_SPACE_BYTES = MIN_FREE_SPACE_MB * 1024 * 1024;
const UPLOADS_PATH = path.join(__dirname, '../../uploads');

/**
 * Check available disk space on the uploads partition
 * @returns {Promise<{available: number, total: number, free: number}>} Space in bytes
 */
export async function getDiskSpace() {
  try {
    const stats = await statfs(UPLOADS_PATH);
    return {
      available: stats.bavail * stats.bsize,
      free: stats.bfree * stats.bsize,
      total: stats.blocks * stats.bsize
    };
  } catch (error) {
    // If uploads dir doesn't exist yet, check parent
    const stats = await statfs(path.dirname(UPLOADS_PATH));
    return {
      available: stats.bavail * stats.bsize,
      free: stats.bfree * stats.bsize,
      total: stats.blocks * stats.bsize
    };
  }
}

/**
 * Middleware to check disk space before allowing uploads
 * Rejects requests if free space is below threshold
 */
export function checkDiskSpace(req, res, next) {
  getDiskSpace()
    .then(space => {
      if (space.available < MIN_FREE_SPACE_BYTES) {
        const availableMB = Math.round(space.available / (1024 * 1024));
        return res.status(507).json({
          error: `Insufficient disk space. Only ${availableMB}MB available, minimum ${MIN_FREE_SPACE_MB}MB required.`,
          code: 'INSUFFICIENT_DISK_SPACE',
          available: space.available,
          required: MIN_FREE_SPACE_BYTES
        });
      }
      // Attach space info to request for potential use
      req.diskSpace = space;
      next();
    })
    .catch(error => {
      console.error('Disk space check failed:', error);
      // Allow request to proceed if check fails (fail open)
      next();
    });
}

/**
 * API endpoint to get current disk space status
 */
export async function getDiskSpaceStatus(req, res) {
  try {
    const space = await getDiskSpace();
    const availableMB = Math.round(space.available / (1024 * 1024));
    const totalMB = Math.round(space.total / (1024 * 1024));

    res.json({
      available: space.available,
      total: space.total,
      availableMB,
      totalMB,
      percentUsed: Math.round((1 - space.available / space.total) * 100),
      isLow: space.available < MIN_FREE_SPACE_BYTES,
      minRequiredMB: MIN_FREE_SPACE_MB
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check disk space' });
  }
}

export default checkDiskSpace;
