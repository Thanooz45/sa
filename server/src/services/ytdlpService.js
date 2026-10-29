import { execFile, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';
import { safeDelete, sanitizeFilename } from './cleanupService.js';

let activeDownloadsCount = 0;

/**
 * Parse JSON safely from yt-dlp stdout
 * @param {string} stdout 
 * @returns {any}
 */
function parseYtDlpJson(stdout) {
  const startIdx = stdout.indexOf('{');
  const endIdx = stdout.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('No valid JSON found in output');
  }
  return JSON.parse(stdout.substring(startIdx, endIdx + 1));
}

/**
 * Format video resolution string
 * @param {any} f 
 * @returns {string}
 */
function getFormatResolution(f) {
  if (f.height) {
    return `${f.height}p`;
  }
  if (f.resolution && f.resolution !== 'unknown') {
    return f.resolution;
  }
  return 'Standard';
}

/**
 * Extracts and filters available video formats
 * @param {any} rawInfo 
 * @returns {{ formats: Array<any>, downloadAvailable: boolean }}
 */
function extractFormats(rawInfo) {
  const formatsList = [];
  const rawFormats = Array.isArray(rawInfo.formats) ? rawInfo.formats : [];

  // Filter video formats (ignore pure audio unless no video available)
  for (const f of rawFormats) {
    // Skip manifest-only, drm, or storyboards
    if (f.vcodec === 'none' && f.acodec !== 'none') {
      // Audio only, skip for video downloader unless wanted
      continue;
    }
    if (f.format_note && f.format_note.toLowerCase().includes('storyboard')) {
      continue;
    }

    const ext = f.ext || f.video_ext || 'mp4';
    const resolution = getFormatResolution(f);
    let filesize = f.filesize || f.filesize_approx || null;

    // Calculate estimated size from bitrate and duration if missing
    if (!filesize && rawInfo.duration) {
      const bitrateKbps = f.tbr || ((f.vbr || 0) + (f.abr || 0));
      if (bitrateKbps && bitrateKbps > 0) {
        filesize = Math.round((bitrateKbps * 1000 / 8) * rawInfo.duration);
      }
    }

    const formatId = String(f.format_id);

    formatsList.push({
      formatId,
      extension: ext,
      resolution,
      filesize,
      note: f.format_note || f.format || ''
    });
  }

  // If no detailed formats list, but video is available
  if (formatsList.length === 0 && rawInfo.url) {
    formatsList.push({
      formatId: 'best',
      extension: rawInfo.ext || 'mp4',
      resolution: rawInfo.height ? `${rawInfo.height}p` : 'Default',
      filesize: rawInfo.filesize || null,
      note: 'Default stream'
    });
  }

  const downloadAvailable = formatsList.length > 0;
  return { formats: formatsList, downloadAvailable };
}

/**
 * Map yt-dlp stderr/errors to AppError
 * @param {Error} err 
 * @param {string} stderr 
 * @returns {AppError}
 */
function mapYtDlpError(err, stderr = '') {
  const msg = (stderr + ' ' + (err.message || '')).toLowerCase();

  if (msg.includes('timed out') || err.code === 'ETIMEDOUT') {
    return new AppError('TIMEOUT', 408, stderr);
  }
  if (
    msg.includes('private video') ||
    msg.includes('sign in') ||
    msg.includes('login') ||
    msg.includes('drm') ||
    msg.includes('paywall') ||
    msg.includes('members-only') ||
    msg.includes('georestricted') ||
    msg.includes('requires authentication') ||
    msg.includes('age-restricted')
  ) {
    return new AppError('NO_PERMITTED_DOWNLOAD', 403, stderr);
  }
  if (
    msg.includes('video unavailable') ||
    msg.includes('not found') ||
    msg.includes('404') ||
    msg.includes('deleted') ||
    msg.includes('has been removed')
  ) {
    return new AppError('VIDEO_UNAVAILABLE', 404, stderr);
  }
  if (msg.includes('unsupported url') || msg.includes('no suitable extractor')) {
    return new AppError('UNSUPPORTED_SOURCE', 400, stderr);
  }
  if (msg.includes('unable to download webpage') || msg.includes('network')) {
    return new AppError('NETWORK_FAILURE', 502, stderr);
  }

  return new AppError('METADATA_FAILURE', 400, stderr || err.message);
}

/**
 * Inspect video URL and extract metadata
 * @param {string} videoUrl 
 * @param {string} sourceName 
 */
