# Safari Network import (v3.2)

The bookmarklet cannot inspect a cross-origin video iframe. Instead:

1. Open the page with the video in Safari.
2. Open **Develop → Show Web Inspector → Network**.
3. Reload the page and press Play (or seek).
4. Filter the request list for `m3u8` and identify the playlists from the desired recording. In Safari versions that support exporting Network traffic to HAR, save a HAR; otherwise copy request URLs (or request details) into a text document or directly into the site.
5. Open your hosted Media Grabber website, use **Import Safari network requests**, choose the HAR/text file or paste the copied requests, and click **Find HLS playlists**.
6. Choose matching quality and audio, test access, download tracks and merge as before.

The imported file is parsed locally in the browser. Cross-origin media downloads still require server permission. DRM is unsupported. Signed playlist URLs may expire, and HAR exports can include cookies, headers, and authentication tokens. **Do not upload HAR captures into a public GitHub repository or share them.** If the app cannot fetch the playlist because of CORS, use the existing local playlist import with a matching original URL when required for relative media references.

## Updating the existing GitHub Pages repository

Replace **only** `index.html` and `src/main.js` with the files from this package. Keep `.github/workflows/deploy.yml`, `scripts/copy-assets.mjs`, `vite.config.js`, and all existing FFmpeg assets/dependencies. Optional: update `package.json`. Commit to `main` and wait for the GitHub Actions workflow to deploy. Do not upload this ZIP as a file to the repository.
