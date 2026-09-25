#!/usr/bin/env node
// 错题本存取脚本。用法见 `node 学习数据/scripts/wrong.mjs`（不带参数即打印帮助）。
import {
  addDays, applyReview, fail, fingerprint, INTERVALS, loadInput, normalizeImages, open, out, parseArgs, pick, table, today,
} from './db.mjs';

const HELP = `错题本 wrong.mjs
  add    记一道错题      node 学习数据/scripts/wrong.mjs add --subject 数学 --topic "导数·单调性" \\
                        --stem "原题干" --answer "(-1,1)" [--form 单选|填空|解答] \\
                        [--options "A. …\\nB. …"] [--drill "挖空后的题面 ____"] \\
                        [--my-answer "A"] [--analysis "要点"] [--cause 概念不清] [--difficulty 3] \\
                        [--source "2026春·周测3"] [--tags "导数,极值"] [--image "学习数据/图片/数学/x.png"]
                        长题干/长解析用 --json-file <UTF-8 JSON 文件> 或 --stdin，键名同上。
  due    今日到期错题    node 学习数据/scripts/wrong.mjs due [--limit 10] [--subject 数学]
  list   全部错题        node 学习数据/scripts/wrong.mjs list [--subject 数学] [--topic 加速度] [--all] [--limit 20]
                        --topic 是模糊匹配（知识点的一半就行），用于讲解前查"他在这个点上错过什么"
  get    查看一道         node 学习数据/scripts/wrong.mjs get <id>
  review 记录复习结果    node 学习数据/scripts/wrong.mjs review <id> --result pass|fail [--note "..."]
  reset  重新开始计时    node 学习数据/scripts/wrong.mjs reset <id>
  stats  统计（含按章节） node 学习数据/scripts/wrong.mjs stats
  remove 删除            node 学习数据/scripts/wrong.mjs remove <id> --yes
通用：追加 --json 输出 JSON（供 AI 解析）。
题型：单选（必须给 options）/ 填空（必须给 drill，用 ____ 挖空）/ 解答（默认，用于压轴大题）。`;

const FORMS = ['单选', '填空', '解答'];

const COLS = [
  { key: 'id', label: 'id', max: 5 },
  { key: 'subject', label: '学科', max: 6 },
  { key: 'topic', label: '知识点', max: 16 },
  { key: 'form', label: '题型', max: 6 },
  { key: 'due_date', label: '下次复习', max: 10 },
  { key: 'stage', label: '档', max: 3 },
  { key: 'status', label: '状态', max: 8 },
  { key: 'drill', label: '题面', max: 36 },
];

const statusOf = (r) => (r.mastered ? '已掌握' : r.due_date <= today() ? '待复习' : '计划中');

const rowOf = (r) => ({
  id: r.id,
  subject: r.subject,
  topic: r.topic,
  form: r.form,
  due_date: r.due_date,
  stage: r.stage,
  status: statusOf(r),
  drill: r.drill || r.stem,
});

