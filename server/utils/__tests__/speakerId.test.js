import { computeSpeakerId } from '../speakerId.js';

describe('computeSpeakerId', () => {
  test('returns null for missing email', () => {
    expect(computeSpeakerId(null)).toBeNull();
    expect(computeSpeakerId(undefined)).toBeNull();
    expect(computeSpeakerId('')).toBeNull();
  });

  test('is deterministic for the same email and salt', () => {
    const a = computeSpeakerId('singer@example.com', 'salt1');
    const b = computeSpeakerId('singer@example.com', 'salt1');
    expect(a).toBe(b);
  });

  test('is case- and whitespace-insensitive', () => {
    const a = computeSpeakerId('Singer@Example.com', 'salt1');
    const b = computeSpeakerId('  singer@example.com  ', 'salt1');
    expect(a).toBe(b);
  });

  test('differs across distinct emails', () => {
    const a = computeSpeakerId('singer@example.com', 'salt1');
    const b = computeSpeakerId('other@example.com', 'salt1');
    expect(a).not.toBe(b);
  });

  test('differs across distinct salts (salt actually used)', () => {
    const a = computeSpeakerId('singer@example.com', 'salt1');
    const b = computeSpeakerId('singer@example.com', 'salt2');
    expect(a).not.toBe(b);
  });

  test('does not embed the raw email in the output', () => {
    const email = 'singer@example.com';
    const id = computeSpeakerId(email, 'salt1');
    expect(id).not.toContain(email);
    expect(id).not.toContain('singer');
  });

  test('produces a hex sha256 digest', () => {
    const id = computeSpeakerId('singer@example.com', 'salt1');
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });
});
