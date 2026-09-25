---
description: 把刚才的错题记进错题本（自动填错因、知识点、来源）
agent: chief
---

加载 `.kilo/skills/wrongbook/SKILL.md`，把下面这道错题记进错题本：

$ARGUMENTS

要求：字段按 wrongbook 技能的表格填写（错因只用规定的七类）；先用固定格式回声，
随即执行 `node 学习数据/scripts/wrong.mjs add ...`，并把脚本真实输出贴给学生。
题干长或含引号换行时改用 `--json-file`。
如果学生没有说明错因，先问一句"这题当时是怎么错的？"，不要默认写"粗心"。
