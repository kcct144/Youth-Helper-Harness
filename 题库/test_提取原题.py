import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('extractor', Path(__file__).with_name('提取原题.py'))
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


class ExtractionTests(unittest.TestCase):
    def test_source_and_answers_preserved(self):
        paras = ['阅读下面短文。', 'He    11    (go) home.', '【答案】',
                 '11．went', '【来源】用户提供', '【详解】11．考查时态。故填went。']
        rows = extractor.extract_passages(paras, '资料.docx')
        self.assertEqual(1, len(rows))
        self.assertEqual([11], rows[0]['原空号'])
        self.assertEqual('went', rows[0]['原答案'][0]['答案'])
        self.assertIn('（1）' + r'\_\_\_\_', rows[0]['题干'])
        self.assertIn('    11    ', rows[0]['原题干'])
        self.assertEqual('待校验', rows[0]['状态'])

    def test_recheck_ignores_prose_number_and_keeps_review(self):
        paras = ['At 1 pm he    1    (go) home.', '【答案】',
                 '1．went', '【来源】用户提供', '1．考查时态。故填went。']
        rows = extractor.extract_passages(paras, '资料.docx')
        rows[0]['复核备注'] = '不要覆盖'
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root/'资料.json').write_text(json.dumps({'候选': rows}), encoding='utf-8')
            (root/'清单.json').write_text(json.dumps({'文件': [{'文件': '资料.docx'}]}), encoding='utf-8')
            extractor.recheck_generated(root)
            result = json.loads((root/'资料.json').read_text(encoding='utf-8'))['候选'][0]
            self.assertEqual([], result['结构问题'])
            self.assertIn('At 1 pm', result['题干'])
            self.assertEqual(1, result['题干'].count(r'\_\_\_\_'))
            self.assertEqual('不要覆盖', result['复核备注'])


if __name__ == '__main__':
    unittest.main()
