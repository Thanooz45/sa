import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';
import { safeDelete, sanitizeFilename } from './cleanupService.js';
import { validateVideoUrl } from '../security/urlValidator.js';
import { analyzeWithYtDlp } from './ytdlpService.js';

// Map of active download jobs
const activeJobs = new Map();

/**
 * Notify all SSE listeners of job updates
 * @param {any} job 
 */
function notifyListeners(job) {
  const payload = {
    jobId: job.id,
    stage: job.status,
    percent: job.percent,
    speed: job.speed,
    eta: job.eta,
    downloadedBytes: job.downloadedBytes,
    totalBytes: job.totalBytes,
    filename: job.filename,
    error: job.error
  };

  const message = `data: ${JSON.stringify(payload)}\n\n`;

  for (const client of job.listeners) {
    try {
      client.write(message);
    } catch {
      job.listeners.delete(client);
    }
  }
}

/**
 * Starts a background download job with real-time progress tracking
 * @param {string} videoUrl 
 * @param {string} formatId 
 * @returns {Promise<{ jobId: string }>}
 */
export async function startDownloadJob(videoUrl, formatId) {
  const validation = await validateVideoUrl(videoUrl);
  if (!validation.valid) {
    throw new AppError(validation.errorCode || 'INVALID_URL', 400);
  }

  const { source } = validation;
  if (source === 'unsupported') {
    throw new AppError('UNSUPPORTED_SOURCE', 400);
  }

  const jobId = crypto.randomUUID();
  const jobDir = path.join(config.TEMP_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const job = {
    id: jobId,
    jobDir,
    url: videoUrl,
    formatId: formatId || 'best',
    source,
    status: 'starting',
    percent: 0,
    speed: '0 B/s',
    eta: '--:--',
    downloadedBytes: 0,
    totalBytes: 0,
    filename: null,
    filePath: null,
    error: null,
    listeners: new Set(),
    createdAt: Date.now()
  };

  activeJobs.set(jobId, job);

  // Run download in background asynchronously
  processJob(job).catch((err) => {
    job.status = 'error';
    job.error = err.message || 'The download did not complete.';
    notifyListeners(job);
    safeDelete(job.jobDir);
  });

  return { jobId };
}

/**
 * Executes the download process (yt-dlp or direct stream) with live progress
 * @param {any} job 
 */
async function processJob(job) {
  if (job.source === 'direct') {
    await processDirectJob(job);
  } else {
    await processYtDlpJob(job);
  }
}

/**
 * Process direct video download with progress tracking
 * @param {any} job 
 */
async function processDirectJob(job) {
  job.status = 'downloading';
  notifyListeners(job);

  let currentUrl = job.url;
  let redirectsCount = 0;
  const maxRedirects = 5;

  while (redirectsCount <= maxRedirects) {
    const parsed = new URL(currentUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const streamResult = await new Promise((resolve, reject) => {
      const req = client.get(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        },
        timeout: config.DOWNLOAD_TIMEOUT_MS
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve({ isRedirect: true, location: res.headers.location });
        }

        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          return reject(new Error('The video could not be accessed.'));
        }

        let filename = path.basename(parsed.pathname) || 'video.mp4';
        if (res.headers['content-disposition']) {
          const match = res.headers['content-disposition'].match(/filename=["']?([^"';]+)["']?/i);
          if (match && match[1]) filename = match[1];
        }
        filename = sanitizeFilename(filename, 'video.mp4');

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        job.totalBytes = totalBytes;
        job.filename = filename;

        const outPath = path.join(job.jobDir, filename);
        job.filePath = outPath;
        const fileStream = fs.createWriteStream(outPath);

        let downloadedBytes = 0;
        let lastTime = Date.now();
        let bytesSinceLast = 0;

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          bytesSinceLast += chunk.length;
          job.downloadedBytes = downloadedBytes;

          const now = Date.now();
          if (now - lastTime >= 300) {
            const timeDelta = (now - lastTime) / 1000;
            const bytesPerSec = bytesSinceLast / timeDelta;
            const speedMb = (bytesPerSec / (1024 * 1024)).toFixed(1);
            job.speed = `${speedMb} MB/s`;

            if (totalBytes > 0) {
              job.percent = Math.min(99.9, Math.round((downloadedBytes / totalBytes) * 1000) / 10);
              const remainingBytes = totalBytes - downloadedBytes;
              const etaSec = Math.round(remainingBytes / (bytesPerSec || 1));
              job.eta = `${Math.floor(etaSec / 60)}:${(etaSec % 60).toString().padStart(2, '0')}`;
            }

            lastTime = now;
            bytesSinceLast = 0;
            notifyListeners(job);
          }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          job.percent = 100;
          job.status = 'completed';
          job.speed = '0 B/s';
          job.eta = '00:00';
          notifyListeners(job);
          resolve({ isRedirect: false });
        });

        res.on('error', (err) => reject(err));
        fileStream.on('error', (err) => reject(err));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('The request took too long. Please try again.'));
      });
      req.on('error', (err) => reject(err));
    });

    if (streamResult.isRedirect) {
      redirectsCount++;
      currentUrl = new URL(streamResult.location, currentUrl).href;
      continue;
    }

    return;
  }
}

