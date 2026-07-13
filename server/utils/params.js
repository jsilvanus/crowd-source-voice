/**
 * Parse a route/query parameter as a positive integer ID.
 * Returns the number, or null if the value is not a valid ID
 * (so callers can respond 400 instead of letting Postgres throw).
 */
export function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}
