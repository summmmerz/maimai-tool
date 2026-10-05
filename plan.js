/* 推分规划器：评分口径 = 旧曲 Top35 + 新曲 Top15（取自水鱼后端 compute_ra） */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var T_OLD = 35, T_NEW = 15, CAP = 100.5, LR = 'mmdraw.records', LRTOK = 'mmdraw.itoken';
  var DC = { Basic: '#22c55e', Advanced: '#ffc400', Expert: '#ff3b3b', Master: '#a855f7', 'Re:Master': '#ff2d9b' };
  var DIFF_BY_INDEX = ['Basic', 'Advanced', 'Expert', 'Master', 'Re:Master'];
  var S = { rec: null, songs: null, entries: [], base: 0, cutoff: 0, exRows: [], sort: 'gap', onlyGain: true, src: '' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function desc(a, b) { return b - a; }
  function key(c) { return (c.song_id || 0) + ':' + c.level_index + ':' + c.type; }
  function playable(c) { return (c.song_id || 0) < 100000 && c.ra != null; }
  function isOld(c) { return c.is_new !== true; }   // 未知一律当旧曲

  /* 按官方口径重算总 rating */
  function compose(list) {
    var ok = list.filter(playable);
    var old = ok.filter(isOld).map(function (c) { return c.ra; }).sort(desc).slice(0, T_OLD);
    var nw = ok.filter(function (c) { return c.is_new === true; }).map(function (c) { return c.ra; }).sort(desc).slice(0, T_NEW);
    return sum(old) + sum(nw);
  }
  function cutoffOf(list) {
    var ok = list.filter(playable);
    var a = ok.filter(isOld).map(function (c) { return c.ra; }).sort(desc)[T_OLD - 1];
    var b = ok.filter(function (c) { return c.is_new === true; }).map(function (c) { return c.ra; }).sort(desc)[T_NEW - 1];
    var v = [a, b].filter(function (x) { return x != null; });
    return v.length ? Math.min.apply(null, v) : 0;
  }

  function kpi(label, value, cls) {
    return '<div class="kpi ' + (cls || '') + '"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>';
  }

  /* ---------- 表 1：已有成绩抬一档 ---------- */
  function planExisting() {
    var rows = [];
    S.rec.charts.forEach(function (c) {
      if (!playable(c)) return;
      var nb = MM.nextBand(c.ds, c.achievements);
      if (!nb) return;                                  // 已顶到 100.5%，没得再抬
      var better = { title: c.title, type: c.type, level_index: c.level_index, ds: c.ds,
                     achievements: nb.need, ra: nb.ra, is_new: c.is_new, song_id: c.song_id };
      var after = compose(S.rec.charts.map(function (x) { return x === c ? better : x; }));
      rows.push({ c: c, need: nb.need, ra: nb.ra, rank: nb.rank, gap: nb.gap, gain: after - S.base });
    });
    return rows;
  }

  function renderExisting(rows) {
    var head = '<thead><tr><th>曲目</th><th>定数</th><th>现在</th><th>还差</th><th>目标档位</th><th>单曲 ra</th><th>总分增益</th><th>抬升后总评</th></tr></thead>';
    var list = (rows || []).slice();
    if (S.onlyGain) list = list.filter(function (r) { return r.gain > 0; });
    if (S.sort === 'gain') {
      list.sort(function (a, b) { return (b.gain - a.gain) || (a.gap - b.gap); });
    } else {
      list.sort(function (a, b) { return (a.gap - b.gap) || (b.gain - a.gain); });   // 越近越「临门一脚」
    }
    if (!list.length) {
      $('tNow').innerHTML = head + '<tr><td colspan="8" class="empty2">' +
        (rows && rows.length ? '没有能进分的谱面 · 去掉「只看进分」看全部'
                              : '已全部顶到 100.5%') + '</td></tr>';
      return;
    }
    $('tNow').innerHTML = head + list.slice(0, 30).map(function (r) {
      var c = r.c;
      var tgt = (r.need % 1 === 0 ? r.need.toFixed(0) : r.need.toFixed(1)) + '%';
      var col = DC[DIFF_BY_INDEX[c.level_index]] || '#ff4fa3';
      return '<tr style="--c:' + col + '">' +
        '<td data-label="曲目"><span class="t">' + esc(c.title) + '</span><span class="sub">' +
        esc(c.level_label || c.type) + '</span></td>' +
        '<td data-label="定数" class="ds">' + (c.ds == null ? '?' : c.ds.toFixed(1)) + '</td>' +
        '<td data-label="现在">' + c.achievements.toFixed(4) + '%</td>' +
        '<td data-label="还差" class="gap' + (r.gap < 0.05 ? ' near' : '') + '">+' + r.gap.toFixed(4) + '%</td>' +
        '<td data-label="目标档位">' + tgt + ' <span class="sub">' + r.rank + '</span></td>' +
        '<td data-label="单曲 ra">' + c.ra + ' → ' + r.ra + '</td>' +
        '<td data-label="总分增益" class="gain' + (r.gain > 0 ? '' : ' zero') + '">' + (r.gain > 0 ? '+' + r.gain : '0') + '</td>' +
        '<td data-label="抬升后总评">' + (S.base + r.gain) + '</td></tr>';
    }).join('');
  }

  function bindSort() {
    var mark = function () {
      $('sortGap').className = 'mini' + (S.sort === 'gap' ? ' on' : '');
      $('sortGain').className = 'mini' + (S.sort === 'gain' ? ' on' : '');
    };
    $('sortGap').onclick = function () { S.sort = 'gap'; mark(); renderExisting(S.exRows); };
    $('sortGain').onclick = function () { S.sort = 'gain'; mark(); renderExisting(S.exRows); };
    $('onlyGain').onchange = function () { S.onlyGain = this.checked; renderExisting(S.exRows); };
    mark();
  }

  /* ---------- 表 2：未打谱面的潜力 ---------- */
  function planNew() {
    if (S.rec.mode === 'b50') return null;   // B50 模式不知道哪些没打过
    var played = {};
    S.rec.charts.forEach(function (c) { played[key(c)] = 1; });
    var rows = [];
    S.entries.forEach(function (e) {
      if (e.utage || e.ds == null) return;
      var k = (e.sid + (e.type === 'dx' ? 10000 : 0)) + ':' + e.diff + ':' + (e.type === 'dx' ? 'DX' : 'SD');
      if (played[k]) return;
      var full = MM.calcRa(e.ds, CAP);
      if (full < S.cutoff) return;                     // 打满都进不了分，直接排除
      var hyp = { title: e.title, type: e.type === 'dx' ? 'DX' : 'SD', level_index: e.diff, ds: e.ds,
                  achievements: CAP, ra: full, is_new: e.is_new, song_id: e.sid };
      var gain = compose(S.rec.charts.concat([hyp])) - S.base;
      rows.push({ e: e, full: full, gain: gain });
    });
    rows.sort(function (a, b) { return (b.gain - a.gain) || (b.full - a.full); });
    return rows;
  }

  function renderNew(rows) {
    var head = '<thead><tr><th>曲目</th><th>难度</th><th>定数</th><th>打满(100.5%)ra</th><th>满分时的总分增益</th></tr></thead>';
    if (rows === null) {
      $('newHint').innerHTML = '<b>B50 模式</b> · 判断不了没打过的谱';
      $('tNew').innerHTML = head + '<tr><td colspan="5" class="empty2">B50 模式下不可用。</td></tr>';
      return;
    }
    $('newHint').innerHTML = '打满 100.5% 可进分 · 门槛 ra ' + S.cutoff +
      ' · <b>' + rows.length + '</b> 张';
    if (!rows.length) {
      $('tNew').innerHTML = head + '<tr><td colspan="5" class="empty2">没有满足条件的未打谱面。</td></tr>';
      return;
    }
    $('tNew').innerHTML = head + rows.slice(0, 30).map(function (r) {
      var e = r.e;
      var col = DC[e.dname] || '#ff4fa3';
      return '<tr style="--c:' + col + '"><td data-label="曲目"><span class="t">' + esc(e.title) +
        '</span><span class="sub">' + esc(e.ver) + '</span></td>' +
        '<td data-label="难度">' + esc(e.dname) + '<span class="sub">' + esc(e.tlabel) + '</span></td>' +
        '<td data-label="定数" class="ds">' + e.ds.toFixed(1) + '</td>' +
        '<td data-label="打满 ra">' + r.full + '</td>' +
        '<td data-label="总分增益" class="gain' + (r.gain > 0 ? '' : ' zero') + '">' +
        (r.gain > 0 ? '+' + r.gain : '0') + '</td></tr>';
    }).join('');
  }

  function milestone() {
    var next = (Math.floor(S.base / 1000) + 1) * 1000;
    S.next = next;
    var from = next - 1000;
    $('bar').style.width = Math.max(2, Math.min(100, (S.base - from) / 10)) + '%';
    $('barNow').textContent = from;
    $('barNext').textContent = next;
    $('milestone').innerHTML = '还差 <b>' + (next - S.base) + '</b> 分 · 目标 <b>' + next + '</b>';
  }

  /* ---------- 取成绩（手机端入口） ---------- */
  function msg(t, color) {
    var el = $('fetchMsg');
    if (el) { el.textContent = t; el.style.color = color || ''; }
  }
  function saveLocal(rec) { try { localStorage.setItem(LR, JSON.stringify(rec)); } catch (e) {} }

  function bindFetch() {
    $('fetchBtn').onclick = function () {
      var u = $('uname').value.trim();
      if (!u) { msg('先填水鱼查分器的用户名'); return; }
      if (!S.songs) { msg('曲库还没加载完，稍等一下'); return; }
      msg('拉取中…', 'var(--cy)');
      fetch('https://www.diving-fish.com/api/maimaidxprober/query/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, b50: true })
      }).then(function (r) {
        if (r.status === 403) throw new Error('该账号设置了隐私 / 未同意用户协议，不允许公开查询');
        if (r.status === 400) throw new Error('用户名不存在？');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (raw) {
        var rec = MM.recordsFromApi(raw, S.songs);
        if (!rec.charts.length) throw new Error('没拿到任何成绩');
        saveLocal(rec);
        applyRecords(rec, '本机浏览器');
        msg('已拉到 ' + rec.charts.length + ' 条成绩（rating ' + rec.rating + '），存在这台设备里');
      }).catch(function (e) {
        msg('失败：' + e.message + '（跨域调用需要 HTTPS，GitHub Pages 下没问题）', 'var(--warn)');
      });
    };
    try {
      var l = localStorage.getItem(LRTOK);
      if (l) { $('itoken').value = l; $('remember').checked = true; }
      else { var s = sessionStorage.getItem(LRTOK); if (s) { $('itoken').value = s; } }
    } catch (e) {}
    $('fetchFull').onclick = function () {
      var t = $('itoken').value.trim();
      if (!t) { msg('先粘 Import-Token（水鱼官网「编辑个人资料」里生成）'); return; }
      if (!S.songs) { msg('曲库还没加载完，稍等一下'); return; }
      var keep = $('remember').checked;
      msg('拉取中…完整成绩可能上千条，慢一点', 'var(--cy)');
      fetch('https://www.diving-fish.com/api/maimaidxprober/player/records', {
        headers: { 'Import-Token': t }
      }).then(function (r) {
        if (r.status === 400) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            throw new Error(j.message || 'Import-Token 有误');
          });
        }
        if (r.status === 403) throw new Error('该账号未同意用户协议 / 已设隐私');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (raw) {
        var rec = MM.recordsFromApi(raw, S.songs);
        if (!rec.charts.length) throw new Error('没拿到成绩');
        saveLocal(rec);
        try {
          if (keep) { localStorage.setItem(LRTOK, t); sessionStorage.removeItem(LRTOK); }
          else { sessionStorage.setItem(LRTOK, t); localStorage.removeItem(LRTOK); }
        } catch (e) {}
        applyRecords(rec, '本机浏览器 · 完整成绩');
        msg('已拉到 ' + rec.charts.length + ' 条完整成绩（rating ' + rec.rating + '）');
      }).catch(function (e) { msg('失败：' + e.message, 'var(--warn)'); });
    };
    $('clearLocal').onclick = function () {
      try {
        localStorage.removeItem(LR); localStorage.removeItem(LRTOK);
        sessionStorage.removeItem(LRTOK);
      } catch (e) {}
      $('itoken').value = '';
      msg('已清除本机成绩和令牌，刷新页面回到默认数据');
    };
  }

  /* ---------- 渲染 ---------- */
  function applyRecords(rec, src) {
    S.rec = rec;
    S.src = src || '';
    S.base = compose(rec.charts);
    S.cutoff = cutoffOf(rec.charts);

    $('rating').textContent = rec.rating;
    $('who').textContent = (rec.nickname || rec.username || '?');
    $('modeTag').textContent = rec.mode === 'full' ? '完整成绩' : (rec.mode === 'test' ? '官方测试数据' : 'B50');
    $('when').textContent = (S.src ? '· ' + S.src : '') +
      (rec.mode === 'test' ? ' · 测试数据' : '');

    var oldN = rec.charts.filter(function (c) { return playable(c) && isOld(c); }).length;
    var newN = rec.charts.filter(function (c) { return playable(c) && c.is_new === true; }).length;
    $('kpis').innerHTML =
      kpi('B50 门槛 ra', S.cutoff, 'cy') +
      kpi('成绩条数', rec.charts.length, '') +
      kpi('旧曲/新曲', oldN + '/' + newN, '') +
      kpi('重算校验', S.base === rec.rating ? '一致' : S.base + '≠' + rec.rating, S.base === rec.rating ? 'gold' : 'hi');

    milestone();
    S.exRows = planExisting();
    bindSort();
    renderExisting(S.exRows);
    renderNew(planNew());

    var pos = S.exRows.filter(function (r) { return r.gain > 0; });
    var top = pos.slice(0, 6);
    if (top.length) {
      $('milestone').innerHTML += ' · 最划算 6 步 <b>+' +
        sum(top.map(function (r) { return r.gain; })) + '</b>';
      var avg = Math.round(sum(pos.map(function (r) { return r.gain; })) / pos.length);
      if (avg > 0) {
        $('milestone').innerHTML += ' · 平均 +' + avg + ' · 约 ' +
          Math.ceil((S.next - S.base) / avg) + ' 次档';
      }
    }
  }

  function noData(err) {
    $('who').textContent = '还没有成绩数据';
    $('rating').textContent = '--';
    $('milestone').innerHTML = '先在「取成绩」里拉一次成绩' +
      (err && err.message ? '（' + esc(err.message) + '）' : '');
    $('tNow').innerHTML = '';
    $('tNew').innerHTML = '';
  }

  /* ---------- 启动 ---------- */
  bindFetch();
  fetch('data/songs.json').then(function (r) { return r.json(); }).then(function (db) {
    S.songs = db.songs;
    S.entries = MM.flatten(db.songs);
    var local = null;
    try { local = JSON.parse(localStorage.getItem(LR)); } catch (e) {}
    if (local && local.charts && local.charts.length) { applyRecords(local, '本机已保存'); return; }
    return fetch('data/records.json').then(function (r) {
      if (!r.ok) throw new Error('没有 data/records.json');
      return r.json();
    }).then(function (rec) { applyRecords(rec); })
      .catch(function (err) { noData(err); });
  }).catch(function (err) { noData(err); });
})();
