import pytest
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
