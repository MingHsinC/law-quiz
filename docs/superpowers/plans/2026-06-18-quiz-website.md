# 法律刷題網站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Flask web app for practising 司律一試 and 調查局特考 multiple-choice questions, accessible from both computer and phone on the same LAN.

**Architecture:** Python Flask backend serves a Vanilla JS SPA. Questions are loaded into SQLite once via `setup.py` (which downloads lagendre GitHub data and scrapes 調查局 questions). Progress (attempts, bookmarks) is stored server-side in SQLite so all LAN devices share the same state. The frontend is a single `index.html` with three screens (Home / Quiz / Stats) managed by Vanilla JS.

**Tech Stack:** Python 3.10+, Flask 3.x, sqlite3 (stdlib), requests, beautifulsoup4, pytest

## Global Constraints

- Python 3.10 or newer (uses `list[dict]`, `dict | None` type hints)
- No JavaScript frameworks — Vanilla JS only
- Server binds to `0.0.0.0:5000`
- `exam_type` values: `'silu'` (司律一試), `'investigation'` (調查局特考)
- `track` values: `'司'`, `'律'`, or `None`
- `answer` values: `'A'`–`'D'`, or `None` (answer unavailable)
- All paths relative to project root `law_test/`
- DB path controlled by env var `QUIZ_DB` (default `quiz.db`) so tests can use a temp file

---

## File Map

| File | Responsibility |
|------|----------------|
| `requirements.txt` | Python dependencies |
| `db.py` | All SQLite operations (schema, CRUD, stats) |
| `scrapers/__init__.py` | Empty package marker |
| `scrapers/lagendre.py` | Download & parse lagendre/law.exam GitHub data |
| `scrapers/investigation.py` | Scrape 調查局特考 from public.com.tw |
| `setup.py` | One-time data pipeline: run scrapers → import JSON → SQLite |
| `app.py` | Flask server + all API endpoints |
| `templates/index.html` | SPA shell (three screens) |
| `static/style.css` | Mobile-first styles |
| `static/app.js` | SPA logic (state, fetch, render) |
| `tests/test_db.py` | Unit tests for db.py |
| `tests/test_lagendre.py` | Unit tests for parsers in lagendre.py |
| `tests/test_app.py` | Flask integration tests |

---

## Task 1: Project Scaffold

**Files:**
- Create: `requirements.txt`
- Create: `.gitignore`
- Create: `scrapers/__init__.py`
- Create: `tests/__init__.py`
- Create: `data/silu/.gitkeep`
- Create: `data/investigation/.gitkeep`
- Create: `static/.gitkeep`
- Create: `templates/.gitkeep`

- [ ] **Step 1: Create requirements.txt**

```
flask>=3.0
requests>=2.31
beautifulsoup4>=4.12
pytest>=8.0
```

- [ ] **Step 2: Create .gitignore**

```
quiz.db
__pycache__/
*.pyc
.pytest_cache/
data/silu/*.json
data/investigation/*.json
```

- [ ] **Step 3: Create directory structure**

```powershell
New-Item -ItemType Directory -Force scrapers, tests, data/silu, data/investigation, static, templates
New-Item -ItemType File scrapers/__init__.py, tests/__init__.py
New-Item -ItemType File data/silu/.gitkeep, data/investigation/.gitkeep
New-Item -ItemType File static/.gitkeep, templates/.gitkeep
```

- [ ] **Step 4: Install dependencies**

```powershell
pip install flask requests beautifulsoup4 pytest
```

Expected: no errors, packages install successfully.

- [ ] **Step 5: Commit**

```bash
git add requirements.txt .gitignore scrapers/ tests/ data/ static/ templates/
git commit -m "feat: project scaffold"
```

---

## Task 2: Database Layer

**Files:**
- Create: `db.py`
- Create: `tests/test_db.py`

**Interfaces:**
- Produces: `init_db()`, `insert_questions(list[dict]) -> int`, `get_questions(...) -> list[dict]`, `get_question(int) -> dict|None`, `record_attempt(int,str,bool)`, `toggle_bookmark(int) -> bool`, `get_stats() -> dict`, `get_wrong_ids() -> list[int]`, `get_filters() -> dict`, `get_bookmarked_ids() -> list[int]`, `get_conn()` context manager

- [ ] **Step 1: Write the failing test**

Create `tests/test_db.py`:

