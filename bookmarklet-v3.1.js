(()=>{
'use strict';
const ID='safari-grabber-v31';
if(window.__safariGrabberV31?.stop)window.__safariGrabberV31.stop();
const items=new Map(),frames=new Map(),cleanups=[];
const mediaRe=/\.(?:m3u8|mpd|mp4|m4v|webm|mov|m4a|mp3|aac|m4s)(?=$|[?#])/i;
const urlRe=/(?:https?:)?\/\/[^\s"'<>\\]+?\.(?:m3u8|mpd|mp4|webm|m4a|mp3|aac)(?:\?[^\s"'<>\\]*)?|(?:\.\.\/|\/)[^\s"'<>\\]+?\.(?:m3u8|mpd|mp4|webm|m4a|mp3|aac)(?:\?[^\s"'<>\\]*)?/gi;
function add(raw,how='page',base=location.href){
 if(!raw||typeof raw!=='string')return;
 try{const u=new URL(raw.replace(/&amp;/g,'&'),base);if(!/^https?:$/.test(u.protocol)||!mediaRe.test(u.href))return;
 const k=u.href;if(!items.has(k)){items.set(k,{url:k,type:/\.m3u8(?=$|[?#])/i.test(k)?'HLS':/\.mpd(?=$|[?#])/i.test(k)?'DASH':/\.(mp3|aac|m4a)(?=$|[?#])/i.test(k)?'audio':'media',detectedBy:how});draw();}
 }catch{}
}
function scrapeText(s,how,base){if(!s||s.length>2000000)return;for(const m of s.matchAll(urlRe))add(m[0],how,base);}
function scan(doc= document,depth=0){
 try{
  const base=doc.baseURI||location.href;
  doc.querySelectorAll('video,audio,source,track,a[href],link[href],script[src],iframe').forEach(el=>{
   for(const a of ['src','href']){const v=el.getAttribute(a);if(v)add(v,'element',base);}
   if(el.currentSrc)add(el.currentSrc,'currentSrc',base);
   if(el.tagName==='IFRAME'){
    const src=el.src||'(no src)';frames.set(src,{url:src,width:el.clientWidth,height:el.clientHeight,accessible:false});
    try{const inner=el.contentDocument;if(inner&&depth<2){frames.get(src).accessible=true;scan(inner,depth+1);}}catch{}
   }
  });
  doc.querySelectorAll('script:not([src])').forEach(el=>scrapeText(el.textContent||'','inline script',base));
  // Limited to attributes likely to contain a video source; don't crawl full page text.
  doc.querySelectorAll('[data-src],[data-url],[data-hls],[data-video-url]').forEach(el=>{for(const a of el.attributes){if(a.name.startsWith('data-'))add(a.value,'data attribute',base);}});
 }catch{}
}
function perf(){try{for(const e of performance.getEntriesByType('resource'))add(e.name,'resource timing');}catch{}}
const root=document.createElement('div');root.id=ID;root.style.cssText='position:fixed;z-index:2147483647;top:15px;right:15px;width:min(490px,calc(100vw - 30px));max-height:88vh;overflow:auto;background:#142137;color:#fff;border:1px solid #46617c;border-radius:14px;box-shadow:0 18px 60px #0009;padding:16px;font:13px/1.45 -apple-system,BlinkMacSystemFont,sans-serif;text-align:left;';
root.innerHTML='<div style="font-weight:700;font-size:18px">Safari Media Finder v3.1</div><div id="sg-status" style="margin:8px 0;color:#cbd9e7"></div><div id="sg-items"></div><textarea id="sg-data" aria-label="Results JSON" style="box-sizing:border-box;width:100%;height:125px;margin-top:10px;background:#f8fbff;color:#172032;border-radius:6px"></textarea><div id="sg-buttons" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"></div><div style="color:#bed0e3;margin-top:9px;font-size:12px">Cross-origin frames cannot be inspected. Resource Timing may omit their media requests. DRM and access controls are not bypassed.</div>';
const status=root.querySelector('#sg-status'),out=root.querySelector('#sg-data'),results=root.querySelector('#sg-items'),bar=root.querySelector('#sg-buttons');
function makeButton(text,fn){const b=document.createElement('button');b.textContent=text;b.style.cssText='background:#297ad8;color:#fff;border:0;border-radius:7px;padding:8px 10px;cursor:pointer';b.onclick=fn;bar.append(b);}
function data(){return JSON.stringify({page:location.href,sources:[...items.values()],frames:[...frames.values()]},null,2)}
function draw(){if(!root.isConnected)return;status.textContent=`${items.size} media URL(s) found • ${frames.size} frame(s) • monitoring page`;results.replaceChildren();for(const v of [...items.values()].slice(0,40)){const p=document.createElement('div');p.style.cssText='border-top:1px solid #45566c;padding:7px 0;overflow-wrap:anywhere';const strong=document.createElement('strong');strong.textContent=`${v.type} (${v.detectedBy})`;const a=document.createElement('a');a.textContent=v.url;a.href=v.url;a.target='_blank';a.rel='noopener noreferrer';a.style='display:block;color:#95cdff';p.append(strong,a);results.append(p);}out.value=data();}
function stop(){for(const f of cleanups)try{f()}catch{}root.remove();delete window.__safariGrabberV31;}
makeButton('Rescan',()=>{scan();perf();draw()});
makeButton('Copy results',async()=>{const val=data();try{await navigator.clipboard.writeText(val)}catch{out.select();document.execCommand('copy');}});
makeButton('Open Grabber',()=>window.open('https://mike-pape.github.io/safari-web-merger/','_blank','noopener'));
makeButton('Stop / close',stop);
document.body.append(root);window.__safariGrabberV31={stop};
scan();perf();draw();
const po=typeof PerformanceObserver==='function'?new PerformanceObserver(list=>{for(const e of list.getEntries())add(e.name,'new resource')}):null;
if(po){try{po.observe({type:'resource',buffered:true});cleanups.push(()=>po.disconnect())}catch{}}
const mo=new MutationObserver(records=>{if(records.every(r=>root.contains(r.target)))return;scan();perf();draw()});mo.observe(document.documentElement,{childList:true,subtree:true});cleanups.push(()=>mo.disconnect());
// Periodic refresh captures video elements with a new currentSrc after playback starts.
const timer=setInterval(()=>{scan();perf();draw()},3500);cleanups.push(()=>clearInterval(timer));
})();
