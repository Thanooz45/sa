import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

/**
 * Remove a file or directory safely
 * @param {string} targetPath 
 */
export function safeDelete(targetPath) {
  try {
    if (!targetPath) return;
    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }
    }
  } catch (err) {
    console.error(`[Cleanup] Failed to remove ${targetPath}:`, err.message);
  }
}

/**
 * Clean up files older than maxAgeMs in the temp directory
 * @param {number} maxAgeMs default 30 minutes
 */
export function cleanOldTempFiles(maxAgeMs = 30 * 60 * 1000) {
  try {
    if (!fs.existsSync(config.TEMP_DIR)) return;
    const now = Date.now();
    const items = fs.readdirSync(config.TEMP_DIR);

    for (const item of items) {
      const fullPath = path.join(config.TEMP_DIR, item);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
        }
      } catch (e) {
        // file might be deleted in parallel, ignore
      }
    }
  } catch (err) {
    console.error('[Cleanup] Periodic cleanup error:', err.message);
  }
}

/**
 * Sanitize filename to prevent directory traversal or unsafe shell/filesystem characters
 * @param {string} rawName 
 * @param {string} fallback 
 * @returns {string}
 */
export function sanitizeFilename(rawName, fallback = 'video.mp4') {
  if (!rawName || typeof rawName !== 'string') return fallback;
  // Strip null bytes and directory separators
  let clean = path.basename(rawName).replace(/[/\\?%*:|"<>]/g, '_').trim();
  // Limit length
  if (clean.length > 120) {
    const ext = path.extname(clean);
    clean = clean.slice(0, 100) + ext;
  }
  return clean || fallback;
}
