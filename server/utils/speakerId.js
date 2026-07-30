import crypto from 'crypto';

/**
 * Derives a stable, one-way per-contributor id from an email address so
 * dataset exports can support speaker-disjoint splitting without exposing
 * or storing the email itself. Salted so the id can't be recovered by
 * hashing/guessing known email addresses.
 */
export function computeSpeakerId(email, salt = process.env.SPEAKER_ID_SALT || '') {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const first = crypto.createHash('sha256').update(`${salt}:${normalized}`).digest('hex');
  return crypto.createHash('sha256').update(`${salt}:${first}`).digest('hex');
}