```python
import os, tempfile, pytest

_tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_tmp.close()
os.environ['QUIZ_DB'] = _tmp.name

import db

@pytest.fixture(autouse=True)
def fresh_db():
    db.init_db()
    with db.get_conn() as conn:
        conn.execute('DELETE FROM bookmarks')
        conn.execute('DELETE FROM attempts')
        conn.execute('DELETE FROM questions')
    yield

def _q(**overrides):
    base = {
        'exam_type': 'silu', 'year': 108, 'subject': '民法',
        'track': '律', 'question_no': 1, 'question_text': '試題文字',
        'opt_a': 'A選項', 'opt_b': 'B選項', 'opt_c': 'C選項',
        'opt_d': 'D選項', 'answer': 'C'
    }
    base.update(overrides)
    return base

def test_insert_and_get():
    db.insert_questions([_q()])
    rows = db.get_questions('silu')
    assert len(rows) == 1
    assert rows[0]['question_text'] == '試題文字'
    assert 'answer' in rows[0]

def test_filter_by_year():
    db.insert_questions([_q(year=108), _q(year=109, question_no=2)])
    rows = db.get_questions('silu', year=108)
    assert len(rows) == 1 and rows[0]['year'] == 108

def test_filter_by_subject():
    db.insert_questions([_q(subject='民法'), _q(subject='刑法', question_no=2)])
    rows = db.get_questions('silu', subject='刑法')
    assert len(rows) == 1 and rows[0]['subject'] == '刑法'

def test_record_attempt_and_stats():
    db.insert_questions([_q()])
    qid = db.get_questions('silu')[0]['id']
    db.record_attempt(qid, 'C', True)
    stats = db.get_stats()
    assert stats['overall']['total'] == 1
    assert stats['overall']['correct'] == 1

def test_wrong_ids_tracks_latest():
    db.insert_questions([_q()])
    qid = db.get_questions('silu')[0]['id']
    db.record_attempt(qid, 'A', False)
    assert qid in db.get_wrong_ids()
    db.record_attempt(qid, 'C', True)
    assert qid not in db.get_wrong_ids()

def test_toggle_bookmark():
    db.insert_questions([_q()])
    qid = db.get_questions('silu')[0]['id']
    assert db.toggle_bookmark(qid) is True
    assert qid in db.get_bookmarked_ids()
    assert db.toggle_bookmark(qid) is False
    assert qid not in db.get_bookmarked_ids()

def test_get_filters():
    db.insert_questions([_q(year=108, subject='民法'), _q(year=109, subject='刑法', question_no=2)])
    f = db.get_filters()
    assert 108 in f['silu']['years']
    assert '刑法' in f['silu']['subjects']

def test_mode_wrong_filter():
    db.insert_questions([_q(), _q(question_no=2)])
    q1id = db.get_questions('silu')[0]['id']
    db.record_attempt(q1id, 'A', False)
    rows = db.get_questions('silu', mode='wrong')
    assert len(rows) == 1 and rows[0]['id'] == q1id
```

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
pytest tests/test_db.py -v
```

Expected: `ImportError: No module named 'db'`

- [ ] **Step 3: Implement db.py**

Create `db.py`:

```python
import sqlite3, os
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = os.environ.get('QUIZ_DB', os.path.join(os.path.dirname(__file__), 'quiz.db'))

_SCHEMA = """
CREATE TABLE IF NOT EXISTS questions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_type     TEXT NOT NULL,
  year          INTEGER NOT NULL,
  subject       TEXT NOT NULL,
  track         TEXT,
  question_no   INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  opt_a         TEXT NOT NULL,
  opt_b         TEXT NOT NULL,
  opt_c         TEXT NOT NULL,
  opt_d         TEXT NOT NULL,
  answer        TEXT
);
CREATE TABLE IF NOT EXISTS attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  chosen      TEXT NOT NULL,
  is_correct  INTEGER NOT NULL,
  answered_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bookmarks (
  question_id INTEGER PRIMARY KEY REFERENCES questions(id),
  created_at  TEXT NOT NULL
);
"""

@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

def init_db():
    with get_conn() as conn:
        conn.executescript(_SCHEMA)

def insert_questions(questions: list[dict]) -> int:
    with get_conn() as conn:
        conn.executemany("""
            INSERT OR IGNORE INTO questions
              (exam_type,year,subject,track,question_no,
               question_text,opt_a,opt_b,opt_c,opt_d,answer)
            VALUES
              (:exam_type,:year,:subject,:track,:question_no,
               :question_text,:opt_a,:opt_b,:opt_c,:opt_d,:answer)
        """, questions)
    return len(questions)

def get_questions(exam_type: str, year: int = 0, subject: str = '',
                  track: str = '', mode: str = 'sequential',
                  limit: int = 9999) -> list[dict]:
    clauses, params = ['exam_type = ?'], [exam_type]
    if year:
        clauses.append('year = ?'); params.append(year)
    if subject:
        clauses.append('subject = ?'); params.append(subject)
    if track:
        clauses.append('track = ?'); params.append(track)
    if mode == 'wrong':
        clauses.append("""id IN (
            SELECT question_id FROM attempts a1
            WHERE is_correct = 0
              AND answered_at = (SELECT MAX(answered_at) FROM attempts a2
                                 WHERE a2.question_id = a1.question_id))""")
    where = ' AND '.join(clauses)
    order = 'RANDOM()' if mode == 'random' else 'year, question_no'
    with get_conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM questions WHERE {where} ORDER BY {order} LIMIT ?",
            params + [limit]
        ).fetchall()
    return [dict(r) for r in rows]

def get_question(qid: int) -> dict | None:
    with get_conn() as conn:
        row = conn.execute('SELECT * FROM questions WHERE id=?', (qid,)).fetchone()
    return dict(row) if row else None

def record_attempt(question_id: int, chosen: str, is_correct: bool) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO attempts(question_id,chosen,is_correct,answered_at) VALUES(?,?,?,?)",
            (question_id, chosen, int(is_correct), now)
        )

def toggle_bookmark(question_id: int) -> bool:
    with get_conn() as conn:
        exists = conn.execute(
            'SELECT 1 FROM bookmarks WHERE question_id=?', (question_id,)
        ).fetchone()
        if exists:
            conn.execute('DELETE FROM bookmarks WHERE question_id=?', (question_id,))
            return False
        conn.execute(
            'INSERT INTO bookmarks(question_id,created_at) VALUES(?,?)',
            (question_id, datetime.now(timezone.utc).isoformat())
        )
        return True

def get_stats() -> dict:
    with get_conn() as conn:
        overall = conn.execute("""
            SELECT COUNT(*) as total, SUM(is_correct) as correct FROM attempts a
            WHERE answered_at=(SELECT MAX(answered_at) FROM attempts a2
                               WHERE a2.question_id=a.question_id)
        """).fetchone()
        by_subject = conn.execute("""
            SELECT q.exam_type, q.subject, COUNT(*) as total, SUM(a.is_correct) as correct
            FROM attempts a JOIN questions q ON q.id=a.question_id
            WHERE a.answered_at=(SELECT MAX(answered_at) FROM attempts a2
                                 WHERE a2.question_id=a.question_id)
            GROUP BY q.exam_type, q.subject
        """).fetchall()
    return {
        'overall': {'total': overall['total'] or 0, 'correct': overall['correct'] or 0},
        'by_subject': [dict(r) for r in by_subject]
    }

