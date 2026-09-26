import importlib.util
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('reference_extract', Path(__file__).with_name('提取参考段落.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ExtractionTests(unittest.TestCase):
    def test_paragraph_runs_and_source_hash(self):
        xml = '''<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
        <w:p><w:r><w:t>I </w:t></w:r><w:r><w:rPr><w:u w:val="single"/><w:b/></w:rPr><w:t>read</w:t></w:r></w:p>
        <w:p/><w:tbl><w:tr><w:tc><w:p><w:r><w:rPr><w:u w:val="none"/><w:b w:val="0"/></w:rPr><w:t>books.</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        </w:body></w:document>'''
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'source.docx'
            with ZipFile(path, 'w') as archive:
                archive.writestr('word/document.xml', xml)
            before = path.read_bytes()
            data = module.extract(path)
            self.assertEqual([p['text'] for p in data['paragraphs']], ['I read', 'books.'])
            self.assertEqual(data['paragraphs'][1]['paragraph'], 2)
            self.assertTrue(data['paragraphs'][0]['runs'][1]['underline'])
            self.assertTrue(data['paragraphs'][0]['runs'][1]['bold'])
            self.assertFalse(data['paragraphs'][1]['runs'][0]['underline'])
            self.assertFalse(data['paragraphs'][1]['runs'][0]['bold'])
            self.assertEqual(len(data['sha256']), 64)
            self.assertEqual(data['status'], '待校验')
            self.assertEqual(path.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
