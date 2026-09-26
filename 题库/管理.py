"""Validate, index and export the Markdown question bank. Requires PyYAML."""
import argparse
from pathlib import Path
import re
import shutil
import yaml

BANK = Path(__file__).resolve().parent
REPO = BANK.parent
FIELDS = {'schema', 'id', '适用题型', '作答形式', '考点', '范围', '目标', '台阶',
          '用途', '前置', '初始难度', '难度依据', '来源', '状态', '版本', '校验说明'}
BLANK = r'\_\_\_\_'
PASSAGE_FIELDS = ('题号', '提示词情况', '空格作用', '考点', '范围')


def load_questions(bank=BANK):
    rows, ids = [], set()
    # Root Markdown files are documentation; questions live in content folders.
    for path in sorted(p for folder in bank.iterdir()
                       if folder.is_dir() and not folder.name.startswith(('.', '_'))
                       for p in folder.rglob('*.md')):
        raw = path.read_text(encoding='utf-8')
        match = re.fullmatch(r'---\r?\n(.*?)\r?\n---\r?\n(.*)', raw, re.S)
        assert match, f'{path}: missing frontmatter'
        meta = yaml.safe_load(match[1])
        assert isinstance(meta, dict) and FIELDS <= meta.keys(), f'{path}: missing fields'
        qid = meta['id']
        assert isinstance(qid, str) and re.fullmatch(r'[A-Z]+(?:-[A-Z]+)*-\d{3,}', qid), f'{path}: invalid id'
        assert qid == path.stem and qid not in ids, f'{path}: duplicate id or wrong filename'
        ids.add(qid)
        assert meta['schema'] == 'enpractice-question/v1', f'{qid}: schema'
        assert type(meta['版本']) is int and meta['版本'] > 0, f'{qid}: version'
        for field in ('适用题型', '用途', '前置'):
            assert isinstance(meta[field], list) and meta[field] and all(isinstance(x, str) and x.strip() for x in meta[field]), f'{qid}: {field}'
        assert set(meta['用途']) <= {'查缺', '补漏', '强化'}, f'{qid}: usage'
        assert meta['状态'] in {'待校验', '已校验', '停用'}, f'{qid}: status'
        assert meta['初始难度'] in {'基础', '常规', '进阶'}, f'{qid}: difficulty'
        assert meta['目标'] in {'概念理解', '形式回忆', '考点识别', '流程运用'}, f'{qid}: target'
        for field in ('作答形式', '考点', '范围', '台阶', '难度依据', '来源', '校验说明'):
            assert isinstance(meta[field], str) and meta[field].strip(), f'{qid}: empty {field}'
        parts = re.split(r'^## (.+)\s*$', match[2], flags=re.M)
        assert not parts[0].strip(), f'{qid}: unexpected text before question'
        headings = parts[1::2]
        sections = dict(zip(headings, (x.strip() for x in parts[2::2])))
        form = meta['作答形式']
        assert form in {'单项选择', '填空'}, f'{qid}: form'
        expected = ['题目', '选项', '答案', '解析', '判分说明'] if form == '单项选择' else ['题目', '答案', '解析', '判分说明']
        assert headings == expected and all(sections.values()), f'{qid}: section order/empty section'
        question = sections['题目']
        assert not re.search(r'(?<!\\)_', question), f'{qid}: unescaped underscore'
        assert '_' not in question.replace(BLANK, ''), f'{qid}: blank must have four escaped underscores'
        count = question.count(BLANK)
        if count > 1:
            assert re.findall(r'（(\d+)）' + re.escape(BLANK), question) == [str(i) for i in range(1, count + 1)], f'{qid}: blank numbering'
        material = meta.get('材料形式')
        per_blank = meta.get('逐空考点')
        assert material in {None, '篇章'}, f'{qid}: material form'
        if material == '篇章':
            assert form == '填空', f'{qid}: passage must be fill-in'
            assert not re.fullmatch(r'L\d+', meta['台阶'], re.I), f'{qid}: passage cannot use one L-level'
            assert isinstance(per_blank, list) and per_blank, f'{qid}: missing per-blank metadata'
            numbers = []
            for item in per_blank:
                assert isinstance(item, dict) and set(PASSAGE_FIELDS) <= item.keys(), f'{qid}: per-blank fields'
                assert type(item['题号']) is int and item['题号'] > 0, f'{qid}: per-blank number'
                assert all(isinstance(item[field], str) and item[field].strip() for field in PASSAGE_FIELDS[1:]), f'{qid}: empty per-blank field'
                numbers.append(item['题号'])
            assert numbers == list(range(1, count + 1)), f'{qid}: per-blank numbering'
        else:
            assert per_blank is None, f'{qid}: per-blank metadata requires passage material'
        if form == '单项选择':
            options = sections['选项'].splitlines()
            assert 2 <= len(options) <= 26, f'{qid}: option count'
            for i, line in enumerate(options):
                assert re.fullmatch(r'- ' + chr(65+i) + r': .+', line), f'{qid}: options'
            assert sections['答案'] in [chr(65+i) for i in range(len(options))], f'{qid}: answer'
        else:
            answers = sections['答案'].splitlines()
            assert count > 0 and len(answers) == count, f'{qid}: blank/answer count'
            for i, line in enumerate(answers, 1):
                assert re.fullmatch(r'- ' + str(i) + r': .+', line), f'{qid}: answer numbering'
        rows.append((path, meta))
    return rows


