const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/error');
const { UPLOAD_ROOT } = require('./utils/storage');

const app = express();

const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // uploaded images are shown by the frontend origin
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_ROOT));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Ensure DB is connected on serverless cold starts (skip for /api/health)
if (process.env.NODE_ENV !== 'test') {
  app.use('/api', async (req, res, next) => {
    if (req.path === '/health') return next();
    try {
      if (mongoose.connection.readyState !== 1) await connectDB();
      next();
    } catch (err) {
      next(err);
    }
  });
}

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