def get_wrong_ids() -> list[int]:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT DISTINCT question_id FROM attempts a
            WHERE is_correct=0
              AND answered_at=(SELECT MAX(answered_at) FROM attempts a2
                               WHERE a2.question_id=a.question_id)
        """).fetchall()
    return [r['question_id'] for r in rows]

def get_filters() -> dict:
    with get_conn() as conn:
        def fetch(sql, *args):
            return [r[0] for r in conn.execute(sql, args).fetchall()]
        return {
            'silu': {
                'years':    fetch("SELECT DISTINCT year FROM questions WHERE exam_type='silu' ORDER BY year"),
                'subjects': fetch("SELECT DISTINCT subject FROM questions WHERE exam_type='silu' ORDER BY subject"),
                'tracks':   ['司', '律']
            },
            'investigation': {
                'years':    fetch("SELECT DISTINCT year FROM questions WHERE exam_type='investigation' ORDER BY year"),
                'subjects': fetch("SELECT DISTINCT subject FROM questions WHERE exam_type='investigation' ORDER BY subject"),
                'tracks':   []
            }
        }

def get_bookmarked_ids() -> list[int]:
    with get_conn() as conn:
        rows = conn.execute('SELECT question_id FROM bookmarks ORDER BY created_at').fetchall()
    return [r['question_id'] for r in rows]
```

- [ ] **Step 4: Run tests — expect PASS**

```powershell
pytest tests/test_db.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add db.py tests/test_db.py
git commit -m "feat: database layer with SQLite"
```

---

## Task 3: lagendre Scraper

**Files:**
- Create: `scrapers/lagendre.py`
- Create: `tests/test_lagendre.py`

**Interfaces:**
- Consumes: nothing from prior tasks
- Produces: `scrapers/lagendre.scrape_all() -> int` (downloads JSONs to `data/silu/`), `parse_filename(str)`, `parse_questions(str)`, `parse_answers(str)` (used by tests and setup.py)

- [ ] **Step 1: Write failing tests for pure parsers**

Create `tests/test_lagendre.py`:

```python
from scrapers.lagendre import parse_filename, parse_questions, parse_answers

def test_parse_filename_si():
    r = parse_filename('100司-綜合法學(一)(刑法、刑事訴訟法、法律倫理).txt')
    assert r == (100, '司', '綜合法學(一)(刑法、刑事訴訟法、法律倫理)')

def test_parse_filename_lu():
    r = parse_filename('108律-民法、民事訴訟法.txt')
    assert r == (108, '律', '民法、民事訴訟法')

def test_parse_filename_ans_returns_none():
    assert parse_filename('108律-民法ANS.txt') is None

def test_parse_filename_nonmatch_returns_none():
    assert parse_filename('README.md') is None

def test_parse_questions_basic():
    text = """1.甲為公司總經理，以下何者正確？
(A)甲不成立犯罪
(B)甲成立背信罪
(C)甲成立詐欺罪
(D)甲成立侵占罪

