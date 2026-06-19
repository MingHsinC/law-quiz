"""把 quiz.db 的題庫匯出成 webapp/questions.json，供離線 PWA 使用。

用法：
    python export_questions.py

每次新增 / 修改題庫後重跑一次，再把 webapp/ 重新部署即可。
"""
import json
import os
import sqlite3

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("QUIZ_DB", os.path.join(HERE, "quiz.db"))
OUT_DIR = os.path.join(HERE, "webapp")
OUT_PATH = os.path.join(OUT_DIR, "questions.json")

# 只輸出離線練習需要的欄位（含 answer / explanation，離線端自行評分）
FIELDS = [
    "id", "exam_type", "year", "subject", "track", "question_no",
    "question_text", "opt_a", "opt_b", "opt_c", "opt_d",
    "answer", "explanation",
]


def export() -> int:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        f"SELECT {', '.join(FIELDS)} FROM questions "
        "ORDER BY exam_type, year, COALESCE(track, ''), question_no"
    ).fetchall()
    conn.close()

    questions = [dict(r) for r in rows]
    os.makedirs(OUT_DIR, exist_ok=True)
    # 緊湊輸出（無多餘空白）以縮小檔案，ensure_ascii=False 保留中文
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, separators=(",", ":"))
    return len(questions)


if __name__ == "__main__":
    n = export()
    size_mb = os.path.getsize(OUT_PATH) / 1024 / 1024
    print(f"已匯出 {n} 題 → {OUT_PATH} ({size_mb:.2f} MB)")