/**
 * Process yt-dlp download with real-time stdout progress parsing
 * @param {any} job 
 */
async function processYtDlpJob(job) {
  job.status = 'downloading';
  notifyListeners(job);

  const outputTemplate = path.join(job.jobDir, '%(title).100s-%(id)s.%(ext)s');

  const args = [
    '--newline',
    '--progress-template', '%(progress._percent_str)s;%(progress._speed_str)s;%(progress._eta_str)s;%(progress.downloaded_bytes)s;%(progress.total_bytes)s',
    '--no-warnings',
    '--no-playlist',
    '--ffmpeg-location', config.FFMPEG_PATH,
    '--max-filesize', `${config.MAX_DOWNLOAD_SIZE_BYTES}`,
    '--concurrent-fragments', `${config.YTDLP_CONCURRENT_FRAGMENTS}`,
    '--socket-timeout', '20',
    '--output', outputTemplate
  ];

  if (job.formatId && job.formatId !== 'best' && job.formatId !== 'direct') {
    args.push('-f', `${job.formatId}`);
  } else {
    args.push('-f', 'bestvideo+bestaudio/best');
  }

  args.push(job.url);

  await new Promise((resolve, reject) => {
    const child = spawn(config.YTDLP_PATH, args, {
      shell: false,
      timeout: config.DOWNLOAD_TIMEOUT_MS
    });

    let stderr = '';

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.includes(';')) continue;
        const parts = line.split(';').map((s) => s.trim());
        if (parts.length >= 5) {
          const pct = parseFloat(parts[0].replace('%', ''));
          if (!isNaN(pct)) job.percent = pct;
          job.speed = parts[1] || job.speed;
          job.eta = parts[2] || job.eta;
          const dBytes = parseInt(parts[3] || '0', 10);
          if (!isNaN(dBytes) && dBytes > 0) job.downloadedBytes = dBytes;
          const tBytes = parseInt(parts[4] || '0', 10);
          if (!isNaN(tBytes) && tBytes > 0) job.totalBytes = tBytes;

          notifyListeners(job);
        }
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        if (stderr.toLowerCase().includes('connection reset by peer')) {
          return reject(new Error('The connection failed. Please retry. (Network / ISP connection reset)'));
        }
        return reject(new Error(stderr || `Download failed with exit code ${code}`));
      }
      resolve(true);
    });
  });

  // Find downloaded file
  const files = fs.readdirSync(job.jobDir);
  if (files.length === 0) {
    throw new Error('Downloaded file not found in job directory');
  }

  job.filename = sanitizeFilename(files[0], 'video.mp4');
  job.filePath = path.join(job.jobDir, files[0]);
  job.percent = 100;
  job.status = 'completed';
  job.speed = '0 B/s';
  job.eta = '00:00';
  notifyListeners(job);
}

/**
 * Handle SSE subscription for job progress
 * @param {string} jobId 
 * @param {import('express').Response} res 
 */
export function subscribeToJob(jobId, res) {
  const job = activeJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial state immediately
  const initialPayload = {
    jobId: job.id,
    stage: job.status,
    percent: job.percent,
    speed: job.speed,
    eta: job.eta,
    downloadedBytes: job.downloadedBytes,
    totalBytes: job.totalBytes,
    filename: job.filename,
    error: job.error
  };
  res.write(`data: ${JSON.stringify(initialPayload)}\n\n`);

  job.listeners.add(res);

  res.on('close', () => {
    job.listeners.delete(res);
  });
}

/**
 * Serves the prepared file and triggers cleanup
 * @param {string} jobId 
 * @param {import('express').Response} res 
 */
export function serveJobFile(jobId, res) {
  const job = activeJobs.get(jobId);
  if (!job || job.status !== 'completed' || !job.filePath || !fs.existsSync(job.filePath)) {
    return res.status(404).json({ success: false, error: 'File is not ready or has expired.' });
  }

  const stat = fs.statSync(job.filePath);
  const ext = path.extname(job.filename).toLowerCase();
  const mimeMap = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.ogv': 'video/ogg'
  };

  res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);

  const readStream = fs.createReadStream(job.filePath);
  readStream.pipe(res);

  readStream.on('end', () => {
    setTimeout(() => {
      safeDelete(job.jobDir);
      activeJobs.delete(jobId);
    }, 5000);
  });

  readStream.on('error', () => {
    safeDelete(job.jobDir);
    activeJobs.delete(jobId);
  });
}
