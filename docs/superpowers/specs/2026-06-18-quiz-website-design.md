# 刷題網站設計文件

**日期**：2026-06-18  
**狀態**：已確認

---

## 目標

建立一個可在本機運行、同區網手機也能連線的法律刷題網站，支援：
- 司律一試（資料來源：lagendre/law.exam，民國 100–111 年）
- 調查局特考三等法律實務組（資料來源：先嘗試考選部，fallback 至 public.com.tw）

---

## 技術選型

| 層級 | 技術 |
|------|------|
| 後端 | Python 3 + Flask |
| 資料庫 | SQLite（透過 sqlite3 標準庫） |
| 前端 | 純 HTML + CSS + Vanilla JS（單頁應用） |
| 資料擷取 | requests + BeautifulSoup4 |
| 伺服器綁定 | `0.0.0.0:5000`，LAN 內手機可直接連 `http://[電腦IP]:5000` |

---

## 專案結構

```
law_test/
├── app.py                  # Flask 伺服器主程式
├── setup.py                # 一次性資料下載/爬蟲腳本
├── db.py                   # SQLite 資料庫操作
├── scrapers/
│   ├── __init__.py
│   ├── lagendre.py         # 司律一試：從 GitHub 下載 .txt 解析
│   └── investigation.py    # 調查局特考：考選部 → fallback public.com.tw
├── data/
│   ├── silu/               # 司律一試解析後的 JSON（依年份命名）
│   └── investigation/      # 調查局 JSON
├── static/
│   ├── style.css
│   └── app.js
├── templates/
│   └── index.html
├── quiz.db                 # SQLite 資料庫（執行期產生）
└── requirements.txt        # flask, requests, beautifulsoup4
```

---

## 資料格式

### 題目 JSON（每個檔案為一份考卷）

```json
{
  "exam_type": "silu",
  "year": 108,
  "subject": "民法、民事訴訟法",
  "track": "律",
  "questions": [
    {
      "no": 1,
      "text": "題目文字...",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "answer": "C"
    }
  ]
}
```

### lagendre .txt 格式（輸入）

- 題目檔：每題以題號開頭（`1.`），選項為 `(A)` / `(B)` / `(C)` / `(D)`
- 答案檔（ANS.txt）：每行一個答案字母，對應題號

---

## 資料庫結構

```sql
CREATE TABLE questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_type    TEXT NOT NULL,   -- 'silu' | 'investigation'
  year         INTEGER NOT NULL,
  subject      TEXT NOT NULL,
  track        TEXT,            -- '司' | '律' | NULL（調查局無此欄）
  question_no  INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  opt_a        TEXT NOT NULL,
  opt_b        TEXT NOT NULL,
  opt_c        TEXT NOT NULL,
  opt_d        TEXT NOT NULL,
  answer       TEXT NOT NULL    -- 'A' | 'B' | 'C' | 'D'
);

CREATE TABLE attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id  INTEGER NOT NULL REFERENCES questions(id),
  chosen       TEXT NOT NULL,
  is_correct   INTEGER NOT NULL,  -- 0 | 1
  answered_at  TEXT NOT NULL      -- ISO 8601
);

CREATE TABLE bookmarks (
  question_id  INTEGER PRIMARY KEY REFERENCES questions(id),
  created_at   TEXT NOT NULL
);
```

---

## API 端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/` | 首頁 HTML |
| GET | `/api/questions` | 取題目列表（支援 exam_type, year, subject, track, mode 參數） |
| GET | `/api/question/<id>` | 單題詳細資料 |
| POST | `/api/attempt` | 送出答案 `{question_id, chosen}`，回傳 `{correct, answer}` |
| GET | `/api/stats` | 整體與各科答對率統計 |
| GET | `/api/wrong` | 曾答錯的題目列表（去重，取最近一次） |
| POST | `/api/bookmark/<id>` | 切換書籤（存在則刪除，不存在則新增） |
| GET | `/api/filters` | 取得可用的年份、科目清單（供下拉選單） |

### `/api/questions` 查詢參數

| 參數 | 說明 | 預設值 |
|------|------|--------|
| `exam_type` | `silu` / `investigation` | 必填 |
| `year` | 年份數字，`0` = 全部 | `0` |
| `subject` | 科目字串，空字串 = 全部 | `""` |
| `track` | `司` / `律` / `""` | `""` |
| `mode` | `sequential` / `random` / `wrong` | `sequential` |
| `limit` | 題數上限 | `9999` |

---

## 前端架構

單頁應用（SPA），不使用任何框架，純 Vanilla JS。

### 畫面狀態機

```
HOME ──[開始練習]──► QUIZ ──[統計按鈕]──► STATS
                        ▲                    │
                        └────────────────────┘
```

### 畫面一：首頁（選題模式）

- 考試切換：司律一試 / 調查局特考（Tab）
- 下拉選單：年份、科目、組別（司/律，僅司律一試）
- 練習模式：順序 / 隨機 / 只練錯題
- 整體答對率顯示

### 畫面二：答題介面

- 顯示：考試別、年份、科目、第 N 題 / 共 M 題
- 選項 A–D 以 radio button 呈現
- 選擇後立即揭示：
  - ✓ 綠色 = 正確
  - ✗ 紅色 = 答錯，同時標出正確選項
- 導覽按鈕：上一題 / 跳題（輸入題號） / 隨機 / 下一題
- 書籤按鈕（加入/移出錯題本）

### 畫面三：統計 / 錯題本

- 各科答對率表格
- 錯題列表（顯示題目、可點進去直接作答）

### RWD

- 手機優先，按鈕最小觸控區域 44×44px
- 選項文字換行不破版

---

## 爬蟲策略

### 司律一試（lagendre.py）

1. 從 GitHub API 列出 `lagendre/law.exam` repo 各年份資料夾
2. 下載每個 `.txt` 和 `ANS.txt`
3. 解析題目（regex 比對題號、選項）與答案
4. 輸出 `data/silu/<year>_<track>_<subject>.json`

### 調查局特考（investigation.py）

策略一：考選部
- 目標：`wwwc.moex.gov.tw` 考畢試題查詢平臺
- 若 HTTP 回傳正常則解析，否則進策略二

策略二：public.com.tw
- 爬取列表頁（帶題目類型參數），取得各年份考卷連結
- 爬取個別考卷頁（題目文字 + 選項）
- 若解答需登入，則 answer 欄位存 `null`，UI 標示「答案未提供」

---

## 啟動方式

```bash
# 1. 安裝依賴
pip install flask requests beautifulsoup4

# 2. 下載/爬取資料（首次執行，約需數分鐘）
python setup.py

# 3. 啟動伺服器
python app.py
# → 電腦：http://localhost:5000
# → 手機（同區網）：http://192.168.x.x:5000
```

---

## 未納入範圍

- 使用者帳號系統（進度為單機共享，不區分使用者）
- 題目解析說明（僅顯示正確答案）
- 調查局申論題（僅處理選擇題）
