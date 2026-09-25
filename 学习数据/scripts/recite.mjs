#!/usr/bin/env node
// 背诵本存取脚本。用法见 `node 学习数据/scripts/recite.mjs`（不带参数即打印帮助）。
import {
  addDays, applyReview, fail, fingerprint, INTERVALS, loadInput, normalizeImages, open, out, parseArgs, pick, table, today,
} from './db.mjs';

const HELP = `背诵本 recite.mjs
  add    加一张卡        node 学习数据/scripts/recite.mjs add --subject 英语 --topic "必修一 Unit3" \\
                        --front "abandon 的意思" --back "vt. 放弃；抛弃" [--kind 英语单词] \\
                        [--hook "a-ban-don：被 ban 掉就放弃了"] [--hint "..."] [--source "错题 #12"] \\
                        [--image "学习数据/图片/英语/x.png"]
                        长内容用 --json-file <UTF-8 JSON 文件> 或 --stdin 传 JSON，键名同上。
  due    今日抽背        node 学习数据/scripts/recite.mjs due [--limit 20] [--subject 英语]
  list   卡片列表        node 学习数据/scripts/recite.mjs list [--subject 英语] [--topic Unit3] [--all]
                        --topic 是模糊匹配
  get    查看一张         node 学习数据/scripts/recite.mjs get <id>
  review 记录背诵结果    node 学习数据/scripts/recite.mjs review <id> --result pass|fail [--note "..."]
  reset  重新开始计时    node 学习数据/scripts/recite.mjs reset <id>
  stats  统计            node 学习数据/scripts/recite.mjs stats
  remove 删除            node 学习数据/scripts/recite.mjs remove <id> --yes
通用：追加 --json 输出 JSON（供 AI 解析）。
kind 取值：概念 / 公式 / 古文 / 文言实词 / 英语单词 / 英语词组 / 时间线 / 答题模板 / 其他`;

const KINDS = ['概念', '公式', '古文', '文言实词', '英语单词', '英语词组', '时间线', '答题模板', '其他'];

const COLS = [
  { key: 'id', label: 'id', max: 5 },
  { key: 'subject', label: '学科', max: 6 },
  { key: 'kind', label: '类型', max: 8 },
  { key: 'topic', label: '知识点', max: 16 },
  { key: 'due_date', label: '下次复习', max: 10 },
  { key: 'stage', label: '档', max: 3 },
  { key: 'status', label: '状态', max: 8 },
  { key: 'front', label: '提示面', max: 36 },
];

const statusOf = (r) => (r.mastered ? '已掌握' : r.due_date <= today() ? '待背' : '计划中');

const rowOf = (r) => ({
  id: r.id,
  subject: r.subject,
  kind: r.kind,
  topic: r.topic,
  due_date: r.due_date,
  stage: r.stage,
  status: statusOf(r),
  front: r.front,
});

