"""只读提取参考 DOCX；保留段落定位和直接运行格式，不自动发布题目。"""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + NS['w'] + '}'


def extract(path):
    with ZipFile(path) as z:
        root = ET.fromstring(z.read('word/document.xml'))
    paragraphs = []
    for node in root.findall('.//w:body//w:p', NS):
        runs = []
        for r in node.findall('./w:r', NS):
            text = ''.join(n.text or '' for n in r.findall('.//w:t', NS))
            underline = r.find('w:rPr/w:u', NS)
            bold = r.find('w:rPr/w:b', NS)
            runs.append({'text': text,
                         'underline': underline is not None and underline.get(W+'val') != 'none',
                         'bold': bold is not None and bold.get(W+'val') not in ('0', 'false')})
        text = ''.join(n.text or '' for n in node.findall('.//w:t', NS))
        if text.strip():
            paragraphs.append({'paragraph': len(paragraphs)+1, 'text': text, 'runs': runs})
    return {'source': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'status': '待校验',
            'notice': '仅正文文本和直接运行格式；未解析继承样式、自动编号或图片；嵌套文本框可能重复。段号不是页码。',
            'paragraphs': paragraphs}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    files = sorted(args.source.glob('*.docx'))
    if not files:
        parser.error('没有 DOCX')
    if args.output.exists():
        parser.error('拒绝覆盖既有提取目录')
    args.output.mkdir(parents=True)
    for path in files:
        data = extract(path)
        (args.output / (path.stem+'.json')).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        print(path.name, len(data['paragraphs']))


if __name__ == '__main__':
    main()
