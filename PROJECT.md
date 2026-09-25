# PROJECT.md · 边界与速查

> 本文件是工作区的"边界合同"。改行为先改这里，再改技能。
> 定位：**模板仓库**——仓库只放 harness（规则、技能、命令、脚本、目录骨架），
> 学生的错题/背诵/笔记等个人数据在本机生成，`.db` 文件不进版本库；
> `学生档案.md` 只含偏好与学情、随模板分发，学生若不想提交可自行加入 `.gitignore`。

## 一、边界三栏

| ✅ 做 | ❌ 不做 | ❓ 需先问学生 |
|---|---|---|
| 讲解题目与知识点，结构固定、面向高中生 | 不超纲讲解、不编造教材页码/真题年份/来源 | 学生要"只给答案"还是"讲思路"时 |
| 讲完顺手归档：默认提议，档案设为"直接记"时不问、不回禀，静默写入 | 学生未把该档案设为"直接记"时不自动写库；不批量写入；不自动新建学科文件夹 | 同一道题反复错、要不要合并成一张背诵卡 |
| 错题本/背诵本/缺口表一律经 `学习数据/scripts/*.mjs` 读写 | 不手改 `.db`、不绕过脚本改 schema、不删学生数据 | 删除记录（`remove`）必须先确认 |
| 笔记按「学科/专题」落到 `笔记本/<学科>/<专题>/` | 不建与学科无关的顶层文件夹、不把资料写进笔记 | 一题涉及多科时归到哪一科 |
| 资料库查不到就现讲，并把结论沉淀回 `资料/<学科>/index.md` | 不把 `资料/` 变成日记/过程记录 | 无 |
| 数据全部留在本地 | 不上传学生数据、不接外部数据库 | 无 |
| 提问优先用选项式（学生点选，降低表达成本） | 有对错的问题里不出现"（推荐）"、不用预选默认值、description 不解释为什么对 | 学生想直接说时就改回对话，不追着让他选 |
| 图片存 `学习数据/图片/<学科>/`，优先用 `grab-image.mjs` 抓取粘贴的图 | 不覆盖/裁剪学生原图；不为缺图而拒绝记录；不改动 Kilo 会话库 | 抓取失败时（说明情况让学生另存，照常记录） |
| 学生明确说"以后都…"时更新 `学生档案.md` 档位 | 不因单次要求改全局偏好、不替学生猜档位 | 分不清单次还是长期时先问一句 |

## 二、命令

| 命令 | 用途 | 对应技能 |
|---|---|---|
| `/explain <题目或知识点>` | 讲解（默认动作） | `tutor` |
| `/wrong` | 把刚才的错题写进错题本 | `wrongbook` |
| `/recite` | 把知识点做成背诵卡 / 抽背 | `recitation` |
| `/review` | 抽今日到期的错题 + 背诵卡 | `wrongbook` + `recitation` |
| `/note` | 把一段知识整理成笔记落进学科文件夹 | `notebook` |
| `/stats` | 查看错题/背诵本统计 | `study-data` |
| `/upgrade` | 从上游同步 harness（学生数据、笔记不动） | `upgrade` |

## 三、目录约定

```
README.md                  学生向：怎么装、怎么开始、数据在哪（只指路，细节留在 AI 侧）
AGENTS.md                  AI 行为总则（自动加载）
PROJECT.md                 本文件：边界三栏 + 命令 + 速查
学生档案.md                学生偏好：讲解风格四档（含互动形式）+ 归档积极程度三条 + 备注 + 学情（已由 kilo.json 登记自动加载）
kilo.json                  权限（仅放行 学习数据/scripts 下的 node 调用）+ instructions 登记
harness.json               版本号 + 升级文件清单（upgradeable / merge_by_rule / never_touch）
.kilo/agent/chief.md       总指挥人格（primary）
.kilo/command/*.md         斜杠命令
.kilo/skills/<name>/SKILL.md   tutor / onboarding / wrongbook / recitation / notebook / study-data / upgrade
学习数据/schema/*.sql      新库建表语句（唯一 schema 来源）
学习数据/schema/migrations/<库>/NNN_*.sql   已有库的结构变更（开库自动执行，库内 meta 记版本）
学习数据/scripts/*.mjs     db.mjs（底层）、wrong.mjs、recite.mjs、gap.mjs（缺口）、grab-image.mjs（抓粘贴的图）
学习数据/*.db              运行期生成，已被 .gitignore 排除
学习数据/图片/<学科>/      错题、背诵卡用的图片（命名 用途-YYYYMMDD-序号.扩展名；.grabbed.json 防重复抓取；不进版本库）
笔记本/<学科>/index.md      学科目录页（按专题汇总的表格）
笔记本/<学科>/<专题>/<笔记>.md  三层结构：学科 / 专题 / 笔记
资料/<学科>/index.md        知识点索引（AI 查不到就现讲，然后补进来）
资料/教材目录.md            人教版高中教材目录（数学·物理·化学·生物，必修+选必），查章节名用 grep，别整篇读
资料/通用/                  答题模板、学习方法
```

