import { FFmpeg } from '@ffmpeg/ffmpeg';
const $ = id => document.getElementById(id);
const log = text => { $('log').textContent += '\n' + text; $('log').scrollTop=$('log').scrollHeight; };
const status = text => { $('status').textContent=text; log(text); };
const MiB = n => (n/1048576).toFixed(1)+' MiB';
const results = { video: [], audio: [] };
let downloaded={video:null,audio:null}, ffmpeg=null, controller=null, running=false;
const saneURL=(s,base) => {const u=new URL(s,base);if(!['https:','http:'].includes(u.protocol))throw Error('Only HTTP(S) sources accepted');return u.href;};
const idFromURL=url=>{const m=url.match(/\/(\d{5,})\/\d+\//);return m?.[1] || '';};
const seconds = x => `${Math.floor(x/3600)}:${String(Math.floor(x/60)%60).padStart(2,'0')}:${String(Math.floor(x%60)).padStart(2,'0')}`;
const typeFromURL=url=> /(?:aud|audio|sound|aac)(?:[._/]|$)/i.test(new URL(url).pathname) ? 'audio':'video';
function parseAttrs(s){const out={};for(const m of s.matchAll(/([\w-]+)=("[^"]*"|[^,]*)/g))out[m[1]]=m[2].replace(/^"|"$/g,'');return out;}
function parseHLS(text, url){
 const lines=text.replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
 if(lines[0]!=='#EXTM3U')throw Error('Not a valid M3U8 playlist');
 if(lines.some(l=>/^#EXT-X-KEY:/.test(l)||/^#EXT-X-SESSION-KEY:/.test(l)))throw Error('Encrypted playlist: this tool does not download protected HLS media.');
 if(lines.some(l=>l.startsWith('#EXT-X-STREAM-INF:'))){
  const variants=[], audios=[];
  for(let i=0;i<lines.length;i++){
   const l=lines[i]; if(l.startsWith('#EXT-X-STREAM-INF:')){const a=parseAttrs(l.split(':').slice(1).join(':'));const next=lines.slice(i+1).find(x=>!x.startsWith('#'));if(next)variants.push({url:saneURL(next,url),quality:a.RESOLUTION||a.BANDWIDTH||'variant',bandwidth:Number(a.BANDWIDTH||0),audioGroup:a.AUDIO||''});}
   if(l.startsWith('#EXT-X-MEDIA:')){const a=parseAttrs(l.slice(13));if(a.TYPE==='AUDIO'&&a.URI)audios.push({url:saneURL(a.URI,url),language:a.LANGUAGE||a.NAME||'audio',group:a['GROUP-ID']||''});}
  }return {kind:'master',variants,audios};
 }
 let duration=0, segments=[], map=null, currentRange=null, previousEnd=-1;
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(line.startsWith('#EXTINF:'))duration+=parseFloat(line.slice(8))||0;
  if(line.startsWith('#EXT-X-MAP:')){let a=parseAttrs(line.slice(11));map={url:saneURL(a.URI,url),range:a.BYTERANGE||null};}
  if(line.startsWith('#EXT-X-BYTERANGE:'))currentRange=line.slice(17);
  if(!line.startsWith('#')){
   const u=saneURL(line,url);let range=null;
   if(currentRange){const [len,pos]=currentRange.split('@');const start=pos===undefined?previousEnd+1:Number(pos);range=[start,start+Number(len)-1];previousEnd=range[1];}else previousEnd=-1;
   segments.push({url:u,range});currentRange=null;
  }
 }
 if(!segments.length)throw Error('No media segments found');
 const urls=[...new Set([...segments.map(s=>s.url), ...(map?[map.url]:[])])];
 const sameResource=urls.length===1 && segments.every(x=>x.range) && !!map;
 return {kind:'media',url,duration,segments,map,sameResource,mediaURL:urls[0],quality:(url.match(/v(\d{3,4})(?=\.)/)||[])[1]||'',recording:idFromURL(url)||idFromURL(urls[0]),bytes:null};
}
async function fetchText(url){const r=await fetch(url,{signal:controller?.signal});if(!r.ok)throw Error(`Playlist HTTP ${r.status}`);return r.text();}
async function addURL(url,forcedType=null,seen=new Set(),depth=0){
 url=saneURL(url,location.href); if(seen.has(url)||depth>3)return;seen.add(url);
 if(/\.mpd(?:\?|$)/i.test(url)){log('DASH MPD detected; importing DASH is not supported in v3.');return;}
 if(/\.(?:mp4|m4s|webm|mov)(?:\?|$)/i.test(url)) {const k=forcedType||typeFromURL(url);results[k].push({kind:'direct',url,mediaURL:url,duration:null,quality: k==='video'?'Direct':'',recording:idFromURL(url)});return;}
 const text=await fetchText(url);await addHLS(text,url,forcedType,seen,depth);
}
async function addHLS(text,url,forcedType=null,seen=new Set(),depth=0){const obj=parseHLS(text,url);
 if(obj.kind==='master'){
  for(const a of obj.variants){try{await addURL(a.url,'video',seen,depth+1); const last=results.video.at(-1);if(last?.url===a.url){last.quality=a.quality;last.audioGroup=a.audioGroup;}}catch(e){log('Variant skipped: '+e.message);}}
  for(const a of obj.audios){try{await addURL(a.url,'audio',seen,depth+1); const last=results.audio.at(-1);if(last?.url===a.url){last.language=a.language;last.group=a.group;}}catch(e){log('Audio variant skipped: '+e.message);}}
 }else{const kind=forcedType||typeFromURL(url);if(!results[kind].some(x=>x.url===url))results[kind].push(obj);log(`Found ${kind}: ${obj.quality||obj.language||'source'} ${seconds(obj.duration)} / ${obj.segments.length} segments`);}
}
function refresh(){
 for(const k of ['video','audio']){
  const sel=$(k+'Select');sel.innerHTML=''; const arr=results[k];
  arr.forEach((x,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${x.quality?x.quality+'p · ':''}${x.language||''} ${x.duration?seconds(x.duration)+' · ':''}${x.recording?'ID '+x.recording+' · ':''}${x.kind==='direct'?'file':'HLS'} · ${new URL(x.url).hostname}`;sel.append(o);});
  if(k==='audio'){const none=document.createElement('option');none.value='none';none.textContent='No audio';sel.prepend(none); if(!arr.length)sel.value='none';}
 }
 const video=results.video[+$('videoSelect').value], matches=results.audio.map((x,i)=>({x,i,score:(video?.recording&&x.recording===video.recording?100:0)+(video?.duration&&x.duration&&Math.abs(video.duration-x.duration)<1?50:0)})).sort((a,b)=>b.score-a.score);
 if(matches[0]&&matches[0].score>0)$('audioSelect').value=String(matches[0].i);
 showMatch();$('discovery').textContent=`Found ${results.video.length} video sources and ${results.audio.length} audio sources.`;
}
function showMatch(){const v=results.video[+$('videoSelect').value],a=results.audio[+$('audioSelect').value];if(!v){$('match').textContent='No video selected.';return;}
 if(!a){$('match').textContent='Video only; no matching audio selected.';return;}
 const delta=v.duration&&a.duration?Math.abs(v.duration-a.duration):null;
 const idBad=v.recording&&a.recording&&v.recording!==a.recording;
 $('match').textContent=`${idBad?'WARNING: Recording IDs differ. ':''}${delta===null?'Duration unknown.':`Track duration difference: ${delta.toFixed(3)} seconds.`} ${delta!==null&&delta>2?'WARNING: Tracks may not synchronize.':''}`;
}
$('videoSelect').onchange=()=>{const video=results.video[+$('videoSelect').value];const matches=results.audio.map((x,i)=>({x,i,score:(video?.recording&&x.recording===video.recording?100:0)+(video?.duration&&x.duration&&Math.abs(video.duration-x.duration)<1?50:0)})).sort((a,b)=>b.score-a.score);if(matches[0]?.score>0)$('audioSelect').value=String(matches[0].i);showMatch();};$('audioSelect').onchange=showMatch;
$('inspect').onclick=async()=>{
 try{controller=new AbortController();const raw=$('source').value.trim();if(!raw)throw Error('Paste a URL or discovery JSON');
  let items=[];if(raw.startsWith('{')||raw.startsWith('[')){const j=JSON.parse(raw);items=Array.isArray(j)?j:(j.sources||[]);if(!items.length)throw Error('No URLs found in JSON');}else items=raw.split(/\s+/).map(url=>({url}));
  for(const item of items){try{await addURL(typeof item==='string'?item:item.url,item.type==='audio'?'audio':null);}catch(e){log('Source skipped: '+e.message);}}
  refresh();status('Media discovery finished.');
 }catch(e){status('Discovery error: '+e.message);}
};
$('inspectFiles').onclick=async()=>{
 try{for(const [id,kind] of [['videoFiles','video'],['audioFiles','audio']])for(const file of $(id).files){await addHLS(await file.text(),`https://import.invalid/${encodeURIComponent(file.name)}`,kind);}
  refresh();status('Local playlists inspected. Relative URLs in local playlists require the original online playlist URL.');
 }catch(e){status('Playlist import error: '+e.message);}
};
async function rangeFetch(url,start,end){for(let attempt=0;attempt<4;attempt++){
 try{const r=await fetch(url,{headers:{Range:`bytes=${start}-${end}`},signal:controller.signal});if(r.status!==206)throw Error(`Expected 206, got HTTP ${r.status}; range request not accepted`);
 const cr=r.headers.get('Content-Range')||'';const m=cr.match(/^bytes (\d+)-(\d+)\/(\d+|\*)$/i);if(!m||+m[1]!==start||+m[2]!==end)throw Error('Unexpected Content-Range: '+cr);
 const buffer=await r.arrayBuffer();if(buffer.byteLength!==end-start+1)throw Error('Byte count mismatch');return {buffer,total:+m[3]};
 }catch(e){if(controller.signal.aborted)throw Error('Cancelled');if(attempt===3)throw e;await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}}
}
async function fetchWhole(source,label){
 const url=source.mediaURL;
 if(source.kind==='direct'||source.sameResource){const probe=await rangeFetch(url,0,Math.min(1023,source.map?.range?Number(source.map.range.split('@')[0])-1:1023));const total=probe.total;
 if(!Number.isFinite(total)||!total)throw Error('Unknown total size');log(`${label}: ${MiB(total)} accessible`);
 const parts=[];let count=0;for(let start=0;start<total;start+=2*1048576){const end=Math.min(total-1,start+2*1048576-1);const result=await rangeFetch(url,start,end);parts.push(result.buffer);count+=result.buffer.byteLength;if(count%(16*1048576)<2*1048576)status(`${label} ${MiB(count)} / ${MiB(total)}`);$('progress').value=Math.round(count/total*45)+(label==='Audio'?45:0);}return new Blob(parts,{type:'video/mp4'});}
 // Conventional HLS segments: append initialization segment first; separate URL segments downloaded sequentially.
 const parts=[];if(source.map){const m=source.map; if(m.range){const [n,o='0']=m.range.split('@');parts.push((await rangeFetch(m.url,+o,+o+(+n)-1)).buffer);}else{const r=await fetch(m.url,{signal:controller.signal});if(!r.ok)throw Error('Init segment HTTP '+r.status);parts.push(await r.arrayBuffer());}}
 for(let i=0;i<source.segments.length;i++){
  const s=source.segments[i];if(s.range){parts.push((await rangeFetch(s.url,...s.range)).buffer);}else{const r=await fetch(s.url,{signal:controller.signal});if(!r.ok)throw Error('Segment HTTP '+r.status);parts.push(await r.arrayBuffer());}
  if(i%20===0){status(`${label}: ${i+1} / ${source.segments.length} segments`);$('progress').value=Math.floor(45*(i+1)/source.segments.length)+(label==='Audio'?45:0);}
 }
 return new Blob(parts,{type:'video/mp4'});
}
const selected=()=>[results.video[+$('videoSelect').value],results.audio[+$('audioSelect').value]];
$('test').onclick=async()=>{try{controller=new AbortController();for(const [source,name] of selected().map((s,i)=>[s,i?'audio':'video']))if(source){const r=await rangeFetch(source.mediaURL,0,255);log(`${name}: HTTP 206 (${r.buffer.byteLength} bytes), resource total ${MiB(r.total)}`);}status('Source access tests passed.');}catch(e){status('Access test failed: '+e.message);}};
$('cancel').onclick=()=>{controller?.abort();status('Cancel requested.');};
$('download').onclick=async()=>{if(running)return;running=true;controller=new AbortController();$('download').disabled=true;try{
 const [v,a]=selected();if(!v)throw Error('Select a video first');if(a&&v.recording&&a.recording&&v.recording!==a.recording)throw Error('Audio and video recording IDs disagree; choose the correct tracks.');if(a&&v.duration&&a.duration&&Math.abs(v.duration-a.duration)>2)throw Error('Video and audio durations differ by more than 2 seconds.');
 downloaded.video=await fetchWhole(v,'Video');$('saveVideo').disabled=false;status(`Video ready (${MiB(downloaded.video.size)}).`);
 if(a){downloaded.audio=await fetchWhole(a,'Audio');$('saveAudio').disabled=false;status(`Audio ready (${MiB(downloaded.audio.size)}).`);}status('Selected tracks downloaded. You can save them separately or merge.');$('progress').value=100;
 }catch(e){status('Download failed: '+e.message);}finally{running=false;$('download').disabled=false;}};
function save(blob,name){if(!blob)throw Error('No data downloaded yet');const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),180000);}
$('saveVideo').onclick=()=>save(downloaded.video,'grabber-video-only.mp4');$('saveAudio').onclick=()=>save(downloaded.audio,'grabber-audio-only.mp4');
async function engine(){if(ffmpeg?.loaded)return ffmpeg;if(location.protocol!=='https:'&&location.hostname!=='localhost')throw Error('Use published HTTPS site');const root=new URL(import.meta.env.BASE_URL,location.href);const workerURL=new URL('ffmpeg/worker.js',root).href,coreURL=new URL('ffmpeg/ffmpeg-core.js',root).href,wasmURL=new URL('ffmpeg/ffmpeg-core.wasm',root).href;
 for(const url of [workerURL,coreURL,wasmURL]){const r=await fetch(url,{method:'HEAD'});if(!r.ok)throw Error(`Missing engine asset: ${url} (HTTP ${r.status})`);}
 const ff=new FFmpeg();ff.on('log',({message})=>{if(/error|failed|Stream #|Duration:|Output #/i.test(message))log('[ffmpeg] '+message.slice(0,250));});ff.on('progress',({progress})=>{if(Number.isFinite(progress))$('progress').value=Math.max(0,Math.min(95,progress*95));});status('Loading same-origin FFmpeg worker...');await ff.load({classWorkerURL:workerURL,coreURL,wasmURL});ffmpeg=ff;status('Engine ready.');return ff;}
$('engine').onclick=async()=>{try{await engine();}catch(e){status('Engine error: '+(e.stack||e));}};
$('merge').onclick=async()=>{if(running)return;running=true;$('merge').disabled=true;try{
 const ff=await engine();const v=$('mergeVideo').files[0]||downloaded.video,a=$('mergeAudio').files[0]||downloaded.audio;
 if(!v||!a)throw Error('Provide both video and audio tracks.');status(`Loading ${MiB(v.size)} video and ${MiB(a.size)} audio into memory...`);await ff.writeFile('video.mp4',new Uint8Array(await v.arrayBuffer()));await ff.writeFile('audio.mp4',new Uint8Array(await a.arrayBuffer()));status('Muxing without re-encoding...');const code=await ff.exec(['-i','video.mp4','-i','audio.mp4','-map','0:v:0','-map','1:a:0','-c','copy','-movflags','+faststart','-y','combined.mp4'],600000);if(code!==0)throw Error(`FFmpeg exit code ${code}`);const out=await ff.readFile('combined.mp4');save(new Blob([out],{type:'video/mp4'}),'Safari-Media-Grabber-combined.mp4');status(`Combined MP4 saved (${MiB(out.byteLength)}).`);$('progress').value=100;for(const f of ['video.mp4','audio.mp4','combined.mp4'])try{await ff.deleteFile(f);}catch{}
 }catch(e){status('Merge failed: '+(e.stack||e));}finally{running=false;$('merge').disabled=false;}};
$('copyLog').onclick=async()=>{try{await navigator.clipboard.writeText($('log').textContent);status('Log copied.');}catch(e){status('Copy failed: '+e.message);}};
