// store.js — 離線資料層：取代原本 Flask 的 /api/* 後端。
// 題目來自 questions.json（隨 App 打包）；作答記錄與書籤存在手機本機 IndexedDB。

// 與 service-worker.js 的 CACHE_NAME 保持一致（題庫更新時用來寫回快取）
const CACHE_NAME = 'lawquiz-v1';

// ── 極簡 IndexedDB 包裝 ─────────────────────────────────────
const IDB = {
  _db: null,
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('lawquiz', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('attempts')) {
          const s = db.createObjectStore('attempts', { keyPath: 'id', autoIncrement: true });
          s.createIndex('question_id', 'question_id', { unique: false });
        }
        if (!db.objectStoreNames.contains('bookmarks')) {
          db.createObjectStore('bookmarks', { keyPath: 'question_id' });
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(); };
      req.onerror = (e) => reject(e.target.error);
    });
  },
  _store(name, mode) { return this._db.transaction(name, mode).objectStore(name); },
  _req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  add(name, val) { return this._req(this._store(name, 'readwrite').add(val)); },
  put(name, val) { return this._req(this._store(name, 'readwrite').put(val)); },
  del(name, key) { return this._req(this._store(name, 'readwrite').delete(key)); },
  get(name, key) { return this._req(this._store(name, 'readonly').get(key)); },
  all(name) { return this._req(this._store(name, 'readonly').getAll()); },
};

