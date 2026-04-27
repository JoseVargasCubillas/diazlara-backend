import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './config/logger';

const app: Express = express();

// ============================================================
// Security Middleware
// ============================================================

// Helmet: Set security HTTP headers
app.use(helmet());

// CORS Configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Rate Limiting: Prevent spam on form submissions
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false,  // Disable the `X-RateLimit-*` headers
});

// Apply rate limiter to specific routes
app.use('/api/leads', limiter);

// ============================================================
// Body Parser & Request Logging
// ============================================================

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging middleware
app.use((_req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: _req.method,
      path: _req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: _req.ip,
    });
  });

  next();
});

// ============================================================
// Routes
// ============================================================

app.use('/api/leads', require('./routes/leads').default);
app.use('/api/sessions', require('./routes/sessions').default);
app.use('/api/availability', require('./routes/availability').default);
app.use('/api/appointments', require('./routes/appointments').default);
app.use('/api/qualifications', require('./routes/qualifications').default);
app.use('/api/admin', require('./routes/admin').default);
app.use('/api/webhooks', require('./routes/webhooks').default);

// ============================================================
// Health Check Endpoint
// ============================================================

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ============================================================
// 404 Handler
// ============================================================

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} does not exist`,
    path: req.path,
  });
});

// ============================================================
// Global Error Handler
// ============================================================

interface CustomError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
}

app.use((err: CustomError, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error({
    error: message,
    status,
    code: err.code,
    stack: err.stack,
    path: _req.path,
    method: _req.method,
  });

  res.status(status).json({
    error: status === 500 ? 'Internal Server Error' : message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

export default app;