笔记本目前**只建数学、物理、化学**三科文件夹；学生要记的学科不在其中时，先问是否新建该科文件夹（见 `notebook` 技能），不要默默新建。**专题**文件夹按需创建（第一次写笔记时），不预建空目录。

错题本/背诵本是扁平的数据库记录，`--subject` 可填九科任意一科：语文、数学、英语、物理、化学、生物、政治、历史、地理。

## 四、脚本速查

零依赖（Node 内置 `node:sqlite`），必须在仓库根目录执行，路径用正斜杠。
追加 `--json` 可得结构化结果（AI 解析用）；长题干/长答案用 `--json-file <utf8文件>` 传，避免转义问题。

```bash
# 错题本（form：单选必须给 options；填空必须给 drill 且含 ____；解答为默认，answer 必填）
node 学习数据/scripts/wrong.mjs add --subject 物理 --topic "牛顿第二定律" --form 单选 \
     --stem "原题干（保真）" --options "A. …
B. …
C. …
D. …" --answer "B" --my-answer "A" --analysis "要点 ≤3 行" \
     --cause 审题偏差 --difficulty 2 [--image "学习数据/图片/物理/错题-20260925-01.png"]
node 学习数据/scripts/wrong.mjs add --subject 数学 --topic "导数·单调性" --form 填空 \
     --stem "原题" --drill "f'(x)<0 ⇒ ____<x<____" --answer "-1|1"
node 学习数据/scripts/wrong.mjs add --subject 数学 --topic "圆锥曲线·定点" --form 解答 \
     --stem "压轴题原题干" --answer "定点 (2,0)" --analysis "1. … 2. … 3. …"
node 学习数据/scripts/wrong.mjs due [--limit 10] [--subject 数学]   # 今日到期
node 学习数据/scripts/wrong.mjs list [--all] [--subject 数学] [--form 填空]
node 学习数据/scripts/wrong.mjs get <id>
node 学习数据/scripts/wrong.mjs review <id> --result pass|fail [--note "..."]
node 学习数据/scripts/wrong.mjs reset <id>        # 重新计时
node 学习数据/scripts/wrong.mjs remove <id> --yes
node 学习数据/scripts/wrong.mjs stats             # 含「按章节」，用来看哪章薄弱

# 背诵本（正面 = 问题；反面 = 答案，分点/表格、≤5 行；hook = 记忆钩子）
node 学习数据/scripts/recite.mjs add --subject 化学 --topic "氧化还原反应" --kind 概念 \
     --front "氧化剂发生什么变化？" --back "1. 得电子
2. 化合价降低
3. 被还原" --hook "升失氧、降得还" --source "错题 #12"
node 学习数据/scripts/recite.mjs due | list | get | review | reset | remove | stats

# 缺口（查缺补漏主线：缺 → 补 → 强 → 已掌握；状态只由证据推进）
node 学习数据/scripts/gap.mjs add --subject 物理 --topic "运动的描述·加速度" \
     --title "加速度公式不熟" --cause 概念不清 --evidence 3
node 学习数据/scripts/gap.mjs fill <id> --action "讲解 + 做成卡 #7"
node 学习数据/scripts/gap.mjs verify <id> --result pass|fail
node 学习数据/scripts/gap.mjs board | due | list | get <id> | stats

# 图片：把对话框里粘贴的图抓出来（只读 Kilo 会话库；幂等；失败则请学生另存）
node 学习数据/scripts/grab-image.mjs --list                      # 看候选
node 学习数据/scripts/grab-image.mjs --subject 物理 --purpose 错题   # 落 学习数据/图片/物理/错题-YYYYMMDD-01.png
```

- 错因只能是：`概念不清 / 计算失误 / 审题偏差 / 方法不会 / 粗心 / 时间不够 / 其他`。
- 卡片类型：`概念 / 公式 / 古文 / 文言实词 / 英语单词 / 英语词组 / 时间线 / 答题模板 / 其他`。
- 图片放 `学习数据/图片/<学科>/`，`--image` 传相对仓库根路径（绝对路径会被自动规整），多张用 `;` 分隔。
- 题目/卡片指纹由「学科 + 归一化题干/正面」生成，**重复录入不会产生新行**，只更新内容并保留复习进度。
- 题型改造纪律见 `wrongbook` 技能第 3 节：`stem` 永远保真，改造只动 `drill`；压轴大题不硬套选择/填空。

