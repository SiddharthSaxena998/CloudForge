/**
 * Phase 0 security helpers: env validation, CORS allow-list, helmet, rate limits.
 * Everything is configurable through .env (see .env.example).
 */
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
];

const allowedOrigins = () =>
  process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;

/** Used by both Express (cors) and Socket.IO. */
const isOriginAllowed = (origin) => {
  if (!origin) return true; // curl / Postman / server-to-server
  const list = allowedOrigins();
  return list.includes('*') || list.includes(origin);
};

const corsOptions = {
  origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
};

/** Fail fast with a helpful message instead of crashing later. */
function validateEnv() {
  const problems = [];

  if (!process.env.MONGO_URI) problems.push('MONGO_URI is missing');

  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 16) {
    problems.push(
      'JWT_SECRET is missing or too short (need 16+ chars). Generate one with:\n' +
        '    node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  if (problems.length) {
    console.error('\nConfiguration error in Backend/.env:\n  - ' + problems.join('\n  - ') + '\n');
    process.exit(1);
  }
}

const json429 = (message) => (req, res) => res.status(429).json({ message });

const limiter = (windowMs, max, message, extra = {}) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: json429(message),
    ...extra,
  });

// Brute-force protection for login/register
const authLimiter = limiter(
  15 * 60 * 1000,
  Number(process.env.AUTH_RATE_LIMIT) || 20,
  'Too many login attempts. Please try again in 15 minutes.',
  { skipSuccessfulRequests: true }
);

// General API limiter (per IP)
const apiLimiter = limiter(
  60 * 1000,
  Number(process.env.API_RATE_LIMIT) || 300,
  'Too many requests. Please slow down.'
);

// Expensive actions: deploy / project creation (uploads + git clone)
const heavyLimiter = limiter(
  10 * 60 * 1000,
  Number(process.env.DEPLOY_RATE_LIMIT) || 30,
  'Too many deploy/create requests. Please wait a few minutes.'
);

function applySecurity(app) {
  // Behind Cloudflare Tunnel / Nginx set TRUST_PROXY=1 so rate limits see real IPs
  if (process.env.TRUST_PROXY) {
    app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
  }
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors(corsOptions));
}

module.exports = {
  validateEnv,
  applySecurity,
  isOriginAllowed,
  authLimiter,
  apiLimiter,
  heavyLimiter,
};
