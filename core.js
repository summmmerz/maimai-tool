/* 抽歌核心逻辑：浏览器 / node 共用 */
(function (root) {
  'use strict';
  var DIFFS = ['Basic', 'Advanced', 'Expert', 'Master', 'Re:Master'];
  var TYPE_LABEL = { standard: 'SD', dx: 'DX', utage: '宴' };

  function flatten(songs) {
    var out = [], i, j, s, c;
    for (i = 0; i < songs.length; i++) {
      s = songs[i];
      for (j = 0; j < s.charts.length; j++) {
        c = s.charts[j];
        out.push({
          sid: s.id, title: s.title, artist: s.artist, genre: s.genre, bpm: s.bpm,
          ver: s.version_name, vcode: s.version, utage: s.id >= 100000,
          type: c.type, tlabel: TYPE_LABEL[c.type] || c.type,
          diff: c.diff, dname: c.name, ds: c.ds, designer: c.designer, notes: c.notes,
          key: s.id + ':' + c.type + ':' + c.diff
        });
      }
    }
    return out;
  }

  function has(arr) { return arr && arr.length > 0; }

  function filterEntries(list, f) {
    f = f || {};
    var low = function (v) { return String(v == null ? '' : v).toLowerCase(); };
    var qT = low(f.title), qD = low(f.designer);
    return list.filter(function (e) {
      if (has(f.diffs) && f.diffs.indexOf(e.dname) < 0) return false;
      if (has(f.types) && f.types.indexOf(e.type) < 0) return false;
      if (has(f.vers) && f.vers.indexOf(e.ver) < 0) return false;
      if (f.dsMin != null && !(e.ds != null && e.ds >= f.dsMin)) return false;
      if (f.dsMax != null && !(e.ds != null && e.ds <= f.dsMax)) return false;
      if (f.bpmMin != null && !(e.bpm >= f.bpmMin)) return false;
      if (f.bpmMax != null && !(e.bpm > 0 && e.bpm <= f.bpmMax)) return false;
      if (qT && low(e.title).indexOf(qT) < 0) return false;
      if (qD && low(e.designer).indexOf(qD) < 0) return false;
      return true;
    });
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* 字符串种子 -> 32 位整数（FNV-1a），保证同一种子可复现 */
  function seedToInt(s) {
    if (s == null || s === '') return (Math.random() * 0xFFFFFFFF) >>> 0;
    if (/^\d+$/.test(String(s))) return (parseInt(s, 10) >>> 0);
    var h = 0x811c9dc5, str = String(s);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function drawN(pool, n, rng, excludeKeys, perSong) {
    var cand = pool, ex = null, i;
    if (has(excludeKeys)) {
      ex = {};
      for (i = 0; i < excludeKeys.length; i++) ex[excludeKeys[i]] = 1;
      cand = pool.filter(function (e) { return !ex[e.key]; });
    }
    var bag = cand.slice(), picked = [], used = {};
    n = Math.min(n, bag.length);
    var guard = bag.length * 4 + 50;
    while (picked.length < n && bag.length && guard-- > 0) {
      var e = bag.splice(Math.floor(rng() * bag.length), 1)[0];
      if (perSong && used[e.sid]) continue;
      used[e.sid] = 1;
      picked.push(e);
    }
    return picked;
  }

  function versionsOf(entries) {
    var map = {};
    entries.forEach(function (e) {
      if (!map[e.ver] || e.vcode < map[e.ver]) map[e.ver] = e.vcode;
    });
    return Object.keys(map).sort(function (a, b) { return map[a] - map[b]; });
  }

  /* ---- 单曲 Rating（官方 ScoreCoefficient 表，取自 Diving-Fish/maimaidx-prober）----
     表语义: 达成率在 [TABLE[i][0], TABLE[i+1][0]) 区间时用 TABLE[i][1] 作系数
     ra = floor(c * 定数 * min(100.5, 达成率) / 100)                              */
  var SC_TABLE = [
    [0, 0], [10, 1.6], [20, 3.2], [30, 4.8], [40, 6.4], [50, 8.0], [60, 9.6], [70, 11.2],
    [75, 12.0], [79.9999, 12.8], [80, 13.6], [90, 15.2], [94, 16.8], [96.9999, 17.6],
    [97, 20.0], [98, 20.3], [98.9999, 20.6], [99, 20.8], [99.5, 21.1], [99.9999, 21.4],
    [100, 21.6], [100.4999, 22.2], [100.5, 22.4]
  ];
  var RANK_NAME = ['d', 'd', 'd', 'd', 'd', 'c', 'b', 'bb', 'bbb', 'bbb', 'a', 'aa', 'aaa',
    's', 's', 'sp', 'sp', 'ss', 'ssp', 'ssp', 'sss', 'sss', 'sssp'];
  /* 真正够得着的档位。水鱼系数表里的 98.9999 / 99.9999 / 100.4999 是 0.0001% 宽的
     边界占位行：打不到，而且系数被紧跟的整点档位严格压制（100.4999→22.2 不如 100.5→22.4），
     所以只认下面这几个整点档，不拿占位行当推荐目标。 */
  var RICK_BANDS = [97, 98, 99, 99.5, 100, 100.5];

  function scIndex(achv) {
    for (var i = 0; i < SC_TABLE.length; i++) {
      if (i === SC_TABLE.length - 1 || achv < SC_TABLE[i + 1][0]) return i;
    }
    return SC_TABLE.length - 1;
  }
  function calcRa(ds, achv) {
    if (ds == null || achv == null) return null;
    var c = SC_TABLE[scIndex(achv)][1];
    return Math.floor(c * ds * Math.min(100.5, achv) / 100);
  }
  /* 下一档：目标只取 RICK_BANDS 里比当前达成率大的那一个（已顶到 100.5% 则 null） */
  function nextBand(ds, achv) {
    if (ds == null || achv == null) return null;
    var need = null;
    for (var k = 0; k < RICK_BANDS.length; k++) {
      if (RICK_BANDS[k] > achv) { need = RICK_BANDS[k]; break; }
    }
    if (need == null) return null;
    var ra = calcRa(ds, need);
    return { need: need, ra: ra, rank: RANK_NAME[scIndex(need)],
             gain: ra - calcRa(ds, achv), gap: need - achv };
  }
  /* 在「当前档位内」再多拿 1 ra 所需的最低达成率（官方 get_more_ra_local 同义） */
  function nextRa1(ds, achv) {
    if (ds == null || achv == null) return null;
    var i = scIndex(achv), ra = calcRa(ds, achv), c = SC_TABLE[i][1];
    if (c <= 0) return null;
    var ach = Math.ceil(Math.min((ra + 1) * 100 / ds / c, 100.5) * 10000) / 10000;
    if (i !== SC_TABLE.length - 1 && ach >= SC_TABLE[i + 1][0]) return null;  // 该档位内做不到
    return { need: ach, ra: ra + 1 };
  }
  /* rating 总分 = 最高的 n 张谱面 ra 之和（默认 50） */
  function totalRating(ras, n) {
    n = n || 50;
    return ras.slice().sort(function (a, b) { return b - a; }).slice(0, n)
      .reduce(function (s, v) { return s + v; }, 0);
  }

  /* ---- 水鱼 API 返回 -> records.json 结构（浏览器端用，与 fetch_records.py 同逻辑）---- */
  function normRec(c, newmap) {
    var title = c.title || '', type = c.type || '';
    var k = title + '\u0001' + type;
    return {
      title: title, type: type, level_index: c.level_index, level_label: c.level_label,
      ds: c.ds, achievements: c.achievements, ra: c.ra, fc: c.fc || '', fs: c.fs || '',
      song_id: c.song_id,
      is_new: Object.prototype.hasOwnProperty.call(newmap, k) ? newmap[k] : null
    };
  }

  function newmapOf(songs) {
    var tmap = { standard: 'SD', dx: 'DX', utage: '宴' }, m = {}, i, j, s;
    for (i = 0; i < songs.length; i++) {
      s = songs[i];
      for (j = 0; j < s.charts.length; j++) {
        m[s.title + '\u0001' + (tmap[s.charts[j].type] || s.charts[j].type)] = !!s.charts[j].is_new;
      }
    }
    return m;
  }

  function recordsFromApi(raw, songs) {
    var newmap = newmapOf(songs), charts = [];
    var b = raw.charts;
    if (b && !Array.isArray(b)) {
      ['sd', 'dx'].forEach(function (k) {
        (b[k] || []).forEach(function (c) { charts.push(normRec(c, newmap)); });
      });
    } else if (Array.isArray(b)) {
      b.forEach(function (c) { charts.push(normRec(c, newmap)); });
    } else if (Array.isArray(raw.records)) {
      raw.records.forEach(function (c) { charts.push(normRec(c, newmap)); });
    }
    return {
      mode: Array.isArray(raw.records) ? 'full' : 'b50',
      username: raw.username, nickname: raw.nickname, rating: raw.rating,
      additional_rating: raw.additional_rating, plate: raw.plate,
      fetched_at: new Date().toISOString(), charts: charts
    };
  }

  var api = {
    DIFFS: DIFFS, TYPE_LABEL: TYPE_LABEL, flatten: flatten, filterEntries: filterEntries,
    mulberry32: mulberry32, seedToInt: seedToInt, drawN: drawN, versionsOf: versionsOf,
    SC_TABLE: SC_TABLE, RANK_NAME: RANK_NAME, RICK_BANDS: RICK_BANDS,
    scIndex: scIndex, calcRa: calcRa, nextBand: nextBand, nextRa1: nextRa1, totalRating: totalRating,
    normRec: normRec, newmapOf: newmapOf, recordsFromApi: recordsFromApi
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
