#!/usr/bin/env node
// 缺口（查缺补漏强化）存取脚本。用法见 `node 学习数据/scripts/gap.mjs`（不带参数即打印帮助）。
import {
  addDays, applyGapVerify, fail, fingerprint, INTERVALS, loadInput, open, out, parseArgs, pick, table, today,
} from './db.mjs';

const HELP = `缺口 gap.mjs —— 「缺 → 补 → 强 → 已掌握」的状态记录
  add    新建/更新缺口   node 学习数据/scripts/gap.mjs add --subject 物理 --topic "运动的描述·加速度" \\
                        --title "加速度公式不熟" [--cause 概念不清] [--evidence 3] [--note "..."]
                        已有同知识点缺口时只更新来源；**已掌握/强的缺口来了新错题 → 自动回退到「补」并计一次反复**
  fill   记录"补"的动作  node 学习数据/scripts/gap.mjs fill <id> --action "讲解一遍 + 做成卡 #7" [--kind 讲解|做卡|笔记]
  verify 验证（证据推进） node 学习数据/scripts/gap.mjs verify <id> --result pass|fail [--note "..."]
                        通过：补→强；强连续通过 2 次→已掌握。未通过：退回"补"并计一次反复
  due    到期该验证的     node 学习数据/scripts/gap.mjs due [--limit 10]
  list   列表            node 学习数据/scripts/gap.mjs list [--subject 物理] [--status 补] [--all]
  board  按学科看板       node 学习数据/scripts/gap.mjs board [--all]
  get    查看一个（含事件流）node 学习数据/scripts/gap.mjs get <id>
  stats  统计            node 学习数据/scripts/gap.mjs stats
  remove 删除            node 学习数据/scripts/gap.mjs remove <id> --yes
通用：追加 --json 输出 JSON。
状态：缺（刚发现）→ 补（已讲过/做过卡）→ 强（至少一次验证通过）→ 已掌握（强阶段再连过 2 次）
纪律：**状态只由证据推进**（错题重做通过、卡片抽背 pass）；计算失误/粗心这类不建缺口。`;

const STATUSES = ['缺', '补', '强', '已掌握'];
const CAUSES = ['概念不清', '方法不会', '审题偏差'];
const ORDER = "CASE status WHEN '缺' THEN 0 WHEN '补' THEN 1 WHEN '强' THEN 2 ELSE 3 END";

const COLS = [
  { key: 'id', label: 'id', max: 5 },
  { key: 'subject', label: '学科', max: 6 },
  { key: 'title', label: '缺口', max: 26 },
  { key: 'status', label: '状态', max: 8 },
  { key: 'evidence', label: '来源错题', max: 12 },
  { key: 'regressions', label: '反复', max: 4 },
  { key: 'due_date', label: '下次验证', max: 10 },
];

const rowOf = (r) => ({
  id: r.id,
  subject: r.subject,
  topic: r.topic,
  title: r.title,
  status: r.status,
  evidence: r.evidence ? r.evidence.split(',').map((x) => `#${x}`).join(' ') : '—',
  regressions: r.regressions || 0,
  due_date: r.due_date || '—',
});

function logEvent(db, gapId, kind, fromStatus, toStatus, detail) {
  db.prepare('INSERT INTO gap_events (gap_id, at, kind, from_status, to_status, detail) VALUES (?,?,?,?,?,?)').run(
    gapId, today(), kind, fromStatus ?? null, toStatus ?? null, detail ?? null
  );
}

const mergeIds = (existing, id) => {
  const list = (existing ? String(existing).split(',') : []).filter(Boolean);
  if (id && !list.includes(String(id))) list.push(String(id));
  return list.length ? list.join(',') : null;
};

