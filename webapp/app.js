const App = {
  exam: 'silu',
  questions: [],
  current: 0,
  answered: {},  // { questionId: { chosen, correct, answer } }

  async init() {
    this._bindNav();
    this._bindHome();
    this._bindExam();
    this._bindBackup();
    Store.onUpdated = (n) => this._onBankUpdated(n);  // 題庫背景更新後回呼
    await Store.load();           // 載入題庫 + 開啟本機 IndexedDB
    this._loadFilters();
    await this._refreshHomeStats();
    this._showScreen('home');
  },

  // ── Navigation ──────────────────────────────────────────

  _showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`screen-${name}`).classList.add('active');
    if (name === 'home')  document.getElementById('nav-home').classList.add('active');
    if (name === 'stats') { document.getElementById('nav-stats').classList.add('active'); this._loadStats(); }
  },

  _bindNav() {
    document.getElementById('nav-home').onclick  = () => this._showScreen('home');
    document.getElementById('nav-stats').onclick = () => this._showScreen('stats');
  },

  // 題庫在背景更新完成：重整選單並顯示提示
  _onBankUpdated(count) {
    this._loadFilters();
    this._refreshHomeStats();
    const el = document.getElementById('update-banner');
    if (!el) return;
    el.textContent = `✅ 題庫已更新（共 ${count} 題）`;
    el.style.display = 'block';
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => { el.style.display = 'none'; }, 5000);
  },

  // ── Home ────────────────────────────────────────────────

  _bindHome() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.exam = btn.dataset.exam;
        this._updateFilterDropdowns();
      };
    });
    document.querySelectorAll('input[name="mode"]').forEach(r => {
      r.onchange = () => this._applyModeUI();
    });
    document.getElementById('filter-year').onchange = () => this._populateSubjects();
    document.getElementById('btn-start').onclick = () => this._startQuiz();
    this._applyModeUI();
  },

  _currentMode() {
    return document.querySelector('input[name="mode"]:checked').value;
  },

  _applyModeUI() {
    const mode = this._currentMode();
    // 年份只在考卷模式出現；科目兩種模式都可選
    document.getElementById('year-field').style.display = mode === 'paper' ? '' : 'none';
    document.getElementById('mode-hint').textContent = mode === 'paper'
      ? '照當年度該科目，整張考卷作答；交卷後檢討。'
      : '隨機抽 20 題；科目可選特定一科或「全部科目」；交卷後檢討。';
    this._populateSubjects();
  },

  _bindExam() {
    document.getElementById('btn-finish').onclick = () => this._finishExam();
    document.getElementById('btn-redo').onclick   = () => this._startQuiz();
    document.getElementById('btn-home-from-result').onclick = () => this._showScreen('home');
  },

  _loadFilters() {
    this._filters = Store.getFilters();
    this._updateFilterDropdowns();
  },

  _updateFilterDropdowns() {
    const f = (this._filters || {})[this.exam] || { years: [], subjects_by_year: {} };
    const yearSel = document.getElementById('filter-year');
    yearSel.innerHTML = '';
    // 最新年份排前面
    f.years.slice().reverse().forEach(y => yearSel.insertAdjacentHTML('beforeend',
      `<option value="${y}">${y} 年</option>`));
    this._populateSubjects();
  },

  _populateSubjects() {
    const mode = this._currentMode();
    const f = (this._filters || {})[this.exam] || { subjects: [], subjects_by_year: {} };
    const sel = document.getElementById('filter-subject');
    sel.innerHTML = '';
    if (mode === 'random') {
      // 隨機模式：全部科目（跨年份）＋「全部」選項
      sel.insertAdjacentHTML('beforeend', '<option value="">全部科目</option>');
      (f.subjects || []).forEach(s =>
        sel.insertAdjacentHTML('beforeend', `<option value="${s}">${s}</option>`));
    } else {
      // 考卷模式：只列該年份的科目
      const year = document.getElementById('filter-year').value;
      (f.subjects_by_year || {})[year]?.forEach(s =>
        sel.insertAdjacentHTML('beforeend', `<option value="${s}">${s}</option>`));
    }
  },

  async _refreshHomeStats() {
    const data = await Store.stats();
    const el   = document.getElementById('home-stats');
    const { total, correct } = data.overall;
    if (total > 0) {
      const pct = Math.round(correct / total * 100);
      el.textContent = `累計答題：${total} 題，答對率：${correct}/${total} (${pct}%)`;
    } else {
      el.textContent = '尚未作答';
    }
  },

  async _startQuiz() {
    const mode = this._currentMode();
    let params;
    if (mode === 'paper') {
      const year    = document.getElementById('filter-year').value;
      const subject = document.getElementById('filter-subject').value;
      if (!year || !subject) { alert('請選擇年份與科目'); return; }
      params = { exam_type: this.exam, year, subject, mode: 'sequential', limit: 9999 };
    } else {
      // 隨機模式：抽 20 題；可選特定科目（空=全部）
      const subject = document.getElementById('filter-subject').value;
      params = { exam_type: this.exam, mode: 'random', limit: 20 };
      if (subject) params.subject = subject;
    }
    this.questions = await Store.getQuestions(params);
    if (!this.questions.length) { alert('找不到符合條件的題目'); return; }
    this.examMode    = true;   // 兩種模式都是考完才看結果
    this.current     = 0;
    this.answered    = {};
    this.examChoices = {};     // 暫存選擇（交卷前不揭曉）
    this._showScreen('quiz');
    this._renderQuestion();
  },

  // ── Quiz ────────────────────────────────────────────────

  _renderQuestion() {
    const q = this.questions[this.current];
    if (!q) return;

    document.getElementById('quiz-meta').textContent = `${q.year}年 ${q.subject}`;
    document.getElementById('quiz-progress').textContent =
      `第 ${this.current + 1} / ${this.questions.length} 題`;
    document.getElementById('quiz-question').textContent =
      `${q.question_no}. ${q.question_text}`;

    const optsEl = document.getElementById('quiz-options');
    optsEl.innerHTML = '';
    const prev   = this.answered[q.id];                 // 練習：已揭曉
    const chosen = this.examChoices ? this.examChoices[q.id] : undefined;  // 測驗：暫存選擇

    [['A', q.opt_a], ['B', q.opt_b], ['C', q.opt_c], ['D', q.opt_d]].forEach(([letter, text]) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'opt-label';
      labelSpan.textContent = letter;
      const textSpan = document.createElement('span');
      textSpan.textContent = text;
      btn.appendChild(labelSpan);
      btn.appendChild(textSpan);
      if (this.examMode) {
        // 測驗模式：可重複切換選擇，交卷前不顯示對錯
        if (letter === chosen) btn.classList.add('selected');
        btn.onclick = () => this._chooseExam(q.id, letter);
      } else if (prev) {
        btn.disabled = true;
        if (letter === prev.answer)                  btn.classList.add('correct');
        if (letter === prev.chosen && !prev.correct) btn.classList.add('wrong');
      } else {
        btn.onclick = () => this._submitAnswer(q.id, letter);
      }
      optsEl.appendChild(btn);
    });

    const resultEl = document.getElementById('quiz-result');
    if (!this.examMode && prev) {
      resultEl.className = `result ${prev.correct ? 'correct' : 'wrong'}`;
      resultEl.textContent = prev.correct
        ? '✓ 答對了！'
        : `✗ 答錯了${prev.answer ? '，正確答案是 ' + prev.answer : '（答案未提供）'}`;
      resultEl.style.display = '';
    } else {
      resultEl.style.display = 'none';
    }

    const bkBtn = document.getElementById('btn-bookmark');
    bkBtn.textContent = q.bookmarked ? '★' : '☆';
    bkBtn.classList.toggle('active', !!q.bookmarked);
    bkBtn.onclick = () => this._toggleBookmark(q.id);

    document.getElementById('btn-prev').onclick   = () => this._goTo(this.current - 1);
    document.getElementById('btn-next').onclick   = () => this._goTo(this.current + 1);
    document.getElementById('btn-random').onclick = () => this._goTo(Math.floor(Math.random() * this.questions.length));
    document.getElementById('btn-skip').onclick   = () => this._skipTo();

    // 測驗模式：隱藏「跳題/隨機」，顯示「交卷」與已答進度
    const examOnly = this.examMode;
    document.getElementById('btn-skip').style.display   = examOnly ? 'none' : '';
    document.getElementById('btn-random').style.display = examOnly ? 'none' : '';
    const finishBtn = document.getElementById('btn-finish');
    if (examOnly) {
      const answeredCount = Object.keys(this.examChoices).length;
      finishBtn.style.display = '';
      finishBtn.textContent = `交卷（已答 ${answeredCount} / ${this.questions.length}）`;
    } else {
      finishBtn.style.display = 'none';
    }

    this._renderGrid();
  },

  // 題號導覽格：藍=已答、白=未答、紅框=目前題；點擊跳題
  _renderGrid() {
    const wrap = document.getElementById('quiz-grid-wrap');
    if (!this.examMode) { wrap.style.display = 'none'; return; }
    wrap.style.display = '';
    const grid = document.getElementById('quiz-grid');
    grid.innerHTML = '';
    this.questions.forEach((q, idx) => {
      const cell = document.createElement('button');
      cell.className = 'grid-cell';
      cell.textContent = idx + 1;
      if (this.examChoices[q.id]) cell.classList.add('answered');
      if (idx === this.current)   cell.classList.add('current');
      cell.onclick = () => this._goTo(idx);
      grid.appendChild(cell);
    });
  },

  _chooseExam(qid, letter) {
    this.examChoices[qid] = letter;
    this._renderQuestion();
  },

  async _finishExam() {
    const answeredCount = Object.keys(this.examChoices).length;
    const unanswered = this.questions.length - answeredCount;
    if (unanswered > 0 &&
        !confirm(`還有 ${unanswered} 題未作答，未作答將計為錯誤。確定交卷？`)) {
      return;
    }
    const answers = this.questions.map(q => ({
      question_id: q.id, chosen: this.examChoices[q.id] || ''
    }));
    const data = await Store.grade(answers);
    this._refreshHomeStats();
    this._showResults(data);
  },

  _showResults(data) {
    const pct = data.total ? Math.round(data.score / data.total * 100) : 0;
    document.getElementById('result-summary').textContent =
      `得分：${data.score} / ${data.total} （${pct}%）`;

    const byId = {};
    this.questions.forEach(q => { byId[q.id] = q; });

    const list = document.getElementById('result-list');
    list.innerHTML = '';
    data.results.forEach((res, idx) => {
      const q = byId[res.question_id];
      if (!q) return;
      const item = document.createElement('div');
      item.className = `review-item ${res.correct ? 'correct' : 'wrong'}`;

      const head = document.createElement('div');
      head.className = 'review-head';
      const status = res.correct ? '✓ 答對' : (res.chosen ? '✗ 答錯' : '✗ 未作答');
      head.textContent = `第 ${idx + 1} 題　${status}`;
      item.appendChild(head);

      const qtext = document.createElement('div');
      qtext.className = 'review-q';
      qtext.textContent = `${q.question_no}. ${q.question_text}`;
      item.appendChild(qtext);

      const opts = document.createElement('div');
      opts.className = 'review-opts';
      [['A', q.opt_a], ['B', q.opt_b], ['C', q.opt_c], ['D', q.opt_d]].forEach(([L, t]) => {
        const o = document.createElement('div');
        o.className = 'review-opt';
        const isAns    = res.answer && res.answer.includes(L);
        const isChosen = res.chosen === L;
        if (isAns)                    o.classList.add('opt-correct');
        if (isChosen && !res.correct) o.classList.add('opt-chosen-wrong');
        let suffix = '';
        if (isAns)    suffix += '　（正解）';
        if (isChosen) suffix += '　← 你的答案';
        o.textContent = `${L}. ${t}${suffix}`;
        opts.appendChild(o);
      });
      item.appendChild(opts);

      const ansLine = document.createElement('div');
      ansLine.className = 'review-ans';
      ansLine.textContent =
        `你的答案：${res.chosen || '（未作答）'}　正解：${res.answer || '（未提供）'}`;
      item.appendChild(ansLine);

      // 只有答錯（含未作答）才顯示詳解
      if (!res.correct) {
        const exp = document.createElement('div');
        exp.className = 'review-exp';
        exp.textContent = `詳解：${res.explanation || '（尚未提供）'}`;
        item.appendChild(exp);
      }

      list.appendChild(item);
    });

    this._showScreen('result');
  },

  async _submitAnswer(qid, chosen) {
    const data = await Store.attempt(qid, chosen);
    this.answered[qid] = { chosen, correct: data.correct, answer: data.answer };
    this._renderQuestion();
    this._refreshHomeStats();
  },

  async _toggleBookmark(qid) {
    const data = await Store.toggleBookmark(qid);
    const q    = this.questions.find(x => x.id === qid);
    if (q) q.bookmarked = data.bookmarked;
    this._renderQuestion();
  },

  _goTo(idx) {
    if (idx < 0 || idx >= this.questions.length) return;
    this.current = idx;
    this._renderQuestion();
  },

  _skipTo() {
    const input = prompt(`跳到第幾題？(1–${this.questions.length})`);
    const n = parseInt(input, 10);
    if (n >= 1 && n <= this.questions.length) this._goTo(n - 1);
  },

  // ── Stats ───────────────────────────────────────────────

  async _loadStats() {
    const [stats, wrong] = await Promise.all([Store.stats(), Store.wrong()]);

    const { total, correct } = stats.overall;
    const pct = total ? Math.round(correct / total * 100) : 0;
    document.getElementById('stats-overall').textContent =
      `${correct} / ${total} 題答對 (${pct}%)`;

    const tbody = document.querySelector('#stats-table tbody');
    tbody.innerHTML = '';
    stats.by_subject.forEach(row => {
      const p = row.total ? Math.round(row.correct / row.total * 100) : 0;
      const examLabel = row.exam_type === 'silu' ? '司律一試' : '調查局特考';
      tbody.insertAdjacentHTML('beforeend',
        `<tr><td>${examLabel}</td><td>${row.subject}</td><td>${row.total}</td><td>${p}% (${row.correct}/${row.total})</td></tr>`);
    });

    const wrongList = document.getElementById('wrong-list');
    wrongList.innerHTML = '';
    if (!wrong.length) {
      wrongList.innerHTML = '<p class="no-data">目前沒有錯題</p>';
      return;
    }
    wrong.forEach(q => {
      const div = document.createElement('div');
      div.className = 'wrong-item';
      const meta = document.createElement('div');
      meta.className = 'wrong-meta';
      meta.textContent = `${q.year}年 ${q.subject}`;
      const text = document.createElement('div');
      text.className = 'wrong-text';
      text.textContent = `${q.question_no}. ${q.question_text}`;
      div.appendChild(meta);
      div.appendChild(text);
      div.onclick = () => this._jumpToQuestion(q);
      wrongList.appendChild(div);
    });
  },

  async _jumpToQuestion(q) {
    this.questions = await Store.getQuestions({
      exam_type: q.exam_type, year: q.year, subject: q.subject,
      track: q.track || '', mode: 'sequential'
    });
    const idx = this.questions.findIndex(x => x.id === q.id);
    this.current     = idx >= 0 ? idx : 0;
    this.answered    = {};
    this.examMode    = false;   // 從錯題本進入＝練習模式
    this.examChoices = {};
    this._showScreen('quiz');
    this._renderQuestion();
  },

  // ── 備份 / 還原（記錄只存在本機，換手機前可匯出） ──────────
  _bindBackup() {
    const exportBtn = document.getElementById('btn-export');
    const importBtn = document.getElementById('btn-import');
    const fileInput = document.getElementById('import-file');
    if (exportBtn) exportBtn.onclick = () => this._exportProgress();
    if (importBtn) importBtn.onclick = () => fileInput.click();
    if (fileInput) fileInput.onchange = (e) => this._importProgress(e);
  },

  async _exportProgress() {
    const data = await Store.exportProgress();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `刷題備份-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async _importProgress(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      await Store.importProgress(JSON.parse(text));
      alert('還原完成！');
      this._loadStats();
      this._refreshHomeStats();
    } catch (err) {
      alert('還原失敗：' + err.message);
    } finally {
      e.target.value = '';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());

// 註冊 Service Worker（離線快取）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}
