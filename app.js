/* 抽歌终端 · 前端逻辑 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var DC = { Basic: '#35e07a', Advanced: '#f5a524', Expert: '#f0503a', Master: '#b57bfa', 'Re:Master': '#ffffff' };
  var TYPES = [['standard', 'SD 标准谱'], ['dx', 'DX 谱']];
  var LF = 'mmdraw.filters', LH = 'mmdraw.hist';
  var S = { entries: [], pool: [], f: null, hist: [], last: [] };

  function defaults() {
    return { diffs: MM.DIFFS.slice(), types: ['standard', 'dx'], vers: [], dsMin: 13, dsMax: 14.5,
             bpmMin: null, bpmMax: null, title: '', designer: '' };
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { if (v === '' || v == null) return null; var n = Number(v); return isNaN(n) ? null : n; }
  function saveF() { try { localStorage.setItem(LF, JSON.stringify(S.f)); } catch (e) {} }
  function saveH() { try { localStorage.setItem(LH, JSON.stringify(S.hist.slice(-300))); } catch (e) {} }

  /* ---------- 控件 ---------- */
  function mkChip(text, on, color, onclick) {
    var b = document.createElement('button');
    b.className = 'chip' + (on ? ' on' : '');
    b.textContent = text;
    if (color) b.style.setProperty('--c', color);
    b.onclick = onclick;
    return b;
  }
  function toggle(arr, v) { var i = arr.indexOf(v); if (i < 0) arr.push(v); else arr.splice(i, 1); }

  function buildDiff() {
    var box = $('diffChips'); box.innerHTML = '';
    MM.DIFFS.forEach(function (d) {
      box.appendChild(mkChip(d, S.f.diffs.indexOf(d) >= 0, DC[d], function () {
        toggle(S.f.diffs, d); buildDiff(); refresh();
      }));
    });
  }
  function buildTypes() {
    var box = $('typeChips'); box.innerHTML = '';
    TYPES.forEach(function (t) {
      box.appendChild(mkChip(t[1], S.f.types.indexOf(t[0]) >= 0, undefined, function () {
        toggle(S.f.types, t[0]); buildTypes(); refresh();
      }));
    });
  }
  function buildVers() {
    var box = $('verChips'); box.innerHTML = '';
    MM.versionsOf(S.entries).forEach(function (v) {
      box.appendChild(mkChip(v, S.f.vers.indexOf(v) >= 0, '#22d3ee', function () {
        toggle(S.f.vers, v); buildVers(); refresh();
      }));
    });
  }
  function syncInputs() {
    $('dsMin').value = S.f.dsMin == null ? '' : S.f.dsMin;
    $('dsMax').value = S.f.dsMax == null ? '' : S.f.dsMax;
    $('bpmMin').value = S.f.bpmMin == null ? '' : S.f.bpmMin;
    $('bpmMax').value = S.f.bpmMax == null ? '' : S.f.bpmMax;
    $('qTitle').value = S.f.title || '';
    $('qDesigner').value = S.f.designer || '';
  }

  /* ---------- 池 ---------- */
  function refresh() {
    S.pool = MM.filterEntries(S.entries, S.f);
    var n = S.pool.length;
    $('poolNum').textContent = n >= 10000 ? (n / 1000).toFixed(1) + 'k' : n;
    $('poolInfo').textContent = '池 ' + n + ' 谱 · ' +
      new Set(S.pool.map(function (e) { return e.sid; })).size + ' 曲';
    saveF();
  }

  /* ---------- 抽取 ---------- */
  function draw() {
    if (!S.pool.length) { flash('池子是空的，放宽点条件'); return; }
    var n = Math.max(1, Math.min(30, parseInt($('n').value, 10) || 3));
    var excl = [];
    if ($('noRepeat').checked) S.hist.forEach(function (h) { excl = excl.concat(h.keys); });
    var picked = MM.drawN(S.pool, n, Math.random, excl, $('perSong').checked);
    if (!picked.length) { flash('池内谱面都被历史排除了，清一下历史'); return; }
    S.last = picked;
    $('go').disabled = true;
    var d = $('dial'); d.classList.remove('rolling'); void d.offsetWidth; d.classList.add('rolling');
    render(picked);
    record(picked);
    setTimeout(function () { $('go').disabled = false; }, 420);
  }

  function render(list) {
    var box = $('results');
    box.innerHTML = list.map(function (e, i) {
      var c = DC[e.dname] || '#ff4fa3';
      return '<article class="card" style="--i:' + i + ';--c:' + c + '">' +
        '<span class="idx">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="tagrow"><span class="tag">' + esc(e.tlabel) + '</span>' +
        '<span class="tag">' + esc(e.dname) + '</span>' +
        '<span class="tag ghost">' + esc(e.ver) + '</span></div>' +
        '<h3>' + esc(e.title) + '</h3><p class="art">' + esc(e.artist) + '</p>' +
        '<div class="dsline"><span class="ds">' + (e.ds == null ? '?' : e.ds.toFixed(1)) + '</span>' +
        '<span class="ds-cap">定数</span></div>' +
        '<dl><dt>BPM</dt><dd>' + (e.bpm || '?') + '</dd>' +
        '<dt>谱师</dt><dd>' + esc(e.designer) + '</dd>' +
        '<dt>物量</dt><dd>' + (e.notes == null ? '—' : e.notes) + '</dd>' +
        '<dt>流派</dt><dd>' + esc(e.genre) + '</dd>' +
        '<dt>曲目 ID</dt><dd>' + e.sid + '</dd></dl></article>';
    }).join('');
    $('copyBtn').disabled = false;
  }

  function record(list) {
    S.hist.push({ t: Date.now(), keys: list.map(function (e) { return e.key; }),
                  txt: list.map(function (e) { return e.title + ' ' + e.dname + ' ' + (e.ds == null ? '' : e.ds); }) });
    saveH(); renderHist();
  }
  function renderHist() {
    var box = $('hist');
    if (!S.hist.length) { box.innerHTML = '<div class="none">—</div>'; return; }
    box.innerHTML = S.hist.slice(-12).reverse().map(function (h) {
      var d = new Date(h.t), p = function (v) { return String(v).padStart(2, '0'); };
      return '<div><b>' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) +
        '</b> ' + esc(h.txt.join(' · ')) + '</div>';
    }).join('');
  }

  function flash(msg) {
    var el = $('poolInfo'); var old = el.textContent;
    el.textContent = '⚠ ' + msg; el.style.color = 'var(--warn)';
    setTimeout(function () { el.textContent = old; el.style.color = ''; }, 2200);
  }

  /* ---------- 8 键环 ---------- */
  function buildDial() {
    var g = $('dialBars'), svg = '';
    for (var i = 0; i < 8; i++) {
      var deg = i * 45, inner = i % 2 ? 26 : 20;
      svg += '<rect x="-5" y="' + (-76 - (i % 2 ? 6 : 0)) + '" width="10" height="' + (14 + (i % 2 ? 4 : 0)) +
        '" rx="2" transform="rotate(' + deg + ')" />';
      svg += '<circle cx="' + (Math.sin(deg * Math.PI / 180) * inner * 2.6).toFixed(1) + '" cy="' +
        (-Math.cos(deg * Math.PI / 180) * inner * 2.6).toFixed(1) + '" r="2.4" fill="#ff4fa3" opacity=".5"/>';
    }
    g.innerHTML = svg;
  }

  /* ---------- 事件 ---------- */
  function bind() {
    ['dsMin', 'dsMax', 'bpmMin', 'bpmMax'].forEach(function (k) {
      $(k).addEventListener('input', function () { S.f[k] = num(this.value); refresh(); });
    });
    $('qTitle').addEventListener('input', function () { S.f.title = this.value; refresh(); });
    $('qDesigner').addEventListener('input', function () { S.f.designer = this.value; refresh(); });
    $('go').onclick = draw;
    $('dial').onclick = draw;
    $('goFloat').onclick = draw;
    if ($('emptyGo')) $('emptyGo').onclick = draw;
    $('verAll').onclick = function () { S.f.vers = MM.versionsOf(S.entries); buildVers(); refresh(); };
    $('verNone').onclick = function () { S.f.vers = []; buildVers(); refresh(); };
    $('clearHist').onclick = function () { S.hist = []; saveH(); renderHist(); flash('历史已清空'); };
    $('copyBtn').onclick = function () {
      var txt = S.last.map(function (e, i) {
        return (i + 1) + '. ' + e.title + '  [' + e.tlabel + ' ' + e.dname + ' ' +
          (e.ds == null ? '?' : e.ds.toFixed(1)) + ']  BPM ' + (e.bpm || '?') + '  谱师 ' + e.designer + '  (' + e.ver + ')';
      }).join('\n');
      var done = function () { var b = $('copyBtn'); b.classList.add('ok'); setTimeout(function () { b.classList.remove('ok'); }, 1400); };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, function () { window.prompt('手动复制', txt); });
      else window.prompt('手动复制', txt);
    };
    document.addEventListener('keydown', function (ev) {
      if (ev.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { ev.preventDefault(); draw(); }
    });
    if (window.DeviceMotionEvent) {                     // 手机摇一摇再抽
      var lastShake = 0, prevMag = 0;
      window.addEventListener('devicemotion', function (ev) {
        var a = ev.accelerationIncludingGravity;
        if (!a) return;
        var m = Math.sqrt((a.x || 0) * (a.x || 0) + (a.y || 0) * (a.y || 0) + (a.z || 0) * (a.z || 0));
        if (prevMag && Math.abs(m - prevMag) > 15 && Date.now() - lastShake > 1500) { lastShake = Date.now(); draw(); }
        prevMag = m;
      });
    }
  }

  /* ---------- 启动 ---------- */
  fetch('data/songs.json').then(function (r) { return r.json(); }).then(function (db) {
    S.entries = MM.flatten(db.songs);
    $('dbTotal').textContent = db.songs.length;
    $('dbCharts').textContent = S.entries.length;
    try { S.f = JSON.parse(localStorage.getItem(LF)); } catch (e) { S.f = null; }
    if (!S.f || !S.f.diffs) S.f = defaults();
    try { S.hist = JSON.parse(localStorage.getItem(LH)) || []; } catch (e) { S.hist = []; }
    buildDial(); buildDiff(); buildTypes(); buildVers(); syncInputs(); renderHist(); bind(); refresh();
    if (/[?&]auto=1/.test(location.search)) draw();   // 演示/截图用：载入即抽一次
  }).catch(function (err) {
    $('poolInfo').textContent = '曲库加载失败：' + err.message + '（请用 start.bat 起服务，不要直接双击 index.html）';
  });
})();
