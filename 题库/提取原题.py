"""Read supplied DOCX collections into a review queue, never into the live bank.

Standard library only. Extraction is structural, NOT semantic validation.
Existing output is refused so that review work cannot be silently overwritten.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}


def paragraphs(path):
    with ZipFile(path) as archive:
        root = ET.fromstring(archive.read('word/document.xml'))
    result = []
    for node in root.findall('.//w:body//w:p', NS):
        text = ''.join(n.text or '' for n in node.findall('.//w:t', NS))
        if text.strip():
            result.append(text)
    return result


def body_start(paras, answer_at, floor):
    # Work backwards from the answer; Chinese explanations/metadata are boundaries.
    start = floor
    for i in range(answer_at - 1, floor - 1, -1):
        p = paras[i]
        if re.search(r'^【|故填|考查|^学校[:：]|^一、语法填空|高中英语作业', p):
            start = i + 1
            break
    return start


def extract_passages(paras, filename):
    positions = [i for i, p in enumerate(paras) if p.strip() == '【答案】']
    starts = [body_start(paras, at, positions[n-1]+1 if n else 0)
              for n, at in enumerate(positions)]
    records = []
    for n, at in enumerate(positions):
        end = starts[n+1] if n+1 < len(starts) else len(paras)
        body = '\n\n'.join(paras[starts[n]:at])
        tail = paras[at+1:end]
        answer_lines = []
        for line in tail:
            if line.startswith('【'):
                break
            answer_lines.append(line)
        answer_text = ' '.join(answer_lines)
        pairs = re.findall(r'(\d+)[．.]\s*(.*?)(?=\s*\d+[．.]|$)', answer_text)
        numbers = [int(k) for k, _ in pairs]
        flags = []
        if not numbers or len(set(numbers)) != len(numbers):
            flags.append('答案编号为空或重复')
        number_set = set(numbers)
        matches = list(re.finditer(r'(?<!\S)(\d{1,4})(?!\S)', body))
        matches = [m for m in matches if int(m[1]) in number_set]
        found = [int(m[1]) for m in matches]
        if found != numbers:
            flags.append('题干空号与答案号不一一对应，需人工检查')
        normalized = body
        if found == numbers and numbers:
            mapping = {k: i for i, k in enumerate(numbers, 1)}
            for m in reversed(matches):
                normalized = normalized[:m.start()] + f'（{mapping[int(m[1])]}）' + r'\_\_\_\_' + normalized[m.end():]
        source = next((p[len('【来源】'):] for p in tail if p.startswith('【来源】')), '')
        if not source:
            flags.append('缺少外部来源标签')
        if '【详解】' not in '\n'.join(tail):
            flags.append('未发现详解标记')
        # Ignore instructions and source blank numbers for exact-text candidate grouping.
        fingerprint_body = '\n'.join(p for p in normalized.splitlines()
                                     if not p.startswith(('阅读下面', '短文填空')))
        fingerprint_body = re.sub(r'（\d+）', '', fingerprint_body)
        fingerprint_body = re.sub(r'\s+', '', fingerprint_body).casefold()
        records.append({
            '候选编号': f'{Path(filename).stem}-{n+1:03}', '状态': '待校验',
            '原文件': filename, '原段落范围': [starts[n]+1, end],
            '外部来源标签': source, '原空号': numbers,
            '题干': normalized, '原题干': body,
            '原答案': [{'原空号': int(k), '答案': v.strip()} for k, v in pairs],
            '原答案及解析': '\n\n'.join(tail), '结构问题': flags,
            '文本指纹': hashlib.sha256(fingerprint_body.encode()).hexdigest(),
        })
    return records


def recheck_generated(output):
    """Recompute only derived structural fields; preserve source and review text."""
    manifest_path = output / '清单.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    fingerprints = {}
    for item in manifest['文件']:
        path = output / (Path(item['文件']).stem + '.json')
        data = json.loads(path.read_text(encoding='utf-8'))
        for r in data['候选']:
            body, numbers = r['原题干'], r['原空号']
            matches = [m for m in re.finditer(r'(?<!\S)(\d{1,4})(?!\S)', body)
                       if int(m[1]) in numbers]
            if [int(m[1]) for m in matches] != numbers:
                # A prose number such as '7 am' must not count as a blank.
                matches = [m for m in re.finditer(r'(?<=[ \t\u00a0\u3000]{2})(\d{1,4})(?=[ \t\u00a0\u3000])', body)
                           if int(m[1]) in numbers]
            flags = []
            normalized = body
            if not numbers or len(set(numbers)) != len(numbers):
                flags.append('答案编号为空或重复')
            if not numbers or [int(m[1]) for m in matches] != numbers:
                flags.append('题干空号与答案号不一一对应，需人工检查')
            else:
                mapping = {k: i for i, k in enumerate(numbers, 1)}
                for m in reversed(matches):
                    normalized = normalized[:m.start()] + f'（{mapping[int(m[1])]}）' + r'\_\_\_\_' + normalized[m.end():]
            if not r['外部来源标签']:
                flags.append('缺少外部来源标签')
            if not re.search(r'【详解】|【解析】|考查|故填', r['原答案及解析']):
                flags.append('未发现解析文本线索')
            fingerprint = '\n'.join(p for p in normalized.splitlines() if not p.startswith(('阅读下面', '短文填空')))
            fingerprint = re.sub(r'\s+', '', re.sub(r'（\d+）', '', fingerprint)).casefold()
            r.update(题干=normalized, 结构问题=flags, 文本指纹=hashlib.sha256(fingerprint.encode()).hexdigest())
            fingerprints.setdefault(r['文本指纹'], []).append(r['候选编号'])
        item['结构异常候选'] = sum(bool(r['结构问题']) for r in data['候选'])
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    manifest['相同文本候选组'] = [v for v in fingerprints.values() if len(v) > 1]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--recheck', action='store_true', help='Only recompute derived structural fields in an existing queue')
    args = parser.parse_args()
    if args.recheck:
        print(json.dumps(recheck_generated(args.output), ensure_ascii=False, indent=2))
        return
    paths = sorted(args.source.glob('*.docx'))
    if not paths:
        parser.error('No DOCX files found')
    if args.output.exists():
        parser.error('Output already exists; choose a new queue directory')
    args.output.mkdir(parents=True)
    inventory, fingerprints = [], {}
    for path in paths:
        paras = paragraphs(path)
        records = extract_passages(paras, path.name) if path.name.startswith('语法填空-') else []
        data = {'文件': path.name, 'SHA256': hashlib.sha256(path.read_bytes()).hexdigest(),
                '提取方式': 'DOCX正文文本；未检查版式、图片及自动编号，不能视为内容校验',
                '候选': records}
        if not records:
            # Word-formation books have implicit numbering and a separate answer key.
            # Preserve ordered paragraphs instead of guessing question/answer alignment.
            data['原段落'] = [{'段落': i, '文本': p} for i, p in enumerate(paras, 1)]
        for r in records:
            fingerprints.setdefault(r['文本指纹'], []).append(r['候选编号'])
        (args.output / (path.stem + '.json')).write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        inventory.append({'文件': path.name, 'SHA256': data['SHA256'], '非空段落': len(paras),
                          '篇章候选': len(records),
                          '结构异常候选': sum(bool(r['结构问题']) for r in records)})
    duplicates = [v for v in fingerprints.values() if len(v) > 1]
    summary = {'文件': inventory, '相同文本候选组': duplicates,
               '说明': '指纹只发现标准化后相同文本，未自动删除；近似改编和答案差异仍需核验。所有候选未发布。'}
    (args.output / '清单.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(recheck_generated(args.output), ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