function show(db, id, flags) {
  const r = db.prepare('SELECT * FROM gaps WHERE id = ?').get(id);
  if (!r) fail(`找不到 id=${id} 的缺口`);
  const events = db.prepare('SELECT at, kind, from_status, to_status, detail FROM gap_events WHERE gap_id = ? ORDER BY id').all(id);
  if (flags.json) {
    console.log(JSON.stringify({ ok: true, meta: null, data: { ...r, events } }, null, 2));
    return;
  }
  console.log(`#${r.id}  [${r.subject}] ${r.topic}   状态：${r.status}${r.regressions ? `（反复 ${r.regressions} 次）` : ''}`);
  console.log(`缺口：${r.title}`);
  console.log(`来源错题：${r.evidence ? r.evidence.split(',').map((x) => `#${x}`).join(' ') : '—'}    主要错因：${r.cause ?? '—'}`);
  console.log(`补的动作：${r.action ?? '—'}`);
  console.log(`档位 ${r.stage}    下次验证 ${r.due_date ?? '—'}`);
  console.log(`缺 ${r.found_at}${r.filled_at ? ` → 补 ${r.filled_at}` : ''}${r.strong_at ? ` → 强 ${r.strong_at}` : ''}${r.mastered_at ? ` → 已掌握 ${r.mastered_at}` : ''}`);
  console.log(events.length ? `事件：\n${events.map((e) => `  ${e.at}  ${e.kind}${e.from_status ? `（${e.from_status}→${e.to_status}）` : ''}${e.detail ? `  ${e.detail}` : ''}`).join('\n')}` : '事件：无');
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
    const title = pick(flags, input, 'title', { required: true });
    const cause = pick(flags, input, 'cause');
    if (cause && !CAUSES.includes(cause)) fail(`错因只能是：${CAUSES.join(' / ')}（计算失误、粗心这类不建缺口）`);
    const evidenceId = pick(flags, input, 'evidence');
    const note = pick(flags, input, 'note');

    const db = open('gap');
    const fp = fingerprint(subject, topic);
    const date = today();
    const cur = db.prepare('SELECT * FROM gaps WHERE fp = ?').get(fp);

    if (!cur) {
      const info = db
        .prepare(
          `INSERT INTO gaps (fp, subject, topic, title, status, cause, evidence, found_at, updated_at)
           VALUES (?,?,?,?,'缺',?,?,?,?)`
        )
        .run(fp, subject, topic, title, cause, evidenceId ? String(evidenceId) : null, date, date);
      const id = Number(info.lastInsertRowid);
      logEvent(db, id, '发现', null, '缺', evidenceId ? `错题 #${evidenceId}` : note);
      show(db, id, flags);
      if (!flags.json) console.log('（新缺口，状态：缺）');
    } else {
      const fresh = evidenceId && !String(cur.evidence ?? '').split(',').includes(String(evidenceId));
      let { status, stage, regressions } = cur;
      let kind = '备注';
      let from = status;
      let detail = note;
      if (fresh && (status === '已掌握' || status === '强')) {
        status = '补';
        stage = 0;
        regressions += 1;
        kind = '回退';
        detail = `新错题 #${evidenceId}${note ? `；${note}` : ''}`;
      } else if (fresh) {
        kind = '发现';
        detail = `错题 #${evidenceId}${note ? `；${note}` : ''}`;
      }
      const due = status === '补' ? addDays(date, INTERVALS[0]) : cur.due_date;
      db.prepare(
        `UPDATE gaps SET title=?, cause=COALESCE(?, cause), evidence=?, status=?, stage=?, regressions=?,
         due_date=?, updated_at=? WHERE fp=?`
      ).run(title, cause, mergeIds(cur.evidence, evidenceId), status, stage, regressions, due, date, fp);
      logEvent(db, cur.id, kind, from, status, detail);
      show(db, cur.id, flags);
      if (!flags.json) {
        console.log(
          kind === '回退'
            ? `（已有缺口，来了新错题 → 回退到「补」，累计反复 ${regressions} 次）`
            : '（已有缺口，只更新了来源）'
        );
      }
    }
    db.close();
    break;
  }

  case 'fill': {
    const id = Number(args._[1]);
    if (!id) fail('用法：fill <id> --action "讲解一遍 + 做成卡 #7"');
    const action = pick(flags, {}, 'action', { required: true });
    const kind = String(pick(flags, {}, 'kind', { fallback: '讲解' }));
    if (!['讲解', '做卡', '笔记'].includes(kind)) fail('--kind 只能是 讲解 / 做卡 / 笔记');
    const db = open('gap');
    const cur = db.prepare('SELECT * FROM gaps WHERE id = ?').get(id);
    if (!cur) fail(`找不到 id=${id} 的缺口`);
    const date = today();
    const status = cur.status === '缺' ? '补' : cur.status;
    const merged = [cur.action, `${kind} ${date.slice(5)}：${action}`].filter(Boolean).join('；');
    db.prepare(
      'UPDATE gaps SET status=?, filled_at=COALESCE(filled_at, ?), action=?, due_date=COALESCE(due_date, ?), updated_at=? WHERE id=?'
    ).run(status, date, merged, addDays(date, INTERVALS[0]), date, id);
    logEvent(db, id, kind, cur.status, status, action);
    show(db, id, flags);
    db.close();
    break;
  }

  case 'verify': {
    const id = Number(args._[1]);
    if (!id) fail('用法：verify <id> --result pass|fail');
    const result = pick(flags, {}, 'result', { required: true });
    if (!['pass', 'fail'].includes(result)) fail('--result 需为 pass 或 fail');
    const note = pick(flags, {}, 'note');
    const db = open('gap');
    const cur = db.prepare('SELECT status FROM gaps WHERE id = ?').get(id);
    if (!cur) fail(`找不到 id=${id} 的缺口`);
    const after = applyGapVerify(db, id, result, note);

    if (flags.json) console.log(JSON.stringify({ ok: true, meta: null, data: after }, null, 2));
    else
      console.log(
        `#${id} ${result === 'pass' ? '✓ 通过' : '✗ 未通过'}：${cur.status} → ${after.status}` +
          (result === 'pass' && after.status !== '已掌握' ? `，下次验证 ${after.due_date}` : '') +
          (result === 'fail' ? `，明天再验证（累计反复 ${after.regressions} 次）` : '')
      );
    db.close();
    break;
  }

  case 'due': {
    const limit = Number.isFinite(Number(flags.limit)) ? Number(flags.limit) : 10;
    const db = open('gap');
    const rows = db
      .prepare(
        `SELECT * FROM gaps WHERE status IN ('补','强') AND due_date <= ? ORDER BY ${ORDER}, due_date LIMIT ?`
      )
      .all(today(), limit)
      .map(rowOf);
    out(rows, COLS, flags, `今日（${today()}）该验证的缺口：`);
    db.close();
    break;
  }

  case 'list':
  case 'board': {
    const where = [];
    const params = [];
    if (flags.subject) {
      where.push('subject = ?');
      params.push(flags.subject);
    }
    if (flags.status) {
      if (!STATUSES.includes(flags.status)) fail(`--status 需为：${STATUSES.join(' / ')}`);
      where.push('status = ?');
      params.push(flags.status);
    } else if (!flags.all) {
      where.push("status <> '已掌握'");
    }
    const db = open('gap');
    const rows = db
      .prepare(`SELECT * FROM gaps ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${ORDER}, regressions DESC, due_date`)
      .all(...params);
    if (cmd === 'board') {
      if (flags.json) {
        console.log(JSON.stringify({ ok: true, meta: null, data: rows.map(rowOf) }, null, 2));
      } else {
        const bySubject = {};
        for (const r of rows) (bySubject[r.subject] ??= []).push(r);
        const subjects = Object.keys(bySubject);
        if (!subjects.length) console.log('（没有未掌握的缺口）');
        for (const s of subjects) {
          const g = bySubject[s];
          const cnt = STATUSES.map((st) => `${st} ${g.filter((x) => x.status === st).length}`).join(' / ');
          console.log(`\n【${s}】${g.length} 个缺口　${cnt}`);
          console.log(table(g.map(rowOf), COLS.filter((c) => c.key !== 'subject')));
        }
        console.log(`\n共 ${rows.length} 个缺口（${today()}）`);
      }
    } else {
      out(rows.map(rowOf), COLS, flags, flags.all || flags.status ? '缺口列表：' : '未掌握的缺口：');
    }
    db.close();
    break;
  }

  case 'get': {
    const id = Number(args._[1]);
    if (!id) fail('用法：get <id>');
    const db = open('gap');
    show(db, id, flags);
    db.close();
    break;
  }

  case 'stats': {
    const db = open('gap');
    const head = db.prepare('SELECT COUNT(*) total FROM gaps').get();
    const byStatus = db.prepare('SELECT status, COUNT(*) n FROM gaps GROUP BY status').all();
    const bySubject = db.prepare(`SELECT subject, COUNT(*) n, SUM(status <> '已掌握') open FROM gaps GROUP BY subject ORDER BY open DESC`).all();
    const worst = db.prepare('SELECT id, subject, title, regressions FROM gaps WHERE regressions > 0 ORDER BY regressions DESC, id LIMIT 5').all();
    const stale = db.prepare("SELECT COUNT(*) n FROM gaps WHERE status IN ('补','强') AND due_date <= ?").get(today());
    if (flags.json) {
      console.log(JSON.stringify({ ok: true, meta: null, data: { summary: { ...head, due: stale.n }, byStatus, bySubject, worst } }, null, 2));
      break;
    }
    const of = (s) => byStatus.find((x) => x.status === s)?.n ?? 0;
    console.log(`缺口总计 ${head.total}：缺 ${of('缺')} / 补 ${of('补')} / 强 ${of('强')} / 已掌握 ${of('已掌握')}；今日该验证 ${stale.n} 个`);
    console.log('\n按学科（未掌握数）：');
    console.log(table(bySubject, [{ key: 'subject', label: '学科' }, { key: 'n', label: '缺口数' }, { key: 'open', label: '未掌握' }]));
    if (worst.length) {
      console.log('\n反复最多的缺口（优先处理）：');
      console.log(table(worst, [
        { key: 'id', label: 'id', max: 5 },
        { key: 'subject', label: '学科', max: 6 },
        { key: 'title', label: '缺口', max: 26 },
        { key: 'regressions', label: '反复次数', max: 8 },
      ]));
    }
    db.close();
    break;
  }

  case 'remove': {
    const id = Number(args._[1]);
    if (!id) fail('用法：remove <id> --yes');
    if (!flags.yes) fail('删除不可恢复，请加 --yes 确认');
    const db = open('gap');
    const info = db.prepare('DELETE FROM gaps WHERE id = ?').run(id);
    console.log(info.changes ? `已删除 #${id}` : `找不到 id=${id}`);
    db.close();
    break;
  }

  default:
    fail(`未知命令 ${cmd}。运行不带参数查看帮助。`);
}
