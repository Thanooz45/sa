# SECRET AGENT 🕵️
### Universal Video Downloader & Media Assistant

Secret Agent is a functional, minimalist video inspection and download utility. Built with React (Vite) and Node.js (Express), it retrieves actual video metadata and format options, enforcing strict security controls and authorized extraction without simulated mock data or DRM circumvention.

---

## 🌟 Key Features

1. **Source Recognition & Inspection**:
   - **Internet Archive (`archive.org`)**: Full item and file listing analysis, metadata extraction, format resolution detection, and public domain media downloads.
   - **Direct Video Streams**: Safe analysis and direct streaming for HTTP/HTTPS `.mp4`, `.webm`, `.ogv`, and `.m4v` links.
   - **Adult Platforms (Eporner, Pornhub, XHamster)**: Best-effort source recognition and metadata probing via `yt-dlp`. Downloading is only enabled when authorized, accessible formats are returned by the upstream source.
2. **Robust Security & Guardrails**:
   - **SSRF Prevention**: Strict DNS resolution checks blocking `localhost`, private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local/cloud metadata (`169.254.169.254`), and IPv6 equivalents.
   - **Safe Subprocess Spawning**: Direct `execFile`/`spawn` argument arrays without shell interpolation to eliminate command injection.
   - **Safe Streaming & Redirects**: Every redirect hop is re-validated against the SSRF guard before proceeding.
   - **Resource Controls**: Configurable download size ceilings (`500MB` default), extraction timeouts, download timeouts, and concurrency limiting.
   - **Temporary File Lifecycle**: Dedicated temporary working folders cleaned up on completion, client disconnect, or stale age timeout (>15 min).
3. **Design & Aesthetic**:
   - Minimalist dark navy / charcoal UI with electric cyan accenting.
   - Clean responsive layout for mobile and desktop.
   - Real-time status indicators, loading spinners, format dropdowns, and explicit error messaging strictly conforming to Section 9 of the specification.

---

## 🏗️ Project Architecture

```
.
├── client/                     # Frontend (React 19, Vite, Standard CSS)
│   ├── src/
│   │   ├── App.jsx             # Main Application component
│   │   ├── index.css           # Design tokens, typography, dark theme
│   │   └── main.jsx            # Entry point
│   ├── index.html              # SEO metadata & fonts (Title: Secret Agent)
│   ├── vite.config.js          # Vite config with /api proxy to backend
│   └── vercel.json             # Vercel SPA routing configuration
├── server/                     # Backend (Node.js, Express)
│   ├── src/
│   │   ├── config.js           # Environment & binary detection (yt-dlp, ffmpeg)
│   │   ├── index.js            # Express server entry point
│   │   ├── middleware/         # Error handler & rate limiter
│   │   ├── routes/             # API routes (/analyze, /download, /health)
│   │   ├── security/           # SSRF & URL validator
│   │   ├── services/           # yt-dlp service, direct video service, cleanup
│   │   └── utils/              # Error mapping & custom AppError
│   ├── test/
│   │   └── specTests.js        # 15 automated specification tests
│   ├── Dockerfile              # Production container with Python3, yt-dlp, FFmpeg
│   └── package.json
├── package.json                # Root workspace management
├── render.yaml                 # Render blueprint configuration
├── vercel.json                 # Vercel deployment configuration
└── spec.md                     # Implementation Specification
```

---

## 🚀 Getting Started Locally

### Prerequisites
- **Node.js** (v18+ or v22+)
- **Python 3** with `yt-dlp` installed (`pip install yt-dlp`)
- **FFmpeg** (installed via `@ffmpeg-installer/ffmpeg` or system PATH)

### 1. Installation
Install dependencies for both frontend and backend from the root directory:
```bash
npm run install:all
```

### 2. Start Backend Server
```bash
npm run dev:server
# Server starts on http://localhost:5001
```

