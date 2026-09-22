import crypto from 'crypto';
import { authenticate, requireAdmin } from './auth.js';

const BEARER_PREFIX = 'Bearer ';

const digest = (value) => crypto.createHash('sha256').update(value).digest();

/**
 * True when the Authorization header carries the configured EXPORT_API_TOKEN.
 * Off (always false) when EXPORT_API_TOKEN is unset/empty.
 *
 * Both sides are hashed to fixed-length digests first, so timingSafeEqual always
 * gets equal-length buffers and the comparison does not leak the token length.
 * The token is read at call time so it can be rotated by restarting with a new env
 * value and so tests can set it per case.
 */
export const matchesExportToken = (authHeader, expected = process.env.EXPORT_API_TOKEN) => {
  if (typeof expected !== 'string' || expected === '') return false;
  if (typeof authHeader !== 'string' || !authHeader.startsWith(BEARER_PREFIX)) return false;

  const provided = authHeader.slice(BEARER_PREFIX.length);
  return crypto.timingSafeEqual(digest(provided), digest(expected));
};

/**
 * Auth for the read-only export GET routes ONLY (/api/export, /manifest, /stats and
 * /audio/:recordingId).
 *
 * Accepts the long-lived EXPORT_API_TOKEN, or falls through to the existing
 * admin JWT path (authenticate + requireAdmin) unchanged. The token is not a JWT, so
 * it is useless to authenticate()/requireAdmin() on every other route. Do not apply
 * this middleware to anything that writes or returns non-export data.
 *
 * Least privilege: token-authenticated requests are marked with req.exportTokenAuth = true
 * so route handlers can restrict them to the validated export (e.g. deny include_all).
 * The mark is set only here, from the server-side token comparison; it is reset to false
 * first, so it is never true on the JWT path and never derived from headers or query.
 */
export const authenticateExportRead = (req, res, next) => {
  req.exportTokenAuth = false;

  if (matchesExportToken(req.headers.authorization)) {
    req.exportTokenAuth = true;
    return next();
  }

  authenticate(req, res, (err) => {
    if (err) return next(err);
    requireAdmin(req, res, next);
  });
};
