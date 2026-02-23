const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const qPublicPath = 'public/data/questions/sheets-import-questions.json';
const qDocsPath = 'docs/data/questions/sheets-import-questions.json';
const fPublicPath = 'public/data/questions/flagged-media-questions.json';
const fDocsPath = 'docs/data/questions/flagged-media-questions.json';
const checkpointPath = '.clip-resolve-checkpoint.json';

const clipRegex = /youtube\.com\/clip\//i;

function readJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function writeJson(p,obj){ fs.writeFileSync(p, JSON.stringify(obj,null,2)+'\n'); }

function toWatchUrl(videoId,startMs,endMs){
  const params = new URLSearchParams();
  if(Number.isFinite(startMs)) params.set('start', String(Math.max(0, Math.floor(startMs/1000))));
  if(Number.isFinite(endMs)) params.set('end', String(Math.max(0, Math.ceil(endMs/1000))));
  const qs = params.toString();
  return `https://www.youtube.com/watch?v=${videoId}${qs ? `&${qs}` : ''}`;
}

function parseCliptToSeconds(raw){
  if(!raw) return null;
  const s = String(raw).trim();
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?(?:-(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?)?$/i);
  if(!m) return null;
  const toSec = (h,m,s)=> (Number(h||0)*3600 + Number(m||0)*60 + Number(s||0));
  const a = toSec(m[1],m[2],m[3]);
  const b = (m[4]||m[5]||m[6]) ? toSec(m[4],m[5],m[6]) : null;
  return {start:a, end:b};
}

