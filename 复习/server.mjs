#!/usr/bin/env node
// 到期复习的本地网页服务：零依赖（Node 内置 http + node:sqlite），只监听 127.0.0.1。
// 只做两件事：给出今日到期队列、把复习结果写回库（错题/卡片，并联动缺口状态）。
// 状态推进全部复用 学习数据/scripts/db.mjs，不在这里另写一套。
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyGapVerify, applyReview, findGap, fingerprint, open, today,
} from '../学习数据/scripts/db.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const START_PORT = Number(flag('--port') || 5174);
const NO_OPEN = args.includes('--no-open');
const LIMIT = Number(flag('--limit') || 30);

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};

/** 今日到期队列：错题 + 背诵卡；与到期缺口同一知识点的排前面，其余按过期时间 */
function dueQueue() {
  const w = open('wrongbook');
  const wrong = w.prepare('SELECT * FROM wrong_questions WHERE mastered = 0 AND due_date <= ? ORDER BY due_date, id').all(today());
  w.close();
  const r = open('recite');
  const recite = r.prepare('SELECT * FROM recite_cards WHERE mastered = 0 AND due_date <= ? ORDER BY due_date, id').all(today());
  r.close();
  const g = open('gap');
  const gaps = g.prepare("SELECT * FROM gaps WHERE status IN ('补','强') AND due_date <= ?").all(today());
  g.close();

  const gapFps = new Set(gaps.map((x) => x.fp));
  const items = [
    ...wrong.map((row) => ({
      kind: 'wrong', id: row.id, subject: row.subject, topic: row.topic, form: row.form,
      prompt: row.drill || row.stem, stem: row.stem, options: row.options, answer: row.answer,
      analysis: row.analysis, due: row.due_date, image: row.image,
      rank: gapFps.has(fingerprint(row.subject, row.topic)) ? 0 : 1,
    })),
    ...recite.map((row) => ({
      kind: 'recite', id: row.id, subject: row.subject, topic: row.topic, kindName: row.kind,
      prompt: row.front, back: row.back, hook: row.hook, hint: row.hint, due: row.due_date,
      rank: gapFps.has(fingerprint(row.subject, row.topic)) ? 0 : 1,
    })),
  ].sort((a, b) => a.rank - b.rank || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));

  return { items: items.slice(0, LIMIT), total: items.length, gapDue: gaps.length, date: today() };
}

/** 写回一条复习结果；错题通过时顺带推进同知识点的缺口（缺口只由证据推进） */
function writeReview(kind, id, result) {
  const dbName = kind === 'wrong' ? 'wrongbook' : 'recite';
  const table = kind === 'wrong' ? 'wrong_questions' : 'recite_cards';
  const reviewTable = kind === 'wrong' ? 'wrong_reviews' : 'recite_reviews';
  const db = open(dbName);
  const row = db.prepare(`SELECT subject, topic FROM ${table} WHERE id = ?`).get(id);
  if (!row) { db.close(); throw new Error(`找不到 ${kind} #${id}`); }
  const after = applyReview(db, table, reviewTable, id, result);
  db.close();

  let gap = null;
  if (kind === 'wrong' && result === 'pass') {
    const g = open('gap');
    const hit = findGap(g, row.subject, row.topic);
    if (hit && hit.status !== '已掌握') gap = applyGapVerify(g, hit.id, 'pass', `错题 #${id} 重做通过`);
    g.close();
  }
  handoff(kind, id, row, result);
  return {
    id, result, due: after.due_date, mastered: !!after.mastered,
    gap: gap ? { id: gap.id, status: gap.status } : null,
  };
}

/**
 * 交接文件：这一轮没过的东西攒在 学习数据/待讲解.json。
 * 学生说"讲讲刚才没过的"时，AI 读它就能定位（过了的自动移除）。
 */
const HANDOFF = resolve(HERE, '../学习数据/待讲解.json');
function handoff(kind, id, row, result) {
  let list = [];
  try { list = JSON.parse(readFileSync(HANDOFF, 'utf8')); } catch {}
  const key = `${kind}:${id}`;
  list = (Array.isArray(list) ? list : []).filter((x) => x.key !== key);
  if (result === 'fail') list.push({ key, kind, id, subject: row.subject, topic: row.topic, at: today() });
  if (list.length) writeFileSync(HANDOFF, JSON.stringify(list.slice(-30), null, 2));
  else try { unlinkSync(HANDOFF); } catch {}
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');

  if (url.pathname === '/api/due') {
    try { return json(res, 200, { ok: true, ...dueQueue() }); }
    catch (e) { return json(res, 500, { ok: false, error: String(e.message || e) }); }
  }

  if (url.pathname === '/api/review' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const { kind, id, result } = JSON.parse(body || '{}');
        if (!['wrong', 'recite'].includes(kind)) throw new Error('kind 只能是 wrong / recite');
        if (!['pass', 'fail'].includes(result)) throw new Error('result 只能是 pass / fail');
        return json(res, 200, { ok: true, ...writeReview(kind, Number(id), result) });
      } catch (e) { return json(res, 400, { ok: false, error: String(e.message || e) }); }
    });
    return;
  }

  // 静态文件
  const path = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = resolve(HERE, `.${path}`);
  if (!file.startsWith(HERE) || !existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

let port = START_PORT;
let tries = 0;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && tries < 10) { tries += 1; server.listen(++port, '127.0.0.1'); }
  else { console.error('✗ 复习服务启动失败：', e.message); process.exit(1); }
});
server.listen(port, '127.0.0.1', () => {
  const link = `http://127.0.0.1:${port}`;
  console.log(`复习服务已启动：${link}    （关掉这个窗口或按 Ctrl+C 结束）`);
  if (!NO_OPEN) {
    const cmd = process.platform === 'win32' ? `start "" ${link}` : process.platform === 'darwin' ? `open ${link}` : `xdg-open ${link}`;
    exec(cmd, () => {});
  }
});