### 3. Start Frontend Dev Server
In a separate terminal:
```bash
npm run dev:client
# Client starts on http://127.0.0.1:3000
```
Open [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser.

---

## 🧪 Automated Testing

The project includes an automated test suite verifying all 15 scenarios required by Section 12 of `spec.md`:
1. Valid direct MP4/OGV URL
2. Valid direct WebM URL
3. Internet Archive item with downloadable file
4. Unsupported website
5. Invalid URL
6. Empty input
7. Unavailable video on supported source
8. Metadata extraction failure mapping
9. Timeout error mapping
10. Oversized file rejection
11. Invalid format identifier rejection
12. Unsafe redirect SSRF protection
13. Attempted access to private networks (SSRF)
14. Interrupted download handling and cleanup
15. Successful end-to-end authorized download

Run the test suite:
```bash
npm test
```
All 15 tests execute against live endpoints and verify standard error responses and streaming capabilities.

---

## 📡 API Reference

### `GET /api/health`
Checks backend and binary status.
**Response**:
```json
{
  "status": "healthy",
  "ytdlpAvailable": true,
  "ffmpegAvailable": true
}
```

### `POST /api/video/analyze`
Analyzes a URL and returns media metadata and eligible formats.
**Request**:
```json
{
  "url": "https://archive.org/details/BigBuckBunny_124"
}
```
**Response**:
```json
{
  "success": true,
  "source": "internet_archive",
  "title": "Big Buck Bunny",
  "duration": 596.46,
  "thumbnail": "https://archive.org/...",
  "downloadAvailable": true,
  "formats": [
    {
      "formatId": "1",
      "extension": "mp4",
      "resolution": "360p",
      "filesize": 61878609,
      "note": "derivative"
    }
  ]
}
```

### `POST /api/video/download`
Validates and streams the authorized video file.
**Request**:
```json
{
  "url": "https://archive.org/details/BigBuckBunny_124",
  "formatId": "1"
}
```
**Response**:
Binary media stream with headers:
- `Content-Type: video/mp4`
- `Content-Disposition: attachment; filename="Big_Buck_Bunny.mp4"`
- `Content-Length: 61878609`

---

## 🛡️ Error Handling Reference (Spec Section 9)

| Condition | User-Facing Message |
|---|---|
| Empty input | `Paste a video URL to continue.` |
| Invalid URL | `Enter a valid HTTP or HTTPS URL.` |
| Unsupported source | `This source is not supported yet.` |
| Video unavailable | `The video could not be accessed.` |
| Metadata failure | `Could not retrieve video information.` |
| No permitted download | `No authorized download method is available.` |
| Unsupported format | `The selected format is unavailable.` |
| File too large | `This file exceeds the configured size limit.` |
| Timeout | `The request took too long. Please try again.` |
| Network failure | `The connection failed. Please retry.` |
| Download interrupted | `The download did not complete.` |
| Temporary source failure | `The source is temporarily unavailable.` |

---

## 🚢 Production Deployment

### Frontend (Vercel)
1. Import repository to Vercel.
2. Keep the repository root as the project root so the root `vercel.json` build and output settings are used.
3. Set the build-time environment variable `VITE_API_URL` to the backend origin (for example, `https://secret-agent-backend.onrender.com`, without an `/api` suffix).
4. Deploy.

### Backend (Render / Docker)
1. Create a new **Web Service** on Render pointing to the repository.
2. Select **Docker** environment using `server/Dockerfile`.
3. Use the included `render.yaml` blueprint, or set these Environment Variables:
   - `PORT`: `5001`
   - `CORS_ORIGIN`: Your deployed Vercel origin (e.g. `https://secret-agent.vercel.app`)
   - `MAX_DOWNLOAD_SIZE_BYTES`: `524288000` (500 MB)
   - `YTDLP_CONCURRENT_FRAGMENTS`: `4` (parallel fragment transfers for HLS/DASH sources)
   - `TEMP_DIR`: `/tmp/secret-agent`
4. Render builds a non-root container with `yt-dlp` and `FFmpeg`. The local temp directory is ephemeral, so completed download jobs must be saved before the service restarts or scales to a different instance.
5. After deployment, check `https://<backend-origin>/api/health` and confirm both `ytdlpAvailable` and `ffmpegAvailable` are `true`.

The frontend's `VITE_API_URL` must point to the deployed backend. The Vercel SPA rewrite is not an API proxy, so leaving this unset in production will send API requests to the frontend host.

---

## ⚠️ Known Limitations & Guardrails
- **No DRM or Paywall Circumvention**: Secret Agent strictly respects intellectual property and terms of service. Encrypted streams, subscriber-only content, or age-gated videos requiring authenticated account login cannot and will not be bypassed.
- **Dynamic Platform Extraction**: External streaming services frequently modify their player logic and API signatures. Supported extractor availability depends on the installed `yt-dlp` version.
- **File Size & Timeout Ceilings**: Files exceeding 500 MB (configurable) or taking longer than 15 minutes are gracefully rejected to protect server health and bandwidth.
