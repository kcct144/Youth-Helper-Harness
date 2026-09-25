-- 背诵本 schema（SQLite）v2
-- 由 学习数据/scripts/db.mjs 在打开库时执行，可安全重复运行。
-- 设计要点：front = 正面/问题，back = 反面/答案（要点式、多用列表与表格），hook = 记忆钩子。

CREATE TABLE IF NOT EXISTS recite_cards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  fp         TEXT    NOT NULL UNIQUE,   -- 卡片指纹 sha1(subject|front) 前 16 位
  subject    TEXT    NOT NULL,          -- 学科
  topic      TEXT    NOT NULL,          -- 教材章节/单元，如「必修一 Unit3」「导数」
  kind       TEXT    NOT NULL DEFAULT '概念', -- 概念/公式/古文/文言实词/英语单词/英语词组/时间线/答题模板/其他
  front      TEXT    NOT NULL,          -- 正面 = 问题（可含 ____ 填空）
  back       TEXT    NOT NULL,          -- 反面 = 答案，要点式（1./2./3.、短表格、对比）
  hook       TEXT,                      -- 记忆钩子：口诀 / 联想 / 对比，可空
  hint       TEXT,                      -- 第一层提示，可空
  source     TEXT,                      -- 来源：错题 #12 / 教材必修一 P30
  image      TEXT,                      -- 图片路径（相对仓库根，多张用 ; 分隔），存 学习数据/图片/ 下
  created_at TEXT    NOT NULL,
  due_date   TEXT    NOT NULL,
  stage      INTEGER NOT NULL DEFAULT 0,
  streak     INTEGER NOT NULL DEFAULT 0,
  lapses     INTEGER NOT NULL DEFAULT 0,
  mastered   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recite_due     ON recite_cards (mastered, due_date);
CREATE INDEX IF NOT EXISTS idx_recite_subject ON recite_cards (subject, topic);

CREATE TABLE IF NOT EXISTS recite_reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES recite_cards (id) ON DELETE CASCADE,
  reviewed_at TEXT    NOT NULL,
  result      TEXT    NOT NULL,  -- pass | fail
  stage_after INTEGER NOT NULL,
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_recite_reviews_c ON recite_reviews (card_id);
