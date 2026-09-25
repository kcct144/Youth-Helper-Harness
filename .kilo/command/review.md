---
description: 抽今日到期的错题与背诵卡，开始一轮复习
agent: chief
---

加载 `.kilo/skills/wrongbook/SKILL.md` 与 `.kilo/skills/recitation/SKILL.md`。

1. 先跑这两条（在仓库根目录）：
   - `node 学习数据/scripts/wrong.mjs due --limit 10`
   - `node 学习数据/scripts/recite.mjs due --limit 10`
2. 把今日待复习的**数量**告诉学生，并让他选：先错题还是先背诵。
3. 错题：只给题干 → 学生做 → 对照 → `review <id> --result pass|fail`。
   背诵：只念 `front` → 学生答 → 对照 `back` → `review <id> --result pass|fail`。
4. 一轮 5–10 条；学生没时间就只做 3 条，做完给一句简短小结（今天过了几条、哪些还要再练）。

$ARGUMENTS
