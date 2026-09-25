---
description: 把知识点做成背诵卡，或抽背今日到期的卡
agent: chief
---

加载 `.kilo/skills/recitation/SKILL.md`。

$ARGUMENTS

- 如果是**做卡**：按"一张卡一个点"拆开，回声后执行
  `node 学习数据/scripts/recite.mjs add ...`，贴真实输出。
- 如果是**抽背**：先 `node 学习数据/scripts/recite.mjs due --limit 10`，
  一次只念一张卡的 `front`，等学生答完再对 `back`，逐张 `review <id> --result pass|fail`。
- 没给内容时，从最近讲过的知识点或 `due` 列表里挑。
