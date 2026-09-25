---
description: 查看错题本与背诵本的学习数据统计
agent: chief
---

加载 `.kilo/skills/study-data/SKILL.md`，跑统计并把结果讲人话：

```bash
node 学习数据/scripts/wrong.mjs stats --json
node 学习数据/scripts/recite.mjs stats --json
```

汇报：错题总数/待掌握/已掌握、背诵卡总数/今日待背、错得最多的学科、最主要的错因。
不要只贴 JSON，给出**一句判断**（如"错因集中在'概念不清'，建议这周把导数那 4 张卡先过一遍"）。

$ARGUMENTS
