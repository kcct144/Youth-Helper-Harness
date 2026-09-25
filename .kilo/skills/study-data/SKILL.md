---
name: study-data
description: 学习数据底层手册：错题本/背诵本的脚本命令、schema、去重与复习调度、备份与排错。任何要读写学习数据、或想知道"能不能手改 .db"的时候加载本技能。
---

# study-data · 数据层手册

错题本与背诵本都存在本机 SQLite 文件里，**唯一入口**是 `学习数据/scripts/` 下的 Node 脚本。
禁止直接编辑 `.db`、禁止手写 SQL 绕开脚本（会破坏指纹去重与复习调度）。

- `学习数据/scripts/db.mjs` —— 底层：开库、建表、日期、指纹、参数解析、表格输出。不直接调用。
- `学习数据/scripts/wrong.mjs` —— 错题本。
- `学习数据/scripts/recite.mjs` —— 背诵本。
- `学习数据/schema/*.sql` —— 建表语句，**schema 的唯一来源**，每次开库自动执行（`CREATE TABLE IF NOT EXISTS`）。

完整命令速查见 `PROJECT.md` 第四节；业务规则见 `wrongbook` / `recitation` 技能。

## 环境

- Node ≥ 22.5（本机实测 v24，`node:sqlite` 内置），**零依赖**：不需要 `npm install`，仓库里不会有 `package.json`。
- 必须在**仓库根目录**执行，脚本用相对路径 `学习数据/scripts/...`。
- 库文件首次写入时自动创建：`学习数据/wrongbook.db`、`学习数据/recite.db`（已被 `.gitignore` 排除）。

## 用法要点

- 追加 `--json` → 输出 `{ok, meta, data}` 结构化结果，适合 AI 解析后再组织成人话。
- 长题干/长答案用 `--json-file <UTF-8 文件>`（键名同 `--xxx` 参数，如 `my-answer`），
  避免引号换行被 shell 吃掉；也支持 `--stdin`。JSON 允许带 BOM。
- 不带参数运行任一脚本 → 打印该脚本的帮助。
- 出错时退出码为 1，并把 `✗ 原因` 打到 stderr。

## 去重（重要）

`fp` = `sha1(学科 + 归一化文本)` 前 16 位（题目用题干，卡片用提问面）。
归一化会去掉所有空白与中英文标点，所以**同一道题换个写法录入不会重复**。
冲突时只更新内容字段（知识点、答案、错因…），`due_date / stage / streak` 等复习进度**保留**。
因此"改错因""补答案"的正确做法就是：原样再跑一次 `add`。

## 复习调度

阶梯 `1 / 3 / 7 / 15 / 30` 天，定义在 `db.mjs` 的 `INTERVALS`：

- 新记录：档 0，次日首次到期。
- `pass`：档 +1，到期 = 今天 + 新档间隔；档位走到 30 天后 `mastered = 1`，退出队列。
- `fail`：档归 0、`streak` 清零、`lapses` +1，明天再来。
- 每次复习都会在 `wrong_reviews` / `recite_reviews` 留痕，`get <id>` 可看到历史。

## schema 变更

1. 改 `学习数据/schema/<name>.sql`；
2. 已存在的列不会自动加上（`IF NOT EXISTS` 只管建表），需另写一次性迁移：
   `node -e "..."` 或在 `schema/` 下加 `migrations/<日期>.sql` 并手动执行一次；
3. 改完必须用一条 `add` + `list --json` 实跑验证，再让学生继续用。

**不要**为了加字段直接删库重建——那会丢学生全部复习进度。

## 备份与排错

- 备份：整个 `学习数据/*.db` 复制一份即可（可先 `db.close()`，即等脚本跑完）。
- 想给学生看内容：用 `list --all` / `get <id>` / `stats`，不要打开 `.db`。
- 报错 `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` → Node 版本太旧，升级到 22.5+。
- 中文乱码 → 确认终端为 UTF-8；脚本本身按 UTF-8 读写，问题通常在终端而不是数据。
- 指纹对不上（重复行）→ 用 `list --all` 找出旧行 `remove <id> --yes`（须学生同意），或直接用 `get` 对比。

## 图片与附件

- 图片统一放 `学习数据/图片/<学科>/`，命名 `用途-YYYYMMDD-序号.扩展名`；该目录已被 `.gitignore` 排除（只放行 `README.md`）。
- **`grab-image.mjs`：把对话框里粘贴或拖进来的图片抓出来落盘**（只读 Kilo 会话库）：

  ```bash
  node 学习数据/scripts/grab-image.mjs --list                       # 看候选（标注 粘贴/文件）
  node 学习数据/scripts/grab-image.mjs --subject 物理 --purpose 错题
  node 学习数据/scripts/grab-image.mjs --probe                      # 抓不到时：打印附件真实形状
  # 选项：--minutes 60（0=不限）--limit 1 --dry-run --json --session <id> --db <path>
  ```

  两种附件形态都支持：**粘贴/截图**（base64 data URL）与**拖拽文件**（磁盘路径）。
  抓取失败且 `--list` 也没候选时，跑 `--probe` 看 part 形状再决定怎么改脚本 —— 不要靠猜。

  幂等：同一张图重复抓取返回原路径，不重复落盘（`学习数据/图片/.grabbed.json` 记录 partId→路径）。
  失败时退出码 1 并提示原因 → 回退到"请学生另存"。
