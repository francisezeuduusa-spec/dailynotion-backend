require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const googleAuthRoutes = require('./routes/googleAuth');
const billingRoutes = require('./routes/billing');
const notionRoutes = require('./routes/notion');
const templateRoutes = require('./routes/templates');
const scheduleRoutes = require('./routes/schedule');
const journalRoutes = require('./routes/journal');
const onboardingRoutes = require('./routes/onboarding');
const { startScheduler } = require('./jobs/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────────
// Stripe webhook needs raw body — mount BEFORE express.json()
// ─────────────────────────────────────────────
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  require('./routes/billing').webhook
);

// ─────────────────────────────────────────────
// Security middleware
// ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

app.use(morgan(isProd ? 'combined' : 'dev'));

app.use(cors({
  origin: (origin, callback) => {
    const allowed = process.env.FRONTEND_URL || 'http://localhost:5173';
    // Allow requests with no origin (mobile apps, curl, Render health checks)
    if (!origin || origin === allowed) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─────────────────────────────────────────────
// Rate limiting
// General: 200 req / 15 min per IP
// Auth: 50 req / 15 min per IP (generous but still protected)
// ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please wait 15 minutes and try again.' }
});

app.use('/api/', limiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/login', authLimiter);

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/plans', billingRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/notion', notionRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/onboarding', onboardingRoutes);

// ─────────────────────────────────────────────
// Health check — used by Render
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ─────────────────────────────────────────────
// 404 handler
// ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─────────────────────────────────────────────
// Global error handler
// Never leak stack traces to the client in production
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (isProd) {
    // In production: log internally, return generic message
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} — ${err.message}`);
    return res.status(status).json({ error: 'Something went wrong. Please try again.' });
  }
  // In development: return full error for debugging
  console.error(err);
  return res.status(status).json({ error: err.message, stack: err.stack });
});

// ─────────────────────────────────────────────
// Catch unhandled promise rejections — don't crash the server
// ─────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error(`[${new Date().toISOString()}] Unhandled rejection:`, reason);
});

process.on('uncaughtException', (err) => {
  console.error(`[${new Date().toISOString()}] Uncaught exception:`, err.message);
  // Don't exit — Render will restart if truly broken
});

// ─────────────────────────────────────────────
// Start server + scheduler
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] DailyNotion backend started — port ${PORT} — ${process.env.NODE_ENV || 'development'}`);
  startScheduler();
});

module.exports = app;
