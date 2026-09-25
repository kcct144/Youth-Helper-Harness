---
description: 从上游同步 harness（技能/脚本/schema），学生数据与笔记不动
---

加载 `.kilo/skills/upgrade/SKILL.md`，按其中流程升级本工作区：

$ARGUMENTS

要点：先 `git fetch` 看版本差 → 预览改了哪些文件 → 备份 → 合并（冲突处置见 `harness.json`）
→ 开库跑一次迁移 → 自检 → 用真实输出汇报。**学生数据、图片、笔记永不参与升级。**
