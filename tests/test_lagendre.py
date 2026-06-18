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
