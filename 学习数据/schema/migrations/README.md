# schema 迁移

`学习数据/schema/<库>.sql` 是**新库**的建表语句（`CREATE TABLE IF NOT EXISTS`）。
它**不会**给已有的库补列，所以任何结构变更都要在 `migrations/<库>/` 下写一条迁移。

## 命名与语义

```
migrations/wrongbook/002_question_forms.sql     # 把库升到版本 2
migrations/recite/002_card_hook_image.sql
```

- 文件名前缀 `NNN` = 迁移完成后的**目标版本号**，按数字升序执行。
- 目标版本写在 `学习数据/scripts/db.mjs` 的 `SCHEMA_VERSION` 里；两者必须一致。
- 版本号存在库内的 `meta` 表（`schema_version` 键）。**没有 meta 表或没有该键的库按版本 1 处理**（历史库）。
- 每条迁移只会在 `schema_version < NNN` 时执行一次，执行后立刻把版本写成 `NNN`；
  中途失败会抛错并保持原版本，下次再跑会从这条重试（所以迁移要尽量写成可重入或用 `IF NOT EXISTS` 保护）。

## 写迁移的纪律

1. **只加不删**：优先 `ALTER TABLE ... ADD COLUMN`；删列/改类型在 SQLite 里要重建表，风险大，能不做就不做。
2. **先保数据**：新增列后，如果旧列里的数据要搬过去，紧跟一条 `UPDATE`（如 `SET answer = correct_answer`）。
3. **必须实测**：造一个旧版本的库跑一遍，确认迁移后 `list` / `stats` 正常、老数据没丢。
4. 迁移文件属于 harness，会被升级覆盖；**不要**在里面放学生数据或一次性脚本。
