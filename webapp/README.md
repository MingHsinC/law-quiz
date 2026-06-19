# 法律刷題 — 離線手機 App（PWA）

這個資料夾是一個**完全離線**的網頁 App：題庫、評分、作答記錄全部在手機本機完成，
安裝後不需要網路、不需要伺服器、零費用。

## 檔案說明

| 檔案 | 作用 |
|------|------|
| `index.html` | App 主頁面 |
| `app.js` | 畫面與互動邏輯 |
| `store.js` | 本機資料層（出題、評分、統計、書籤），用 IndexedDB 存記錄 |
| `questions.json` | 題庫（由 `../export_questions.py` 從 quiz.db 匯出，5020 題） |
| `manifest.webmanifest` | PWA 設定（App 名稱、圖示） |
| `service-worker.js` | 離線快取（第一次連網把整個 App 存進手機） |
| `icons/` | App 圖示 |

## 如何裝到手機（用 GitHub Pages 免費部署）

1. **產生題庫檔**（之後每次改題庫都要重跑）：
   ```
   python export_questions.py
   ```
2. 把整個專案 push 到 GitHub。
3. GitHub repo → **Settings → Pages** → Source 選 **Deploy from a branch**，
   分支選你的分支、資料夾選 **/ (root)**，再把網址指到 `webapp/`；
   或更簡單：把 `webapp/` 的內容放到一個專門的 repo 根目錄再開 Pages。
4. 開啟 Pages 給的網址（例如 `https://你的帳號.github.io/xxx/webapp/`）。
5. **手機 Chrome / Safari 打開該網址 → 選「加入主畫面」**。
6. 完成！桌面會出現「法律刷題」圖示，之後**離線也能用**。

> 第一次安裝需要連一次網（下載題庫到手機），之後完全離線。

## 更新題庫後

1. 重跑 `python export_questions.py`（更新 `questions.json`）。
2. 編輯 `service-worker.js`，把 `CACHE_VERSION` 的數字 +1（例如 `lawquiz-v1` → `lawquiz-v2`）。
3. 重新 push / 部署。手機下次連網開啟時會自動更新題庫。

## 本機預覽（電腦上先看效果）

```
python -m http.server 8000 --directory webapp
```
然後瀏覽器開 `http://127.0.0.1:8000/`。
（Service Worker 需要 `localhost`／`127.0.0.1` 或 HTTPS 才會啟用。）

## 備份作答記錄

記錄只存在手機本機。換手機或清除瀏覽器資料前，
到「統計 / 錯題」頁最下方按「**匯出備份**」存成檔案，新手機再用「**匯入還原**」匯回。
