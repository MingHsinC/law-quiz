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

# 考選部真實檔案以造字字元 U+E18C..U+E18F 當作 (A)(B)(C)(D) 選項標記
_PUA_OPT_BASE = 0xE18C  # +0=A, +1=B, +2=C, +3=D

def _extract_options(block: str) -> dict[str, str] | None:
    """從選項區塊抽出 {A,B,C,D}。支援造字標記與 ASCII (A)/（Ａ） 兩種格式。"""
    # 格式一：考選部造字標記 U+E18C..U+E18F
    positions = []
    for i in range(4):
        idx = block.find(chr(_PUA_OPT_BASE + i))
        if idx >= 0:
            positions.append((idx, 'ABCD'[i]))
    if len(positions) == 4:
        positions.sort()
        opts = {}
        for k, (idx, letter) in enumerate(positions):
            end = positions[k + 1][0] if k + 1 < len(positions) else len(block)
            opts[letter] = re.sub(r'\s+', ' ', block[idx + 1:end]).strip()
        return opts if all(opts.values()) else None

    # 格式二：ASCII/全形 (A)(B)(C)(D)
    opt_re = re.compile(
        r'[\(（]([ABCD])[\)）]\s*(.*?)(?=\s*[\(（][ABCD][\)）]|$)', re.DOTALL)
    opts = {m.group(1): re.sub(r'\s+', ' ', m.group(2)).strip()
            for m in opt_re.finditer(block)}
    if len(opts) == 4 and all(opts.values()):
        return opts
    return None

def _is_question_start(line: str) -> "re.Match | None":
    """題目行：題號+題幹。
    同時支援 `1 甲為…`（有空格）與 `1下列…`（無空格，109 年起）兩種格式；
    並過濾『109年…』標題與『1301頁次』等無中文的頁碼/代號行。"""
    if re.match(r'^\d+\s*年', line):
        return None
    m = re.match(r'^(\d{1,3})[\.\s、]?\s*(\D.*)$', line)
    if not m:
        return None
    if not re.search(r'[一-鿿]', m.group(2)):  # 題幹必含中文
        return None
    return m

def parse_questions(text: str) -> list[dict]:
    """Parse question file → list of {no, text, A, B, C, D}.

    真實格式：題幹單獨一行（`1 題目…`），選項以造字標記跟在後續行。
    """
    lines = text.splitlines()
    questions = []
    i = 0
    while i < len(lines):
        m = _is_question_start(lines[i])
        if not m:
            i += 1
            continue
        no, stem = int(m.group(1)), m.group(2).strip()
        # 收集到下一題之前的所有行當作選項區塊
        j = i + 1
        opt_lines = []
        while j < len(lines) and not _is_question_start(lines[j]):
            opt_lines.append(lines[j])
            j += 1
        opts = _extract_options('\n'.join(opt_lines))
        if opts and stem:
            questions.append({'no': no, 'text': stem,
                              'A': opts['A'], 'B': opts['B'],
                              'C': opts['C'], 'D': opts['D']})
        i = j
    return questions

def parse_answers(text: str) -> dict[int, str]:
    """Parse ANS file → {question_no: letter}.

    支援三種格式：
    1. 考選部欄位式（題號區塊 / 答案區塊 交錯）
    2. `1.(B)` 或 `1.B`
    3. 每行一個字母
    """
    lines = [l.strip() for l in text.splitlines()]

    # 格式一：考選部欄位式 —— 蒐集成對的「題號區塊」「答案區塊」
    nums_blocks: list[list[int]] = []
    ans_blocks: list[list[str]] = []
    mode = None
    for s in lines:
        if s == '題號':
            mode = 'num'; nums_blocks.append([]); continue
        if s == '答案':
            mode = 'ans'; ans_blocks.append([]); continue
        if not s:
            continue
        if mode == 'num' and re.match(r'^\d+$', s):
            nums_blocks[-1].append(int(s))
        elif mode == 'ans' and re.match(r'^[A-E]+#?$', s):
            # 單一答案如 'D'；送分題可能為多字母如 'CD'（C、D 皆算對）
            ans_blocks[-1].append(s.rstrip('#'))
        elif mode == 'ans':
            mode = None  # 離開答案區塊（例如進入備註）
    if nums_blocks and ans_blocks:
        answers: dict[int, str] = {}
        for nums, ans in zip(nums_blocks, ans_blocks):
            for n, a in zip(nums, ans):
                answers[n] = a
        if answers:
            return answers

    # 格式二、三：逐行解析
    answers = {}
    for line in lines:
        if not line:
            continue
        m = re.match(r'^(\d+)[\.\s][\(（]?([ABCD])[\)）]?', line)
        if m:
            answers[int(m.group(1))] = m.group(2)
            continue
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
            n_parsed = len(questions)
            n_no_answer = sum(1 for q in questions if answers.get(q['no']) is None)
            if n_no_answer:
                print(f'    ⚠ {n_no_answer}/{n_parsed} 題無對應答案（answer=None）')
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
