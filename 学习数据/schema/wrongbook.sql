-- 错题本 schema（SQLite）v2
-- 由 学习数据/scripts/db.mjs 在打开库时执行，可安全重复运行。
-- 设计要点：stem 保真原题，drill 是改造后的自测题面（单选/填空），answer 是自测答案。

CREATE TABLE IF NOT EXISTS wrong_questions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  fp             TEXT    NOT NULL UNIQUE,   -- 指纹 sha1(subject|归一化 stem) 前 16 位，用于去重
  subject        TEXT    NOT NULL,          -- 学科：语文/数学/英语/物理/化学/生物/政治/历史/地理
  topic          TEXT    NOT NULL,          -- 知识点：教材章节简称·考点，如「导数·单调性」
  form           TEXT    NOT NULL DEFAULT '解答', -- 题型：单选 | 填空 | 解答
  stem           TEXT    NOT NULL,          -- 原始题干（保真，不改造）
  options        TEXT,                      -- 单选选项，换行分隔：A. …\nB. …\nC. …\nD. …
  drill          TEXT,                      -- 自测题面：填空用 ____ 挖空；空表示直接用 stem
  answer         TEXT    NOT NULL,          -- 自测答案：单选写字母；填空按空序用 | 分隔；解答写最终结论
  my_answer      TEXT,                      -- 学生当时的答案（原样，含"没做出来"）
  analysis       TEXT,                      -- 解析要点，≤3 行、编号步骤，不写长篇
  cause          TEXT,                      -- 错因：概念不清/计算失误/审题偏差/方法不会/粗心/时间不够/其他
  difficulty     INTEGER NOT NULL DEFAULT 3,-- 1-5
  source         TEXT,                      -- 来源：周测3 / 期中 / 练习册 P12
  tags           TEXT,                      -- 逗号分隔
  image          TEXT,                      -- 图片路径（相对仓库根，多张用 ; 分隔），存 学习数据/图片/ 下
  created_at     TEXT    NOT NULL,          -- YYYY-MM-DD
  due_date       TEXT    NOT NULL,          -- 下次复习日
  stage          INTEGER NOT NULL DEFAULT 0,-- 间隔阶段，索引进 INTERVALS
  streak         INTEGER NOT NULL DEFAULT 0,-- 连续答对次数
  lapses         INTEGER NOT NULL DEFAULT 0,-- 累计答错次数
  mastered       INTEGER NOT NULL DEFAULT 0,-- 1 = 已掌握，不再进入到期队列
  updated_at     TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wrong_due     ON wrong_questions (mastered, due_date);
CREATE INDEX IF NOT EXISTS idx_wrong_subject ON wrong_questions (subject, topic);

CREATE TABLE IF NOT EXISTS wrong_reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES wrong_questions (id) ON DELETE CASCADE,
  reviewed_at TEXT    NOT NULL,  -- YYYY-MM-DD
  result      TEXT    NOT NULL,  -- pass | fail
  stage_after INTEGER NOT NULL,
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_wrong_reviews_q ON wrong_reviews (question_id);
