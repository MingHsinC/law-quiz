// service-worker.js — 離線快取。第一次連網時把 App 全部存進手機，之後完全離線。
//
// 更新題庫後（重跑 export_questions.py 並重新部署）：
//   把下面的 CACHE_VERSION 改個數字（例如 v2 → v3），
//   使用者下次連網開啟時就會自動下載新題庫。
const CACHE_VERSION = 'lawquiz-v1';

const ASSETS = [
  '.',
  'index.html',
  'style.css',
  'store.js',
  'app.js',
  'questions.json',
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

// 取用：cache-first，找不到才連網（離線時也能用）
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        // 動態把成功取得的同源資源也存入快取
        if (resp.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, copy));
        }
        return resp;
      }).catch(() => cached);
    }),
  );
});