def usable_questions(rows):
    """Return only content that may enter indexes and distributions."""
    return [(path, meta) for path, meta in rows if meta['状态'] == '已校验']


def write_index(folder, rows, title):
    lines = [f'# {title}', '', '自动生成，仅列出本次已校验的可用题；按目标选题，未列出的旧文件不使用。答案在单题文件内，作答前不得展示。', '',
             '| 题号 | 适用题型 | 考点与范围 | 目标 | 台阶 | 作答形式 | 材料形式 | 难度 | 前置 | 关联题组 | 版本 |',
             '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for path, m in rows:
        rel = path.relative_to(folder).as_posix()
        cells = [f'[{m["id"]}]({rel})', '、'.join(m['适用题型']), f'{m["考点"]}：{m["范围"]}', m['目标'], m['台阶'], m['作答形式'], m.get('材料形式', '单题'), m['初始难度'], '、'.join(m['前置']), m.get('关联题组', '—'), str(m['版本'])]
        lines.append('| ' + ' | '.join(cells) + ' |')
    if not rows:
        lines.extend(['', '当前没有可用预设题目。'])
    (folder / '索引.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'index', 'export'])
    parser.add_argument('--type', dest='question_type')
    args = parser.parse_args()
    rows = load_questions()
    if args.action == 'check':
        print(f'Format valid: {len(rows)} questions. Content requires separate review.')
        return
    usable = usable_questions(rows)
    if args.action == 'index':
        write_index(BANK, usable, '统一题库索引')
        print(f'Indexed {len(usable)} questions.')
        return
    target_type = args.question_type
    assert target_type and re.fullmatch(r'[\w-]+', target_type), 'Provide a simple --type name'
    workspace = REPO / '题型工作区' / target_type
    assert (workspace / 'AGENTS.md').is_file(), 'Target workspace must already exist'
    selected = [(p, m) for p, m in usable if target_type in m['适用题型']]
    destination = workspace / '练习'
    exported = []
    for source, meta in selected:
        target = destination / source.relative_to(BANK)
        assert target.resolve().is_relative_to(workspace.resolve()), 'Export target escaped workspace'
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        exported.append((target, meta))
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(BANK / '规范.md', destination / '规范.md')
    write_index(destination, exported, f'{target_type}预设练习索引')
    print(f'Exported {len(exported)} questions to {destination}. Student progress unchanged.')


if __name__ == '__main__':
    main()
