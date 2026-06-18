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
