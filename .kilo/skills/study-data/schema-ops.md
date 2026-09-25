# study-data 运维手册（用到再读）

正常讲课、记错题、复习**都不需要**看这个文件。只有这几种情况要读：
改表结构（加字段）、数据对不上（重复行）、环境报错、要给学生看某个字段的含义。

## schema 变更纪律

1. 改 `学习数据/schema/<库>.sql`（新库建表语句），并把 `db.mjs` 的 `SCHEMA_VERSION.<库>` +1；
2. **已存在的库不会自动加列**（`CREATE TABLE IF NOT EXISTS` 只管建表），必须写迁移：
   `学习数据/schema/migrations/<库>/<新版本号>_<名字>.sql`，开库时自动执行，库内 `meta.schema_version` 记版本；
3. 迁移写成"只加不删"，需要搬数据就在后面跟一条 `UPDATE`；
4. 改完**必须造一个旧版本库实跑一遍**（老数据不丢、`list`/`stats` 正常），再交给学生用。

完整规范见 `学习数据/schema/migrations/README.md`。**不要**为了加字段删库重建——那会丢学生全部复习进度。

## schema 字段速查

- `wrong_questions`：`form`(单选/填空/解答)、`stem`(保真原题)、`options`(单选)、`drill`(挖空题面)、
  `answer`(自测答案，必填)、`my_answer`、`analysis`、`cause`、`difficulty`、`source`、`tags`、`image`、
  `fp`、`created_at/due_date/stage/streak/lapses/mastered/updated_at`。
- `recite_cards`：`front`(正面/问题)、`back`(反面/答案)、`hook`(记忆钩子)、`hint`、`kind`、`source`、`image` + 同上调度字段。
- `gaps`：`title`、`status`(缺/补/强/已掌握)、`cause`、`evidence`(来源错题 id)、`action`、`regressions`、
  `stage/due_date`、`found_at/filled_at/strong_at/mastered_at`；事件流在 `gap_events`。

## 备份与排错

- 备份：整个 `学习数据/*.db` 复制一份即可（等脚本跑完再拷）。
- 想看内容：用 `list --all` / `get <id>` / `stats`，**不要打开 `.db`**。
- `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite` → Node 太旧，升到 22.5+。
- 中文乱码 → 通常是终端编码，不是数据；脚本本身按 UTF-8 读写。
- 指纹对不上（出现重复行）→ `list --all` 找旧行 `remove <id> --yes`（须学生同意）。
- **PowerShell 陷阱**：一行命令里塞 `$`、反引号、中文正则会被吃掉或报错（实测多次）；
  复杂内容改用 `--json-file` 或写进临时脚本，别硬塞一行。
- **`.cmd` / `.bat` 里不要出现中文**：cmd 会在 `chcp` 生效前按 GBK 解码，中文的某个字节可能被当成
  命令分隔符，把后半句当命令执行（实测报 `'o' 不是内部或外部命令`）。启动脚本一律**纯 ASCII**，
  路径用 `%~dp0` 让 cmd 自己填；行尾必须是 CRLF。
