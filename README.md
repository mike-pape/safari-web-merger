# Safari Video + Audio Merger v2.4

A same-origin ESM-worker FFmpeg.wasm web app for merging **already downloaded**, matching MP4 video and audio tracks. The input files stay in your Safari tab; GitHub only hosts the webpage code.

## Publish using Safari and GitHub Pages (no Xcode or Terminal)

GitHub Pages cannot run `npm install` itself. This project includes a GitHub Actions workflow to build and deploy the site on each push to `main`.

1. Sign in to github.com and create a **new public repository**, e.g. `safari-web-merger`, with a README if GitHub requires one. Public is simplest for GitHub Pages on Free accounts.
2. Upload **the contents of this extracted folder** to the repository, preserving folders, including `.github/workflows/deploy.yml`. If Safari's file picker hides the `.github` directory, use the GitHub web editor to create `.github/workflows/deploy.yml` using the supplied file's text. Do **not** upload the ZIP as a single file.
3. Open repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open the **Actions** tab. Run or wait for **Publish Safari Merger**. The workflow installs NPM dependencies on GitHub's build runner, copies the actual FFmpeg ESM worker+core files, builds the site, and deploys it.
5. Once deployed, GitHub Pages shows the URL, usually `https://YOURUSERNAME.github.io/safari-web-merger/`.
6. Open that URL in Safari. Click **Test engine** before selecting files. Then choose your saved `webinar-6923750-video-only.mp4` and `webinar-6923750-audio-only.mp4`, click **Combine into MP4**.

## Limitations and privacy

- **Never open `index.html` directly** with `file://`; the app needs an HTTPS origin for module workers.
- This is a **single-thread** core. No COOP/COEP headers or SharedArrayBuffer are required.
- Safari may run out of memory when muxing ~455 MiB of input and producing a similarly sized output. There is no guarantee of success for files this large.
- This is an **unverified build**: package syntax and assets paths can be checked here, but the complete GitHub Actions build and Safari execution require publishing and testing.
- The app only reads local files using the File API and processes them with FFmpeg in Safari. No upload API is included.
- Only process recordings you are authorized to save.
- If the site returns 404 for the FFmpeg files, inspect the GitHub Actions logs and confirm all assets were copied into `dist/ffmpeg/`.
