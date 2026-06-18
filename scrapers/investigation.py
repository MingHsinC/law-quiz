import re, json, requests
from bs4 import BeautifulSoup
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / 'data' / 'investigation'

_LIST_URL = (
    'https://www.public.com.tw/previousexam'
    '?page={page}&mode=0&year=&type=AO0039&level=AP0007'
    '&subject=AB0201&KeyWord=&titleword=%E8%AA%BF%E6%9F%A5%E5%B1%80'
    '%E7%89%B9%E8%80%83%E4%B8%89%E7%AD%89%E6%B3%95%E5%BE%8B%E5%AF%A6'
    '%E5%8B%99%E7%B5%84&keyname=&keyguid='
)
_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'zh-TW,zh;q=0.9',
}

def _parse_year(text: str) -> int | None:
    m = re.search(r'(\d{2,3})', text)
    return int(m.group(1)) if m else None

def _parse_question_block(text: str) -> dict | None:
    m = re.match(r'^(\d+)[\.、]\s*(.*)', text.strip(), re.DOTALL)
    if not m:
        return None
    no, rest = int(m.group(1)), m.group(2)
    opt_re = re.compile(r'[\(（]([ABCD])[\)）]\s*(.*?)(?=\s*[\(（][ABCD][\)）]|$)', re.DOTALL)
    opts = {om.group(1): om.group(2).strip() for om in opt_re.finditer(rest)}
    if len(opts) != 4:
        return None
    first = opt_re.search(rest)
    q_text = rest[:first.start()].strip() if first else ''
    if not q_text:
        return None
    return {'no': no, 'text': q_text,
            'A': opts['A'], 'B': opts['B'], 'C': opts['C'], 'D': opts['D']}

def _fetch_paper_list() -> list[dict]:
    papers, page = [], 1
    while True:
        try:
            resp = requests.get(_LIST_URL.format(page=page), headers=_HEADERS, timeout=15)
            resp.raise_for_status()
        except Exception as e:
            print(f'  ✗ 無法取得第{page}頁: {e}')
            break
        soup = BeautifulSoup(resp.text, 'html.parser')
        rows = soup.select('table tr')[1:]
        if not rows:
            break
        found_any = False
        for row in rows:
            cells = row.find_all('td')
            if len(cells) < 2:
                continue
            year_text   = cells[0].get_text(strip=True)
            subject_text = cells[1].get_text(strip=True)
            link = row.find('a', href=lambda h: h and h != '#')
            href = link['href'] if link else '#'
            if not href.startswith('http'):
                href = f'https://www.public.com.tw{href}' if href != '#' else '#'
            year = _parse_year(year_text)
            if year:
                papers.append({'year': year, 'subject': subject_text, 'url': href})
                found_any = True
        if not found_any:
            break
        # Check pagination: stop if no "next" indicator
        next_btn = soup.find('a', string=re.compile(r'[>»下]'))
        if not next_btn:
            break
        page += 1
    return papers

def _fetch_questions(url: str) -> list[dict]:
    if url == '#':
        return []
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=15)
        resp.raise_for_status()
    except Exception:
        return []
    soup = BeautifulSoup(resp.text, 'html.parser')
    questions = []
    # Try common question container patterns
    for sel in ['.question', '[class*="question"]', 'ol > li', 'div.exam-question']:
        blocks = soup.select(sel)
        if blocks:
            for block in blocks:
                q = _parse_question_block(block.get_text(separator='\n', strip=True))
                if q:
                    questions.append(q)
            break
    # Fallback: full page text split by question numbers
    if not questions:
        text = soup.get_text(separator='\n')
        for block in re.split(r'\n(?=\d{1,3}[\.、])', text):
            q = _parse_question_block(block)
            if q:
                questions.append(q)
    return questions

def scrape_all() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    print('  抓取 public.com.tw 清單中...')
    papers = _fetch_paper_list()
    print(f'  找到 {len(papers)} 份考卷')
    for paper in papers:
        questions = _fetch_questions(paper['url'])
        records = [{
            'no': q['no'], 'text': q['text'],
            'options': {'A': q['A'], 'B': q['B'], 'C': q['C'], 'D': q['D']},
            'answer': None
        } for q in questions]
        safe = re.sub(r'[<>:"/\\|?*]', '_', paper['subject'])
        out_path = DATA_DIR / f"{paper['year']}_{safe}.json"
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump({'exam_type': 'investigation', 'year': paper['year'],
                       'subject': paper['subject'], 'track': None,
                       'questions': records},
                      f, ensure_ascii=False, indent=2)
        status = f"{len(records)} 題 (答案未提供)" if records else "0 題（JS 渲染，無法抓取）"
        print(f"  ✓ {paper['year']} {paper['subject']}: {status}")
        total += len(records)
    return total
