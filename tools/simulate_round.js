const fs = require('fs');
const path = require('path');

function cleanQuoteText(value){
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  const pairs = [['"','"'], ['“','”'], ['„','“'], ['«','»']];
  for(const [open, close] of pairs){
    if(text.startsWith(open) && text.endsWith(close) && text.length >= open.length + close.length){
      return text.slice(open.length, text.length - close.length).trim();
    }
  }
  return text;
}

function extractQuoted(s){
  const t = String(s||'');
  if(!t) return null;
  for(const matcher of [/“([\s\S]*?)”/, /„([\s\S]*?)“/, /«([\s\S]*?)»/, /"([\s\S]*?)"/]){
    const match = t.match(matcher);
    if(match) return cleanQuoteText(match[1]);
  }
  return cleanQuoteText(t);
}

function parseProfile(mdText){
  const nameMatch = mdText.match(/^#\s*Style Profile:\s*(.+)$/im);
  const name = nameMatch ? nameMatch[1].replace(/—.*/,'').trim() : '—';
  const lower = mdText.toLowerCase();
  const header = '## quote pool';
  const startIdx = lower.indexOf(header);
  const quotes = [];
  if(startIdx !== -1){
    const rest = mdText.slice(startIdx);
    const nextHeaderRel = rest.search(/\r?\n##\s/);
    const block = nextHeaderRel === -1 ? rest : rest.slice(0, nextHeaderRel);
    const blockBody = block.replace(/^[^\n]*\n?/, '');
    const lines = blockBody.split(/\r?\n/);
    let current = null;
    for(const raw of lines){
      const line = raw.replace(/\u00A0/g,' ').replace(/\t/g,'    ');
      const m = line.match(/^\s*(\d+)\.\s*(.*)$/);
      if(m){ if(current){ const cleaned = extractQuoted(current); if(cleaned) quotes.push(cleaned); } current = m[2] || ''; }
      else if(current !== null){ if(line.trim() === '') continue; current += ' ' + line.trim(); }
    }
    if(current){ const cleaned = extractQuoted(current); if(cleaned) quotes.push(cleaned); }
  }
  return { name, quotes };
}

// lightweight generateFakeFrom (port of app.js)
function generateFakeFrom(real){
  const r = String(real || '').trim(); if(!r) return '(no content)';
  const smallSyn = { 'aber':'but','danke':'thanks','ich':'I','wir':'we','nicht':'not','schnell':'quick','heute':'today' };
  function replaceSyn(s){ return s.split(/(\W+)/).map(tok=>{ const low = tok.toLowerCase(); if(smallSyn[low]){ if(tok[0] && tok[0]===tok[0].toUpperCase()) return smallSyn[low].charAt(0).toUpperCase()+smallSyn[low].slice(1); return smallSyn[low]; } return tok; }).join(''); }
  const strategies = [ s => 'To be honest, ' + s.replace(/^['"“”]+|['"“”]+$/g,'').replace(/\.$/,'') + '.', s => replaceSyn(s).replace(/\b(und|aber|oder)\b/gi, (m)=>', ' + m), s => s.split(/[,;:]/).reverse().join(' — ').replace(/\s+/g,' ').trim() + '.', s => s.replace(/\b(I am|ich bin)\b/gi,"I'm").replace(/\bwe\b/gi,'we all'), s => s + ' 🤔' ];
  const pick = strategies[Math.floor(Math.random()*strategies.length)];
  let out = pick(r);
  if(out === r) out = 'Paraphrase: ' + r;
  if(out.split(/\s+/).filter(Boolean).length < 4){ const extras = ['I would prioritise follow-up.','Let\'s align on next steps.','Short follow-up planned.']; out = out + ' ' + extras[Math.floor(Math.random()*extras.length)]; }
  if(Math.random() < 0.12) out = out + ' FYI.';
  return out;
}

function buildRound(profile){
  const pool = profile.quotes.slice();
  const minReal = 2, minAi = 2;
  const desiredReal = Math.min(8, Math.max(minReal, Math.floor(Math.random()*7)+minReal));
  const realCount = Math.min(desiredReal, Math.max(minReal, Math.min(pool.length, 10-minAi)));
  const aiCount = 10 - realCount;
  const items = [];
  const seen = new Set();
  const norm = s => String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  const available = pool.slice();
  for(let i=0;i<realCount && available.length>0;i++){ const idx = Math.floor(Math.random()*available.length); const pick = available.splice(idx,1)[0]; items.push({text: pick, type:'real'}); seen.add(norm(pick)); }
  let guard=0; let aiAttempts=0;
  while(items.filter(it=>it.type==='ai').length < aiCount && guard<500){ guard++; const srcs=[]; if(profile.quotes.length) srcs.push(profile.quotes[Math.floor(Math.random()*profile.quotes.length)]); if(profile.quotes.length>1 && Math.random()<0.8){ let s2=profile.quotes[Math.floor(Math.random()*profile.quotes.length)]; let tries=0; while(s2===srcs[0] && tries<6){ s2=profile.quotes[Math.floor(Math.random()*profile.quotes.length)]; tries++; } if(s2) srcs.push(s2); } const combined = srcs.length>1 ? srcs.map(x=>String(x).replace(/^"|"$/g,'')).join(' — ') : (srcs[0]||'Working in small steps'); let fake = generateFakeFrom(combined); if(fake.split(/\s+/).filter(Boolean).length<5) fake = fake + ' Please let me know the next steps.'; const n=norm(fake); if(!seen.has(n)){ items.push({text:fake,type:'ai'}); seen.add(n); } else { aiAttempts++; if(aiAttempts>20){ fake = fake + ' ✨' + Math.floor(Math.random()*900+100); const nn=norm(fake); if(!seen.has(nn)){ items.push({text:fake,type:'ai'}); seen.add(nn); } } } }
  let fill=0; while(items.length<10 && fill<50){ fill++; const src = profile.quotes.length ? profile.quotes[Math.floor(Math.random()*profile.quotes.length)] : 'Working in small steps'; let fake = generateFakeFrom(src) + ' ⚡'; const n=norm(fake); if(!seen.has(n)){ items.push({text:fake,type:'ai'}); seen.add(n); } }
  // shuffle
  for(let i=items.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [items[i],items[j]]=[items[j],items[i]] }
  return items;
}

const fp = process.argv[2] || path.join(__dirname,'..','..','Desktop','Schlosswitz Hackathon','style_profile_fabi.md');
try{
  const txt = fs.readFileSync(fp,'utf8');
  const profile = parseProfile(txt);
  console.log('Profile name:', profile.name);
  const round = buildRound(profile);
  console.log('\nGenerated round (type: text):');
  round.forEach((it,i)=>{ console.log(`${i+1}. [${it.type}] ${it.text}`); });
  // check duplicates
  const norm = s => String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
  const seen = new Set(); let dup=false; round.forEach(it=>{ if(seen.has(norm(it.text))) dup=true; seen.add(norm(it.text)); });
  console.log('\nDuplicates present?', dup);
}catch(e){ console.error('Err', e.message); process.exit(2); }
