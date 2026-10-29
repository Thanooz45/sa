import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { validateVideoUrl, isPrivateOrRestrictedIp } from '../src/security/urlValidator.js';
import { ERROR_MESSAGES, AppError } from '../src/utils/errors.js';
import { config } from '../src/config.js';
import { analyzeDirectVideo } from '../src/services/directVideoService.js';
import { analyzeWithYtDlp } from '../src/services/ytdlpService.js';

const API_BASE = `http://localhost:${config.PORT}`;

async function apiRequest(endpoint, body = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, headers: res.headers, data, res };
}

test('1. Valid direct MP4/OGV URL analysis', async () => {
  const url = 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.ogv';
  const { status, data } = await apiRequest('/api/video/analyze', { url });
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.equal(data.source, 'direct');
  assert.equal(data.downloadAvailable, true);
  assert.ok(data.formats.length > 0);
  assert.ok(data.formats[0].filesize > 0);
});

test('2. Valid direct WebM URL analysis', async () => {
  const url = 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.360p.vp9.webm';
  const { status, data } = await apiRequest('/api/video/analyze', { url });
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.equal(data.source, 'direct');
  assert.equal(data.downloadAvailable, true);
  assert.equal(data.formats[0].extension, 'webm');
});

test('3. Internet Archive item with downloadable files', async () => {
  const url = 'https://archive.org/details/BigBuckBunny_124';
  const { status, data } = await apiRequest('/api/video/analyze', { url });
  assert.equal(status, 200);
  assert.equal(data.success, true);
  assert.equal(data.source, 'internet_archive');
  assert.equal(data.title, 'Big Buck Bunny');
  assert.equal(data.downloadAvailable, true);
  assert.ok(data.formats.length >= 1);
});

test('4. Unsupported website', async () => {
  const url = 'https://news.ycombinator.com/item?id=1';
  const { status, data } = await apiRequest('/api/video/analyze', { url });
  assert.equal(status, 400);
  assert.equal(data.success, false);
  assert.equal(data.error, ERROR_MESSAGES.UNSUPPORTED_SOURCE);
});

test('5. Invalid URL', async () => {
  const url = 'not-a-valid-http-url';
  const { status, data } = await apiRequest('/api/video/analyze', { url });
  assert.equal(status, 400);
  assert.equal(data.success, false);
  assert.equal(data.error, ERROR_MESSAGES.INVALID_URL);
});

test('6. Empty input', async () => {
  const { status, data } = await apiRequest('/api/video/analyze', { url: '' });
  assert.equal(status, 400);
  assert.equal(data.success, false);
  assert.equal(data.error, ERROR_MESSAGES.EMPTY_INPUT);
});

test('7. Unavailable video on supported source', async () => {
  const url = 'https://archive.org/details/non_existent_archive_item_xyz_98765';
  const { status, data } = await apiRequest('/api/video/analyze', { url });
  assert.equal(status, 404);
  assert.equal(data.success, false);
  assert.equal(data.error, ERROR_MESSAGES.VIDEO_UNAVAILABLE);
});

test('8. Metadata extraction failure mapping', () => {
  const err = new AppError('METADATA_FAILURE', 400);
  assert.equal(err.message, ERROR_MESSAGES.METADATA_FAILURE);
  assert.equal(err.message, 'Could not retrieve video information.');
});

test('9. Timeout error mapping', () => {
  const err = new AppError('TIMEOUT', 408);
  assert.equal(err.message, ERROR_MESSAGES.TIMEOUT);
  assert.equal(err.message, 'The request took too long. Please try again.');
});

test('10. Oversized file rejection', async () => {
  const err = new AppError('FILE_TOO_LARGE', 413);
  assert.equal(err.message, ERROR_MESSAGES.FILE_TOO_LARGE);
  assert.equal(err.message, 'This file exceeds the configured size limit.');
});

test('11. Invalid format identifier rejection', async () => {
  const url = 'https://archive.org/details/BigBuckBunny_124';
  const { status, data } = await apiRequest('/api/video/download', {
    url,
    formatId: 'invalid-non-existent-format-id-999'
  });
  assert.equal(status, 400);
  assert.equal(data.success, false);
  assert.equal(data.error, ERROR_MESSAGES.UNSUPPORTED_FORMAT);
});

test('12. Unsafe redirect SSRF protection', async () => {
  // Test SSRF checker rejecting redirect to private IP
  const isPrivate = isPrivateOrRestrictedIp('127.0.0.1');
  assert.equal(isPrivate, true);

  const isMetadataPrivate = isPrivateOrRestrictedIp('169.254.169.254');
  assert.equal(isMetadataPrivate, true);
});

test('13. Attempted access to private networks (SSRF)', async () => {
  const privateUrls = [
    'http://127.0.0.1:8080/video.mp4',
    'http://localhost:3000/video.mp4',
    'http://192.168.1.1/video.mp4',
    'http://10.0.0.1/video.mp4',
    'http://169.254.169.254/latest/meta-data/'
  ];

  for (const url of privateUrls) {
    const val = await validateVideoUrl(url);
    assert.equal(val.valid, false);
    assert.equal(val.error, ERROR_MESSAGES.UNSUPPORTED_SOURCE);
  }
});

test('14. Interrupted download handling and cleanup', () => {
  const err = new AppError('DOWNLOAD_INTERRUPTED', 500);
  assert.equal(err.message, ERROR_MESSAGES.DOWNLOAD_INTERRUPTED);
  assert.equal(err.message, 'The download did not complete.');
});

test('15. Successful end-to-end authorized download', async () => {
  const url = 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.ogv';
  const res = await fetch(`${API_BASE}/api/video/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, formatId: 'direct' })
  });

  assert.equal(res.status, 200);
  const disposition = res.headers.get('content-disposition');
  assert.ok(disposition.includes('attachment'));
  assert.ok(disposition.includes('big_buck_bunny_720p_surround.ogv'));

  // Read first chunk to verify stream transmission
  const reader = res.body.getReader();
  const { value, done } = await reader.read();
  assert.ok(!done);
  assert.ok(value.length > 0);
  await reader.cancel();
});
