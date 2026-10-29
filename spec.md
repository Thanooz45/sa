# SECRET AGENT
## Universal Video Downloader — Implementation Specification
**Version:** 1.0  
**Product:** Secret Agent  
**Objective:** Build a functional video-downloading website with a minimal interface and support for authorized video downloads.

---

# 1. PROJECT OVERVIEW

Build a website named **Secret Agent** where users paste a video URL, inspect the available video information and formats, and download a video when a supported and authorized download method is available.

The initial target sources are:

1. Eporner
2. Pornhub
3. Internet Archive

The application should also support direct MP4 and WebM video URLs.

The goal is a working application, not a UI prototype. Every displayed result must come from an actual backend operation.

**Important limitations:** Not every URL will work. Website changes, unavailable videos, licensing restrictions, and technical limitations can prevent downloads. Do not bypass DRM, paywalls, authentication, age restrictions, or other access controls.

# 2. OFFICIAL GITHUB REFERENCE — REQUIRED

Use the official yt-dlp repository as the primary technical reference for supported websites, extraction, metadata, format selection, downloads, and troubleshooting.

**Official repository:**
https://github.com/yt-dlp/yt-dlp

**Supported websites:**
https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md

**Official README and usage documentation:**
https://github.com/yt-dlp/yt-dlp/blob/master/README.md

**Official releases:**
https://github.com/yt-dlp/yt-dlp/releases

The official documentation describes yt-dlp as a video downloader supporting thousands of sites. It also warns that supported websites can stop working when their implementations change.

## Instructions for Antigravity

Before implementing the application:

1. Read the official yt-dlp README.
2. Inspect the supported-site list for Eporner, Pornhub, and Internet Archive.
3. Check the installed version's actual extractor capabilities.
4. Review installation requirements and supported options.
5. Implement the backend using yt-dlp where appropriate.
6. Test real video URLs rather than assuming that an extractor works.
7. Document any unsupported source or download limitation.

Do not copy the entire yt-dlp repository into the frontend. Integrate the appropriate tool into the backend and follow its licensing and distribution requirements.

Do not hardcode video metadata or fabricate successful downloads.

# 3. TECHNOLOGY STACK

### Frontend
- React
- Vite
- JavaScript
- Standard CSS

### Backend
- Node.js
- Express.js
- yt-dlp for supported source inspection and authorized retrieval
- FFmpeg for media merging or processing when required

### Storage
- Temporary local storage during development
- Temporary disk storage or controlled streaming in production
- Automatic cleanup of temporary files

### Database
No database is required for the initial MVP.

### Deployment
- Frontend: Vercel
- Backend: Render or another suitable persistent backend service

Large downloads and media processing may exceed serverless function execution limits. Keep the downloading workload in a suitable backend environment.

# 4. USER INTERFACE

The website should be extremely simple.

## Homepage

Display:

- Website title: SECRET AGENT
- Subtitle: Your media download assistant
- One large video URL input
- An `Analyze Video` button
- A video information section
- A format selector
- A `Download Video` button when eligible
- A clear status and error area

### Suggested layout

```text
+------------------------------------------+
|                                          |
|             SECRET AGENT                 |
|       Your media download assistant      |
|                                          |
|  +------------------------------------+  |
|  | Paste a video URL                  |  |
|  +------------------------------------+  |
|                                          |
|            [ Analyze Video ]             |
|                                          |
|  VIDEO INFORMATION                       |
|  --------------------------------------  |
|  Source: Internet Archive                |
|  Title: Actual retrieved title           |
|  Duration: Actual duration, if available |
|                                          |
|  Available formats                       |
|  [ MP4 - 1080p                    v ]    |
|                                          |
|            [ Download Video ]            |
|                                          |
|  Status: Ready                            |
|                                          |
+------------------------------------------+
```

The displayed title and metadata above are illustrative placeholders, not real video information.

## Design requirements

- Dark navy or charcoal background
- Clean typography
- White text
- One accent color
- Simple rounded input and buttons
- Minimal cards
- Responsive desktop and mobile layouts
- Accessible controls
- Clear loading indicators
- No unnecessary animations

The browser tab title must be `Secret Agent`.

# 5. USER WORKFLOW

Implement this end-to-end flow:

1. User opens Secret Agent.
2. User pastes a video URL.
3. User clicks `Analyze Video`.
4. Frontend validates the URL's basic format.
5. Backend validates the URL and its destination.
6. Backend identifies the source.
7. Backend attempts metadata retrieval using the appropriate permitted mechanism.
8. Backend returns actual metadata and available formats.
9. The application determines whether a permitted download method is available.
10. User selects a format.
11. User clicks `Download Video`.
12. Backend revalidates the URL and download eligibility.
13. Backend processes the download.
14. Browser receives the file.
15. The application reports success only after the download has completed.

If a step fails, display a useful error rather than pretending that the operation succeeded.

