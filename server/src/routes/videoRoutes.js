import express from 'express';
import fs from 'fs';
import { validateVideoUrl } from '../security/urlValidator.js';
import { analyzeDirectVideo, streamDirectDownload } from '../services/directVideoService.js';
import { analyzeWithYtDlp, downloadWithYtDlp } from '../services/ytdlpService.js';
import { startDownloadJob, subscribeToJob, serveJobFile } from '../services/jobService.js';
import { AppError } from '../utils/errors.js';
import { config } from '../config.js';

const router = express.Router();

/**
 * Health check endpoint
 * GET /api/health
 */
router.get('/health', (req, res) => {
  const ytdlpAvailable = fs.existsSync(config.YTDLP_PATH) || config.YTDLP_PATH === 'yt-dlp';
  const ffmpegAvailable = fs.existsSync(config.FFMPEG_PATH) || config.FFMPEG_PATH === 'ffmpeg';

  res.json({
    status: 'healthy',
    ytdlpAvailable,
    ffmpegAvailable
  });
});

/**
 * Analyze video URL
 * POST /api/video/analyze
 */
router.post('/video/analyze', async (req, res, next) => {
  try {
    const { url } = req.body || {};

    const validation = await validateVideoUrl(url);
    if (!validation.valid) {
      throw new AppError(validation.errorCode || 'INVALID_URL', 400);
    }

    const { source } = validation;

    if (source === 'unsupported') {
      throw new AppError('UNSUPPORTED_SOURCE', 400);
    }

    let result;
    if (source === 'direct') {
      try {
        result = await analyzeDirectVideo(url);
      } catch (directErr) {
        // Fallback to yt-dlp if direct HEAD probe failed but yt-dlp can handle it
        try {
          result = await analyzeWithYtDlp(url, 'direct');
        } catch {
          throw directErr;
        }
      }
    } else {
      // internet_archive, eporner, pornhub, xhamster
      result = await analyzeWithYtDlp(url, source);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Direct stream download (Standard endpoint)
 * POST /api/video/download
 */
router.post('/video/download', async (req, res, next) => {
  try {
    const { url, formatId } = req.body || {};

    const validation = await validateVideoUrl(url);
    if (!validation.valid) {
      throw new AppError(validation.errorCode || 'INVALID_URL', 400);
    }

    const { source } = validation;

    if (source === 'unsupported') {
      throw new AppError('UNSUPPORTED_SOURCE', 400);
    }

    if (source === 'direct') {
      await streamDirectDownload(url, res);
      return;
    }

    // internet_archive, eporner, pornhub, xhamster
    // Re-verify metadata and format eligibility
    const analysis = await analyzeWithYtDlp(url, source);
    if (!analysis.downloadAvailable || analysis.formats.length === 0) {
      throw new AppError('NO_PERMITTED_DOWNLOAD', 403);
    }

    // Validate formatId
    const targetFormatId = formatId || 'best';
    if (targetFormatId !== 'best') {
      const match = analysis.formats.some((f) => String(f.formatId) === String(targetFormatId));
      if (!match) {
        throw new AppError('UNSUPPORTED_FORMAT', 400);
      }
    }

    await downloadWithYtDlp(url, targetFormatId, res);
  } catch (err) {
    next(err);
  }
});

/**
 * Start a download job with real-time progress
 * POST /api/video/start-download
 */
router.post('/video/start-download', async (req, res, next) => {
  try {
    const { url, formatId } = req.body || {};
    const result = await startDownloadJob(url, formatId);
    res.json({ success: true, jobId: result.jobId });
  } catch (err) {
    next(err);
  }
});

/**
 * Server-Sent Events stream for real-time download progress
 * GET /api/video/job-progress/:jobId
 */
router.get('/video/job-progress/:jobId', (req, res) => {
  subscribeToJob(req.params.jobId, res);
});

/**
 * Get downloaded file when job is ready
 * GET /api/video/job-file/:jobId
 */
router.get('/video/job-file/:jobId', (req, res) => {
  serveJobFile(req.params.jobId, res);
});

export default router;
