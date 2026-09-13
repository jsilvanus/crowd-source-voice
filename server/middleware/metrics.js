import { httpRequestDuration } from '../utils/metrics.js';

/**
 * Records request duration per method/route/status. Uses the matched Express
 * route pattern (not the raw URL) as the label so IDs in the path don't blow
 * up metric cardinality.
 */
export function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;

    httpRequestDuration
      .labels(req.method, route, String(res.statusCode))
      .observe(durationSeconds);
  });

  next();
}

export default metricsMiddleware;
