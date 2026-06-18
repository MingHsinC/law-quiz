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
                q_text   = _fetch_raw(year, fname)
                ans_text = _fetch_raw(year, ans_fname)
            except Exception as e:
                print(f'  x 下載失敗 {fname}: {e}')
                continue
            questions = parse_questions(q_text)
            answers   = parse_answers(ans_text)
            import re as _re
            raw_blocks = [b for b in _re.split(r'\n(?=\d+[\.、])', q_text.strip()) if b.strip()]
            n_numbered = len(raw_blocks)
            n_parsed = len(questions)
            if n_parsed < n_numbered:
                print(f'    ⚠ 題目解析：{n_parsed}/{n_numbered} 成功（{n_numbered - n_parsed} 題格式不符跳過）')
            if len(answers) != n_parsed:
                print(f'    ⚠ 答案筆數 {len(answers)} ≠ 題目筆數 {n_parsed}，部分題目答案可能為 None')
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
            print(f'  ok {yr}{track} {subject}: {len(records)} 題')
            total += len(records)
    return total
