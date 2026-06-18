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
        q.pop('answer', None)
        q.pop('explanation', None)
    return jsonify(questions)

@app.route('/api/question/<int:qid>')
def api_question(qid):
    q = db.get_question(qid)
    if not q:
        return jsonify({'error': 'not found'}), 404
    q.pop('answer', None)
    q.pop('explanation', None)
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
    # answer 可能是多字母送分題（如 'CD'），選到其中任一即算對
    is_correct = (chosen in answer) if answer else False
    db.record_attempt(qid, chosen, is_correct)
    return jsonify({'correct': is_correct, 'answer': answer,
                    'answer_available': answer is not None,
                    'explanation': q.get('explanation')})

@app.route('/api/grade', methods=['POST'])
def api_grade():
    """測驗模式交卷：一次評分整組答案。
    已作答題目記錄 attempt；未作答題目只回傳正解，不記錄。"""
    data    = request.get_json() or {}
    answers = data.get('answers', [])
    results = []
    for item in answers:
        qid = item.get('question_id')
        q   = db.get_question(qid)
        if not q:
            continue
        chosen = str(item.get('chosen', '')).upper()
        ans    = q['answer']
        if chosen in ('A', 'B', 'C', 'D'):
            is_correct = (chosen in ans) if ans else False
            db.record_attempt(qid, chosen, is_correct)
        else:
            chosen, is_correct = '', False
        results.append({
            'question_id':      qid,
            'chosen':           chosen,
            'correct':          is_correct,
            'answer':           ans,
            'answer_available': ans is not None,
            'explanation':      q.get('explanation'),
        })
    score = sum(1 for r in results if r['correct'])
    return jsonify({'score': score, 'total': len(results), 'results': results})

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
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('8.8.8.8', 80))
            return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'

if __name__ == '__main__':
    db.init_db()  # ensure tables exist before running
    ip = _local_ip()
    print(f'\n電腦：http://localhost:5000')
    print(f'手機：http://{ip}:5000\n')
    app.run(host='0.0.0.0', port=5000, debug=False)
