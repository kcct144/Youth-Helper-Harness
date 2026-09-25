-- 缺口表 schema（SQLite）v1
-- 「查缺补漏强化」的核心实体：一个知识点/能力的掌握状态。
-- 与错题本的分界：缺口 = 一个知识点（上位）；错题 = 一道题（证据）。
-- 状态只能由证据推进（错题重做通过 / 卡片抽背 pass），不由 AI 感觉推进。

CREATE TABLE IF NOT EXISTS gaps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fp          TEXT    NOT NULL UNIQUE,   -- sha1(subject|topic)，与错题本同一套去重逻辑
  subject     TEXT    NOT NULL,          -- 学科
  topic       TEXT    NOT NULL,          -- 「章节简称·考点」，与错题本 --topic 完全同一套命名
  title       TEXT    NOT NULL,          -- 一句话描述缺口，如「加速度公式不熟」
  status      TEXT    NOT NULL DEFAULT '缺', -- 缺 | 补 | 强 | 已掌握
  cause       TEXT,                      -- 主要错因：概念不清 / 方法不会 / 审题偏差
  evidence    TEXT,                      -- 来源错题 id，逗号分隔，如 "3,15,21"
  action      TEXT,                      -- 补的动作摘要，如 "讲解 09-25；卡 #7"
  stage       INTEGER NOT NULL DEFAULT 0,-- 强化档位，索引进 INTERVALS
  due_date    TEXT,                      -- 下次验证日（补 / 强 阶段才有）
  regressions INTEGER NOT NULL DEFAULT 0,-- 回退次数（反复错的信号，最该被看见）
  found_at    TEXT    NOT NULL,
  filled_at   TEXT,
  strong_at   TEXT,
  mastered_at TEXT,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gaps_status  ON gaps (status, due_date);
CREATE INDEX IF NOT EXISTS idx_gaps_subject ON gaps (subject, topic);

CREATE TABLE IF NOT EXISTS gap_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  gap_id      INTEGER NOT NULL REFERENCES gaps (id) ON DELETE CASCADE,
  at          TEXT    NOT NULL,          -- YYYY-MM-DD
  kind        TEXT    NOT NULL,          -- 发现|讲解|做卡|笔记|通过|未通过|回退|备注
  from_status TEXT,
  to_status   TEXT,
  detail      TEXT
);

CREATE INDEX IF NOT EXISTS idx_gap_events_gap ON gap_events (gap_id);
