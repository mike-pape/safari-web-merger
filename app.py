"""Personal-use YouTube extractor; run behind a private API key."""
import asyncio
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse
from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

API_KEY = os.environ.get('GRABBER_API_KEY', '')
BASE = Path(tempfile.gettempdir()) / 'safari-grabber-jobs'
BASE.mkdir(parents=True, exist_ok=True)
MAX_DURATION = int(os.environ.get('MAX_DURATION_SECONDS', '10800'))
MAX_BYTES = int(os.environ.get('MAX_DOWNLOAD_BYTES', str(1500 * 1024 * 1024)))
JOBS = {}
LOCK = threading.Lock()
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

class VideoInput(BaseModel):
    url: str

class DownloadInput(VideoInput):
    quality: str = '1080'

def check_token(x_api_key: str | None):
    if not API_KEY:
        raise HTTPException(503, 'Administrator must configure GRABBER_API_KEY before use.')
    if x_api_key != API_KEY:
        raise HTTPException(401, 'Invalid API key')

def normalize_youtube(url):
    try:
        p = urlparse(url.strip())
        host = (p.hostname or '').lower()
        if p.scheme != 'https' or host not in ('youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be','music.youtube.com'):
            raise ValueError()
        if p.username or p.password or p.port:
            raise ValueError()
        if host.endswith('youtu.be'):
            video_id = p.path.lstrip('/').split('/')[0]
        else:
            from urllib.parse import parse_qs
            if p.path == '/watch':
                video_id = parse_qs(p.query).get('v', [''])[0]
            elif re.fullmatch(r'/(?:shorts|live|embed)/[\w-]{11}', p.path):
                video_id = p.path.split('/')[-1]
            else:
                raise ValueError()
        if not re.fullmatch(r'[\w-]{11}', video_id):
            raise ValueError()
        return 'https://www.youtube.com/watch?v=' + video_id
    except (ValueError, TypeError):
        raise HTTPException(400, 'Enter an ordinary YouTube video URL, not a playlist or arbitrary address.')

def ytdlp_info(url):
    import yt_dlp
    opts = {'quiet':True,'no_warnings':True,'noplaylist':True,'skip_download':True,'extract_flat':False,'socket_timeout':20,'retries':2,'ignoreerrors':False,'js_runtimes':{'deno':{'path':'/usr/local/bin/deno'}}}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    if not info or info.get('is_live'):
        raise ValueError('Live or unavailable video is not supported.')
    if int(info.get('duration') or 0) > MAX_DURATION:
        raise ValueError('Video exceeds configured maximum duration.')
    return {'id':info.get('id'),'title':info.get('title'),'duration':info.get('duration'),'uploader':info.get('uploader'), 'thumbnail':info.get('thumbnail'), 'webpage_url':url}

@app.get('/api/health')
def health():
    return {'ok':True,'extractor':'yt-dlp','authorization':'required'}

@app.post('/api/youtube/info')
async def info(data: VideoInput, x_api_key: str | None = Header(None)):
    check_token(x_api_key)
    url = normalize_youtube(data.url)
    try:
        return await asyncio.wait_for(asyncio.to_thread(ytdlp_info, url), timeout=90)
    except Exception as exc:
        raise HTTPException(422, f'YouTube extraction failed: {str(exc)[:350]}')

def cleanup():
    now=time.time()
    with LOCK:
        doomed=[k for k,v in JOBS.items() if v['created'] < now-3600 and v['state'] not in ('running','queued')]
        for k in doomed:
            job=JOBS.pop(k)
            shutil.rmtree(job['folder'], ignore_errors=True)

def execute_job(job_id, url, quality):
    job=JOBS[job_id]
    job['state']='running'
    formats={
      'best':'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
      '1080':'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]',
      '720':'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b[height<=720]',
      '480':'bv*[height<=480][ext=mp4]+ba[ext=m4a]/b[height<=480][ext=mp4]/bv*[height<=480]+ba/b[height<=480]',
      'audio':'ba[ext=m4a]/ba'
    }
    folder=Path(job['folder'])
    args=['yt-dlp','--no-playlist','--no-part','--no-cache-dir','--restrict-filenames',
          '--format',formats[quality],'--retries','3','--fragment-retries','3',
          '--socket-timeout','20','--max-filesize','1400M',
          '--output',str(folder/'recording.%(ext)s')]
    if quality=='audio': args += ['--extract-audio','--audio-format','m4a']
    else: args += ['--merge-output-format','mp4']
    args.append(url)
    try:
        proc=subprocess.run(args,capture_output=True,text=True,timeout=1800)
        if proc.returncode:
            raise RuntimeError((proc.stderr or proc.stdout)[-900:] or f'yt-dlp exited {proc.returncode}')
        candidates=[p for p in folder.glob('recording.*') if p.suffix.lower() in ('.mp4','.m4a','.webm','.mkv')]
        if not candidates: raise RuntimeError('No output media file created')
        result=max(candidates,key=lambda p:p.stat().st_size)
        if result.stat().st_size > MAX_BYTES: raise RuntimeError('Output exceeds storage limit')
        job['file']=str(result)
        job['state']='ready'
    except subprocess.TimeoutExpired:
        job['state']='failed';job['error']='Processing timed out after 30 minutes.'
    except Exception as exc:
        job['state']='failed';job['error']=str(exc)[-700:]
    finally:
        if job['state']!='ready': shutil.rmtree(folder,ignore_errors=True)
        cleanup()

@app.post('/api/youtube/jobs')
def start(data: DownloadInput, x_api_key: str | None = Header(None)):
    check_token(x_api_key)
    url=normalize_youtube(data.url)
    if data.quality not in ('best','1080','720','480','audio'):
        raise HTTPException(400,'Unsupported quality')
    cleanup()
    with LOCK:
        if sum(v['state'] in ('queued','running') for v in JOBS.values()) >= 1:
            raise HTTPException(429,'Another video is being prepared. Wait for it to finish.')
        jid=uuid.uuid4().hex
        path=BASE/jid;path.mkdir()
        JOBS[jid]={'state':'queued','created':time.time(),'folder':str(path),'file':None,'error':None}
    threading.Thread(target=execute_job,args=(jid,url,data.quality),daemon=True).start()
    return {'job_id':jid,'state':'queued'}

@app.get('/api/youtube/jobs/{job_id}')
def job_status(job_id: str, x_api_key: str | None = Header(None)):
    check_token(x_api_key)
    job=JOBS.get(job_id)
    if not job:raise HTTPException(404,'Job expired or missing')
    result={'state':job['state'],'error':job['error']}
    if job['state']=='ready':
        result['size']=Path(job['file']).stat().st_size
        result['download_url']=f'/api/youtube/files/{job_id}'
    return result

# Unpredictable job IDs serve as short-lived download capabilities. Do not share them.
@app.get('/api/youtube/files/{job_id}')
def file(job_id: str):
    job=JOBS.get(job_id)
    if not job or job['state']!='ready' or time.time()-job['created']>3600:
        raise HTTPException(404,'Download unavailable or expired')
    path=Path(job['file'])
    return FileResponse(path,media_type='application/octet-stream',filename='youtube-video'+path.suffix)

app.mount('/',StaticFiles(directory='dist',html=True),name='site')