- `--image` 存**相对仓库根的路径**（正斜杠），多张用 `;` 分隔。脚本会自动把传入的绝对路径规整成相对路径；
  不在 `学习数据/图片/` 下时会打印一行 `! 建议…` 提醒，但**不阻断**写入。
- 学生原图只读；需要标注就另存一份，不覆盖原文件。
- 实现说明：Kilo 把粘贴的图以 base64 存在会话库 `part.data`（`{"type":"file","mime":"image/png","url":"data:…"}`）。
  这是 Kilo 内部结构，**升级后可能失效**——脚本已做到失败即回退，不要把它当唯一路径。

## schema 字段速查（v2）

- `wrong_questions`：`form`(单选/填空/解答)、`stem`(保真原题)、`options`(单选)、`drill`(挖空题面)、
  `answer`(自测答案，`answer` 必填)、`my_answer`、`analysis`、`cause`、`difficulty`、`source`、`tags`、`image`。
- `recite_cards`：`front`(正面/问题)、`back`(反面/答案)、`hook`(记忆钩子)、`hint`、`kind`、`source`、`image`。
- 两者的 `fp` 去重规则、`due_date/stage/streak/lapses/mastered` 调度字段含义不变（见下两节）。

## 缺口表（查缺补漏强化）

`学习数据/gaps.db`：一个**知识点/能力**的掌握状态，是这个仓库的主线（缺 → 补 → 强 → 已掌握）。
错题是"证据"，背诵卡是"记忆点"，**缺口是它们的上位目录**。

```bash
node 学习数据/scripts/gap.mjs add --subject 物理 --topic "运动的描述·加速度" \
     --title "加速度公式不熟" --cause 概念不清 --evidence 3
node 学习数据/scripts/gap.mjs fill <id> --action "讲解 + 做成卡 #7" --kind 讲解
node 学习数据/scripts/gap.mjs verify <id> --result pass|fail
node 学习数据/scripts/gap.mjs due | list [--subject] [--status] | board | get <id> | stats
```

状态机（**只由证据推进**，不由 AI 感觉推进）：

| 转移 | 触发 |
|---|---|
| → 缺 | 错题暴露 / 学生自述 / 同一概念第 2 次卡 |
| 缺 → 补 | `fill`（讲解 / 做卡 / 笔记） |
| 补 → 强 | `verify pass` 第一次通过 |
| 强 → 已掌握 | 强阶段再连过 2 次（`stage` 到 3） |
| 已掌握 / 强 → 补 | **来了新错题**（自动回退，`regressions + 1`） |
| 补阶段 `verify fail` | 保持「补」，`due` 推到明天（不算回退） |

纪律：

- **只有「概念不清 / 方法不会 / 审题偏差」建缺口**；「计算失误 / 粗心 / 时间不够」不建——那是习惯问题。
- `topic` 与错题本、笔记专题、背诵卡 topic **用同一套命名**（章节简称·考点），三张表才天然对齐。
- `regressions > 0`（反复错的缺口）是最该优先处理的信号，`board` 与 `stats` 都会把它排在前面。

**这是 AI 的内部机制，不面向学生**：

- 不主动展示看板；对话里不要出现"缺口表""状态""回退""反复次数"这些词。
- 给学生结论时翻译成人话："这个点你已经错两次了，今天先过它"、"上次会了这次又错，说明没稳"。
- **没有 `/gap` 命令**（已删）——需要看板时自己跑 `gap.mjs`，只把结论讲出来。
- 学生主动问"我哪里弱"时可以用自然语言列清单，但同样不展示内部字段。
- 这个表是给你排优先级用的：先安排 `regressions > 0` 与 `due` 到期的，再安排其他的。

## 汇报纪律

每次跑完脚本，**把真实输出贴给学生**（可整理成表格，但数字与 `#id` 必须来自真实输出）。
不要凭记忆说"已记录"，也不要编造下次复习日期。

**唯一例外——"直接记"档**：当该档案的积极程度为"直接记"、且是 AI 自发归档（学生没要求）时，
**静默写入，不在回复里提**；学生问起再报 `#id` 与下次复习日期。
学生用 `/wrong`、`/recite` 等明确要求时，照常贴输出。
