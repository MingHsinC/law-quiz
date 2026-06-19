from import_local import parse_local_filename, split_stem_options


def test_filename_with_track():
    assert parse_local_filename('100司-綜合法學(一)(刑法).txt') == (100, '司', '綜合法學(一)(刑法)')

def test_filename_no_track():
    assert parse_local_filename('103綜合法學(一)(刑法).txt') == (103, None, '綜合法學(一)(刑法)')

def test_filename_ans_ignored():
    assert parse_local_filename('103綜合法學(一)(刑法)ANS.txt') is None

def test_filename_non_txt():
    assert parse_local_filename('README.md') is None

def test_split_options_separated_by_newline():
    text = '下列何者正確？\nA甲說\nB乙說\nC丙說\nD丁說'
    stem, opts = split_stem_options(text)
    assert stem == '下列何者正確？'
    assert opts == {'A': '甲說', 'B': '乙說', 'C': '丙說', 'D': '丁說'}

def test_split_options_run_together():
    # 選項相連無分隔（A…罪B…罪），且兩兩成行
    text = ('甲男誘拐乙女，下列敘述何者正確？\n'
            'A成立和誘罪B成立略誘罪\nC成立略誘婦女罪D無罪')
    stem, opts = split_stem_options(text)
    assert stem.endswith('正確？')
    assert opts['A'] == '成立和誘罪'
    assert opts['B'] == '成立略誘罪'
    assert opts['C'] == '成立略誘婦女罪'
    assert opts['D'] == '無罪'

def test_split_stem_contains_latin_letter():
    # 題幹含 'A 銀行' / 'GPS'，不可被誤判成選項標記
    text = ('甲將錢存入 A 銀行並用 GPS 定位，下列何者錯誤？\n'
            'A工具屬之\nB資訊公開\nC屬竊錄\nD非正當')
    stem, opts = split_stem_options(text)
    assert 'A 銀行' in stem and 'GPS' in stem
    assert opts['A'] == '工具屬之'
    assert opts['D'] == '非正當'

def test_split_options_tab_separated():
    text = '下列何者正確？\nA甲說\tB乙說\nC丙說\tD丁說'
    stem, opts = split_stem_options(text)
    assert opts == {'A': '甲說', 'B': '乙說', 'C': '丙說', 'D': '丁說'}

def test_split_returns_none_when_incomplete():
    assert split_stem_options('只有三個選項？\nA甲\nB乙\nC丙') is None