export async function analyzeWithYtDlp(videoUrl, sourceName) {
  const args = [
    '-J',
    '--no-warnings',
    '--no-playlist',
    '--socket-timeout', '15',
    '--ffmpeg-location', config.FFMPEG_PATH,
    videoUrl
  ];

  return new Promise((resolve, reject) => {
    execFile(
      config.YTDLP_PATH,
      args,
      {
        timeout: config.EXTRACTION_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024
      },
      (err, stdout, stderr) => {
        if (err) {
          return reject(mapYtDlpError(err, stderr));
        }

        try {
          const rawInfo = parseYtDlpJson(stdout);
          const { formats, downloadAvailable } = extractFormats(rawInfo);

          resolve({
            success: true,
            source: sourceName,
            title: rawInfo.title || 'Untitled Video',
            duration: rawInfo.duration || null,
            thumbnail: rawInfo.thumbnail || null,
            downloadAvailable,
            formats
          });
        } catch (parseErr) {
          reject(new AppError('METADATA_FAILURE', 500, parseErr.message));
        }
      }
    );
  });
}

/**
 * Downloads a video using yt-dlp and streams the resulting file to the client response
 * @param {string} videoUrl 
 * @param {string} formatId 
 * @param {import('express').Response} res 
 */
export async function downloadWithYtDlp(videoUrl, formatId, res) {
  if (activeDownloadsCount >= config.MAX_CONCURRENT_DOWNLOADS) {
    throw new AppError('TEMPORARY_SOURCE_FAILURE', 429, 'Maximum concurrent downloads reached');
  }

  activeDownloadsCount++;

  const jobUuid = crypto.randomUUID();
  const jobDir = path.join(config.TEMP_DIR, jobUuid);
  fs.mkdirSync(jobDir, { recursive: true });

  const outputTemplate = path.join(jobDir, '%(title).100s-%(id)s.%(ext)s');

  const args = [
    '--no-warnings',
    '--no-playlist',
    '--ffmpeg-location', config.FFMPEG_PATH,
    '--max-filesize', `${config.MAX_DOWNLOAD_SIZE_BYTES}`,
    '--concurrent-fragments', `${config.YTDLP_CONCURRENT_FRAGMENTS}`,
    '--socket-timeout', '20',
    '--output', outputTemplate
  ];

  if (formatId && formatId !== 'best' && formatId !== 'direct') {
    args.push('-f', `${formatId}`);
  } else {
    args.push('-f', 'bestvideo+bestaudio/best');
  }

  args.push(videoUrl);

  let aborted = false;

  const cleanup = () => {
    activeDownloadsCount = Math.max(0, activeDownloadsCount - 1);
    safeDelete(jobDir);
  };

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(config.YTDLP_PATH, args, {
        shell: false,
        timeout: config.DOWNLOAD_TIMEOUT_MS
      });

      let stderr = '';

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        if (!aborted) reject(mapYtDlpError(err, stderr));
      });

      child.on('close', (code) => {
        if (aborted) {
          cleanup();
          return;
        }
        if (code !== 0) {
          if (stderr.toLowerCase().includes('file is larger than max-filesize')) {
            return reject(new AppError('FILE_TOO_LARGE', 413, stderr));
          }
          return reject(mapYtDlpError(new Error(`Exit code ${code}`), stderr));
        }
        resolve(true);
      });

      // Handle client disconnect
      res.on('close', () => {
        if (!res.writableEnded) {
          aborted = true;
          try {
            child.kill('SIGKILL');
          } catch (e) {
            // ignore
          }
          cleanup();
        }
      });
    });

    // Locate the downloaded file in jobDir
    const files = fs.readdirSync(jobDir);
    if (files.length === 0) {
      throw new AppError('DOWNLOAD_INTERRUPTED', 500, 'Downloaded file not found in job directory');
    }

    const downloadedFileName = files[0];
    const fullFilePath = path.join(jobDir, downloadedFileName);
    const stat = fs.statSync(fullFilePath);

    if (stat.size > config.MAX_DOWNLOAD_SIZE_BYTES) {
      throw new AppError('FILE_TOO_LARGE', 413, 'File exceeds size limit');
    }

    const safeFilename = sanitizeFilename(downloadedFileName, 'video.mp4');
    const ext = path.extname(safeFilename).toLowerCase();
    const mimeMap = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.ogv': 'video/ogg'
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

    const readStream = fs.createReadStream(fullFilePath);
    readStream.pipe(res);

    readStream.on('end', () => {
      cleanup();
    });

    readStream.on('error', (err) => {
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'The download did not complete.' });
      }
    });

  } catch (err) {
    cleanup();
    throw err;
  }
}
