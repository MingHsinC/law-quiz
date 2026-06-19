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
  answer        TEXT,
  explanation   TEXT
);
-- track 可能為 NULL（103 年起無司/律之分）；SQLite 的 UNIQUE 視 NULL 為相異，
-- 故改用 COALESCE 索引，讓 NULL 與 '' 視同一值，確保重複匯入不會產生重複題目。
CREATE UNIQUE INDEX IF NOT EXISTS ux_question
  ON questions(exam_type, year, subject, COALESCE(track, ''), question_no);
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
        # 既有資料庫遷移：補上 explanation 欄位（CREATE IF NOT EXISTS 不會新增欄位）
        cols = [r[1] for r in conn.execute("PRAGMA table_info(questions)").fetchall()]
        if 'explanation' not in cols:
            conn.execute("ALTER TABLE questions ADD COLUMN explanation TEXT")

def insert_questions(questions: list[dict]) -> int:
    # explanation 為選填欄位，未提供者預設 None
    rows = [{**q, 'explanation': q.get('explanation')} for q in questions]
    with get_conn() as conn:
        cur = conn.executemany("""
            INSERT OR IGNORE INTO questions
              (exam_type,year,subject,track,question_no,
               question_text,opt_a,opt_b,opt_c,opt_d,answer,explanation)
            VALUES
              (:exam_type,:year,:subject,:track,:question_no,
               :question_text,:opt_a,:opt_b,:opt_c,:opt_d,:answer,:explanation)
        """, rows)
    return cur.rowcount

def set_explanation(question_id: int, explanation: str) -> None:
    with get_conn() as conn:
        conn.execute('UPDATE questions SET explanation=? WHERE id=?',
                     (explanation, question_id))

def set_explanation_by_key(exam_type: str, year: int, subject: str,
                           question_no: int, explanation: str) -> int:
    """依 (考試,年份,科目,題號) 更新詳解，回傳更新筆數。
    註：100–102 年同題號有司/律兩卷，會一併更新（該年詳解兩卷通用時適用）。"""
    with get_conn() as conn:
        cur = conn.execute(
            'UPDATE questions SET explanation=? '
            'WHERE exam_type=? AND year=? AND subject=? AND question_no=?',
            (explanation, exam_type, year, subject, question_no))
    return cur.rowcount

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
              AND a1.id = (SELECT id FROM attempts a2
                           WHERE a2.question_id = a1.question_id
                           ORDER BY answered_at DESC, id DESC LIMIT 1))""")
    where = ' AND '.join(clauses)
    # 考卷模式：同年同科若有司/律兩卷，依 track 分組再依題號排序
    order = 'RANDOM()' if mode == 'random' else 'year, track, question_no'
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
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        cur = conn.execute(
            'INSERT OR IGNORE INTO bookmarks(question_id, created_at) VALUES(?, ?)',
            (question_id, now)
        )
        if cur.rowcount == 1:
            return True   # inserted — bookmark added
        # Already existed — remove it
        conn.execute('DELETE FROM bookmarks WHERE question_id=?', (question_id,))
        return False

def get_stats() -> dict:
    with get_conn() as conn:
        overall = conn.execute("""
            SELECT COUNT(*) as total, SUM(is_correct) as correct FROM attempts a
            WHERE a.id=(SELECT id FROM attempts a2
                        WHERE a2.question_id=a.question_id
                        ORDER BY answered_at DESC, id DESC LIMIT 1)
        """).fetchone()
        by_subject = conn.execute("""
            SELECT q.exam_type, q.subject, COUNT(*) as total, SUM(a.is_correct) as correct
            FROM attempts a JOIN questions q ON q.id=a.question_id
            WHERE a.id=(SELECT id FROM attempts a2
                        WHERE a2.question_id=a.question_id
                        ORDER BY answered_at DESC, id DESC LIMIT 1)
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
              AND id=(SELECT id FROM attempts a2
                      WHERE a2.question_id=a.question_id
                      ORDER BY answered_at DESC, id DESC LIMIT 1)
        """).fetchall()
    return [r['question_id'] for r in rows]

def get_filters() -> dict:
    with get_conn() as conn:
        def fetch(sql, *args):
            return [r[0] for r in conn.execute(sql, args).fetchall()]
        out = {}
        for et in ('silu', 'investigation'):
            years = fetch(
                "SELECT DISTINCT year FROM questions WHERE exam_type=? ORDER BY year", et)
            subjects = fetch(
                "SELECT DISTINCT subject FROM questions WHERE exam_type=? ORDER BY subject", et)
            subjects_by_year = {
                str(y): fetch(
                    "SELECT DISTINCT subject FROM questions WHERE exam_type=? AND year=? "
                    "ORDER BY subject", et, y)
                for y in years
            }
            out[et] = {
                'years': years,
                'subjects': subjects,
                'subjects_by_year': subjects_by_year,
            }
        return out

def get_bookmarked_ids() -> list[int]:
    with get_conn() as conn:
        rows = conn.execute('SELECT question_id FROM bookmarks ORDER BY created_at').fetchall()
    return [r['question_id'] for r in rows]
