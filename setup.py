"""Run once to download questions and populate quiz.db."""
import json
from pathlib import Path

import db
from scrapers import lagendre, investigation

def _import_dir(directory: Path) -> int:
    total = 0
    for json_path in sorted(directory.glob('*.json')):
        try:
            data = json.loads(json_path.read_text(encoding='utf-8'))
        except Exception as e:
            print(f'  ✗ 讀取失敗 {json_path.name}: {e}')
            continue
        records = [{
            'exam_type':    data['exam_type'],
            'year':         data['year'],
            'subject':      data['subject'],
            'track':        data.get('track'),
            'question_no':  q['no'],
            'question_text': q['text'],
            'opt_a': q['options']['A'],
            'opt_b': q['options']['B'],
            'opt_c': q['options']['C'],
            'opt_d': q['options']['D'],
            'answer': q.get('answer')
        } for q in data['questions']]
        n = db.insert_questions(records)
        total += n
    return total

def main():
    print('=== 法律刷題 初始化 ===\n')
    db.init_db()

    print('【1/2】司律一試 (lagendre/law.exam)')
    try:
        lagendre.scrape_all()
    except Exception as e:
        print(f'  ✗ 下載失敗: {e}')

    print('\n【2/2】調查局特考 (public.com.tw)')
    try:
        investigation.scrape_all()
    except Exception as e:
        print(f'  ✗ 爬取失敗: {e}')

    print('\n【匯入資料庫】')
    n1 = _import_dir(Path('data/silu'))
    n2 = _import_dir(Path('data/investigation'))
    print(f'  司律一試：{n1} 題')
    print(f'  調查局：  {n2} 題')
    print(f'\n✓ 共匯入 {n1+n2} 題')
    print('請執行: python app.py')

if __name__ == '__main__':
    main()
