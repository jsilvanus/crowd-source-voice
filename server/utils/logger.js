import pino from 'pino';

// Structured logging. Never log PII (email, password, tokens, recording/corpus
// content) — only IDs, UUID storage keys, HTTP method/route/status, and error
// messages/stacks. The redact list below is a safety net, not the primary
// guard: call sites must not pass PII into log calls in the first place.
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.email',
      '*.token',
      '*.jwt'
    ],
    censor: '[Redacted]'
  },
  transport: process.env.NODE_ENV === 'production'
    ? undefined
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
});

export default logger;
