require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reportRoutes = require('./routes/reportRoutes');
const { initCron } = require('./services/cronService');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable reverse proxy trust for deployments behind Render / proxies (for secure cookies and accurate rate limiting)
app.set('trust proxy', 1);

// CORS configuration supporting Vercel frontend deployments and local dev
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://localhost:4173'
].filter(Boolean).map(o => o.trim().replace(/\/+$/, '').toLowerCase());

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server, curl, Postman or same-origin requests where origin is not set
    if (!origin) return callback(null, true);

    const lowerOrigin = origin.toLowerCase().trim().replace(/\/+$/, '');
    const isExplicitlyAllowed = allowedOrigins.includes(lowerOrigin);
    const isVercelOrigin = /^https:\/\/.*\.vercel\.app$/.test(lowerOrigin);
    const isDev = process.env.NODE_ENV !== 'production';

    if (isExplicitlyAllowed || isVercelOrigin || isDev) {
      return callback(null, origin);
    }

    // Default allow with origin reflection for cross-origin client access
    return callback(null, origin);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

// Rate limiting (generous for personal household use)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// Request parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded product images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    application: 'Expiry Reminder API',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);

// 404 Route Handler for unmatched API calls
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API route not found'
  });
});

// Serve frontend production build if available
const frontendDist = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendDist));
app.get('*', (req, res, next) => {
  const indexPath = path.join(frontendDist, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Application Error:', err);
  return res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` 🚀 Expiry Reminder Server running on port ${PORT}`);
  console.log(` 🌐 Health check: http://localhost:${PORT}/api/health`);
  console.log(`===============================================`);

  // Initialize background cron scheduler
  initCron();
});
