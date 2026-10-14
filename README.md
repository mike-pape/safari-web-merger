# Safari Media Grabber v4.0 — unified HLS + YouTube

This package extends the proven v3.2 Safari HLS downloader and browser-side FFmpeg muxer, and adds a **private server-side YouTube extraction service**. Safari remains the only software you need to operate on your Mac. The server must be deployed separately: GitHub Pages cannot run Python or yt-dlp.

## One web address (recommended): Render

1. Put this complete project in your existing GitHub repository `safari-web-merger`, keeping folders `.github/workflows`, `src`, `scripts`, and `backend` intact. If GitHub's web uploader flattens directories, use **Add file → Create new file** with paths such as `backend/app.py`, and paste the file contents. Keep `src/main.js` in `src/`. Do not upload this ZIP into the repository as one file.
2. Visit https://dashboard.render.com/ and create a **New → Web Service** connected to that GitHub repository. (If using a Render Blueprint, its `render.yaml` defines the same Docker service.) Choose **Docker** runtime, repository root `/`, and a paid tier with sufficient CPU, memory, disk, and bandwidth for long videos. Pricing/limits depend on your Render account.
3. In Render's **Environment** settings, set `GRABBER_API_KEY` to a long random private secret. For Blueprints using `generateValue`, Render can generate the value; reveal/copy it from Render Environment. **Do not put the key into GitHub files.** If you change environment variables, redeploy the service.
4. Deploy the service and visit the HTTPS link supplied by Render. The same page includes **YouTube** and the original **HLS/Network import/FFmpeg** tools.
5. Paste the private key into the page, enter a *single YouTube watch URL*, select quality, click **Check YouTube video**, then **Prepare downloadable file**. The server uses yt-dlp + Deno + FFmpeg and offers a temporary file download when ready.

You can keep your existing GitHub Pages site for HLS-only tasks. If you use the GitHub Pages front end instead of the Render site, enter the Render HTTPS origin under **Extraction service URL**, but note: cross-origin browser requests are not enabled by this package. **Use the Render-hosted URL** for the unified experience.

## Safety and privacy

- Only download videos you own or have permission to save. This utility does not bypass DRM or promise access to private, subscription-only or geographically restricted content.
- The YouTube video URL goes to your own Render server, which temporarily stores the downloaded video. Unlike the HLS section, the YouTube path is not processed solely in Safari.
- The API key is kept in the browser tab's memory; never put it in the URL or GitHub. The download link itself uses a random, short-lived capability ID—do not share it.
- This is for **personal use**. It is not a hardened public download service. Keep the API key private, monitor usage, and disable the Render service when not in use. Render services may incur hosting, storage, and network-transfer charges.
- A YouTube backend can still fail when YouTube changes its playback requirements, restricts servers/datacenter IPs, or requires login. yt-dlp is not a guaranteed universal solution; keep dependencies updated.
- Live streams, playlists, videos longer than 3 hours, and files over the configured 1.5 GiB limit are not supported. Only one job may run at a time; output expires after about an hour or a service restart.

## Technical overview

- Frontend: existing Vite + FFmpeg.wasm HLS v3.2, extended with YouTube panel.
- Server: Python FastAPI, yt-dlp[default], FFmpeg, Deno 2.5.6, packaged via multi-stage Dockerfile.
- API: `GET /api/health`, `POST /api/youtube/info`, `POST /api/youtube/jobs`, `GET /api/youtube/jobs/{id}`, `GET /api/youtube/files/{id}`. Private key required for the first three endpoints that expose a video or create jobs; file URLs are unguessable temporary capabilities.
- Supports browser-based video/audio file combining for normal accessible HLS playlists, independently of the YouTube server.
- The old GitHub Pages deployment workflow remains available and still builds the static frontend, but does not deploy the Docker backend.

## Build/testing status

The JavaScript and Python syntax have been checked locally. A complete npm/Docker build and a real YouTube download **have not been verified** in this environment. Verify on your Render URL with a short public video you may save before using large videos. When encountering an error, copy the page error and relevant Render application logs (redact your API key).