# 6. SOURCE SUPPORT

## A. Eporner

Implement source recognition and best-effort metadata inspection.

Requirements:

- Recognize Eporner URLs.
- Attempt extraction using the installed yt-dlp version where appropriate.
- Inspect the actual formats returned by the extractor.
- Enable downloads only when an authorized download method is available.
- Report unsupported, unavailable, or restricted videos accurately.

Do not assume that every publicly viewable video can be downloaded.

## B. Pornhub

Implement source recognition and best-effort metadata inspection.

Requirements:

- Recognize Pornhub URLs.
- Check whether the installed extractor can retrieve metadata.
- Report available formats only when actually returned.
- Enable downloads only when the download is authorized and technically available.
- Handle extraction failures without repeatedly retrying indefinitely.

Do not bypass authentication, DRM, paywalls, or other access restrictions.

## C. Internet Archive

Implement functional support for individual Internet Archive items.

Requirements:

- Recognize supported item pages and media URLs.
- Retrieve item metadata and file listings.
- Identify downloadable files.
- Display available file formats and sizes.
- Check applicable licensing or rights information when available.
- Download the selected file through an appropriate authorized mechanism.

This should be the primary website-specific integration for the initial MVP.

## D. Direct video URLs

Support direct HTTP or HTTPS URLs pointing to MP4 and WebM files.

Requirements:

- Validate the URL and destination.
- Check that the response is actually a supported video file.
- Handle redirects safely.
- Respect file-size limits.
- Return the file with an appropriate filename and content type.
- Avoid downloading HTML error pages and returning them as videos.

# 7. BACKEND API

Implement these endpoints.

## POST `/api/video/analyze`

Request:

```json
{
  "url": "https://example.com/video"
}
```

Example response:

```json
{
  "success": true,
  "source": "internet_archive",
  "title": "Example Video",
  "duration": 120,
  "downloadAvailable": true,
  "formats": [
    {
      "formatId": "example-format",
      "extension": "mp4",
      "resolution": "1080p",
      "filesize": 125000000
    }
  ]
}
```

This is an example response structure. Actual values must be obtained from the source.

If no authorized download method is available, return `downloadAvailable: false`.

## POST `/api/video/download`

Request:

```json
{
  "url": "https://example.com/video",
  "formatId": "example-format"
}
```

Requirements:

- Validate the request.
- Revalidate the URL.
- Recheck download eligibility.
- Validate the requested format against the actual available formats.
- Apply download size and timeout limits.
- Return the file or a controlled download response.
- Report errors accurately.

Never trust a format identifier or download eligibility value supplied by the frontend without backend validation.

## GET `/api/health`

Return a simple health response indicating whether the backend is running.

Do not expose environment variables, filesystem paths, or sensitive configuration in the response.

# 8. DOWNLOAD ENGINE

Use yt-dlp as the primary extraction engine for compatible sources where the requested download is authorized.

Follow the official documentation:
https://github.com/yt-dlp/yt-dlp/blob/master/README.md

Implementation requirements:

- Use a maintained version.
- Check the installed version during startup or diagnostics.
- Use safe subprocess execution or an appropriate programmatic interface.
- Avoid shell interpolation of user-supplied URLs.
- Apply timeouts and download size limits.
- Capture and interpret errors.
- Restrict concurrent downloads.
- Use temporary output directories.
- Clean up incomplete files.
- Use FFmpeg only when required.
- Do not assume that all sources require the same extraction method.

If an extractor stops working, report the failure and consult the official repository for updates and troubleshooting.

Do not automatically disable security controls or attempt to circumvent platform restrictions to make an extraction succeed.

# 9. ERROR HANDLING

Provide clear messages for these cases:

| Condition | User-facing message |
|---|---|
| Empty input | Paste a video URL to continue. |
| Invalid URL | Enter a valid HTTP or HTTPS URL. |
| Unsupported source | This source is not supported yet. |
| Video unavailable | The video could not be accessed. |
| Metadata failure | Could not retrieve video information. |
| No permitted download | No authorized download method is available. |
| Unsupported format | The selected format is unavailable. |
| File too large | This file exceeds the configured size limit. |
| Timeout | The request took too long. Please try again. |
| Network failure | The connection failed. Please retry. |
| Download interrupted | The download did not complete. |
| Temporary source failure | The source is temporarily unavailable. |

Include a concise technical error code in server logs, but do not expose sensitive details to the user.

# 10. SECURITY REQUIREMENTS

Because users submit URLs that the server will fetch, implement protections against:

- Server-side request forgery
- Requests to localhost
- Private network access
- Cloud metadata endpoint access
- DNS rebinding
- Unsafe redirects
- Command injection
- Arbitrary file paths
- Oversized downloads
- Excessive processing time
- Excessive concurrent jobs
- Malicious filenames

Additional requirements:

