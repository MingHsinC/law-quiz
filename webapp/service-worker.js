// service-worker.js — 離線快取。第一次連網時把 App 全部存進手機，之後完全離線。
//
// 題庫更新：只要重跑 export_questions.py 並部署即可，手機端會自動偵測 version.json
//   的變化並在背景重抓新題庫（不需要改這個檔）。
// CACHE_VERSION 只有在「改了 App 程式碼／結構」時才需要 +1，強制刷新整個 App 殼。
const CACHE_VERSION = 'lawquiz-v1';
const CACHE_NAME = CACHE_VERSION;  // store.js 也會用到，保持一致

const ASSETS = [
  '.',
  'index.html',
  'style.css',
  'store.js',
  'app.js',
  'questions.json',
  'version.json',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

// 安裝：把所有資源預先存起來
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// 啟用：清掉舊版快取
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

// 取用策略：
//   version.json → network-first（連網時拿最新，才能偵測題庫更新；離線時退回快取）
//   其他資源     → cache-first（離線秒開、省流量）
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(event.request).then((resp) => {
        if (resp.ok && url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
        }
        return resp;
      }).catch(() => caches.match(event.request)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        // 動態把成功取得的同源資源也存入快取
        if (resp.ok && url.origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
        }
        return resp;
      }).catch(() => cached);
    }),
  );
});
