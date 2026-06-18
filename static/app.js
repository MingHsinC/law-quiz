const App = {
  exam: 'silu',
  questions: [],
  current: 0,
  answered: {},  // { questionId: { chosen, correct, answer } }

  async init() {
    this._bindNav();
    this._bindHome();
    await this._loadFilters();
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
    document.getElementById('btn-start').onclick = () => this._startQuiz();
  },

  async _loadFilters() {
    const r = await fetch('/api/filters');
    this._filters = await r.json();
    this._updateFilterDropdowns();
  },

  _updateFilterDropdowns() {
    const f = (this._filters || {})[this.exam] || { years: [], subjects: [], tracks: [] };

    const yearSel = document.getElementById('filter-year');
    yearSel.innerHTML = '<option value="0">全部</option>';
    f.years.forEach(y => yearSel.insertAdjacentHTML('beforeend',
      `<option value="${y}">${y} 年</option>`));

    const subjectSel = document.getElementById('filter-subject');
    subjectSel.innerHTML = '<option value="">全部</option>';
    f.subjects.forEach(s => subjectSel.insertAdjacentHTML('beforeend',
      `<option value="${s}">${s}</option>`));

    document.getElementById('track-label').style.display =
      this.exam === 'silu' ? '' : 'none';
  },

  async _refreshHomeStats() {
    const r    = await fetch('/api/stats');
    const data = await r.json();
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
    const year    = document.getElementById('filter-year').value;
    const subject = document.getElementById('filter-subject').value;
    const track   = this.exam === 'silu' ? document.getElementById('filter-track').value : '';
    const mode    = document.querySelector('input[name="mode"]:checked').value;
    const params  = new URLSearchParams({ exam_type: this.exam, year, subject, track, mode });
    const r = await fetch(`/api/questions?${params}`);
    this.questions = await r.json();
    if (!this.questions.length) { alert('找不到符合條件的題目'); return; }
    this.current  = 0;
    this.answered = {};
    this._showScreen('quiz');
    this._renderQuestion();
  },

  // ── Quiz ────────────────────────────────────────────────

  _renderQuestion() {
    const q = this.questions[this.current];
    if (!q) return;

    document.getElementById('quiz-meta').textContent =
      `${q.year}年 ${q.subject}${q.track ? ' ' + q.track : ''}`;
    document.getElementById('quiz-progress').textContent =
      `第 ${this.current + 1} / ${this.questions.length} 題`;
    document.getElementById('quiz-question').textContent =
      `${q.question_no}. ${q.question_text}`;

    const optsEl = document.getElementById('quiz-options');
    optsEl.innerHTML = '';
    const prev = this.answered[q.id];

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
      if (prev) {
        btn.disabled = true;
        if (letter === prev.answer)                    btn.classList.add('correct');
        if (letter === prev.chosen && !prev.correct)   btn.classList.add('wrong');
      } else {
        btn.onclick = () => this._submitAnswer(q.id, letter);
      }
      optsEl.appendChild(btn);
    });

    const resultEl = document.getElementById('quiz-result');
    if (prev) {
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
  },

  async _submitAnswer(qid, chosen) {
    const r = await fetch('/api/attempt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question_id: qid, chosen })
    });
    const data = await r.json();
    this.answered[qid] = { chosen, correct: data.correct, answer: data.answer };
    this._renderQuestion();
    this._refreshHomeStats();
  },

  async _toggleBookmark(qid) {
    const r    = await fetch(`/api/bookmark/${qid}`, { method: 'POST' });
    const data = await r.json();
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
    const [statsR, wrongR] = await Promise.all([fetch('/api/stats'), fetch('/api/wrong')]);
    const stats = await statsR.json();
    const wrong = await wrongR.json();

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
    const params = new URLSearchParams({
      exam_type: q.exam_type, year: q.year, subject: q.subject,
      track: q.track || '', mode: 'sequential'
    });
    const r = await fetch(`/api/questions?${params}`);
    this.questions = await r.json();
    const idx = this.questions.findIndex(x => x.id === q.id);
    this.current  = idx >= 0 ? idx : 0;
    this.answered = {};
    this._showScreen('quiz');
    this._renderQuestion();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