function show(db, id, flags) {
  const r = db.prepare('SELECT * FROM wrong_questions WHERE id = ?').get(id);
  if (!r) fail(`找不到 id=${id} 的错题`);
  const reviews = db
    .prepare('SELECT reviewed_at, result, stage_after FROM wrong_reviews WHERE question_id = ? ORDER BY id')
    .all(id);
  if (flags.json) {
    console.log(JSON.stringify({ ok: true, meta: null, data: { ...r, reviews } }, null, 2));
    return;
  }
  console.log(`#${r.id}  [${r.subject}] ${r.topic} · ${r.form}   ${statusOf(r)}（下次 ${r.due_date}，档 ${r.stage}/${INTERVALS.length}，连对 ${r.streak}，错 ${r.lapses} 次）`);
  console.log(`原题干：${r.stem}`);
  if (r.options) console.log(`选项：${r.options.split('\n').join('  ')}`);
  if (r.drill) console.log(`自测题面：${r.drill}`);
  console.log(`标准答案：${r.answer}    我的答案：${r.my_answer ?? '—'}`);
  if (r.analysis) console.log(`解析要点：${r.analysis}`);
  console.log(`错因：${r.cause ?? '—'}    难度：${r.difficulty}    来源：${r.source ?? '—'}    标签：${r.tags ?? '—'}`);
  if (r.image) console.log(`图片：${r.image}`);
  console.log(`记录于 ${r.created_at}，更新于 ${r.updated_at}`);
  console.log(reviews.length ? `复习记录：${reviews.map((v) => `${v.reviewed_at} ${v.result}`).join('，')}` : '复习记录：无');
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const flags = args.flags;

if (!cmd || flags.help) {
  console.log(HELP);
  process.exit(0);
}

const CAUSES = ['概念不清', '计算失误', '审题偏差', '方法不会', '粗心', '时间不够', '其他'];

switch (cmd) {
  case 'add': {
    const input = loadInput(flags);
    const subject = pick(flags, input, 'subject', { required: true });
    const topic = pick(flags, input, 'topic', { required: true });
    const stem = pick(flags, input, 'stem', { required: true });
    const form = pick(flags, input, 'form', { fallback: '解答' });
    if (!FORMS.includes(form)) fail(`--form 需为：${FORMS.join(' / ')}`);
    const options = pick(flags, input, 'options');
    const drill = pick(flags, input, 'drill');
    if (form === '单选' && !options) fail('单选必须给 --options（每行一个选项：A. …）');
    if (form === '填空' && (!drill || !String(drill).includes('____'))) fail('填空必须给 --drill，并用 ____ 标出空位');
    const answer = pick(flags, input, 'answer', { required: true });
    const cause = pick(flags, input, 'cause');
    if (cause && !CAUSES.includes(cause)) fail(`错因需为：${CAUSES.join(' / ')}`);
    const difficulty = Number(pick(flags, input, 'difficulty', { fallback: 3 }));
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) fail('--difficulty 需为 1-5 的整数');
    const image = normalizeImages(pick(flags, input, 'image'));

    const db = open('wrongbook');
    const fp = fingerprint(subject, stem);
    const date = today();
    const fields = [
      topic, form, stem, options, drill, answer, pick(flags, input, 'my-answer'),
      pick(flags, input, 'analysis'), cause, difficulty, pick(flags, input, 'source'),
      pick(flags, input, 'tags'), image, date,
    ];
    const already = db.prepare('SELECT id FROM wrong_questions WHERE fp = ?').get(fp);

    if (already) {
      db.prepare(
        `UPDATE wrong_questions SET topic=?, form=?, stem=?, options=?, drill=?, answer=?, my_answer=?,
         analysis=?, cause=?, difficulty=?, source=?, tags=?, image=?, updated_at=? WHERE fp=?`
      ).run(...fields, fp);
      show(db, already.id, flags);
      if (!flags.json) console.log('（同一道题已存在，只更新了内容，复习进度保留）');
    } else {
      const due = addDays(date, INTERVALS[0]);
      const info = db
        .prepare(
          `INSERT INTO wrong_questions (topic, form, stem, options, drill, answer, my_answer, analysis, cause,
            difficulty, source, tags, image, updated_at, fp, subject, created_at, due_date, stage)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`
        )
        .run(...fields, fp, subject, date, due);
      show(db, Number(info.lastInsertRowid), flags);
      if (!flags.json) console.log(`（已加入错题本，${due} 首次复习）`);
    }
    db.close();
    break;
  }

  case 'due':
  case 'list': {
    const db = open('wrongbook');
    const where = [];
    const params = [];
    if (cmd === 'due') {
      where.push('mastered = 0', 'due_date <= ?');
      params.push(today());
    } else if (!flags.all) where.push('mastered = 0');
    for (const key of ['subject', 'form', 'cause']) {
      if (flags[key]) {
        where.push(`${key} = ?`);
        params.push(flags[key]);
      }
    }
    if (flags.topic) {
      where.push('topic LIKE ?');
      params.push(`%${flags.topic}%`);
    }
    const limit = Number.isFinite(Number(flags.limit)) ? Number(flags.limit) : 20;
    const rows = db
      .prepare(
        `SELECT * FROM wrong_questions ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY due_date, id LIMIT ?`
      )
      .all(...params, limit)
      .map(rowOf);
    out(rows, COLS, flags, cmd === 'due' ? `今日（${today()}）到期错题：` : '错题列表：');
    db.close();
    break;
  }

  case 'get': {
    const id = Number(args._[1]);
    if (!id) fail('用法：get <id>');
    const db = open('wrongbook');
    show(db, id, flags);
    db.close();
    break;
  }

  case 'review': {
    const id = Number(args._[1]);
    if (!id) fail('用法：review <id> --result pass|fail');
    const result = pick(flags, {}, 'result', { required: true });
    if (!['pass', 'fail'].includes(result)) fail('--result 需为 pass 或 fail');
    const db = open('wrongbook');
    const after = applyReview(db, 'wrong_questions', 'wrong_reviews', id, result, pick(flags, {}, 'note'));
    console.log(
      flags.json
        ? JSON.stringify({ ok: true, meta: null, data: after }, null, 2)
        : `#${after.id} ${result === 'pass' ? '✓ 通过' : '✗ 未通过'}：档 ${after.stage}，连对 ${after.streak}，` +
          (after.mastered ? '已掌握，移出复习队列' : `下次复习 ${after.due_date}`)
    );
    db.close();
    break;
  }

  case 'reset': {
    const id = Number(args._[1]);
    if (!id) fail('用法：reset <id>');
    const db = open('wrongbook');
    if (!db.prepare('SELECT id FROM wrong_questions WHERE id = ?').get(id)) fail(`找不到 id=${id} 的错题`);
    const due = addDays(today(), INTERVALS[0]);
    db.prepare('UPDATE wrong_questions SET mastered=0, stage=0, streak=0, due_date=?, updated_at=? WHERE id=?').run(
      due, today(), id
    );
    console.log(`#${id} 已重置，${due} 重新复习`);
    db.close();
    break;
  }

  case 'stats': {
    const db = open('wrongbook');
    const head = db
      .prepare(
        `SELECT COUNT(*) total, SUM(mastered=0) active, SUM(mastered=1) mastered,
                SUM(mastered=0 AND due_date <= ?) due FROM wrong_questions`
      )
      .get(today());
    const bySubject = db
      .prepare('SELECT subject, COUNT(*) n, SUM(mastered=1) mastered FROM wrong_questions GROUP BY subject ORDER BY n DESC')
      .all();
    const byChapter = db
      .prepare(
        `SELECT CASE WHEN instr(topic,'·')>0 THEN substr(topic,1,instr(topic,'·')-1) ELSE topic END chapter,
                COUNT(*) n, SUM(mastered=1) mastered, SUM(mastered=0 AND due_date<=?) due
         FROM wrong_questions GROUP BY chapter ORDER BY n DESC LIMIT 20`
      )
      .all(today());
    const byCause = db
      .prepare("SELECT COALESCE(cause,'未归类') cause, COUNT(*) n FROM wrong_questions GROUP BY cause ORDER BY n DESC")
      .all();
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, meta: null, data: { summary: head, bySubject, byChapter, byCause } }, null, 2));
      break;
    }
    console.log(`错题总数 ${head.total ?? 0}，待掌握 ${head.active ?? 0}，已掌握 ${head.mastered ?? 0}，今日到期 ${head.due ?? 0}`);
    console.log('\n按学科：');
    console.log(table(bySubject, [{ key: 'subject', label: '学科' }, { key: 'n', label: '错题数' }, { key: 'mastered', label: '已掌握' }]));
    console.log('\n按章节（topic 中 · 前一段）：');
    console.log(table(byChapter, [
      { key: 'chapter', label: '章节', max: 24 },
      { key: 'n', label: '错题数' },
      { key: 'due', label: '待复习' },
      { key: 'mastered', label: '已掌握' },
    ]));
    console.log('\n按错因：');
    console.log(table(byCause, [{ key: 'cause', label: '错因' }, { key: 'n', label: '数量' }]));
    db.close();
    break;
  }

  case 'remove': {
    const id = Number(args._[1]);
    if (!id) fail('用法：remove <id> --yes');
    if (!flags.yes) fail('删除不可恢复，请加 --yes 确认');
    const db = open('wrongbook');
    const info = db.prepare('DELETE FROM wrong_questions WHERE id = ?').run(id);
    console.log(info.changes ? `已删除 #${id}` : `找不到 id=${id}`);
    db.close();
    break;
  }

  default:
    fail(`未知命令 ${cmd}。运行不带参数查看帮助。`);
}
