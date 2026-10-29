import React, { useState, useRef } from 'react';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return null;
  const s = Math.floor(seconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function formatSourceName(source) {
  const map = {
    internet_archive: 'Internet Archive',
    eporner: 'Eporner',
    pornhub: 'Pornhub',
    xhamster: 'XHamster',
    direct: 'Direct Stream'
  };
  return map[source] || source || 'Media Source';
}

export default function App() {
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Live download progress state
  const [downloadProgress, setDownloadProgress] = useState(null);
  const eventSourceRef = useRef(null);

  const handleAnalyze = async (e) => {
    if (e) e.preventDefault();
    if (!url.trim()) {
      setError('Paste a video URL to continue.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setSuccessMsg(null);
    setVideoData(null);
    setDownloadProgress(null);

    try {
      const res = await fetch(apiUrl('/api/video/analyze'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Could not retrieve video information.');
        return;
      }

      setVideoData(data);
      if (data.formats && data.formats.length > 0) {
        setSelectedFormat(String(data.formats[0].formatId));
      } else {
        setSelectedFormat('');
      }
    } catch (err) {
      setError('The connection failed. Please retry.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownload = async () => {
    if (!videoData || !selectedFormat) return;

    setDownloading(true);
    setError(null);
    setSuccessMsg(null);

    // Initial progress state
    setDownloadProgress({
      percent: 0,
      speed: '0 B/s',
      eta: '--:--',
      downloadedBytes: 0,
      totalBytes: 0,
      stage: 'starting'
    });

    try {
      // Start background job with live progress
      const res = await fetch(apiUrl('/api/video/start-download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          formatId: selectedFormat
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'The download did not complete.');
        setDownloading(false);
        setDownloadProgress(null);
        return;
      }

      const jobId = data.jobId;

      // Connect to Server-Sent Events stream for live progress
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(apiUrl(`/api/video/job-progress/${jobId}`));
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const progress = JSON.parse(event.data);
          setDownloadProgress(progress);

          if (progress.stage === 'completed') {
            eventSource.close();
            setDownloading(false);
            setSuccessMsg(`Download complete! Saving ${progress.filename || 'video'}...`);

            // Trigger file save directly
            const a = document.createElement('a');
            a.href = apiUrl(`/api/video/job-file/${jobId}`);
            a.download = progress.filename || 'video.mp4';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          } else if (progress.stage === 'error') {
            eventSource.close();
            setDownloading(false);
            setError(progress.error || 'The download did not complete.');
          }
        } catch (e) {
          console.error('Error parsing progress SSE:', e);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
      };

    } catch (err) {
      setError('The download did not complete.');
      setDownloading(false);
    }
  };

  const clearInput = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setUrl('');
    setVideoData(null);
    setError(null);
    setSuccessMsg(null);
    setDownloadProgress(null);
  };

  const selectedFormatObj = videoData?.formats?.find(
    (f) => String(f.formatId) === String(selectedFormat)
  );

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-badge">Authorized Video Utility</div>
        <h1 className="brand-title">SECRET AGENT</h1>
        <p className="brand-subtitle">Your media download assistant</p>
      </header>

      {/* Main Action Card */}
      <main className="card input-section">
        <form onSubmit={handleAnalyze} className="input-group">
          <div className="input-wrapper">
            <input
              id="url-input"
              type="text"
              className="video-input"
              placeholder="Paste a video URL (Internet Archive, Direct MP4/WebM, etc.)..."
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (error) setError(null);
              }}
              disabled={analyzing || downloading}
              autoComplete="off"
            />
            {url && (
              <button
                type="button"
                className="btn-clear"
                onClick={clearInput}
                title="Clear input"
                id="clear-btn"
              >
                ✕
              </button>
            )}
          </div>

          <button
            id="analyze-btn"
            type="submit"
            className="btn btn-primary btn-full"
            disabled={analyzing || downloading || !url.trim()}
          >
            {analyzing ? (
              <>
                <span className="spinner"></span>
                <span>Analyzing Video...</span>
              </>
            ) : (
              'Analyze Video'
            )}
          </button>
        </form>

        {/* Supported Sources Tags */}
        <div className="sources-list">
          <span className="source-badge highlight">Internet Archive</span>
          <span className="source-badge highlight">Direct MP4 / WebM</span>
          <span className="source-badge">Eporner</span>
          <span className="source-badge">Pornhub</span>
          <span className="source-badge">XHamster</span>
        </div>
      </main>

      {/* Error Feedback */}
      {error && (
        <div id="error-message" className="alert alert-danger" role="alert">
          <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>⚠️</span>
          <div>{error}</div>
        </div>
      )}

      {/* Success Feedback */}
      {successMsg && (
        <div id="status-message" className="alert alert-success" role="status">
          <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>✓</span>
          <div>{successMsg}</div>
        </div>
      )}

      {/* Video Information & Download Card */}
      {videoData && (
        <section id="video-info-card" className="card info-section">
          <div className="info-header">
            <h2>Video Information</h2>
            <span className="source-tag">{formatSourceName(videoData.source)}</span>
          </div>

          <div className="media-preview-container">
            {videoData.thumbnail && (
              <img
                src={videoData.thumbnail}
                alt={videoData.title}
                className="video-thumb"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <div className="video-meta-details">
              <h3 className="video-title">{videoData.title}</h3>
              {videoData.duration && (
                <span className="video-duration">
                  Duration: {formatDuration(videoData.duration)}
                </span>
              )}
            </div>
          </div>

          {/* Format Selector Section */}
          {videoData.downloadAvailable && videoData.formats && videoData.formats.length > 0 ? (
            <div className="format-section">
              <div className="format-label">
                <span>Select Quality / Format</span>
                <span style={{ color: 'var(--text-accent)' }}>
                  {videoData.formats.length} qualities available
                </span>
              </div>

              {/* Visual Format Cards Grid with Sizing */}
              <div className="format-grid">
                {videoData.formats.map((f) => {
                  const isSelected = String(f.formatId) === String(selectedFormat);
                  const sizeFormatted = f.filesize ? formatBytes(f.filesize) : 'Size Dynamic';

                  return (
                    <div
                      key={f.formatId}
                      className={`format-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => !downloading && setSelectedFormat(String(f.formatId))}
                    >
                      <div className="format-card-top">
                        <span className="res-badge">{f.resolution}</span>
                        <span className="ext-badge">{f.extension.toUpperCase()}</span>
                      </div>
                      <div className="format-size-tag">
                        📦 {sizeFormatted}
                      </div>
                      {f.note && (
                        <div className="format-note-tag" title={f.note}>
                          {f.note}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Accessible Dropdown Selector */}
              <select
                id="format-select"
                className="format-dropdown"
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
                disabled={downloading}
              >
                {videoData.formats.map((f) => {
                  const sizeText = f.filesize ? ` — ${formatBytes(f.filesize)}` : ' — Size dynamic';
                  const noteText = f.note ? ` (${f.note})` : '';
                  return (
                    <option key={f.formatId} value={f.formatId}>
                      {f.resolution} — {f.extension.toUpperCase()}{sizeText}{noteText}
                    </option>
                  );
                })}
              </select>

              {/* Live Real-Time Download Progress Dashboard */}
              {downloadProgress && (
                <div className="progress-dashboard">
                  <div className="progress-header">
                    <div className="progress-title">
                      {downloadProgress.percent < 100 ? (
                        <>
                          <span className="spinner"></span>
                          <span>Downloading {selectedFormatObj?.resolution || ''} Media...</span>
                        </>
                      ) : (
                        <span>✓ Transfer Finished</span>
                      )}
                    </div>
                    <div className="progress-percentage">
                      {downloadProgress.percent.toFixed(1)}%
                    </div>
                  </div>

                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.min(100, Math.max(0, downloadProgress.percent))}%` }}
                    ></div>
                  </div>

                  <div className="progress-stats-grid">
                    <div className="stat-item">
                      <span className="stat-label">Transferred</span>
                      <span className="stat-value">
                        {downloadProgress.downloadedBytes > 0
                          ? `${formatBytes(downloadProgress.downloadedBytes)}`
                          : '0 MB'}
                        {downloadProgress.totalBytes > 0 && ` / ${formatBytes(downloadProgress.totalBytes)}`}
                      </span>
                    </div>

                    <div className="stat-item">
                      <span className="stat-label">Speed</span>
                      <span className="stat-value">{downloadProgress.speed || 'Calculating...'}</span>
                    </div>

                    <div className="stat-item">
                      <span className="stat-label">ETA</span>
                      <span className="stat-value">{downloadProgress.eta || '--:--'}</span>
                    </div>

                    <div className="stat-item">
                      <span className="stat-label">Quality</span>
                      <span className="stat-value">
                        {selectedFormatObj?.resolution || 'Default'} ({selectedFormatObj?.extension?.toUpperCase() || 'MP4'})
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Download Button */}
              <button
                id="download-btn"
                type="button"
                className="btn btn-primary btn-full"
                onClick={handleDownload}
                disabled={downloading || !selectedFormat}
                style={{ marginTop: '0.5rem' }}
              >
                {downloading ? (
                  <>
                    <span className="spinner"></span>
                    <span>
                      Downloading ({downloadProgress ? `${downloadProgress.percent.toFixed(0)}%` : 'Starting...'})
                    </span>
                  </>
                ) : (
                  `Download Video (${selectedFormatObj?.resolution || ''} ${selectedFormatObj?.filesize ? `• ${formatBytes(selectedFormatObj.filesize)}` : ''})`
                )}
              </button>
            </div>
          ) : (
            <div className="alert alert-info">
              <span>ℹ️</span>
              <div>No authorized download method is available for this media item.</div>
            </div>
          )}

          <div className="status-bar">
            <span>
              Status:{' '}
              {downloading
                ? `Active Transfer (${downloadProgress?.percent?.toFixed(1) || 0}%)`
                : analyzing
                ? 'Analyzing...'
                : 'Ready'}
            </span>
            <span>Formats detected: {videoData.formats ? videoData.formats.length : 0}</span>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="app-footer">
        <p>Secret Agent &bull; Universal Video Utility &bull; Authorized Sources Only</p>
      </footer>
    </div>
  );
}