## 五、复习调度

间隔重复阶梯 `1 / 3 / 7 / 15 / 30` 天（`学习数据/scripts/db.mjs` 中 `INTERVALS`）：

- 新录入：档 0，次日首次复习。
- 答对 `pass`：档 +1，到期日 = 今天 + 该档间隔；走到 30 天档即标记"已掌握"，移出队列。
- 答错 `fail`：档归 0、连对清零、累计错误 +1，明天再来。
- 学生说"这题我早会了"：用 `reset` 重新计时，或 `review pass` 推进档位。

## 六、当前状态

- [x] harness 骨架：AGENTS.md、PROJECT.md、kilo.json、目录骨架（笔记本 3 科 / 资料 9 科）
- [x] 错题本 / 背诵本 / 缺口表 schema 与脚本（已实跑自证）
- [x] 技能：tutor、wrongbook、recitation、notebook、study-data
- [x] 命令：explain、wrong、recite、review、note、stats
- [x] 学生档案：讲解风格四档（互动频率 / 信息密度 / 引导强度 / 互动形式）+ 归档积极程度三条（错题本 / 背诵本 / 笔记本）+ 备注 + 学情，经 `instructions` 自动加载
- [x] 互动规范：优先点选、选项不泄露答案、**description 默认留空**（AGENTS.md「互动要求」+ tutor 技能第 1 节）
- [x] 教学节奏：**"一步一步"改节奏不改信息量**（路线图 + 进度标注 + 连续答对就合并、代数不跳步、机械动作不提问、同题不重讲）——tutor 技能 §3
- [x] 讲解质量：**禁止跳步**（每个等式可复现）、"哪来的"给三件套、符号超载就降维、只问为什么/往哪走、"你再想想"最多一次、出新题必验证 —— tutor 技能 §3
- [x] 缺口表（**AI 内部机制，不向学生暴露**）：`gaps.db` + `gap.mjs`（缺/补/强/已掌握 + 事件流 + 反复计数）；状态只由证据推进，计算失误/粗心不建缺口
- [x] 出题纪律：**出题前先问**（选项"来一道 / 先不用"），学生不想练就翻篇；只有他主动要求或说"我会了"要验证时才提议 —— tutor 技能 §3 + AGENTS.md
- [x] 模式判定：**题的问题 → 讲题（逐步）；知识点的问题 → 讲课（离开题、连续讲完一个模块，不用问答推推导）** —— tutor 技能 §2
- [x] 公式写法：**聊天里没有行内公式**（`$...$` 不渲染；`\(...\)` 会独占一行居中撑高）→ 句子内纯文本、复杂公式单独成段 `$$...$$`；`.md` 文件不受限
- [x] 首次使用引导：`学习数据/` 下无 `.db` 时，AI 用一屏介绍 + **只问 1 个问题**（其余讲完第一道题再问），流程见 `onboarding` 技能
- [x] 升级机制：`harness.json` 版本与文件分级 + `schema/migrations/` 自动迁移 + `/upgrade` 命令与 `upgrade` 技能
- [ ] 资料库内容：骨架已建，知识点随真实提问陆续沉淀

## 七、升级（发布与同步）

- 版本号在 `harness.json` 的 `version`。**改 harness 时同步 +1**；动了表结构还要加迁移（纪律见 `学习数据/schema/migrations/README.md`）。
- 学生安装：`git clone <上游地址>`（想要自己的远程备份就 fork）。
  **不要用 GitHub 的 "Use this template"** —— 它会把历史压成一个提交，之后合并上游要 `--allow-unrelated-histories` 且冲突面更大。
- 学生升级：说一句"升级"，AI 按 `.kilo/skills/upgrade/SKILL.md` 执行
  `fetch → 预览 → 备份 → 合并 → 迁移 → 自检 → 汇报`。
- 文件分级以 `harness.json` 为准：`upgradeable` 取上游、`merge_by_rule` 人工合并（去重/保留学生值）、`never_touch` 绝不触碰。
- 升级前副本放 `.upgrade-backup/<时间>/`（已 gitignore）；回滚 = `git reset --hard <升级前提交>` + 从备份拷回被合并的文件。
- **学生的错题、背诵、图片、笔记正文永不参与升级**；升级脚本/schema 后由 `db.mjs` 自动迁移，不删库不重建。
