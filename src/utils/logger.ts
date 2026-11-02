import { pino } from 'pino'

// one json object per line on stdout, always; pnpm dev pipes it through pino-pretty to make it readable. docker keeps it
// (rotated by daemon.json, see setup-vps.sh) and any log tool can filter on a field (level, reqId, userId, route)
// instead of grepping free text.
// redact is a backstop: the request logger already writes an allow-list of fields, so a secret only reaches these
// paths if someone logs a whole body, headers object or user row by mistake
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // "warn", not pino's default 40: readable in docker compose logs, and what loki, datadog and opentelemetry expect
  formatters: {
    level: (label) => ({level: label}),
  },
  redact: {
    paths: [
      'password', 'currentPassword', 'newPassword', 'token', 'accessToken', 'refreshToken',
      '*.password', '*.currentPassword', '*.newPassword', '*.token', '*.accessToken', '*.refreshToken',
      'headers.cookie', 'headers.authorization', '*.headers.cookie', '*.headers.authorization',
      'body', '*.body',
    ],
    censor: '[redacted]',
  },
})
