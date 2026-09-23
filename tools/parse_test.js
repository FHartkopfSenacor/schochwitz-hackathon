const fs = require('fs');
const path = require('path');

function extractQuoted(s){
  const t = String(s||'');
  if(!t) return null;
  const quoteChars = ['"','“','”'];
  let first = -1, last = -1;
  for(const q of quoteChars){
    const i = t.indexOf(q);
    if(i !== -1 && (first === -1 || i < first)) first = i;
    const j = t.lastIndexOf(q);
    if(j !== -1 && j > last) last = j;
  }
  if(first !== -1 && last > first){
    const inner = t.slice(first+1, last).replace(/\s+/g,' ');
    return '"' + inner.trim() + '"';
  }
  return t.trim();
}

function parseProfile(mdText){
  const nameMatch = mdText.match(/^#\s*Style Profile:\s*(.+)$/im);
  const name = nameMatch ? nameMatch[1].replace(/—.*/,'').trim() : '—';
  // robust string search for the quote pool
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
    for(let li=0; li<lines.length; li++){
      const raw = lines[li];
      const line = raw.replace(/\u00A0/g,' ').replace(/\t/g,'    ');
      const m = line.match(/^\s*(\d+)\.\s*(.*)$/);
      console.log(li+':', JSON.stringify(line.slice(0,120)), 'MATCH->', !!m);
      if(m){
        if(current){ const cleaned = extractQuoted(current); if(cleaned) quotes.push(cleaned); }
        current = m[2] || '';
      } else if(current !== null){ if(line.trim() === '') continue; current += ' ' + line.trim(); }
    }
    if(current){ const cleaned = extractQuoted(current); if(cleaned) quotes.push(cleaned); }
  }
  return { name, quotes };
}

const fp = process.argv[2] || path.join(__dirname,'..','..','Desktop','Schlosswitz Hackathon','style_profile_fabi.md');
try{
  const txt = fs.readFileSync(fp,'utf8');
  // Robust string search for the section
  const lower = txt.toLowerCase();
  const header = '## quote pool';
  const startIdx = lower.indexOf(header);
  let poolBlock = null;
  if(startIdx !== -1){
    const rest = txt.slice(startIdx);
    const nextHeaderRel = rest.search(/\r?\n##\s/);
    poolBlock = nextHeaderRel === -1 ? rest : rest.slice(0, nextHeaderRel);
  }
  console.log('--- Quote pool raw block ---');
  console.log(poolBlock || '(not found)');
  const parsed = parseProfile(txt);
  console.log('\n--- Parsed JSON ---');
  console.log(JSON.stringify(parsed, null, 2));
}catch(e){
  console.error('Error reading file:', e.message);
  process.exit(2);
}