function parseSourceForMeta(source){
  const out = { videoId:null, startMs:null, endMs:null };

  const vidPatterns = [
    /"videoId":"([A-Za-z0-9_-]{11})"/,
    /"watchEndpoint"\s*:\s*\{[^{}]{0,400}?"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/,
    /"currentVideoEndpoint"\s*:\s*\{[^{}]{0,400}?"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/,
    /[?&]v=([A-Za-z0-9_-]{11})(?:[&#"'\\\s]|$)/,
    /\/watch\?v=([A-Za-z0-9_-]{11})(?:[&#"'\\\s]|$)/
  ];
  for(const p of vidPatterns){ const m = source.match(p); if(m){ out.videoId = m[1]; break; } }

  const startPatterns = [
    /"startTimeMs":"?(\d{1,12})"?/,
    /"clipStartTimeMs":"?(\d{1,12})"?/,
    /"startMs":"?(\d{1,12})"?/,
    /[?&]start=(\d{1,8})(?:[&#"'\\\s]|$)/,
    /[?&]t=(\d{1,8})(?:[&#"'\\\s]|$)/,
  ];
  const endPatterns = [
    /"endTimeMs":"?(\d{1,12})"?/,
    /"clipEndTimeMs":"?(\d{1,12})"?/,
    /"endMs":"?(\d{1,12})"?/,
    /[?&]end=(\d{1,8})(?:[&#"'\\\s]|$)/,
  ];

  for(const p of startPatterns){
    const m = source.match(p);
    if(m){
      const n = Number(m[1]);
      if(Number.isFinite(n)) { out.startMs = n > 86400 ? n : n*1000; break; }
    }
  }
  for(const p of endPatterns){
    const m = source.match(p);
    if(m){
      const n = Number(m[1]);
      if(Number.isFinite(n)) { out.endMs = n > 86400 ? n : n*1000; break; }
    }
  }

  if((out.startMs == null || out.endMs == null)){
    const m = source.match(/[?&]clipt=([0-9hms\-]+)/i);
    if(m){
      const v = parseCliptToSeconds(m[1]);
      if(v){
        if(out.startMs == null && Number.isFinite(v.start)) out.startMs = v.start * 1000;
        if(out.endMs == null && Number.isFinite(v.end)) out.endMs = v.end * 1000;
      }
    }
  }

  if((out.startMs == null || out.endMs == null)){
    const m = source.match(/"clipCreation"[^\n\r]{0,3000}?"startTimeMs":"?(\d+)"?[^\n\r]{0,3000}?"endTimeMs":"?(\d+)"?/);
    if(m){
      if(out.startMs == null) out.startMs = Number(m[1]);
      if(out.endMs == null) out.endMs = Number(m[2]);
    }
  }

  if(out.startMs != null && out.endMs != null && out.endMs <= out.startMs){
    out.endMs = null;
  }
  return out;
}

function loadCheckpoint(){
  if(!fs.existsSync(checkpointPath)) return { attempted: [], resolved: {}, failed: [], lastUpdated: null };
  try {
    const c = JSON.parse(fs.readFileSync(checkpointPath,'utf8'));
    return {
      attempted: Array.isArray(c.attempted) ? c.attempted : [],
      resolved: c.resolved && typeof c.resolved === 'object' ? c.resolved : {},
      failed: Array.isArray(c.failed) ? c.failed : [],
      lastUpdated: c.lastUpdated || null
    };
  } catch {
    return { attempted: [], resolved: {}, failed: [], lastUpdated: null };
  }
}
function saveCheckpoint(c){
  c.lastUpdated = new Date().toISOString();
  fs.writeFileSync(checkpointPath, JSON.stringify(c,null,2)+'\n');
}

(async()=>{
  const qPublic = readJson(qPublicPath);
  const qDocs = readJson(qDocsPath);
  const fPublic = readJson(fPublicPath);
  const fDocs = readJson(fDocsPath);

  const unresolved = [...new Set((qPublic.questions||[])
    .filter(q => q.type==='media' && typeof q.mediaUrl==='string' && clipRegex.test(q.mediaUrl))
    .map(q => q.mediaUrl))];

  const cp = loadCheckpoint();
  const attemptedSet = new Set(cp.attempted);
  const failedSet = new Set(cp.failed);
  const resolvedMap = new Map(Object.entries(cp.resolved||{}));

  const queue = unresolved.filter(url => !resolvedMap.has(url) && !attemptedSet.has(url));

  console.log(JSON.stringify({
    unresolvedUniqueAtStart: unresolved.length,
    checkpointAttempted: attemptedSet.size,
    checkpointResolved: resolvedMap.size,
    queue: queue.length
  }));

  if(queue.length === 0){
    console.log('Nothing to process, applying checkpoint mappings to datasets only.');
  }

  let browser = null;
  let context = null;
  async function ensureContext(){
    if(context) return;
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled']
    });
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      viewport: { width: 1366, height: 900 }
    });
    await context.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });
  }
  async function resetContext(){
    try { if(context) await context.close(); } catch {}
    try { if(browser) await browser.close(); } catch {}
    context = null;
    browser = null;
    await ensureContext();
  }
  await ensureContext();

  let processed = 0;
  for(const clipUrl of queue){
    let found = null;

    for(const waitMs of [1200, 2600, 5200]){
      let page = null;
      try{
        await ensureContext();
        page = await context.newPage();
        await page.goto(clipUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(waitMs);

        const data = await page.evaluate(() => {
          const scripts = Array.from(document.scripts || []).map(s => s.textContent || '').join('\n');
          const html = document.documentElement ? document.documentElement.outerHTML : '';
          const hrefs = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href') || '').join('\n');
          const initData = (window.ytInitialData ? JSON.stringify(window.ytInitialData) : '');
          const playerResponse = (window.ytInitialPlayerResponse ? JSON.stringify(window.ytInitialPlayerResponse) : '');
          return {
            finalUrl: location.href,
            source: [html, scripts, hrefs, initData, playerResponse].join('\n')
          };
        });

        const candidate = parseSourceForMeta(`${data.finalUrl}\n${data.source}`);
        if(candidate.videoId && Number.isFinite(candidate.startMs) && Number.isFinite(candidate.endMs) && candidate.endMs > candidate.startMs){
          found = candidate;
          try { await page.close(); } catch {}
          break;
        }
      } catch (e) {
        try { if(page) await page.close(); } catch {}
        try {
          const msg = String(e && e.message ? e.message : e || '');
          if(msg.includes('has been closed') || msg.includes('Target page, context or browser has been closed')){
            await resetContext();
          }
        } catch {}
        continue;
      }
      try { if(page) await page.close(); } catch {}
    }

    attemptedSet.add(clipUrl);
    cp.attempted.push(clipUrl);
    if(found){
      const watch = toWatchUrl(found.videoId, found.startMs, found.endMs);
      resolvedMap.set(clipUrl, watch);
      cp.resolved[clipUrl] = watch;
    } else {
      failedSet.add(clipUrl);
      cp.failed.push(clipUrl);
    }

    processed++;
    if(processed % 10 === 0){
      saveCheckpoint(cp);
      console.log(`progress ${processed}/${queue.length} resolvedNow=${Object.keys(cp.resolved).length} failedNow=${cp.failed.length}`);
    }
  }

  try { if(context) await context.close(); } catch {}
  try { if(browser) await browser.close(); } catch {}
  saveCheckpoint(cp);

  function applyQ(obj){
    let updated = 0;
    obj.questions = (obj.questions || []).map(q => {
      if(q.type==='media' && typeof q.mediaUrl==='string' && resolvedMap.has(q.mediaUrl)){
        updated++;
        return { ...q, mediaUrl: resolvedMap.get(q.mediaUrl), needsMediaReview: false };
      }
      return q;
    });
    return updated;
  }

  function applyFlagged(flaggedObj){
    if(Array.isArray(flaggedObj)){
      let updated = 0;
      const out = flaggedObj.map(item => {
        const url = item?.mediaUrl;
        if(typeof url==='string' && resolvedMap.has(url)){
          updated++;
          return { ...item, mediaUrl: resolvedMap.get(url) };
        }
        return item;
      });
      return { out, updated };
    }

    if(flaggedObj && typeof flaggedObj==='object' && Array.isArray(flaggedObj.items)){
      let updated = 0;
      const outItems = flaggedObj.items.map(item => {
        const url = item?.mediaUrl;
        if(typeof url==='string' && resolvedMap.has(url)){
          updated++;
          return { ...item, mediaUrl: resolvedMap.get(url) };
        }
        return item;
      });
      return { out: { ...flaggedObj, items: outItems, count: outItems.length }, updated };
    }

    return { out: flaggedObj, updated: 0 };
  }

  const qPubUpdated = applyQ(qPublic);
  const qDocUpdated = applyQ(qDocs);

  const fp = applyFlagged(fPublic);
  const fd = applyFlagged(fDocs);

  writeJson(qPublicPath, qPublic);
  writeJson(qDocsPath, qDocs);
  writeJson(fPublicPath, fp.out);
  writeJson(fDocsPath, fd.out);

  const remaining = [...new Set((qPublic.questions||[]).filter(q => q.type==='media' && clipRegex.test(q.mediaUrl||'')).map(q => q.mediaUrl))].length;

  console.log(JSON.stringify({
    resolvedMapTotal: resolvedMap.size,
    attemptedTotal: attemptedSet.size,
    failedTotal: failedSet.size,
    updatedQuestionsPublic: qPubUpdated,
    updatedQuestionsDocs: qDocUpdated,
    updatedFlaggedPublic: fp.updated,
    updatedFlaggedDocs: fd.updated,
    remainingUniqueClipUrls: remaining
  }, null, 2));
})();
