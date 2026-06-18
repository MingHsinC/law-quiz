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
  UNIQUE(exam_type, year, subject, track, question_no)
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
              AND a1.id = (SELECT id FROM attempts a2
                           WHERE a2.question_id = a1.question_id
                           ORDER BY answered_at DESC, id DESC LIMIT 1))""")
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
