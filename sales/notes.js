/* Perch artifact notes — quick per-section feedback, localStorage-persisted.
   Drop <script src="notes.js"></script> before </body>. Zero markup required.
   - Pages with their own `textarea.notes[data-key]` (the playbook): those are
     ADOPTED into the unified digest (no second box added).
   - Other pages: a "📝 add note" box is attached to each top-level section.
   - A floating "Copy all notes" button compiles everything (across all
     same-origin /sales/ pages) into a digest to paste back into chat. */
(function () {
  var PAGE = (location.pathname.split('/').pop() || 'index').replace('.html', '') || 'index';
  var PREFIX = 'perchnote::';
  var SEL = ['.day1', '.phase', '.scen', '.calc', '.why', '.card', '.roles', '.beyond', '.gloss', '.mod'];

  // ---- styles ----
  var css = ''
    + '.pn-wrap{margin:12px 4px 2px;}'
    + '.pn-toggle{font:600 11px/1 -apple-system,sans-serif;letter-spacing:.03em;color:#fbbf24;'
    + 'background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.35);border-radius:99px;'
    + 'padding:5px 11px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .15s}'
    + '.pn-toggle:hover{background:rgba(251,191,36,.18)}'
    + '.pn-toggle.has{color:#4ade80;background:rgba(74,222,128,.12);border-color:rgba(74,222,128,.4)}'
    + '.pn-box{display:none;margin-top:8px}'
    + '.pn-box.open{display:block}'
    + '.pn-ta{width:100%;min-height:60px;resize:vertical;background:#0c0e12;border:1px solid #2c3340;'
    + 'border-radius:9px;color:#e7eaf0;font:13px/1.5 -apple-system,sans-serif;padding:9px 11px}'
    + '.pn-ta:focus{outline:none;border-color:#fbbf24}'
    + '.pn-lbl{font:600 10px/1 -apple-system,sans-serif;text-transform:uppercase;letter-spacing:.06em;'
    + 'color:#6f7785;margin-bottom:5px;display:block}'
    + '.pn-fab{position:fixed;right:18px;bottom:18px;z-index:9999;font:700 13px/1 -apple-system,sans-serif;'
    + 'color:#0c0e12;background:linear-gradient(135deg,#fbbf24,#f59e0b);border:none;border-radius:99px;'
    + 'padding:13px 18px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.4);display:flex;align-items:center;gap:8px}'
    + '.pn-fab:hover{filter:brightness(1.08)}'
    + '.pn-fab .pn-count{background:#0c0e12;color:#fbbf24;border-radius:99px;padding:2px 7px;font-size:11px;min-width:18px;text-align:center}'
    + '.pn-fab .pn-count.zero{display:none}'
    + '.pn-toast{position:fixed;right:18px;bottom:74px;z-index:9999;background:#14171d;border:1px solid #4ade80;'
    + 'color:#e7eaf0;border-radius:10px;padding:11px 15px;font:13px/1.4 -apple-system,sans-serif;'
    + 'box-shadow:0 6px 20px rgba(0,0,0,.4);opacity:0;transform:translateY(8px);transition:all .2s;max-width:280px}'
    + '.pn-toast.show{opacity:1;transform:none}'
    + '@media print{.pn-toggle,.pn-fab,.pn-box:not(.open){display:none}.pn-box.open{display:block}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function clean(s){ return (s || '').replace(/\s+/g, ' ').trim(); }
  function keyFor(label){ return PREFIX + PAGE + '::' + label; }
  var seen = {};
  function uniqueLabel(label){
    label = label || 'Section';
    if (seen[label]) { seen[label]++; return label + ' #' + seen[label]; }
    seen[label] = 1; return label;
  }
  function labelFromSection(el){
    var h = el.querySelector('.pt, h2, h3, h4');
    if (h) {
      var c = h.cloneNode(true);
      c.querySelectorAll('.badge, .st, .tag-pill').forEach(function(n){ n.remove(); });
      return clean(c.textContent).slice(0, 70);
    }
    return clean(el.textContent).slice(0, 40);
  }

  // ---- floating copy-all button (defined first so listeners can update it) ----
  var fab = document.createElement('button'); fab.className = 'pn-fab';
  fab.innerHTML = 'Copy all notes <span class="pn-count zero">0</span>';
  document.body.appendChild(fab);
  var countEl = fab.querySelector('.pn-count');

  function allNotes(){
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) {
          var v = clean(localStorage.getItem(k));
          if (!v) continue;
          var rest = k.slice(PREFIX.length);
          var sp = rest.indexOf('::');
          out.push({ page: rest.slice(0, sp), label: rest.slice(sp + 2), note: localStorage.getItem(k) });
        }
      }
    } catch (e) {}
    return out;
  }
  function updateCount(){ var n = allNotes().length; countEl.textContent = n; countEl.className = 'pn-count' + (n ? '' : ' zero'); }
  function digest(){
    var notes = allNotes(); if (!notes.length) return '';
    var byPage = {}; notes.forEach(function(n){ (byPage[n.page] = byPage[n.page] || []).push(n); });
    var lines = ['# Perch artifact notes — ' + new Date().toISOString().slice(0,10), ''];
    Object.keys(byPage).forEach(function(pg){
      lines.push('## ' + pg);
      byPage[pg].forEach(function(n){ lines.push('- [' + n.label + '] ' + clean(n.note)); });
      lines.push('');
    });
    return lines.join('\n').trim();
  }
  function toast(msg, ok){
    var t = document.createElement('div'); t.className = 'pn-toast'; t.textContent = msg;
    if (ok === false) t.style.borderColor = '#f87171';
    document.body.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('show'); });
    setTimeout(function(){ t.classList.remove('show'); setTimeout(function(){ t.remove(); }, 250); }, 2600);
  }
  function fallbackCopy(text, n){
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied ' + n + ' note(s) — paste into chat.'); }
    catch (e) { toast('Copy failed — select the text manually.', false); }
    ta.remove();
  }
  fab.addEventListener('click', function(){
    var text = digest();
    if (!text) { toast('No notes yet — add a note on any section.', false); return; }
    var n = allNotes().length;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function(){ toast('Copied ' + n + ' note(s) — paste into chat.'); },
        function(){ fallbackCopy(text, n); });
    } else { fallbackCopy(text, n); }
  });

  // ---- attach a fresh note box to a section ----
  function attachBox(el){
    if (el.querySelector('.pn-wrap')) return;
    var label = uniqueLabel(labelFromSection(el));
    var key = keyFor(label);
    var wrap = document.createElement('div'); wrap.className = 'pn-wrap';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pn-toggle';
    var box = document.createElement('div'); box.className = 'pn-box';
    var lbl = document.createElement('span'); lbl.className = 'pn-lbl'; lbl.textContent = 'Note · ' + label;
    var ta = document.createElement('textarea'); ta.className = 'pn-ta'; ta.placeholder = 'Your note for this section…';
    var saved = ''; try { saved = localStorage.getItem(key) || ''; } catch (e) {}
    ta.value = saved;
    btn.appendChild(document.createTextNode(''));
    function refreshBtn(){ var has = clean(ta.value).length > 0; btn.className = 'pn-toggle' + (has ? ' has' : ''); btn.firstChild.nodeValue = has ? '📝 note saved · edit' : '📝 add note'; }
    refreshBtn(); if (saved) box.classList.add('open');
    btn.addEventListener('click', function(){ box.classList.toggle('open'); if (box.classList.contains('open')) ta.focus(); });
    ta.addEventListener('input', function(){
      try { if (clean(ta.value)) localStorage.setItem(key, ta.value); else localStorage.removeItem(key); } catch (e) {}
      refreshBtn(); updateCount();
    });
    box.appendChild(lbl); box.appendChild(ta); wrap.appendChild(btn); wrap.appendChild(box);
    el.appendChild(wrap);
  }

  // ---- adopt a page's own textareas into the unified digest ----
  function adopt(ta){
    var sec = ta.closest('section') || ta.closest('.mod') || ta.parentElement;
    var label = uniqueLabel(sec ? labelFromSection(sec) : clean(ta.dataset.key));
    var key = keyFor(label);
    function mirror(){ try { if (clean(ta.value)) localStorage.setItem(key, ta.value); else localStorage.removeItem(key); } catch (e) {} }
    mirror();
    ta.addEventListener('input', function(){ mirror(); updateCount(); });
  }

  // ---- decide mode ----
  var legacy = document.querySelectorAll('textarea.notes[data-key]');
  if (legacy.length) {
    Array.prototype.forEach.call(legacy, adopt);
  } else {
    var cands = Array.prototype.slice.call(document.querySelectorAll(SEL.join(',')));
    cands = cands.filter(function(el){ return !cands.some(function(o){ return o !== el && o.contains(el); }); });
    cands.forEach(attachBox);
  }
  updateCount();
})();
