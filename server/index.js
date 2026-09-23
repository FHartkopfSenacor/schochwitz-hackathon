const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

function loadDotEnv(){
  const envFile = path.join(__dirname, '.env');
  try{
    const text = fs.readFileSync(envFile, 'utf8');
    for(const line of text.split(/\r?\n/)){
      const trimmed = line.trim();
      if(!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if(!process.env[key]) process.env[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }catch(e){ /* no .env file */ }
}

loadDotEnv();

const OPENAI_API_BASE_URL = (process.env.OPENAI_API_BASE_URL || process.env.OPENAI_BASE_URL || 'https://eu.api.openai.com/v1').replace(/\/+$/, '');

function sendJSON(res, status, obj){ res.writeHead(status, {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}); res.end(JSON.stringify(obj)); }

function serveStatic(req, res){
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if(urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, urlPath.replace(/^\//, ''));
  if(!filePath.startsWith(ROOT)) return sendJSON(res, 403, { error: 'forbidden' });
  fs.stat(filePath, (err, stats)=>{
    if(err || !stats.isFile()) return sendJSON(res, 404, { error: 'not found' });
    const stream = fs.createReadStream(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'})[ext]||'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    stream.pipe(res);
  });
}

function parseJSONBody(req, cb){
  let raw = '';
  req.on('data', chunk => { raw += chunk.toString(); if(raw.length > 1e6) req.destroy(); });
  req.on('end', ()=>{
    try{ cb(null, raw? JSON.parse(raw) : {}); }catch(e){ cb(e); }
  });
}

function parseAiJson(raw){
  if(!raw) return [];
  const candidates = [];
  const pushFrom = (value)=>{
    if(Array.isArray(value)){
      for(const item of value){ if(item != null && String(item).trim()) candidates.push(String(item).trim()); }
      return;
    }
    if(value && typeof value === 'object'){
      if(Array.isArray(value.quotes)) pushFrom(value.quotes);
      if(Array.isArray(value.items)) pushFrom(value.items);
    }
  };

  try{ pushFrom(JSON.parse(raw)); }catch(e){
    let text = String(raw).trim();
    const m = text.match(/\[[\s\S]*\]/);
    if(m){ try{ pushFrom(JSON.parse(m[0])); }catch(e2){} }
    if(!candidates.length){
      const parts = text.split(/\r?\n|\s*\.\s*/).map(x=>x.trim()).filter(Boolean);
      for(const part of parts){ if(part.length > 8) candidates.push(part); }
    }
  }

  return candidates.filter((item, index, arr)=>arr.indexOf(item) === index).slice(0, 50);
}

function buildStylePrompt({ profileName, profileText, quotes, aiCount }){
  const examples = (quotes || []).slice(0, 12).map((q, i) => `Example ${i + 1}: ${String(q).trim()}`).join('\n');
  const profile = String(profileText || '').trim();

  return [
    'You are generating fake quotes for a “real vs AI” guessing game.',
    'Your task is to produce statements that feel like they were written by the same person as the uploaded profile, not stitched together from their real quotes.',
    'Before writing, infer the profile’s style: vocabulary, tone, directness, optimism, hesitation, sentence length, and topic focus.',
    'Write each quote as a stand-alone original sentence. Do not concatenate examples, do not join two quote fragments with “ — ”, and do not copy any real quote verbatim.',
    'Keep the quotes short, natural, and plausible. Prefer the personality of the profile over generic AI language.',
    'Avoid filler phrases like “Let me know,” “happy to help,” “please let me know,” “in summary,” and “fyi” unless the profile genuinely uses them.',
    'Use the profile language patterns as a guide, but synthesize a fresh line that could plausibly be from the same writer.',
    'Return valid JSON only, with a top-level object: {"quotes":["..."]}.',
    `Generate exactly ${Number(aiCount || 6)} quote strings.`,
    `Profile name: ${profileName || 'Unknown profile'}`,
    profile ? `Style profile context:\n${profile.slice(0, 6000)}` : `Example quotes:\n${examples}`,
    `Reference examples (do not copy):\n${examples}`,
    'Hard constraints: no repeated phrases, no quote stitching, no concatenated examples, no markdown, no commentary, no extra text outside the JSON object.'
  ].join('\n\n');
}

function normalizeAiQuotes(items, quotes = []){
  const seen = new Set();
  const profileText = (quotes || []).map(String).filter(Boolean);
  const isQuoteStitch = (text) => {
    const s = String(text || '').trim();
    if(!s) return true;
    if(s.includes(' — ') && profileText.some(q => s.includes(String(q).replace(/^"|"$/g, '').trim()))) return true;
    if(s.includes(' (AI variant)')) return true;
    return false;
  };

  const out = [];
  for(const item of items || []){
    const txt = String(item || '').trim();
    if(!txt) continue;
    if(isQuoteStitch(txt)) continue;
    const key = txt.toLowerCase();
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(txt);
  }
  return out;
}

function simpleAI(quotes, aiCount){
  const out = [];
  for(let i=0;i<aiCount;i++){
    const src = quotes[i % Math.max(1, quotes.length)] || 'Working in small steps';
    let txt = String(src).replace(/^"|"$/g,'').trim();
    txt = txt.split(/[,;:\-—]+/).reverse().join(' — ').trim();
    if(!txt) txt = 'A thoughtful follow-up.';
    out.push(txt + ' (AI variant)');
  }
  return out;
}

const server = http.createServer((req, res) => {
  if(req.method === 'OPTIONS') return sendJSON(res, 204, {});
  if(req.method === 'GET') return serveStatic(req, res);

  if(req.method === 'POST' && req.url === '/api/generate'){
    return parseJSONBody(req, (err, body)=>{
      if(err) return sendJSON(res, 400, { error: 'invalid json' });
      const { quotes = [], aiCount = 6, profileName = '', profileText = '' } = body || {};
      if(process.env.OPENAI_API_KEY){
        (async ()=>{
          try{
            const prompt = buildStylePrompt({ profileName, profileText, quotes, aiCount });
            const payload = {
              model: 'gpt-4o-mini',
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: 'You create original fake statements that match a known writing style without copying any source quote. Return only proper JSON. The output must contain exactly 10 distinct strings in a JSON object under the key "quotes".' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.7,
              max_tokens: 900
            };
            const out = await fetch(OPENAI_API_BASE_URL + '/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
              },
              body: JSON.stringify(payload)
            });
            const responseText = await out.text();
            if(!out.ok){
              let detail = responseText;
              try{
                const errorPayload = JSON.parse(responseText);
                detail = errorPayload.error && errorPayload.error.message || detail;
              }catch(e){ /* keep raw response text */ }
              throw new Error(`OpenAI HTTP ${out.status}: ${detail || out.statusText}`);
            }
            const data = JSON.parse(responseText);
            const txt = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '';
            let arr = [];
            try{
              const parsedPayload = JSON.parse(txt);
              if(parsedPayload && Array.isArray(parsedPayload.quotes)) arr = parsedPayload.quotes;
              else if(parsedPayload && Array.isArray(parsedPayload.items)) arr = parsedPayload.items;
              else arr = parseAiJson(txt);
            }catch(e){ arr = parseAiJson(txt); }

            const clean = normalizeAiQuotes(arr, quotes).slice(0, 10);
            if(clean.length >= 1){
              return sendJSON(res, 200, { ai: clean, source: 'openai' });
            }
            console.warn('OpenAI response rejected as stitched/invalid; using fallback.');
            return sendJSON(res, 200, { ai: simpleAI(quotes, aiCount), source: 'fallback', error: 'OpenAI response invalid' });
          }catch(e){
            console.warn('OpenAI call failed:', e && e.message);
            sendJSON(res, 200, { ai: simpleAI(quotes, aiCount), source: 'fallback', error: String(e && e.message) });
          }
        })();
      } else {
        return sendJSON(res, 200, { ai: simpleAI(quotes, aiCount), source: 'fallback' });
      }
    });
  }

  if(req.method === 'POST' && req.url === '/api/translate'){
    return parseJSONBody(req, (err, body)=>{
      if(err) return sendJSON(res, 400, { error: 'invalid json' });
      const { text = '' } = body || {};
      if(!text) return sendJSON(res, 400, { error: 'missing text' });
      const original = String(text).replace(/\s+/g, ' ').trim();

      if(process.env.OPENAI_API_KEY){
        (async ()=>{
          try{
            const payload = {
              model: 'gpt-4o-mini',
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: 'You are a precise literary translator. Translate the complete user quote into all three target languages: English, Polish, and German. Detect and translate every part of mixed-language input; never leave a source-language fragment untranslated except proper nouns, product names, or intentional code. Preserve meaning, tone, punctuation, and quotation marks. Return only valid JSON with exactly these string keys: english, polish, german.' },
                { role: 'user', content: original }
              ],
              temperature: 0.1,
              max_tokens: 300
            };
            const out = await fetch(OPENAI_API_BASE_URL + '/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY
              },
              body: JSON.stringify(payload)
            });
            const responseText = await out.text();
            if(!out.ok) throw new Error(`OpenAI HTTP ${out.status}: ${responseText}`);
            const data = JSON.parse(responseText);
            const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
              ? String(data.choices[0].message.content).trim() : '';
            const translations = JSON.parse(content);
            if(translations && translations.english && translations.polish && translations.german){
              return sendJSON(res, 200, { translations: {
                english: String(translations.english).trim(),
                polish: String(translations.polish).trim(),
                german: String(translations.german).trim()
              }, source: 'openai', sources: { english: 'openai', polish: 'openai', german: 'openai' } });
            }
            throw new Error('OpenAI returned no translation');
          }catch(e){
            console.warn('OpenAI translation failed:', e && e.message);
            return sendJSON(res, 200, { translations: { english: original, polish: original, german: original }, source: 'none', error: String(e && e.message) });
          }
        })();
      } else {
        return sendJSON(res, 200, { translations: { english: original, polish: original, german: original }, source: 'none' });
      }
    });
  }

  // fallback
  sendJSON(res, 404, { error: 'not found' });
});

server.listen(PORT, ()=> console.log('Server running on port', PORT));
