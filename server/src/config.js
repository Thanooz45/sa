import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect yt-dlp binary
function detectYtDlp() {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    return process.env.YTDLP_PATH;
  }
  
  // Common paths - prioritize local Python 3.13 venv
  const userHome = process.env.HOME || process.env.USERPROFILE || '';
  const possiblePaths = [
    path.join(__dirname, '../venv/bin/yt-dlp'),
    path.join(userHome, '.local/bin/yt-dlp'),
    path.join(userHome, 'Library/Python/3.13/bin/yt-dlp'),
    path.join(userHome, 'Library/Python/3.12/bin/yt-dlp'),
    path.join(userHome, 'Library/Python/3.11/bin/yt-dlp'),
    path.join(userHome, 'Library/Python/3.10/bin/yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/opt/homebrew/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    'yt-dlp'
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return 'yt-dlp';
}

// Detect FFmpeg binary
function detectFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  if (ffmpegInstaller && ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
    return ffmpegInstaller.path;
  }
  return 'ffmpeg';
}

const tmpDir = path.resolve(process.env.TEMP_DIR || path.resolve(__dirname, '../../tmp'));
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

export const config = {
  PORT: parseInt(process.env.PORT || '5001', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  YTDLP_PATH: detectYtDlp(),
  FFMPEG_PATH: detectFfmpeg(),
  TEMP_DIR: tmpDir,
  MAX_DOWNLOAD_SIZE_BYTES: parseInt(process.env.MAX_DOWNLOAD_SIZE_BYTES || `${500 * 1024 * 1024}`, 10), // 500 MB
  DOWNLOAD_TIMEOUT_MS: parseInt(process.env.DOWNLOAD_TIMEOUT_MS || `${15 * 60 * 1000}`, 10), // 15 mins
  EXTRACTION_TIMEOUT_MS: parseInt(process.env.EXTRACTION_TIMEOUT_MS || `${45 * 1000}`, 10), // 45 secs
  MAX_CONCURRENT_DOWNLOADS: parseInt(process.env.MAX_CONCURRENT_DOWNLOADS || '3', 10),
  YTDLP_CONCURRENT_FRAGMENTS: parseInt(process.env.YTDLP_CONCURRENT_FRAGMENTS || '4', 10),
  RATE_LIMIT_WINDOW_MS: 60 * 1000,
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '120', 10)
};
