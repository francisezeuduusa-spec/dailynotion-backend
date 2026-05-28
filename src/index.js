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

// ─────────────────────────────────────────────
// IMPORTANT: Stripe webhook needs raw body
// Mount it BEFORE express.json()
// ─────────────────────────────────────────────
app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  require('./routes/billing').webhook // handled inside billing.js
);

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again later.' }
});

app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

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
// Health check
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// 404 handler
// ─────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ─────────────────────────────────────────────
// Global error handler
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─────────────────────────────────────────────
// Start server + scheduler
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 DailyNotion backend running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Frontend URL: ${process.env.FRONTEND_URL}`);

  if (process.env.NODE_ENV !== 'test') {
    startScheduler();
  }
});

module.exports = app;
