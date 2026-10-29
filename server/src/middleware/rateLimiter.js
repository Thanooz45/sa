import { config } from '../config.js';
import { ERROR_MESSAGES } from '../utils/errors.js';

const ipRequests = new Map();

// Periodic cleanup of rate limiter map
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRequests.entries()) {
    if (now - data.resetTime > config.RATE_LIMIT_WINDOW_MS) {
      ipRequests.delete(ip);
    }
  }
}, 60 * 1000);

/**
 * Basic in-memory rate limiter middleware
 */
export function rateLimiter(req, res, next) {
  // Allow health checks without rate limiting
  if (req.path === '/health') {
    return next();
  }

  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  let entry = ipRequests.get(clientIp);
  if (!entry || now - entry.resetTime > config.RATE_LIMIT_WINDOW_MS) {
    entry = { count: 1, resetTime: now };
    ipRequests.set(clientIp, entry);
    return next();
  }

  entry.count++;
  if (entry.count > config.RATE_LIMIT_MAX) {
    return res.status(429).json({
      success: false,
      error: ERROR_MESSAGES.TEMPORARY_SOURCE_FAILURE,
      errorCode: 'RATE_LIMIT_EXCEEDED'
    });
  }

  next();
}
