-- v1 → v2：错题支持 单选/填空/解答 三种题型、自测题面、解析要点与图片
-- v1 的 answer 语义是 correct_answer；这里搬迁后仍保留旧列（SQLite 删列代价大，留着不碍事）。

ALTER TABLE wrong_questions ADD COLUMN form TEXT NOT NULL DEFAULT '解答';
ALTER TABLE wrong_questions ADD COLUMN options TEXT;
ALTER TABLE wrong_questions ADD COLUMN drill TEXT;
ALTER TABLE wrong_questions ADD COLUMN answer TEXT;
ALTER TABLE wrong_questions ADD COLUMN analysis TEXT;
ALTER TABLE wrong_questions ADD COLUMN image TEXT;

UPDATE wrong_questions SET answer = correct_answer WHERE answer IS NULL;