function show(db, id, flags) {
  const r = db.prepare('SELECT * FROM recite_cards WHERE id = ?').get(id);
  if (!r) fail(`找不到 id=${id} 的卡片`);
  const reviews = db
    .prepare('SELECT reviewed_at, result, stage_after FROM recite_reviews WHERE card_id = ? ORDER BY id')
    .all(id);
  if (flags.json) {
    console.log(JSON.stringify({ ok: true, meta: null, data: { ...r, reviews } }, null, 2));
    return;
  }
  console.log(`#${r.id}  [${r.subject}] ${r.topic} · ${r.kind}   ${statusOf(r)}（下次 ${r.due_date}，档 ${r.stage}/${INTERVALS.length}，连对 ${r.streak}，忘 ${r.lapses} 次）`);
  console.log(`提示面：${r.front}`);
  console.log(`答案面：${r.back}`);
  if (r.hint) console.log(`提示：${r.hint}`);
  if (r.hook) console.log(`记忆钩子：${r.hook}`);
  if (r.image) console.log(`图片：${r.image}`);
  console.log(`来源：${r.source ?? '—'}    记录于 ${r.created_at}，更新于 ${r.updated_at}`);
  console.log(reviews.length ? `背诵记录：${reviews.map((v) => `${v.reviewed_at} ${v.result}`).join('，')}` : '背诵记录：无');
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const flags = args.flags;

if (!cmd || flags.help) {
  console.log(HELP);
  process.exit(0);
}

switch (cmd) {
  case 'add': {
    const input = loadInput(flags);
    const subject = pick(flags, input, 'subject', { required: true });
    const topic = pick(flags, input, 'topic', { required: true });
    const front = pick(flags, input, 'front', { required: true });
    const back = pick(flags, input, 'back', { required: true });
    const kind = pick(flags, input, 'kind', { fallback: '概念' });
    if (!KINDS.includes(kind)) fail(`--kind 需为：${KINDS.join(' / ')}`);

    const db = open('recite');
    const fp = fingerprint(subject, front);
    const date = today();
    const hint = pick(flags, input, 'hint');
    const hook = pick(flags, input, 'hook');
    const source = pick(flags, input, 'source');
    const image = normalizeImages(pick(flags, input, 'image'));
    const already = db.prepare('SELECT id FROM recite_cards WHERE fp = ?').get(fp);
    if (already) {
      db.prepare(
        'UPDATE recite_cards SET topic=?, kind=?, back=?, hook=?, hint=?, source=?, image=?, updated_at=? WHERE fp=?'
      ).run(topic, kind, back, hook, hint, source, image, date, fp);
      show(db, already.id, flags);
      if (!flags.json) console.log('（同一张卡已存在，只更新了内容，背诵进度保留）');
    } else {
      const due = addDays(date, INTERVALS[0]);
      const info = db
        .prepare(
          `INSERT INTO recite_cards (fp, subject, topic, kind, front, back, hook, hint, source, image, created_at, due_date, stage, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)`
        )
        .run(fp, subject, topic, kind, front, back, hook, hint, source, image, date, due, date);
      show(db, Number(info.lastInsertRowid), flags);
      if (!flags.json) console.log(`（已加入背诵本，${due} 首次抽背）`);
    }
    db.close();
    break;
  }

  case 'due':
  case 'list': {
    const db = open('recite');
    const where = [];
    const params = [];
    if (cmd === 'due') {
      where.push('mastered = 0', 'due_date <= ?');
      params.push(today());
    } else if (!flags.all) where.push('mastered = 0');
    for (const key of ['subject', 'kind']) {
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
        `SELECT * FROM recite_cards ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY due_date, id LIMIT ?`
      )
      .all(...params, limit)
      .map(rowOf);
    out(rows, COLS, flags, cmd === 'due' ? `今日（${today()}）待背 ${rows.length} 张：` : '背诵卡片：');
    db.close();
    break;
  }

  case 'get': {
    const id = Number(args._[1]);
    if (!id) fail('用法：get <id>');
    const db = open('recite');
    show(db, id, flags);
    db.close();
    break;
  }

  case 'review': {
    const id = Number(args._[1]);
    if (!id) fail('用法：review <id> --result pass|fail');
    const result = pick(flags, {}, 'result', { required: true });
    if (!['pass', 'fail'].includes(result)) fail('--result 需为 pass 或 fail');
    const db = open('recite');
    const after = applyReview(db, 'recite_cards', 'recite_reviews', id, result, pick(flags, {}, 'note'));
    console.log(
      flags.json
        ? JSON.stringify({ ok: true, meta: null, data: after }, null, 2)
        : `#${after.id} ${result === 'pass' ? '✓ 背出' : '✗ 没背出'}：档 ${after.stage}，连对 ${after.streak}，` +
          (after.mastered ? '已掌握，移出抽背队列' : `下次抽背 ${after.due_date}`)
    );
    db.close();
    break;
  }

  case 'reset': {
    const id = Number(args._[1]);
    if (!id) fail('用法：reset <id>');
    const db = open('recite');
    if (!db.prepare('SELECT id FROM recite_cards WHERE id = ?').get(id)) fail(`找不到 id=${id} 的卡片`);
    const due = addDays(today(), INTERVALS[0]);
    db.prepare('UPDATE recite_cards SET mastered=0, stage=0, streak=0, due_date=?, updated_at=? WHERE id=?').run(
      due, today(), id
    );
    console.log(`#${id} 已重置，${due} 重新抽背`);
    db.close();
    break;
  }

  case 'stats': {
    const db = open('recite');
    const head = db
      .prepare(
        `SELECT COUNT(*) total, SUM(mastered=0) active, SUM(mastered=1) mastered,
                SUM(mastered=0 AND due_date <= ?) due FROM recite_cards`
      )
      .get(today());
    const bySubject = db
      .prepare("SELECT subject, COUNT(*) n, SUM(mastered=1) mastered, SUM(mastered=0 AND due_date <= ?) due FROM recite_cards GROUP BY subject ORDER BY n DESC")
      .all(today());
    const byKind = db.prepare('SELECT kind, COUNT(*) n FROM recite_cards GROUP BY kind ORDER BY n DESC').all();
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, meta: null, data: { summary: head, bySubject, byKind } }, null, 2));
      break;
    }
    console.log(`卡片总数 ${head.total ?? 0}，待掌握 ${head.active ?? 0}，已掌握 ${head.mastered ?? 0}，今日待背 ${head.due ?? 0}`);
    console.log('\n按学科：');
    console.log(table(bySubject, [
      { key: 'subject', label: '学科' },
      { key: 'n', label: '卡片数' },
      { key: 'due', label: '今日待背' },
      { key: 'mastered', label: '已掌握' },
    ]));
    console.log('\n按类型：');
    console.log(table(byKind, [{ key: 'kind', label: '类型' }, { key: 'n', label: '数量' }]));
    db.close();
    break;
  }

  case 'remove': {
    const id = Number(args._[1]);
    if (!id) fail('用法：remove <id> --yes');
    if (!flags.yes) fail('删除不可恢复，请加 --yes 确认');
    const db = open('recite');
    const info = db.prepare('DELETE FROM recite_cards WHERE id = ?').run(id);
    console.log(info.changes ? `已删除 #${id}` : `找不到 id=${id}`);
    db.close();
    break;
  }

  default:
    fail(`未知命令 ${cmd}。运行不带参数查看帮助。`);
}