- Restrict outbound network destinations to approved sources and legitimate media hosts.
- Revalidate redirect destinations.
- Resolve and validate destination IP addresses.
- Use safe process arguments.
- Do not accept executable commands from users.
- Do not request or store users' login credentials.
- Do not collect browser cookies.
- Avoid logging sensitive query parameters.
- Apply request rate limits.
- Use HTTPS in production.
- Configure temporary-file cleanup.

The URL validation design must still permit legitimate media delivery hosts without allowing unrestricted access to internal services.

# 11. DEPLOYMENT

## Frontend: Vercel

Configure the frontend build and production API base URL.

Ensure the deployed frontend communicates with the correct backend.

## Backend: Render or equivalent

Confirm that the chosen hosting plan supports:

- Required runtime dependencies
- yt-dlp installation
- FFmpeg installation where needed
- Sufficient request execution time
- Temporary disk space
- Large response handling
- Appropriate network access
- Background processing if required

Do not assume the free hosting tier will support large downloads reliably.

## Production checks

- Configure CORS for the actual frontend domain.
- Store configuration in environment variables.
- Do not commit secrets.
- Add a health endpoint.
- Set request and download limits.
- Verify HTTPS.
- Test cleanup of temporary files.
- Test downloads on the deployed site.

# 12. TESTING REQUIREMENTS

Create a test suite covering:

1. Valid direct MP4 URL.
2. Valid direct WebM URL.
3. Internet Archive item with a downloadable file.
4. Unsupported website.
5. Invalid URL.
6. Empty input.
7. Unavailable video.
8. Metadata extraction failure.
9. Download timeout.
10. Oversized file.
11. Invalid format identifier.
12. Unsafe redirect.
13. Attempted access to a private network.
14. Interrupted download.
15. Successful end-to-end authorized download.

For Eporner and Pornhub, test compatibility only with content and download methods that are authorized. Do not make production support claims based solely on the presence of an extractor.

# 13. ACCEPTANCE CRITERIA

The MVP is complete when:

- The application launches locally.
- The interface works on desktop and mobile.
- Users can submit video URLs.
- The backend identifies supported source types.
- Metadata is retrieved from real sources.
- Available formats are displayed accurately.
- Direct MP4/WebM downloads work.
- Internet Archive downloads work for eligible items.
- Eporner and Pornhub compatibility is tested and honestly reported.
- Restricted or unsupported videos fail gracefully.
- Downloaded files are valid.
- File sizes and completion states are accurate.
- Temporary files are cleaned up.
- URL validation and SSRF protections are tested.
- The project includes setup and deployment instructions.
- The deployed application passes end-to-end tests.

# 14. INSTRUCTIONS TO ANTIGRAVITY

Act as a senior full-stack engineer.

First inspect the existing project directory. Preserve useful existing code and configuration rather than overwriting files blindly.

Implement the project in this order:

1. Initialize or inspect the React/Vite frontend.
2. Implement the Express backend.
3. Implement secure URL validation.
4. Implement direct video downloads.
5. Integrate Internet Archive support.
6. Integrate best-effort Eporner and Pornhub source recognition.
7. Add metadata extraction and format selection.
8. Implement actual download handling.
9. Add error handling and security controls.
10. Run local end-to-end tests.
11. Fix all errors found during testing.
12. Prepare deployment configuration.
13. Deploy only after the application passes local tests.
14. Document the working features and known limitations.

Use the official yt-dlp GitHub repository as the source of truth for the extraction tool's capabilities and configuration.

Do not stop after generating the UI. Run the application, test real authorized downloads, inspect logs, and correct implementation defects.

Never fabricate results or claim that a feature works without testing it.

**Final objective:** Deliver a functional website called Secret Agent that provides a consistent, simple download experience for supported sources when an authorized download method is available.

## Target Sources — Four Websites

The initial version of **Secret Agent** must recognize and test these four sources:

1. **Eporner**
2. **Pornhub**
3. **XHamster**
4. **Internet Archive**

### XHamster Integration Requirements

- Recognize supported XHamster video URLs.
- Consult the official yt-dlp repository and supported-sites list before implementation.
- Check whether the installed yt-dlp version can retrieve metadata and available formats.
- Display real video information only when retrieval succeeds.
- Enable downloading only when a supported, authorized download method is available.
- Handle unavailable videos, unsupported formats, and extraction failures gracefully.
- Do not bypass DRM, authentication, paywalls, or other access restrictions.

### Official Technical References

- yt-dlp repository: https://github.com/yt-dlp/yt-dlp
- Supported websites: https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md
- Installation and usage documentation: https://github.com/yt-dlp/yt-dlp/blob/master/README.md

### Required Testing

Test XHamster independently from the other sources. Confirm that URL recognition, metadata retrieval, format detection, and any permitted download work end to end.

**Important:** The presence of an XHamster extractor does not guarantee that every video is accessible or downloadable. The application must report actual results rather than promise universal compatibility.