2.下列敘述何者正確？
(A)選項一
(B)選項二
(C)選項三
(D)選項四
"""
    qs = parse_questions(text)
    assert len(qs) == 2
    assert qs[0]['no'] == 1
    assert qs[0]['text'] == '甲為公司總經理，以下何者正確？'
    assert qs[0]['A'] == '甲不成立犯罪'
    assert qs[0]['D'] == '甲成立侵占罪'

def test_parse_answers_format_numbered():
    text = "1.(B)\n2.(C)\n3.(A)\n"
    ans = parse_answers(text)
    assert ans == {1: 'B', 2: 'C', 3: 'A'}

def test_parse_answers_format_plain():
    text = "B\nC\nA\n"
    ans = parse_answers(text)
    assert ans == {1: 'B', 2: 'C', 3: 'A'}

def test_parse_answers_format_dot():
    text = "1.B\n2.C\n3.A\n"
    ans = parse_answers(text)
    assert ans == {1: 'B', 2: 'C', 3: 'A'}
```

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
pytest tests/test_lagendre.py -v
```

Expected: `ImportError: cannot import name 'parse_filename'`

- [ ] **Step 3: Implement scrapers/lagendre.py**

Create `scrapers/lagendre.py`:

```python
import re, json, requests
from pathlib import Path

GITHUB_API  = 'https://api.github.com/repos/lagendre/law.exam/contents'
RAW_BASE    = 'https://raw.githubusercontent.com/lagendre/law.exam/main'
DATA_DIR    = Path(__file__).parent.parent / 'data' / 'silu'

def parse_filename(filename: str) -> tuple[int, str, str] | None:
    """'108律-民法.txt' → (108, '律', '民法')"""
    if 'ANS' in filename:
        return None
    m = re.match(r'^(\d+)(司|律)-(.+)\.txt$', filename)
    if not m:
        return None
    return int(m.group(1)), m.group(2), m.group(3)

def parse_questions(text: str) -> list[dict]:
    """Parse question file → list of {no, text, A, B, C, D}."""
    questions = []
    blocks = re.split(r'\n(?=\d+[\.、])', text.strip())
    opt_re = re.compile(r'[\(（]([ABCD])[\)）]\s*(.*?)(?=\s*[\(（][ABCD][\)）]|$)', re.DOTALL)

    for block in blocks:
        block = block.strip()
        m = re.match(r'^(\d+)[\.、]\s*(.*)', block, re.DOTALL)
        if not m:
            continue
        no, rest = int(m.group(1)), m.group(2)
        opts = {om.group(1): om.group(2).strip() for om in opt_re.finditer(rest)}
        if len(opts) != 4:
            continue
        first = opt_re.search(rest)
        q_text = rest[:first.start()].strip() if first else ''
        if not q_text:
            continue
        questions.append({'no': no, 'text': q_text,
                          'A': opts['A'], 'B': opts['B'],
                          'C': opts['C'], 'D': opts['D']})
    return questions

def parse_answers(text: str) -> dict[int, str]:
    """Parse ANS file → {question_no: letter}. Handles three formats."""
    answers: dict[int, str] = {}
    for line in text.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        # "1.(B)" or "1.B"
        m = re.match(r'^(\d+)[\.\s][\(（]?([ABCD])[\)）]?', line)
        if m:
            answers[int(m.group(1))] = m.group(2)
            continue
        # Plain letter per line
        m = re.match(r'^([ABCD])$', line)
        if m:
            answers[len(answers) + 1] = m.group(1)
    return answers

def _list_year_dirs() -> list[str]:
    resp = requests.get(GITHUB_API, timeout=15)
    resp.raise_for_status()
    return [item['name'] for item in resp.json()
            if item['type'] == 'dir' and item['name'].isdigit()]

def _list_files(year: str) -> list[str]:
    resp = requests.get(f'{GITHUB_API}/{year}', timeout=15)
    resp.raise_for_status()
    return [item['name'] for item in resp.json() if item['name'].endswith('.txt')]

def _fetch_raw(year: str, filename: str) -> str:
    url = f'{RAW_BASE}/{year}/{requests.utils.quote(filename)}'
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text

def scrape_all() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    for year in _list_year_dirs():
        files = _list_files(year)
        for fname in files:
            info = parse_filename(fname)
            if not info:
                continue
            ans_fname = fname.replace('.txt', 'ANS.txt')
            if ans_fname not in files:
                continue
            yr, track, subject = info
            try:
                q_text  = _fetch_raw(year, fname)
                ans_text = _fetch_raw(year, ans_fname)
            except Exception as e:
                print(f'  ✗ 下載失敗 {fname}: {e}')
                continue
            questions = parse_questions(q_text)
            answers   = parse_answers(ans_text)
            records = [{
                'no': q['no'], 'text': q['text'],
                'options': {'A': q['A'], 'B': q['B'], 'C': q['C'], 'D': q['D']},
                'answer': answers.get(q['no'])
            } for q in questions]
            safe = re.sub(r'[<>:"/\\|?*]', '_', subject)
            out_path = DATA_DIR / f'{yr}_{track}_{safe}.json'
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump({'exam_type': 'silu', 'year': yr, 'subject': subject,
                           'track': track, 'questions': records},
                          f, ensure_ascii=False, indent=2)
            print(f'  ✓ {yr}{track} {subject}: {len(records)} 題')
            total += len(records)
    return total
```

- [ ] **Step 4: Run tests — expect PASS**

```powershell
pytest tests/test_lagendre.py -v
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scrapers/lagendre.py tests/test_lagendre.py
git commit -m "feat: lagendre scraper and parsers"
```

---

## Task 4: Investigation Scraper

**Files:**
- Create: `scrapers/investigation.py`

**Interfaces:**
- Consumes: nothing from prior tasks
- Produces: `scrapers/investigation.scrape_all() -> int` (writes JSONs to `data/investigation/`)

Note: this scraper makes live HTTP requests and depends on the current state of public.com.tw. No unit tests (would require brittle HTML fixtures). Verify manually with `python -c "from scrapers.investigation import scrape_all; print(scrape_all())"`.

- [ ] **Step 1: Create scrapers/investigation.py**

```python
import re, json, requests
from bs4 import BeautifulSoup
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / 'data' / 'investigation'

_LIST_URL = (
    'https://www.public.com.tw/previousexam'
    '?page={page}&mode=0&year=&type=AO0039&level=AP0007'
    '&subject=AB0201&KeyWord=&titleword=%E8%AA%BF%E6%9F%A5%E5%B1%80'
    '%E7%89%B9%E8%80%83%E4%B8%89%E7%AD%89%E6%B3%95%E5%BE%8B%E5%AF%A6'
    '%E5%8B%99%E7%B5%84&keyname=&keyguid='
)
_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9',
}

def _parse_year(text: str) -> int | None:
    m = re.search(r'(\d{2,3})', text)
    return int(m.group(1)) if m else None

def _parse_question_block(text: str) -> dict | None:
    m = re.match(r'^(\d+)[\.、]\s*(.*)', text.strip(), re.DOTALL)
    if not m:
        return None
    no, rest = int(m.group(1)), m.group(2)
    opt_re = re.compile(r'[\(（]([ABCD])[\)）]\s*(.*?)(?=\s*[\(（][ABCD][\)）]|$)', re.DOTALL)
    opts = {om.group(1): om.group(2).strip() for om in opt_re.finditer(rest)}
    if len(opts) != 4:
        return None
    first = opt_re.search(rest)
    q_text = rest[:first.start()].strip() if first else ''
    if not q_text:
        return None
    return {'no': no, 'text': q_text,
            'A': opts['A'], 'B': opts['B'], 'C': opts['C'], 'D': opts['D']}

def _fetch_paper_list() -> list[dict]:
    papers, page = [], 1
    while True:
        try:
            resp = requests.get(_LIST_URL.format(page=page), headers=_HEADERS, timeout=15)
            resp.raise_for_status()
        except Exception as e:
            print(f'  ✗ 無法取得第{page}頁: {e}')
            break
        soup = BeautifulSoup(resp.text, 'html.parser')
        rows = soup.select('table tr')[1:]
        if not rows:
            break
        found_any = False
        for row in rows:
            cells = row.find_all('td')
            if len(cells) < 2:
                continue
            year_text   = cells[0].get_text(strip=True)
            subject_text = cells[1].get_text(strip=True)
            link = row.find('a', href=lambda h: h and h != '#')
            href = link['href'] if link else '#'
            if not href.startswith('http'):
                href = f'https://www.public.com.tw{href}' if href != '#' else '#'
            year = _parse_year(year_text)
            if year:
                papers.append({'year': year, 'subject': subject_text, 'url': href})
                found_any = True
        if not found_any:
            break
        # Check pagination: stop if no "next" indicator
        next_btn = soup.find('a', string=re.compile(r'[>»下]'))
        if not next_btn:
            break
        page += 1
    return papers

def _fetch_questions(url: str) -> list[dict]:
    if url == '#':
        return []
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=15)
        resp.raise_for_status()
    except Exception:
        return []
    soup = BeautifulSoup(resp.text, 'html.parser')
    questions = []
    # Try common question container patterns
    for sel in ['.question', '[class*="question"]', 'ol > li', 'div.exam-question']:
        blocks = soup.select(sel)
        if blocks:
            for block in blocks:
                q = _parse_question_block(block.get_text(separator='\n', strip=True))
                if q:
                    questions.append(q)
            break
    # Fallback: full page text split by question numbers
    if not questions:
        text = soup.get_text(separator='\n')
        for block in re.split(r'\n(?=\d{1,3}[\.、])', text):
            q = _parse_question_block(block)
            if q:
                questions.append(q)
    return questions

def scrape_all() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    print('  抓取 public.com.tw 清單中...')
    papers = _fetch_paper_list()
    print(f'  找到 {len(papers)} 份考卷')
    for paper in papers:
        questions = _fetch_questions(paper['url'])
        records = [{
            'no': q['no'], 'text': q['text'],
            'options': {'A': q['A'], 'B': q['B'], 'C': q['C'], 'D': q['D']},
            'answer': None
        } for q in questions]
        safe = re.sub(r'[<>:"/\\|?*]', '_', paper['subject'])
        out_path = DATA_DIR / f"{paper['year']}_{safe}.json"
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump({'exam_type': 'investigation', 'year': paper['year'],
                       'subject': paper['subject'], 'track': None,
                       'questions': records},
                      f, ensure_ascii=False, indent=2)
        status = f"{len(records)} 題 (答案未提供)" if records else "0 題（JS 渲染，無法抓取）"
        print(f"  ✓ {paper['year']} {paper['subject']}: {status}")
        total += len(records)
    return total
```

- [ ] **Step 2: Smoke-test the scraper (requires internet)**

```powershell
python -c "from scrapers.investigation import _fetch_paper_list; papers = _fetch_paper_list(); print(f'Found {len(papers)} papers')"
```

Expected: prints a number ≥ 0 without crashing. If 0, the site structure may have changed — inspect the HTML of the list URL manually and adjust selectors.

- [ ] **Step 3: Commit**

```bash
git add scrapers/investigation.py
git commit -m "feat: investigation bureau scraper"
```

---

## Task 5: Data Pipeline (setup.py)

**Files:**
- Create: `setup.py`

**Interfaces:**
- Consumes: `db.init_db`, `db.insert_questions`, `scrapers.lagendre.scrape_all`, `scrapers.investigation.scrape_all`
- Produces: populated `quiz.db`, JSON files under `data/`

- [ ] **Step 1: Create setup.py**

```python
"""Run once to download questions and populate quiz.db."""
import json
from pathlib import Path

import db
from scrapers import lagendre, investigation

def _import_dir(directory: Path) -> int:
    total = 0
    for json_path in sorted(directory.glob('*.json')):
        try:
            data = json.loads(json_path.read_text(encoding='utf-8'))
        except Exception as e:
            print(f'  ✗ 讀取失敗 {json_path.name}: {e}')
            continue
        records = [{
            'exam_type':    data['exam_type'],
            'year':         data['year'],
            'subject':      data['subject'],
            'track':        data.get('track'),
            'question_no':  q['no'],
            'question_text': q['text'],
            'opt_a': q['options']['A'],
            'opt_b': q['options']['B'],
            'opt_c': q['options']['C'],
            'opt_d': q['options']['D'],
            'answer': q.get('answer')
        } for q in data['questions']]
        n = db.insert_questions(records)
        total += n
    return total

def main():
    print('=== 法律刷題 初始化 ===\n')
    db.init_db()

    print('【1/2】司律一試 (lagendre/law.exam)')
    try:
        lagendre.scrape_all()
    except Exception as e:
        print(f'  ✗ 下載失敗: {e}')

    print('\n【2/2】調查局特考 (public.com.tw)')
    try:
        investigation.scrape_all()
    except Exception as e:
        print(f'  ✗ 爬取失敗: {e}')

    print('\n【匯入資料庫】')
    n1 = _import_dir(Path('data/silu'))
    n2 = _import_dir(Path('data/investigation'))
    print(f'  司律一試：{n1} 題')
    print(f'  調查局：  {n2} 題')
    print(f'\n✓ 共匯入 {n1+n2} 題')
    print('請執行: python app.py')

if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run setup.py (requires internet, takes a few minutes)**

```powershell
python setup.py
```

Expected output:
```
=== 法律刷題 初始化 ===

【1/2】司律一試 (lagendre/law.exam)
  ✓ 100司 綜合法學(一)...: 75 題
  ...（每份考卷一行）

【2/2】調查局特考 (public.com.tw)
  找到 N 份考卷
  ...

【匯入資料庫】
  司律一試：XXXX 題
  調查局：  XXXX 題

✓ 共匯入 XXXX 題
```

If lagendre scraper returns 0 questions for a file, open `data/silu/` and inspect one JSON to check the parser. The txt format on GitHub may differ slightly from assumed format — adjust `parse_questions()` regex accordingly.

- [ ] **Step 3: Verify DB was populated**

```powershell
python -c "import db; db.init_db(); f=db.get_filters(); print('silu years:', f['silu']['years'][:5])"
```

Expected: prints a list of year numbers like `[100, 101, 102, ...]`

- [ ] **Step 4: Commit**

```bash
git add setup.py
git commit -m "feat: data pipeline setup.py"
```

---

## Task 6: Flask API

**Files:**
- Create: `app.py`
- Create: `tests/test_app.py`

**Interfaces:**
- Consumes: all `db.*` functions
- Produces: HTTP API consumed by frontend

- [ ] **Step 1: Write failing API tests**

Create `tests/test_app.py`:

```python
import os, tempfile, pytest

_tmp = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
_tmp.close()
os.environ['QUIZ_DB'] = _tmp.name

import db
import app as flask_app

@pytest.fixture
def client():
    db.init_db()
    with db.get_conn() as conn:
        conn.execute('DELETE FROM bookmarks')
        conn.execute('DELETE FROM attempts')
        conn.execute('DELETE FROM questions')
    flask_app.app.config['TESTING'] = True
    with flask_app.app.test_client() as c:
        yield c

def _insert(client, **overrides):
    q = {'exam_type':'silu','year':108,'subject':'民法','track':'律',
         'question_no':1,'question_text':'試題','opt_a':'A選項',
         'opt_b':'B選項','opt_c':'C選項','opt_d':'D選項','answer':'C'}
    q.update(overrides)
    db.insert_questions([q])
    return db.get_questions(q['exam_type'])[0]['id']

def test_home_returns_200(client):
    r = client.get('/')
    assert r.status_code == 200

def test_get_questions_no_answer(client):
    _insert(client)
    r = client.get('/api/questions?exam_type=silu')
    assert r.status_code == 200
    data = r.get_json()
    assert len(data) == 1
    assert 'answer' not in data[0]
    assert 'bookmarked' in data[0]

def test_get_questions_missing_exam_type(client):
    r = client.get('/api/questions')
    assert r.status_code == 400

def test_submit_correct(client):
    qid = _insert(client)
    r = client.post('/api/attempt', json={'question_id': qid, 'chosen': 'C'})
    assert r.status_code == 200
    data = r.get_json()
    assert data['correct'] is True
    assert data['answer'] == 'C'

def test_submit_wrong(client):
    qid = _insert(client)
    r = client.post('/api/attempt', json={'question_id': qid, 'chosen': 'A'})
    data = r.get_json()
    assert data['correct'] is False
    assert data['answer'] == 'C'

def test_wrong_list(client):
    qid = _insert(client)
    client.post('/api/attempt', json={'question_id': qid, 'chosen': 'A'})
    r = client.get('/api/wrong')
    assert any(q['id'] == qid for q in r.get_json())

def test_wrong_list_clears_after_correct(client):
    qid = _insert(client)
    client.post('/api/attempt', json={'question_id': qid, 'chosen': 'A'})
    client.post('/api/attempt', json={'question_id': qid, 'chosen': 'C'})
    r = client.get('/api/wrong')
    assert not any(q['id'] == qid for q in r.get_json())

def test_bookmark_toggle(client):
    qid = _insert(client)
    r1 = client.post(f'/api/bookmark/{qid}')
    assert r1.get_json()['bookmarked'] is True
    r2 = client.post(f'/api/bookmark/{qid}')
    assert r2.get_json()['bookmarked'] is False

def test_stats(client):
    qid = _insert(client)
    client.post('/api/attempt', json={'question_id': qid, 'chosen': 'C'})
    data = client.get('/api/stats').get_json()
    assert data['overall']['total'] == 1
    assert data['overall']['correct'] == 1

def test_filters(client):
    _insert(client)
    data = client.get('/api/filters').get_json()
    assert 108 in data['silu']['years']

def test_null_answer_question(client):
    qid = _insert(client, answer=None)
    r = client.post('/api/attempt', json={'question_id': qid, 'chosen': 'A'})
    data = r.get_json()
    assert data['answer_available'] is False
```

- [ ] **Step 2: Run tests — expect FAIL**

```powershell
pytest tests/test_app.py -v
```

Expected: `ImportError: No module named 'app'`

- [ ] **Step 3: Implement app.py**

Create `app.py`:

```python
import socket
from flask import Flask, jsonify, request, render_template
import db

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/filters')
def api_filters():
    return jsonify(db.get_filters())

@app.route('/api/questions')
def api_questions():
    exam_type = request.args.get('exam_type', '')
    if not exam_type:
        return jsonify({'error': 'exam_type required'}), 400
    year    = int(request.args.get('year', 0))
    subject = request.args.get('subject', '')
    track   = request.args.get('track', '')
    mode    = request.args.get('mode', 'sequential')
    limit   = int(request.args.get('limit', 9999))
    questions  = db.get_questions(exam_type, year, subject, track, mode, limit)
    bookmarked = set(db.get_bookmarked_ids())
    for q in questions:
        q['bookmarked'] = q['id'] in bookmarked
        del q['answer']
    return jsonify(questions)

@app.route('/api/question/<int:qid>')
def api_question(qid):
    q = db.get_question(qid)
    if not q:
        return jsonify({'error': 'not found'}), 404
    q.pop('answer', None)
    q['bookmarked'] = qid in db.get_bookmarked_ids()
    return jsonify(q)

@app.route('/api/attempt', methods=['POST'])
def api_attempt():
    data   = request.get_json() or {}
    qid    = data.get('question_id')
    chosen = str(data.get('chosen', '')).upper()
    if not qid or chosen not in ('A','B','C','D'):
        return jsonify({'error': 'invalid input'}), 400
    q = db.get_question(qid)
    if not q:
        return jsonify({'error': 'not found'}), 404
    answer     = q['answer']
    is_correct = (chosen == answer) if answer else False
    db.record_attempt(qid, chosen, is_correct)
    return jsonify({'correct': is_correct, 'answer': answer,
                    'answer_available': answer is not None})

@app.route('/api/stats')
def api_stats():
    return jsonify(db.get_stats())

@app.route('/api/wrong')
def api_wrong():
    ids       = db.get_wrong_ids()
    questions = [db.get_question(i) for i in ids]
    for q in questions:
        if q:
            q.pop('answer', None)
    return jsonify([q for q in questions if q])

@app.route('/api/bookmark/<int:qid>', methods=['POST'])
def api_bookmark(qid):
    if not db.get_question(qid):
        return jsonify({'error': 'not found'}), 404
    added = db.toggle_bookmark(qid)
    return jsonify({'bookmarked': added})

def _local_ip() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect(('8.8.8.8', 80))
        return s.getsockname()[0]

if __name__ == '__main__':
    ip = _local_ip()
    print(f'\n電腦：http://localhost:5000')
    print(f'手機：http://{ip}:5000\n')
    app.run(host='0.0.0.0', port=5000, debug=False)
```

- [ ] **Step 4: Run tests — expect PASS**

```powershell
pytest tests/test_app.py -v
```

Expected: all 11 tests PASS. The `test_home_returns_200` will fail until `templates/index.html` exists; create an empty placeholder first:

```powershell
Set-Content templates/index.html "<!DOCTYPE html><html><body>placeholder</body></html>"
```

Re-run: all 11 PASS.

- [ ] **Step 5: Commit**

```bash
git add app.py tests/test_app.py templates/index.html
git commit -m "feat: Flask API with tests"
```

---

## Task 7: Frontend HTML + CSS

**Files:**
- Modify: `templates/index.html` (replace placeholder)
- Create: `static/style.css`

**Interfaces:**
- Consumes: API from Task 6
- Produces: HTML skeleton with three screens; CSS consumed by app.js (Task 8)

- [ ] **Step 1: Replace templates/index.html**

```html
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>法律刷題</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <header>
    <h1>法律刷題</h1>
    <nav>
      <button id="nav-home"  class="nav-btn active">首頁</button>
      <button id="nav-stats" class="nav-btn">統計 / 錯題</button>
    </nav>
  </header>

  <!-- Screen: Home -->
  <main id="screen-home" class="screen active">
    <div class="exam-tabs">
      <button class="tab-btn active" data-exam="silu">司律一試</button>
      <button class="tab-btn" data-exam="investigation">調查局特考</button>
    </div>
    <div class="filters card">
      <div class="filter-row">
        <label>年份<select id="filter-year"><option value="0">全部</option></select></label>
        <label>科目<select id="filter-subject"><option value="">全部</option></select></label>
        <label id="track-label">組別
          <select id="filter-track">
            <option value="">全部</option>
            <option value="司">司法官</option>
            <option value="律">律師</option>
          </select>
        </label>
      </div>
      <div class="filter-row">
        <span class="filter-label">模式</span>
        <div class="radio-group">
          <label><input type="radio" name="mode" value="sequential" checked>順序</label>
          <label><input type="radio" name="mode" value="random">隨機</label>
          <label><input type="radio" name="mode" value="wrong">只練錯題</label>
        </div>
      </div>
    </div>
    <p id="home-stats" class="home-stats">載入中...</p>
    <button id="btn-start" class="btn-primary">開始練習</button>
  </main>

  <!-- Screen: Quiz -->
  <main id="screen-quiz" class="screen">
    <div class="quiz-header">
      <span id="quiz-meta"></span>
      <span id="quiz-progress"></span>
    </div>
    <div id="quiz-question" class="question-text"></div>
    <div id="quiz-options"  class="options-list"></div>
    <div id="quiz-result"   class="result" style="display:none"></div>
    <div class="quiz-nav">
      <button id="btn-prev"   class="btn-nav">上一題</button>
      <button id="btn-skip"   class="btn-nav">跳題</button>
      <button id="btn-random" class="btn-nav">隨機</button>
      <button id="btn-next"   class="btn-nav">下一題</button>
      <button id="btn-bookmark" class="btn-bookmark" title="書籤">☆</button>
    </div>
  </main>

  <!-- Screen: Stats -->
  <main id="screen-stats" class="screen">
    <h2>整體統計</h2>
    <p id="stats-overall" class="stats-overall"></p>
    <h2>各科答對率</h2>
    <div class="table-wrap">
      <table id="stats-table" class="stats-table">
        <thead><tr><th>考試</th><th>科目</th><th>答題數</th><th>答對率</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <h2>錯題本</h2>
    <div id="wrong-list" class="wrong-list"></div>
  </main>

  <script src="/static/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create static/style.css**

```css
:root {
  --primary: #1a73e8;
  --primary-dark: #1557b0;
  --correct: #34a853;
  --wrong: #ea4335;
  --bg: #f8f9fa;
  --card: #ffffff;
  --text: #202124;
  --muted: #5f6368;
  --border: #dadce0;
  --radius: 8px;
  --touch: 48px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, 'Noto Sans TC', sans-serif; background: var(--bg); color: var(--text); font-size: 16px; line-height: 1.6; }

/* Header */
header { background: var(--primary); color: #fff; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,.2); }
header h1 { font-size: 1.1rem; }
nav { display: flex; gap: 4px; }
.nav-btn { background: transparent; color: rgba(255,255,255,.75); border: none; padding: 8px 12px; border-radius: var(--radius); cursor: pointer; font-size: .9rem; min-height: var(--touch); }
.nav-btn.active, .nav-btn:hover { color: #fff; background: rgba(255,255,255,.2); }

/* Screens */
.screen { display: none; padding: 16px; max-width: 720px; margin: 0 auto; }
.screen.active { display: block; }

/* Home */
.exam-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
.tab-btn { flex: 1; padding: 10px; border: 2px solid var(--border); border-radius: var(--radius); background: #fff; cursor: pointer; font-size: 1rem; min-height: var(--touch); transition: border-color .15s; }
.tab-btn.active { border-color: var(--primary); color: var(--primary); font-weight: 600; }

.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 12px; }
.filters { }
.filter-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 10px; }
.filter-row:last-child { margin-bottom: 0; }
.filter-row label { display: flex; flex-direction: column; gap: 4px; font-size: .85rem; color: var(--muted); }
.filter-label { font-size: .85rem; color: var(--muted); }
select { border: 1px solid var(--border); border-radius: 4px; padding: 8px; font-size: 1rem; background: #fff; min-height: var(--touch); min-width: 100px; }
.radio-group { display: flex; flex-wrap: wrap; gap: 10px; }
.radio-group label { flex-direction: row; align-items: center; gap: 6px; font-size: 1rem; color: var(--text); cursor: pointer; min-height: var(--touch); }

.home-stats { text-align: center; color: var(--muted); margin-bottom: 12px; }
.btn-primary { display: block; width: 100%; padding: 14px; background: var(--primary); color: #fff; border: none; border-radius: var(--radius); font-size: 1.1rem; cursor: pointer; min-height: var(--touch); }
.btn-primary:hover { background: var(--primary-dark); }

/* Quiz */
.quiz-header { display: flex; justify-content: space-between; font-size: .85rem; color: var(--muted); margin-bottom: 10px; }
.question-text { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 12px; white-space: pre-wrap; word-break: break-word; }
.options-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.option-btn { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; background: var(--card); border: 2px solid var(--border); border-radius: var(--radius); cursor: pointer; font-size: 1rem; text-align: left; min-height: var(--touch); word-break: break-word; width: 100%; transition: border-color .15s; }
.option-btn:hover:not(:disabled) { border-color: var(--primary); }
.option-btn.correct { border-color: var(--correct); background: #e6f4ea; }
.option-btn.wrong   { border-color: var(--wrong);   background: #fce8e6; }
.option-btn:disabled { cursor: default; }
.opt-label { font-weight: 700; min-width: 20px; }

.result { border-radius: var(--radius); padding: 12px 14px; margin-bottom: 12px; font-size: 1rem; }
.result.correct { border: 1px solid var(--correct); background: #e6f4ea; color: #137333; }
.result.wrong   { border: 1px solid var(--wrong);   background: #fce8e6; color: #c5221f; }

.quiz-nav { display: flex; flex-wrap: wrap; gap: 8px; }
.btn-nav { flex: 1; padding: 10px 6px; border: 1px solid var(--border); border-radius: var(--radius); background: #fff; cursor: pointer; font-size: .9rem; min-height: var(--touch); min-width: 56px; }
.btn-nav:hover { background: var(--bg); }
.btn-bookmark { padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: #fff; cursor: pointer; font-size: 1.3rem; min-height: var(--touch); line-height: 1; }
.btn-bookmark.active { color: #f4b400; }

/* Stats */
h2 { font-size: 1rem; color: var(--muted); margin: 16px 0 8px; text-transform: uppercase; letter-spacing: .05em; }
.stats-overall { font-size: 1.4rem; text-align: center; margin-bottom: 8px; }
.table-wrap { overflow-x: auto; }
.stats-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: .95rem; }
.stats-table th, .stats-table td { padding: 10px 12px; border: 1px solid var(--border); text-align: left; }
.stats-table th { background: var(--bg); font-weight: 600; }
.wrong-list { display: flex; flex-direction: column; gap: 8px; }
.wrong-item { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px; cursor: pointer; }
.wrong-item:hover { border-color: var(--primary); }
.wrong-meta { font-size: .8rem; color: var(--muted); margin-bottom: 4px; }
.wrong-text { font-size: .95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.no-data { color: var(--muted); font-size: .95rem; }
```

- [ ] **Step 3: Manual visual check**

Start the server and open `http://localhost:5000` — you should see the styled home page with tabs and filters. No JavaScript errors in the browser console.

```powershell
python app.py
```

- [ ] **Step 4: Commit**

```bash
git add templates/index.html static/style.css
git commit -m "feat: frontend HTML and CSS"
```

---

## Task 8: Frontend JavaScript

**Files:**
- Create: `static/app.js`

**Interfaces:**
- Consumes: all `/api/*` endpoints from Task 6
- Produces: fully functional SPA

- [ ] **Step 1: Create static/app.js**

```javascript
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
    const track   = document.getElementById('filter-track').value;
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
      btn.innerHTML = `<span class="opt-label">${letter}</span><span>${text}</span>`;
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
      div.innerHTML = `<div class="wrong-meta">${q.year}年 ${q.subject}</div>
        <div class="wrong-text">${q.question_no}. ${q.question_text}</div>`;
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
```

- [ ] **Step 2: Run all tests to confirm nothing broken**

```powershell
pytest -v
```

Expected: all tests PASS.

- [ ] **Step 3: Manual end-to-end test**

Start the server:

```powershell
python app.py
```

Verify each of the following in the browser at `http://localhost:5000`:

1. Home screen loads, shows correct stats text
2. Switch between 司律一試 / 調查局特考 tabs — filter dropdowns update
3. Click "開始練習" — quiz screen loads, shows question text and 4 options
4. Click a correct answer — option turns green, result bar shows ✓
5. Click a wrong answer — option turns red, correct option turns green
6. Navigate with 上一題 / 下一題 / 隨機 / 跳題
7. Click ☆ → turns ★ (yellow)
8. Go to 統計 / 錯題 → shows answered stats and wrong-question list
9. Click a wrong question → jumps to that question in the quiz
10. From a phone on the same WiFi, open `http://<IP>:5000` — same interface works

- [ ] **Step 4: Commit**

```bash
git add static/app.js
git commit -m "feat: Vanilla JS SPA frontend"
```

---

## Task 9: Final Integration Commit

- [ ] **Step 1: Run full test suite**

```powershell
pytest -v
```

Expected: all tests PASS.

- [ ] **Step 2: Verify data was loaded (requires setup.py to have run)**

```powershell
python -c "import db; db.init_db(); qs=db.get_questions('silu'); print(f'司律一試：{len(qs)} 題')"
```

Expected: a non-zero number.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete quiz website MVP"
```
