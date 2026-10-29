import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import videoRoutes from './routes/videoRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { cleanOldTempFiles } from './services/cleanupService.js';

const app = express();

// Enable CORS
app.use(cors({
  origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing with size limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Apply rate limiter to /api
app.use('/api', rateLimiter);

// API routes
app.use('/api', videoRoutes);

// Root greeting / check
app.get('/', (req, res) => {
  res.json({
    name: 'Secret Agent API',
    status: 'running'
  });
});

// Central error handler
app.use(errorHandler);

// Schedule periodic temp directory cleanup every 15 minutes
setInterval(() => {
  cleanOldTempFiles();
}, 15 * 60 * 1000);

// Run initial cleanup on startup
cleanOldTempFiles();

// Start server
const server = app.listen(config.PORT, () => {
  console.log(`[Secret Agent Server] Listening on port ${config.PORT}`);
  console.log(`[yt-dlp] ${config.YTDLP_PATH}`);
  console.log(`[FFmpeg] ${config.FFMPEG_PATH}`);
  console.log(`[Temp Dir] ${config.TEMP_DIR}`);
});

export default app;
