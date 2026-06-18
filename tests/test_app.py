import pytest
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

def test_attempt_returns_explanation_key(client):
    qid = _insert(client)
    r = client.post('/api/attempt', json={'question_id': qid, 'chosen': 'C'})
    assert 'explanation' in r.get_json()

def test_questions_strip_explanation(client):
    _insert(client)
    data = client.get('/api/questions?exam_type=silu').get_json()
    assert 'explanation' not in data[0]

def _insert_many(client, specs):
    """specs: list of (question_no, answer). 回傳 {question_no: id}。"""
    for no, ans in specs:
        db.insert_questions([{
            'exam_type':'silu','year':108,'subject':'民法','track':'律',
            'question_no':no,'question_text':f'試題{no}','opt_a':'A','opt_b':'B',
            'opt_c':'C','opt_d':'D','answer':ans}])
    return {q['question_no']: q['id'] for q in db.get_questions('silu')}

def test_grade_scores_mixed_answers(client):
    ids = _insert_many(client, [(1,'C'), (2,'A'), (3,'B')])
    q1, q2, q3 = ids[1], ids[2], ids[3]
    payload = {'answers': [
        {'question_id': q1, 'chosen': 'C'},   # 對
        {'question_id': q2, 'chosen': 'D'},   # 錯
        {'question_id': q3, 'chosen': ''},    # 未作答
    ]}
    r = client.post('/api/grade', json=payload)
    assert r.status_code == 200
    data = r.get_json()
    assert data['total'] == 3
    assert data['score'] == 1
    res = {x['question_id']: x for x in data['results']}
    assert res[q1]['correct'] is True
    assert res[q2]['correct'] is False and res[q2]['answer'] == 'A'
    assert res[q3]['chosen'] == '' and res[q3]['answer'] == 'B'

def test_grade_records_attempts_only_for_answered(client):
    ids = _insert_many(client, [(1,'C'), (2,'A')])
    q1, q2 = ids[1], ids[2]
    client.post('/api/grade', json={'answers': [
        {'question_id': q1, 'chosen': 'C'},
        {'question_id': q2, 'chosen': ''},   # 未作答 → 不記錄
    ]})
    stats = client.get('/api/stats').get_json()
    assert stats['overall']['total'] == 1   # 只有 q1 被記錄

def test_grade_multi_answer_accepts_either(client):
    qid = _insert(client, answer='CD')   # 送分題
    data = client.post('/api/grade', json={
        'answers': [{'question_id': qid, 'chosen': 'D'}]
    }).get_json()
    assert data['results'][0]['correct'] is True
