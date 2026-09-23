(() => {
  // UI elements
  const fileInput = document.getElementById('fileInput');
  const profileNameEl = document.getElementById('profileName');
  const quoteCountEl = document.getElementById('quoteCount');
  const startBtn = document.getElementById('startBtn');
  const resetBtn = document.getElementById('resetGame');
  const statementEl = document.getElementById('statement');
  const paraphraseEl = document.getElementById('paraphrase');
  const realBtn = document.getElementById('realBtn');
  const aiBtn = document.getElementById('aiBtn');
  const roundEl = document.getElementById('currentRound');
  const confettiEl = document.getElementById('confetti');
  const gameSection = document.querySelector('.game');
  const scoreEl = document.getElementById('score');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistory');

  let profile = { name: '—', quotes: [] };
  let game = { items: [], index: 0, score: 0, finished: false };

  // History stored in localStorage
  function loadHistory(){
    try{ return JSON.parse(localStorage.getItem('dt_history')||'[]') }catch(e){return[]}
  }
  function saveHistory(h){ localStorage.setItem('dt_history', JSON.stringify(h)) }

  function renderHistory(){
    const h = loadHistory();
    historyList.innerHTML = '';
    h.sort((a,b)=>b.score-a.score || b.time - a.time).forEach(entry=>{
      const li = document.createElement('li');
      li.textContent = `${entry.name} — ${entry.score}/10 (${new Date(entry.time).toLocaleString()})`;
      historyList.appendChild(li);
    })
  }

  // Parse uploaded markdown profile
  function parseProfile(mdText){
    // Extract name from top-level header
    let name = '—';
    const nameMatch = mdText.match(/^#\s*Style Profile:\s*(.+)$/im);
    if(nameMatch) name = nameMatch[1].replace(/—.*/,'').trim();

    // Locate the '## Quote pool' section using string search to be robust to line breaks
    const lower = mdText.toLowerCase();
    const header = '## quote pool';
    const startIdx = lower.indexOf(header);
    const quotes = [];
    if(startIdx !== -1){
      // find next header occurrence (\n## ) after startIdx
      let rest = mdText.slice(startIdx);
      // find the position of the next '\n## ' (or CRLF) in rest
      const nextHeaderRel = rest.search(/\r?\n##\s/);
      const block = nextHeaderRel === -1 ? rest : rest.slice(0, nextHeaderRel);
      // remove the first header line
      const blockBody = block.replace(/^[^\n]*\n?/, '');
      const lines = blockBody.split(/\r?\n/);

      // Accumulate numbered items that may span multiple lines
      let current = null;
      for(const raw of lines){
        const line = raw.replace(/\u00A0/g,' ').replace(/\t/g,'    ');
        const m = line.match(/^\s*(\d+)\.\s*(.*)$/);
        if(m){
          // push previous
          if(current){
            const cleaned = extractQuoted(current);
            if(cleaned) quotes.push(cleaned);
          }
          current = m[2] || '';
        } else if(current !== null){
          // continuation line for current numbered item (indented or plain continuation)
          if(line.trim() === '') continue;
          current += ' ' + line.trim();
        }
      }
      // push last
      if(current){
        const cleaned = extractQuoted(current);
        if(cleaned) quotes.push(cleaned);
      }
    }
    return { name, quotes };
  }

  // Extract quoted content if present; preserve surrounding double quotes
  function extractQuoted(s){
    const t = String(s || '');
    if(!t) return null;
    // find first and last occurrence of straight or curly double quotes
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
    // no paired quotes — return trimmed string
    return t.trim();
  }

  function enableStartIfReady(){
    startBtn.disabled = profile.quotes.length === 0;
  }

  function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]} }

  // Improved fake generation: combine several lightweight transformations
  function generateFakeFrom(real){
    const r = String(real || '').trim();
    if(!r) return '(no content)';

    const smallSyn = {
      'aber':'but','danke':'thanks','ich':'I','wir':'we','nicht':'not','schnell':'quick','heute':'today'
    };

    function replaceSyn(s){
      return s.split(/(\W+)/).map(tok=>{
        const low = tok.toLowerCase();
        if(smallSyn[low]){
          // preserve capitalization
          if(tok[0] && tok[0] === tok[0].toUpperCase()) return capitalize(smallSyn[low]);
          return smallSyn[low];
        }
        return tok;
      }).join('');
    }

    function capitalize(t){ return t.charAt(0).toUpperCase()+t.slice(1) }

    // strategies
    const strategies = [
      s => 'To be honest, ' + s.replace(/^['"“”]+|['"“”]+$/g,'').replace(/\.$/,'') + '.',
      s => replaceSyn(s).replace(/\b(und|aber|oder)\b/gi, (m)=>', ' + m),
      s => s.split(/[,;:]/).reverse().join(' — ').replace(/\s+/g,' ').trim() + '.',
      s => s.replace(/\b(I am|ich bin)\b/gi,'I\'m').replace(/\bwe\b/gi,'we all'),
      s => s + ' 🤔',
    ];

    // pick a strategy and apply
    const pick = strategies[Math.floor(Math.random()*strategies.length)];
    let out = pick(r);
    // fallback short paraphrase
    if(out === r) out = 'Paraphrase: ' + r;

    // ensure length of at least a few words (avoid one-word or identical short outputs)
    const minWords = 4;
    const wordCount = out.split(/\s+/).filter(Boolean).length;
    if(wordCount < minWords){
      const extras = ['I would prioritise follow-up.', 'Let\'s align on next steps.', 'Short follow-up planned.'];
      out = out + ' ' + extras[Math.floor(Math.random()*extras.length)];
    }

    // randomly add abbreviation sometimes to fit style
    if(Math.random() < 0.12) out = out + ' FYI.';

    return out;
  }

  // Basic German->English paraphrase for demonstration only (small dictionary)
  function englishParaphrase(text){
    if(!text) return '';
    // Phrase-first mapping (longer phrases first)
    const phraseMap = [
      ['alles gut','all good'],
      ['danke dir dafür','thanks for that'],
      ['danke dir','thanks'],
      ['wie erwartet','as expected'],
      ['gar kein Thema','no problem at all'],
      ['kannst du','can you'],
      ['soll ich','should I'],
      ['wenn möglich','if possible'],
      ['mal kurz','briefly'],
    ];
    const wordMap = {
      'aber':'but','ich':'I','wir':'we','nicht':'not','schnell':'quick','heute':'today','fyi':'FYI','rolle':'role','thematik':'issue','feedback':'feedback'
    };

    let s = text;
    // apply phrase replacements first
    phraseMap.forEach(([k,v])=>{
      const re = new RegExp('\\b'+escapeReg(k)+'\\b','ig');
      s = s.replace(re, v);
    });
    // then word replacements
    Object.keys(wordMap).forEach(k=>{
      const re = new RegExp('\\b'+escapeReg(k)+'\\b','ig');
      s = s.replace(re, wordMap[k]);
    });

    // If still contains typical German words, try to remove or translate a few common ones
    const commonGerman = [' und ', ' aber ', ' das ', ' die ', ' der ', 'zu ', 'dass', 'schau', 'passt'];
    commonGerman.forEach(g=>{
      if(new RegExp(escapeReg(g),'i').test(s)) s = s.replace(new RegExp(escapeReg(g),'ig'), ' ');
    });

    // Clean up spacing and punctuation
    s = s.replace(/\s+/g,' ').trim();
    if(!/[\.\?\!]$/.test(s)) s = s + '.';
    return '(EN) ' + s;
  }

  function escapeReg(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') }

  function buildGame(){
    const pool = profile.quotes.slice();
    // ensure at least 2 real and 2 ai
    const minReal = 2, minAi = 2;
    const desiredReal = Math.min(8, Math.max(minReal, Math.floor(Math.random()*7)+minReal));
    // realCount can't exceed available quotes and must leave at least minAi ai slots
    const realCount = Math.min(desiredReal, Math.max(minReal, Math.min(pool.length, 10 - minAi)));
    const aiCount = 10 - realCount;

    const items = [];
    const seen = new Set();
    const norm = s => String(s||'').replace(/\s+/g,' ').trim().toLowerCase();

    // choose unique real quotes
    const available = pool.slice();
    for(let i=0;i<realCount && available.length>0;i++){
      const idx = Math.floor(Math.random()*available.length);
      const pick = available.splice(idx,1)[0];
      items.push({text: pick, type: 'real'});
      seen.add(norm(pick));
    }

    // generate unique AI items until we reach aiCount
    let aiAttempts = 0;
    let guard = 0;
    while(items.filter(it=>it.type==='ai').length < aiCount && guard < 500){
      guard++;
      // pick 1 or 2 sources
      const srcs = [];
      if(profile.quotes.length) srcs.push(profile.quotes[Math.floor(Math.random()*profile.quotes.length)]);
      if(profile.quotes.length > 1 && Math.random() < 0.8) {
        let s2 = profile.quotes[Math.floor(Math.random()*profile.quotes.length)];
        let tries=0; while(s2===srcs[0] && tries<6){ s2 = profile.quotes[Math.floor(Math.random()*profile.quotes.length)]; tries++; }
        if(s2) srcs.push(s2);
      }
      const combined = srcs.length>1 ? (srcs.map(x=>String(x).replace(/^"|"$/g,'')).join(' — ')) : (srcs[0]||'Working in small steps');
      let fake = generateFakeFrom(combined);
      if(fake.split(/\s+/).filter(Boolean).length < 5) fake = fake + ' Please let me know the next steps.';
      const n = norm(fake);
      if(!seen.has(n)){
        items.push({text: fake, type: 'ai'});
        seen.add(n);
      } else {
        aiAttempts++;
        // if many attempts fail, add a playful unique suffix
        if(aiAttempts > 20){
          fake = fake + ' ✨' + Math.floor(Math.random()*900+100);
          const nn = norm(fake);
          if(!seen.has(nn)){ items.push({text: fake, type:'ai'}); seen.add(nn); }
        }
      }
    }

    // if we still don't have 10 items (rare), fill with short generated variants
    let fillGuard = 0;
    while(items.length < 10 && fillGuard < 50){
      fillGuard++;
      const src = profile.quotes.length ? profile.quotes[Math.floor(Math.random()*profile.quotes.length)] : 'Working in small steps';
      let fake = generateFakeFrom(src) + ' ⚡';
      const n = norm(fake);
      if(!seen.has(n)){ items.push({text: fake, type:'ai'}); seen.add(n); }
    }

    // finally shuffle
    shuffle(items);
    game.items = items; game.index = 0; game.score = 0; game.finished = false;
    roundEl.textContent = '0'; scoreEl.textContent = '0';
    statementEl.textContent = 'Press Real or AI to guess the first statement.';
    paraphraseEl.textContent = '';
  }

  function ensureUniqueItems(items){
    const seen = new Set();
    // normalize helper
    const norm = s => String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
    // iterate and ensure uniqueness; for AI entries, attempt multiple regenerations
    for(let i=0;i<items.length;i++){
      let text = items[i].text;
      let attempts = 0;
      while(seen.has(norm(text)) && attempts < 12){
        if(items[i].type === 'ai'){
          // pick two different sources to generate a new fake
          let a = profile.quotes.length ? profile.quotes[Math.floor(Math.random()*profile.quotes.length)] : '';
          let b = profile.quotes.length ? profile.quotes[Math.floor(Math.random()*profile.quotes.length)] : '';
          let tries = 0;
          while(b === a && tries < 8 && profile.quotes.length>1){ b = profile.quotes[Math.floor(Math.random()*profile.quotes.length)]; tries++ }
          const combined = a && b && a !== b ? (a.replace(/^"|"$/g,'') + ' — ' + b.replace(/^"|"$/g,'')) : (a||b||'Working in small steps');
          text = generateFakeFrom(combined);
          // add playful suffix sometimes
          if(Math.random() < 0.25) text = text + ' ✨';
        } else {
          // real entries should not be modified; if duplicate (unlikely), append short token
          text = items[i].text + ' (dup)';
        }
        attempts++;
      }
      if(seen.has(norm(text))){
        // last-resort uniqueifier
        text = items[i].text + ' #' + Math.floor(Math.random()*9000+1000);
      }
      items[i].text = text;
      seen.add(norm(text));
    }
  }

  function showNext(){
    if(game.index >= game.items.length){
      endGame(); return;
    }
    const item = game.items[game.index];
    statementEl.textContent = '';
    paraphraseEl.textContent = '';
    // reveal animation
    roundEl.textContent = String(game.index + 1);
    statementEl.classList.remove('pop');
    // small type-in reveal
    let i = 0, txt = item.text;
    const step = () => {
      if (i <= txt.length) {
        statementEl.textContent = txt.slice(0, i);
        i += 3;
        requestAnimationFrame(step);
      } else {
            statementEl.classList.add('pop');
            paraphraseEl.textContent = englishParaphrase(item.text);
      }
    };
    requestAnimationFrame(step);
  }

      // Visual feedback for guess result
      function showFeedback(correct){
        // create pill
        let holder = gameSection.querySelector('.feedback');
        if(!holder){ holder = document.createElement('div'); holder.className='feedback'; gameSection.appendChild(holder); }
        holder.innerHTML = '';
        const pill = document.createElement('div'); pill.className = 'pill ' + (correct? 'correct':'wrong');
        pill.textContent = correct? '✔ Correct!':'✖ Wrong!';
        holder.appendChild(pill);
        // trigger show
        requestAnimationFrame(()=> pill.classList.add('show'));
        // confetti on correct
        if(correct && confettiEl){
          for(let i=0;i<18;i++){
            const d = document.createElement('div'); d.className='dot'; d.style.left = (10 + Math.random()*80) + '%'; d.style.background = ['#ff3b3b','#ffd34d','#4ce0a8','#7ad8ff','#d68bff'][Math.floor(Math.random()*5)];
            confettiEl.appendChild(d);
            // animate in
            setTimeout(()=> d.classList.add('show'), 20 + Math.random()*200);
            // cleanup
            setTimeout(()=> d.remove(), 1400);
          }
        }
        // remove pill after delay
        setTimeout(()=>{ if(pill) pill.classList.remove('show'); }, 1000);
      }

  function endGame(){
    game.finished = true;
    statementEl.textContent = `Round complete — final score ${game.score}/10`;
    // save to history
    const h = loadHistory();
    h.push({ name: profile.name||'—', score: game.score, time: Date.now() });
    saveHistory(h);
    renderHistory();
  }

  // UI handlers
  fileInput.addEventListener('change', async (ev)=>{
    const f = ev.target.files && ev.target.files[0];
    if(!f) return;
    const text = await f.text();
    const parsed = parseProfile(text);
    // if there is a finished game and different profile, keep history already saved on end
    profile = parsed;
    profileNameEl.textContent = profile.name || '—';
    quoteCountEl.textContent = profile.quotes.length;
    enableStartIfReady();
    // populate test section with parsed quotes
    try{
      const list = document.getElementById('parsedQuotesList');
      list.innerHTML = '';
      profile.quotes.forEach((q,i)=>{
        const li = document.createElement('li');
        li.textContent = `${i+1}. ${q}`;
        list.appendChild(li);
      });
      document.getElementById('testSection').style.display = profile.quotes.length? 'block':'none';
    }catch(e){/* ignore in non-browser tests */}
  });

  // hide test section
  const hideTestBtn = document.getElementById('hideTest');
  if(hideTestBtn){ hideTestBtn.addEventListener('click', ()=>{ document.getElementById('testSection').style.display='none'; }); }

  startBtn.addEventListener('click', ()=>{
    buildGame();
    showNext();
    startBtn.disabled = true;
  });

  realBtn.addEventListener('click', ()=>{ handleGuess('real') });
  aiBtn.addEventListener('click', ()=>{ handleGuess('ai') });

  function handleGuess(guess){
    if(game.finished || !game.items.length) return;
    const cur = game.items[game.index];
    const correct = guess === cur.type;
    if(correct) game.score += 1;
    game.index += 1;
    scoreEl.textContent = String(game.score);
    // show animated feedback
    showFeedback(correct);
    if(game.index >= game.items.length) setTimeout(()=> endGame(), 700); else setTimeout(()=> showNext(), 700);
  }

  resetBtn.addEventListener('click', ()=>{
    profile = { name: '—', quotes: [] };
    game = { items: [], index: 0, score: 0, finished: false };
    profileNameEl.textContent = '—'; quoteCountEl.textContent = '0'; startBtn.disabled = true;
    statementEl.textContent = 'Upload profile and press Start.'; scoreEl.textContent='0'; roundEl.textContent='0';
    const list = document.getElementById('parsedQuotesList'); if(list) list.innerHTML = '';
  });

  clearHistoryBtn.addEventListener('click', ()=>{ if(confirm('Clear history?')){ saveHistory([]); renderHistory(); } });

  // init
  renderHistory();
  // Show start when quotes present
  fileInput.addEventListener('change', ()=>{ startBtn.disabled = profile.quotes.length===0 });

  // Enable start when a profile is already loaded via drag/drop
  startBtn.disabled = true;
  // expose for debugging
  window.DT = { profile, game };
})();
