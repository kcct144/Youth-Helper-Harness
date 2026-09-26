import importlib.util
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).with_name('管理.py')
SPEC = importlib.util.spec_from_file_location('question_bank_manager', MODULE_PATH)
manager = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(manager)


BASE_META = """schema: enpractice-question/v1
id: {qid}
适用题型: [语法填空]
作答形式: 填空
考点: {point}
范围: {scope}
目标: 流程运用
台阶: {level}
用途: [查缺]
前置: [理解句意]
初始难度: 常规
难度依据: 语境判断
来源: 自编
状态: {status}
校验说明: 已检查格式和答案
版本: 1
{extra}"""


def document(qid, question, answers, *, point='时态', scope='一般过去时',
             level='L1', status='已校验', extra=''):
    meta = BASE_META.format(qid=qid, point=point, scope=scope, level=level,
                            status=status, extra=extra)
    return f"""---
{meta}---
## 题目

{question}

## 答案

{answers}

## 解析

根据语境判断。

## 判分说明

逐空判分。
"""


class QuestionBankTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.bank = Path(self.temp.name)
        (self.bank / '语法').mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def write(self, qid, content):
        (self.bank / '语法' / f'{qid}.md').write_text(content, encoding='utf-8')

    def test_legacy_single_question_remains_valid(self):
        qid = 'GR-OLD-001'
        self.write(qid, document(qid, r'He （1）\_\_\_\_ yesterday.', '- 1: wrote'))
        rows = manager.load_questions(self.bank)
        self.assertEqual([qid], [meta['id'] for _, meta in rows])

    def test_reading_questions_are_indexed_but_root_docs_are_not(self):
        folder = self.bank / '阅读理解' / '局部补漏'
        folder.mkdir(parents=True)
        qid = 'RC-MICRO-001'
        content = document(qid, r'活动在星期 \_\_\_\_ 举行。', '- 1: 六')
        content = content.replace('适用题型: [语法填空]', '适用题型: [阅读理解]')
        (folder / f'{qid}.md').write_text(content, encoding='utf-8')
        (self.bank / '规范.md').write_text('# 文档不是题目', encoding='utf-8')
        rows = manager.usable_questions(manager.load_questions(self.bank))
        self.assertEqual([qid], [m['id'] for _, m in rows])
        manager.write_index(self.bank, rows, '测试索引')
        index = (self.bank / '索引.md').read_text(encoding='utf-8')
        self.assertIn('阅读理解/局部补漏/RC-MICRO-001.md', index)
        self.assertEqual(['阅读理解'], rows[0][1]['适用题型'])

    def test_valid_passage(self):
        qid = 'GR-TEXT-001'
        extra = """材料形式: 篇章
逐空考点:
  - 题号: 1
    提示词情况: 给出动词 write
    空格作用: 谓语
    考点: 时态
    范围: 一般过去时
  - 题号: 2
    提示词情况: 无提示词
    空格作用: 连接从句
    考点: 连词
    范围: 宾语从句连接词
"""
        body = r'He （1）\_\_\_\_ (write) that he knew （2）\_\_\_\_ happened.'
        self.write(qid, document(qid, body, '- 1: wrote\n- 2: what',
                                  point='综合语法', scope='见逐空考点',
                                  level='混合（见逐空考点）', extra=extra))
        rows = manager.load_questions(self.bank)
        self.assertEqual('篇章', rows[0][1]['材料形式'])

    def test_passage_requires_per_blank_metadata(self):
        qid = 'GR-TEXT-002'
        content = document(qid, r'He （1）\_\_\_\_ yesterday.', '- 1: wrote',
                           point='综合语法', scope='见逐空考点',
                           level='混合（见逐空考点）', extra='材料形式: 篇章\n')
        self.write(qid, content)
        with self.assertRaisesRegex(AssertionError, 'missing per-blank metadata'):
            manager.load_questions(self.bank)

    def test_passage_rejects_wrong_per_blank_numbers(self):
        qid = 'GR-TEXT-003'
        extra = """材料形式: 篇章
逐空考点:
  - 题号: 1
    提示词情况: 给出动词 write
    空格作用: 谓语
    考点: 时态
    范围: 一般过去时
  - 题号: 1
    提示词情况: 无提示词
    空格作用: 连接从句
    考点: 连词
    范围: 宾语从句连接词
"""
        body = r'He （1）\_\_\_\_ that he knew （2）\_\_\_\_ happened.'
        self.write(qid, document(qid, body, '- 1: wrote\n- 2: what',
                                  point='综合语法', scope='见逐空考点',
                                  level='混合（见逐空考点）', extra=extra))
        with self.assertRaisesRegex(AssertionError, 'per-blank numbering'):
            manager.load_questions(self.bank)

    def test_pending_question_is_filtered_from_usable_rows(self):
        ready = 'GR-FILTER-001'
        pending = 'GR-FILTER-002'
        self.write(ready, document(ready, r'He （1）\_\_\_\_ yesterday.', '- 1: wrote'))
        self.write(pending, document(pending, r'She （1）\_\_\_\_ yesterday.', '- 1: wrote', status='待校验'))
        usable = manager.usable_questions(manager.load_questions(self.bank))
        self.assertEqual([ready], [meta['id'] for _, meta in usable])


if __name__ == '__main__':
    unittest.main()
