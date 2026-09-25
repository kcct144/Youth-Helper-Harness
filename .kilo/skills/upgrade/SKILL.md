---
name: upgrade
description: 从上游升级 harness 的完整流程：版本比对、文件分级处置、schema 迁移、自检与回滚。学生说"升级""更新""拉最新"时加载本技能。
---

# upgrade · 升级 harness

触发：学生说"升级 / 更新 / 拉一下最新 / 有没有新功能"。
目标：拿到最新的技能与脚本，**而错题、背诵、图片、笔记一个字都不动**。

先读 `harness.json`：里面有本地 `version`，以及三类文件清单（`upgradeable` / `merge_by_rule` / `never_touch`）。
**所有处置都以它为准**，不要凭印象判断哪些文件能覆盖。

## 0. 前置检查

```bash
git rev-parse --is-inside-work-tree    # 不是仓库 → 见本节末
git remote -v
git status --short
```

- **不是 git 仓库**：告诉学生"这个工作区不是用 git 拉的，没法自动升级"，并给两条路：
  以后改用 `git clone` 安装；或本次由你手动把上游的 `.kilo/**`、`AGENTS.md`、`PROJECT.md`、`kilo.json`、
  `学习数据/scripts/**`、`学习数据/schema/**` 覆盖过来（**逐条对照 `harness.json`**，绝不碰数据）。
- **上游地址**：`harness.json.upstream` 填了就核对；留空则依次取 `git remote` 里的 `upstream`、`origin`。
- **工作区有未提交改动**（学生刚写过的笔记）：先提交一次，避免 merge 被拒——
  `git add -A && git commit -m "升级前：保存本地改动"`。**只提交，不 push。**

## 1. 取上游并比版本

```bash
git fetch <remote> --tags
git show <remote>/main:harness.json      # 上游版本
```

版本相同 → 回一句"已是最新（vX.Y.Z）"，**不要**为了显得干了活而强行合并，结束。
版本更高 → 继续。

## 2. 预览改了什么（讲人话，不贴 diff）

```bash
git log --oneline HEAD..<remote>/main
git diff --name-status HEAD <remote>/main
```

按类别归纳给学生：技能（`.kilo/skills/`）、命令（`.kilo/command/`）、脚本（`学习数据/scripts/`）、
数据库结构（`schema/`）、资料（`资料/`）、文档。一两句说清，比如"新增了 XX 技能、修了图片抓取的 bug"。

## 3. 备份（关键，先做）

把**将要合并、且本地有改动**的文件复制到 `.upgrade-backup/<YYYYMMDD-HHmm>/` 下（保持相对路径），
至少覆盖：`资料/<学科>/index.md`、`笔记本/<学科>/index.md`、`学生档案.md`。

**禁止用 `git stash`** —— stash 是全局共享的，多 worktree 场景会互相破坏。

## 4. 合并

```bash
git merge <remote>/main          # 历史无关时用 --allow-unrelated-histories
```

冲突（或上游删改了本地也改过的文件）按 `harness.json` 的清单处置：

| 类别 | 处置 |
|---|---|
| `upgradeable` | **取上游**：`git checkout --theirs <file>` 后 `git add <file>` |
| `merge_by_rule` | **逐个人工合并**，按 harness.json 里每条的 `rule`（去重、保留学生值、套用新格式） |
| `never_touch` | **不应出现在冲突里**。出现了就停下问学生——通常是他把数据/图片加进了版本管理，先确认再处理 |

合并底线：**学生数据、图片、笔记正文永不为了"合并成功"而放弃。**

冲突太多、或学生明显慌了 → `git merge --abort` 回到原状，改走**轻升级**：
只覆盖 `.kilo/**` + 四个文档（`AGENTS.md`/`PROJECT.md`/`kilo.json`/`harness.json`），其余留到下次。
轻升级同样要跑第 5 步之后的迁移与自检。

## 5. 迁移数据库

脚本升级后可能要求新字段，而旧库没有。**开库即自动迁移**（`db.mjs` 按 `SCHEMA_VERSION` 与库内 `meta.schema_version` 执行
`schema/migrations/<库>/<版本>_*.sql`），所以只要跑一次：

```bash
node 学习数据/scripts/wrong.mjs stats --json
node 学习数据/scripts/recite.mjs stats --json
```

看到 `↑ wrongbook 已迁移 v1 → v2，执行 002_….sql` 就是生效了。

- 迁移失败：**不要删库、不要重建**。先看报错，修正 `schema/migrations/` 里的 SQL 后重跑（失败会保持原版本，可安全重试）。
- 迁移前后都要记录 `stats` 里的**错题数 / 卡片数**，汇报时用来自证"数据没丢"。

## 6. 自检

```bash
node 学习数据/scripts/wrong.mjs --help
node 学习数据/scripts/recite.mjs --help
node 学习数据/scripts/grab-image.mjs --list
```

再确认技能与命令数量对得上（`.kilo/skills/`、`.kilo/command/` 下的文件），以及 `git status` 是否干净。

## 7. 汇报（结论先行）

- 版本：`v旧 → v新`
- 改了什么：技能 / 命令 / 脚本 / schema，各一两句
- 迁移：是否执行、执行了哪些文件
- 数据：错题数与卡片数（升级前后一致）、笔记与图片未被动
- 兜底：备份在 `.upgrade-backup/<时间>/`；回滚办法是 `git reset --hard <升级前提交>` +
  从备份目录拷回被合并的文件
- **贴真实输出**，不要凭记忆说"升级成功"

## 硬约束

- 不 `git push`、不改 `git config`、不 `rebase`（避免重写学生历史）、不用 `stash`
- 不把 `.db`、图片加进版本管理（`.gitignore` 已排除，别去动）
- 升级只做一次合并；连续失败就停下来说明情况，不要反复试