// ── 資料層（鏡像原 db.py 的查詢邏輯） ───────────────────────
const Store = {
  questions: [],
  byId: {},
  _filters: null,
  _bookmarkSet: new Set(),
  onUpdated: null,   // 題庫背景更新完成後呼叫（由 app.js 設定）

  async load() {
    await IDB.open();
    const r = await fetch('questions.json');     // SW cache-first → 離線秒開
    this._setQuestions(await r.json());
    await this._refreshBookmarkCache();
    this._checkUpdate();                          // 連網時在背景比對版本，不阻塞畫面
  },

  _setQuestions(list) {
    this.questions = list;
    this.byId = {};
    this.questions.forEach((q) => { this.byId[q.id] = q; });
    this._buildFilters();
  },

  // 比對 version.json；有新版就背景重抓題庫並更新快取（離線或失敗則安靜略過）
  async _checkUpdate() {
    try {
      const res = await fetch('version.json', { cache: 'no-store' });
      if (!res.ok) return;
      const remote = (await res.json()).version;
      const local = localStorage.getItem('questions_version');
      if (!local) {                 // 首次：目前打包的題庫即對應此版本，記錄即可
        localStorage.setItem('questions_version', remote);
        return;
      }
      if (remote === local) return; // 已是最新

      // 用帶版本參數的網址繞過 SW 的 cache-first，強制抓最新題庫
      const fresh = await fetch(`questions.json?v=${remote}`, { cache: 'reload' });
      if (!fresh.ok) return;
      const data = await fresh.clone().json();
      if ('caches' in self) {       // 寫回快取，讓下次離線也是新題庫
        const c = await caches.open(CACHE_NAME);
        await c.put('questions.json', fresh.clone());
      }
      this._setQuestions(data);
      localStorage.setItem('questions_version', remote);
      if (typeof this.onUpdated === 'function') this.onUpdated(data.length);
    } catch (e) {
      /* 離線或網路錯誤：維持現有題庫即可 */
    }
  },

  async _refreshBookmarkCache() {
    const rows = await IDB.all('bookmarks');
    this._bookmarkSet = new Set(rows.map((b) => b.question_id));
  },

  // ── 篩選選單：對應 db.get_filters() ──────────────────────
  _buildFilters() {
    const out = {};
    for (const et of ['silu', 'investigation']) {
      const qs = this.questions.filter((q) => q.exam_type === et);
      const years = [...new Set(qs.map((q) => q.year))].sort((a, b) => a - b);
      const subjects = [...new Set(qs.map((q) => q.subject))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      const subjects_by_year = {};
      for (const y of years) {
        subjects_by_year[String(y)] = [...new Set(
          qs.filter((q) => q.year === y).map((q) => q.subject),
        )].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      }
      out[et] = { years, subjects, subjects_by_year };
    }
    this._filters = out;
  },

  getFilters() { return this._filters; },

  // ── 出題：對應 db.get_questions() ────────────────────────
  async getQuestions({ exam_type, year = 0, subject = '', track = '', mode = 'sequential', limit = 9999 }) {
    let qs = this.questions.filter((q) => q.exam_type === exam_type);
    if (year) qs = qs.filter((q) => q.year === Number(year));
    if (subject) qs = qs.filter((q) => q.subject === subject);
    if (track) qs = qs.filter((q) => (q.track || '') === track);

    if (mode === 'wrong') {
      const wrongIds = new Set(await this._lastWrongIds());
      qs = qs.filter((q) => wrongIds.has(q.id));
    }

    if (mode === 'random') {
      qs = this._shuffle(qs.slice());
    } else {
      // 考卷模式：依 年份 → track(司在律前) → 題號 排序
      qs = qs.slice().sort((a, b) =>
        (a.year - b.year)
        || (a.track || '').localeCompare(b.track || '')
        || (a.question_no - b.question_no));
    }

    qs = qs.slice(0, limit);
    // 附上書籤狀態（原本後端會標 q.bookmarked）
    return qs.map((q) => ({ ...q, bookmarked: this._bookmarkSet.has(q.id) }));
  },

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },

  // ── 單題作答（練習模式）：對應 POST /api/attempt ─────────
  async attempt(qid, chosen) {
    const q = this.byId[qid];
    if (!q) return { error: 'not found' };
    chosen = String(chosen || '').toUpperCase();
    const ans = q.answer;
    const isCorrect = ans ? ans.includes(chosen) : false;
    await this._record(qid, chosen, isCorrect);
    return {
      correct: isCorrect,
      answer: ans,
      answer_available: ans != null,
      explanation: q.explanation,
    };
  },

  // ── 交卷評分：對應 POST /api/grade ──────────────────────
  async grade(answers) {
    const results = [];
    for (const item of answers) {
      const q = this.byId[item.question_id];
      if (!q) continue;
      let chosen = String(item.chosen || '').toUpperCase();
      const ans = q.answer;
      let isCorrect = false;
      if (['A', 'B', 'C', 'D'].includes(chosen)) {
        isCorrect = ans ? ans.includes(chosen) : false;
        await this._record(q.id, chosen, isCorrect);
      } else {
        chosen = '';
      }
      results.push({
        question_id: q.id,
        chosen,
        correct: isCorrect,
        answer: ans,
        answer_available: ans != null,
        explanation: q.explanation,
      });
    }
    const score = results.filter((r) => r.correct).length;
    return { score, total: results.length, results };
  },

  async _record(qid, chosen, isCorrect) {
    await IDB.add('attempts', {
      question_id: qid,
      chosen,
      is_correct: isCorrect ? 1 : 0,
      answered_at: new Date().toISOString(),
    });
  },

  // 每題「最後一次作答」：對應 db.py 多處的 sub-query
  async _lastAttemptByQuestion() {
    const rows = await IDB.all('attempts');
    const last = new Map(); // question_id → attempt（id 最大者＝最新）
    for (const a of rows) {
      const prev = last.get(a.question_id);
      if (!prev || a.id > prev.id) last.set(a.question_id, a);
    }
    return last;
  },

  async _lastWrongIds() {
    const last = await this._lastAttemptByQuestion();
    return [...last.values()].filter((a) => a.is_correct === 0).map((a) => a.question_id);
  },

  // ── 統計：對應 db.get_stats() ────────────────────────────
  async stats() {
    const last = await this._lastAttemptByQuestion();
    let total = 0, correct = 0;
    const bySubject = new Map(); // key: exam_type|subject
    for (const a of last.values()) {
      const q = this.byId[a.question_id];
      if (!q) continue;
      total += 1;
      if (a.is_correct) correct += 1;
      const key = `${q.exam_type}|${q.subject}`;
      const agg = bySubject.get(key) || { exam_type: q.exam_type, subject: q.subject, total: 0, correct: 0 };
      agg.total += 1;
      agg.correct += a.is_correct ? 1 : 0;
      bySubject.set(key, agg);
    }
    return { overall: { total, correct }, by_subject: [...bySubject.values()] };
  },

  // ── 錯題本：對應 GET /api/wrong ─────────────────────────
  async wrong() {
    const ids = await this._lastWrongIds();
    return ids.map((id) => this.byId[id]).filter(Boolean);
  },

  // ── 書籤切換：對應 POST /api/bookmark/<id> ──────────────
  async toggleBookmark(qid) {
    if (this._bookmarkSet.has(qid)) {
      await IDB.del('bookmarks', qid);
      this._bookmarkSet.delete(qid);
      return { bookmarked: false };
    }
    await IDB.put('bookmarks', { question_id: qid, created_at: new Date().toISOString() });
    this._bookmarkSet.add(qid);
    return { bookmarked: true };
  },

  // ── 備份 / 還原（換手機時用） ───────────────────────────
  async exportProgress() {
    return {
      version: 1,
      attempts: await IDB.all('attempts'),
      bookmarks: await IDB.all('bookmarks'),
    };
  },

  async importProgress(data) {
    if (!data || !Array.isArray(data.attempts)) throw new Error('檔案格式不符');
    for (const a of data.attempts) {
      const { id, ...rest } = a; // 重新編號避免主鍵衝突
      await IDB.add('attempts', rest);
    }
    for (const b of (data.bookmarks || [])) {
      await IDB.put('bookmarks', b);
    }
    await this._refreshBookmarkCache();
  },
};
