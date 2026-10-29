import http from 'http';
import https from 'https';
import { URL } from 'url';
import path from 'path';
import { validateVideoUrl } from '../security/urlValidator.js';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';
import { sanitizeFilename } from './cleanupService.js';

const ALLOWED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-matroska'
]);

/**
 * Fetch headers and handle redirects with SSRF protection on every hop
 * @param {string} initialUrl 
 * @param {number} maxRedirects 
 * @returns {Promise<{ finalUrl: string, statusCode: number, headers: Record<string, string> }>}
 */
async function fetchSafeHead(initialUrl, maxRedirects = 5) {
  let currentUrl = initialUrl;
  let redirectsCount = 0;

  while (redirectsCount <= maxRedirects) {
    const valResult = await validateVideoUrl(currentUrl);
    if (!valResult.valid) {
      throw new AppError('UNSUPPORTED_SOURCE', 400, `SSRF blocked redirect to ${currentUrl}`);
    }

    const parsed = new URL(currentUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const res = await new Promise((resolve, reject) => {
      const req = client.request(
        currentUrl,
        {
          method: 'HEAD',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*'
          },
          timeout: 10000
        },
        resolve
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new AppError('TIMEOUT', 408, 'HEAD request timed out'));
      });
      req.on('error', (err) => reject(new AppError('NETWORK_FAILURE', 502, err.message)));
      req.end();
    });

    // Handle redirects
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      redirectsCount++;
      if (redirectsCount > maxRedirects) {
        throw new AppError('NETWORK_FAILURE', 502, 'Too many redirects');
      }
      currentUrl = new URL(res.headers.location, currentUrl).href;
      continue;
    }

    return {
      finalUrl: currentUrl,
      statusCode: res.statusCode || 200,
      headers: res.headers
    };
  }

  throw new AppError('NETWORK_FAILURE', 502, 'Too many redirects');
}

/**
 * Analyze a direct video URL
 * @param {string} videoUrl 
 */
export async function analyzeDirectVideo(videoUrl) {
  let headInfo;
  try {
    headInfo = await fetchSafeHead(videoUrl);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('VIDEO_UNAVAILABLE', 404, err.message);
  }

  const { headers, finalUrl, statusCode } = headInfo;
  if (statusCode >= 400) {
    throw new AppError('VIDEO_UNAVAILABLE', statusCode, `Status code ${statusCode}`);
  }

  const contentType = (headers['content-type'] || '').toLowerCase().split(';')[0].trim();
  const parsed = new URL(finalUrl);
  const pathname = parsed.pathname;
  const isVideoExt = /\.(mp4|webm|m4v|ogv|mov)$/i.test(pathname);

  // Validate that response is actually a video
  const isVideoContent = ALLOWED_VIDEO_TYPES.has(contentType) || (isVideoExt && (contentType === 'application/octet-stream' || !contentType));
  if (!isVideoContent) {
    throw new AppError('METADATA_FAILURE', 400, `Non-video content-type: ${contentType}`);
  }

  const contentLength = parseInt(headers['content-length'] || '0', 10);
  if (contentLength > config.MAX_DOWNLOAD_SIZE_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 413, `Size ${contentLength} exceeds limit ${config.MAX_DOWNLOAD_SIZE_BYTES}`);
  }

  // Derive filename
  let filename = path.basename(pathname) || 'video.mp4';
  if (headers['content-disposition']) {
    const match = headers['content-disposition'].match(/filename=["']?([^"';]+)["']?/i);
    if (match && match[1]) {
      filename = match[1];
    }
  }
  filename = sanitizeFilename(filename, 'video.mp4');

  const extension = path.extname(filename).replace('.', '') || (contentType.includes('webm') ? 'webm' : 'mp4');

  return {
    success: true,
    source: 'direct',
    title: filename,
    duration: null,
    downloadAvailable: true,
    formats: [
      {
        formatId: 'direct',
        extension,
        resolution: 'Original',
        filesize: contentLength > 0 ? contentLength : null,
        note: 'Direct stream'
      }
    ]
  };
}

/**
 * Stream direct video download to client response with SSRF-safe redirect following
 * @param {string} videoUrl 
 * @param {import('express').Response} res 
 */
export async function streamDirectDownload(videoUrl, res) {
  let currentUrl = videoUrl;
  let redirectsCount = 0;
  const maxRedirects = 5;

  while (redirectsCount <= maxRedirects) {
    const valResult = await validateVideoUrl(currentUrl);
    if (!valResult.valid) {
      throw new AppError('UNSUPPORTED_SOURCE', 400, `SSRF blocked redirect to ${currentUrl}`);
    }

    const parsed = new URL(currentUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const streamResult = await new Promise((resolve, reject) => {
      const req = client.get(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        },
        timeout: config.DOWNLOAD_TIMEOUT_MS
      }, (streamRes) => {
        // Handle redirect
        if (streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
          streamRes.resume(); // consume response data to free up memory
          return resolve({
            isRedirect: true,
            location: streamRes.headers.location
          });
        }

        if (streamRes.statusCode && streamRes.statusCode >= 400) {
          streamRes.resume();
          return reject(new AppError('VIDEO_UNAVAILABLE', streamRes.statusCode, `Status code ${streamRes.statusCode}`));
        }

        const headers = streamRes.headers;
        const contentType = headers['content-type'] || 'video/mp4';
        const contentLength = parseInt(headers['content-length'] || '0', 10);

        if (contentLength > config.MAX_DOWNLOAD_SIZE_BYTES) {
          streamRes.resume();
          return reject(new AppError('FILE_TOO_LARGE', 413, 'File exceeds maximum size'));
        }

        let filename = path.basename(parsed.pathname) || 'video.mp4';
        if (headers['content-disposition']) {
          const match = headers['content-disposition'].match(/filename=["']?([^"';]+)["']?/i);
          if (match && match[1]) filename = match[1];
        }
        filename = sanitizeFilename(filename, 'video.mp4');

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        if (contentLength > 0) {
          res.setHeader('Content-Length', contentLength);
        }

        let downloadedBytes = 0;

        streamRes.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > config.MAX_DOWNLOAD_SIZE_BYTES) {
            streamRes.destroy();
            req.destroy();
            return reject(new AppError('FILE_TOO_LARGE', 413, 'Exceeded max file size during download'));
          }
        });

        streamRes.pipe(res);

        streamRes.on('end', () => resolve({ isRedirect: false }));
        streamRes.on('error', (err) => reject(new AppError('DOWNLOAD_INTERRUPTED', 500, err.message)));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new AppError('TIMEOUT', 408, 'Direct download timed out'));
      });

      req.on('error', (err) => reject(new AppError('NETWORK_FAILURE', 502, err.message)));

      res.on('close', () => {
        req.destroy();
      });
    });

    if (streamResult.isRedirect) {
      redirectsCount++;
      if (redirectsCount > maxRedirects) {
        throw new AppError('NETWORK_FAILURE', 502, 'Too many redirects');
      }
      currentUrl = new URL(streamResult.location, currentUrl).href;
      continue;
    }

    return;
  }

  throw new AppError('NETWORK_FAILURE', 502, 'Too many redirects');
}
