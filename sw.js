/* Service Worker：静态资源 cache-first，同源数据文件首次成功即缓存，水鱼 API 一律走网络 */
var CACHE = 'mmdx-v6';
var SHELL = [
  './', 'index.html', 'plan.html',
  'style.css', 'plan.css', 'core.js', 'app.js', 'plan.js',
  'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/barlowcondensed-600.woff2', 'fonts/barlowcondensed-700.woff2'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 逐个加，任何一个失败都不阻断安装
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function put(req, res) {
  if (res && res.ok && res.type === 'basic') {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
  }
  return res;
}

/* HTML/CSS/JS 走 network-first：改完立刻生效，断网时回退缓存。
   字体 / 图标 / 数据文件走 cache-first：省流量；数据要更新就改上面的 CACHE 版本号。 */
var NET_FIRST = /\.(html|css|js)$/;

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;          // 水鱼 API：直连，不缓存

  var netFirst = req.mode === 'navigate' || NET_FIRST.test(url.pathname);
  if (netFirst) {
    e.respondWith(
      fetch(req).then(function (res) { return put(req, res); })
        .catch(function () {
          return caches.match(req).then(function (hit) { return hit || caches.match('index.html'); });
        })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) { return put(req, res); })
        .catch(function () { return caches.match('index.html'); });
    })
  );
});
