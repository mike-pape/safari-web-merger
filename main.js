import { FFmpeg } from '@ffmpeg/ffmpeg';

const $ = id => document.getElementById(id);
const MiB = x => (x / 1048576).toFixed(1) + ' MiB';
let ffmpeg = null;
let busy = false;
const log = value => { $('log').textContent += '\n' + value; $('log').scrollTop = $('log').scrollHeight; };
const status = value => { $('status').textContent = value; log(value); };
const describe = error => [String(error), error?.message, error?.stack].filter(Boolean).join(' | ');

async function init() {
  if (ffmpeg?.loaded) return ffmpeg;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') throw new Error('Open the published HTTPS site, not a file:// page.');
  const root = new URL(import.meta.env.BASE_URL, location.href);
  const workerURL = new URL('ffmpeg/worker.js', root).href;
  const coreURL = new URL('ffmpeg/ffmpeg-core.js', root).href;
  const wasmURL = new URL('ffmpeg/ffmpeg-core.wasm', root).href;
  log('Worker: ' + workerURL);
  log('Core: ' + coreURL);
  log('WASM: ' + wasmURL);
  for (const url of [workerURL, coreURL, wasmURL]) {
    const head = await fetch(url, { method: 'HEAD' });
    if (!head.ok) throw new Error(`Asset unavailable (HTTP ${head.status}): ${url}`);
  }
  const instance = new FFmpeg();
  instance.on('log', ({ message }) => {
    if (/error|failed|invalid|Stream #|Duration:|Output #/i.test(message)) log('[ffmpeg] ' + message.slice(0, 320));
  });
  instance.on('progress', ({ progress }) => {
    if (Number.isFinite(progress)) $('progress').value = Math.min(97, Math.max(0, progress * 95));
  });
  status('Loading same-origin FFmpeg ESM worker and WASM...');
  let timeout;
  try {
    await Promise.race([
      instance.load({ classWorkerURL: workerURL, coreURL, wasmURL }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Engine startup exceeded 90 seconds')), 90000); })
    ]);
  } finally { clearTimeout(timeout); }
  ffmpeg = instance;
  status('FFmpeg engine initialized successfully.');
  return ffmpeg;
}

async function run(testOnly) {
  if (busy) return;
  busy = true;
  $('test').disabled = $('merge').disabled = true;
  $('progress').value = 0;
  $('log').textContent = `Safari Video + Audio Merger v2.4\nOrigin: ${location.origin}\nSecure: ${isSecureContext}\nCross-origin isolated: ${crossOriginIsolated}`;
  try {
    const ff = await init();
    if (testOnly) { status('ENGINE TEST PASSED.'); return; }
    const video = $('video').files[0];
    const audio = $('audio').files[0];
    if (!video || !audio) throw new Error('Select both saved MP4 files before merging.');
    if (video.size < 1000000 || audio.size < 1000000) throw new Error('One of your inputs appears too small; do not select an .m3u8 playlist.');
    log(`Video: ${video.name} (${MiB(video.size)})`);
    log(`Audio: ${audio.name} (${MiB(audio.size)})`);
    status('Loading video into FFmpeg memory. Safari may require over 1 GB of free memory.');
    await ff.writeFile('video.mp4', new Uint8Array(await video.arrayBuffer()));
    $('progress').value = 20;
    status('Loading audio into FFmpeg memory...');
    await ff.writeFile('audio.mp4', new Uint8Array(await audio.arrayBuffer()));
    $('progress').value = 30;
    status('Muxing without transcoding. This can take a few minutes...');
    const exitCode = await ff.exec(['-i', 'video.mp4', '-i', 'audio.mp4', '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy', '-movflags', '+faststart', '-y', 'combined.mp4'], 600000);
    if (exitCode !== 0) throw new Error(`FFmpeg exited with code ${exitCode}. See log for detail.`);
    status('Reading completed MP4...');
    const output = await ff.readFile('combined.mp4');
    if (!output?.byteLength || output.byteLength < 1000000) throw new Error('Invalid or unexpectedly small output.');
    const blob = new Blob([output], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ACA-Webinar-20260324-1080p-with-audio.mp4';
    document.body.appendChild(a);
    a.click();
    a.remove();
    $('progress').value = 100;
    status(`SUCCESS. Saved combined MP4 (${MiB(blob.size)}). Check Safari Downloads.`);
    setTimeout(() => URL.revokeObjectURL(url), 180000);
    // Free memory after successful merge.
    try { await ff.deleteFile('video.mp4'); await ff.deleteFile('audio.mp4'); await ff.deleteFile('combined.mp4'); } catch (e) { log('Cleanup warning: ' + e); }
  } catch (error) {
    status('ERROR: ' + describe(error));
    log('If this is a memory error, Safari cannot reliably merge files of this size using WebAssembly. Keep the original tracks.');
  } finally {
    busy = false;
    $('test').disabled = $('merge').disabled = false;
  }
}
$('test').addEventListener('click', () => run(true));
$('merge').addEventListener('click', () => run(false));
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('log').textContent); status('Copied diagnostic log.'); }
  catch (e) { status('Copy failed: ' + e); }
});
