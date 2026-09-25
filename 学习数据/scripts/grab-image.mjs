#!/usr/bin/env node
// 从 Kilo 会话库中提取「最近粘贴进对话框的图片」，落到 学习数据/图片/<学科>/。
// 只读打开会话库，不修改任何会话数据；失败时以退出码 1 结束，由调用方回退到手动另存。
//
// 用法：
//   node 学习数据/scripts/grab-image.mjs --subject 物理 [--purpose 错题] [--minutes 60] [--limit 1] [--json]
//   [--session ses_xxx] [--db <path>] [--dry-run] [--list]
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail, parseArgs, today } from './db.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const IMAGE_ROOT = resolve(ROOT, '学习数据', '图片');
const INDEX_FILE = resolve(IMAGE_ROOT, '.grabbed.json');

const EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

const HELP = `grab-image.mjs —— 把对话框里粘贴或拖进来的图片存进 学习数据/图片/
  --subject <学科>   必填，决定子目录（数学/物理/化学/…）
  --purpose <用途>   文件名前缀，默认 错题（可用 背诵 / 题目）
  --minutes <N>      只取最近 N 分钟内的图，默认 60；0 表示不限
  --limit <N>        最多取几张，默认 1（按时间从新到旧）
  --list             只列出候选，不写文件（会标明「粘贴」还是「文件」）
  --probe            诊断：打印最近带 mime/url/path 的 part 形状，排查"抓不到"
  --dry-run          打印将写入的路径，不写文件
  --json             输出 JSON（供 AI 解析）
  --session <id>     指定会话（默认取本工作区最新会话）
  --db <path>        指定会话库路径（默认 ~/.local/share/kilo/kilo.db）
也接受 --stdin / --json-file 传同样的键。
支持两种附件：粘贴/截图进来的是 base64（data URL），拖拽文件进来的是磁盘路径。

输出：写入的相对路径（相对仓库根），例如
  学习数据/图片/物理/错题-20260925-01.png`;

const args = parseArgs(process.argv.slice(2));
const flags = args.flags;
if (flags.help || (!flags.subject && !flags.list && !flags.probe && !flags['dry-run'])) {
  console.log(HELP);
  process.exit(flags.help ? 0 : 0);
}

const dbPath = typeof flags.db === 'string'
  ? resolve(flags.db)
  : resolve(process.env.KILO_DB || resolve(homedir(), '.local', 'share', 'kilo', 'kilo.db'));
if (!existsSync(dbPath)) fail(`找不到会话库：${dbPath}（可用 --db 指定）`);

const norm = (p) => String(p ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const here = norm(ROOT);

let db;
try {
  db = new DatabaseSync(dbPath, { readOnly: true });
} catch (e) {
  fail(`只读打开会话库失败：${e.message}`);
}

// 1) 定位会话：优先 --session，否则本工作区最新的会话
let sessionId = typeof flags.session === 'string' ? flags.session : null;
if (!sessionId) {
  const rows = db
    .prepare('SELECT id, directory, time_updated FROM session ORDER BY time_updated DESC LIMIT 200')
    .all();
  const mine = rows.find((r) => norm(r.directory) === here) || rows.find((r) => norm(r.directory).startsWith(here));
  if (!mine) fail('没找到本工作区的会话；可用 --session <id> 指定');
  sessionId = mine.id;
}

// 2) 取该会话的图片 part（type=file & mime=image/*），按时间从新到旧
const mins = Number.isFinite(Number(flags.minutes)) ? Number(flags.minutes) : 60;
const since = mins > 0 ? Date.now() - mins * 60000 : 0;
const limit = Math.max(1, Number(flags.limit ?? 1));
const parts = db
  .prepare('SELECT id, time_created, data FROM part WHERE session_id = ? ORDER BY time_created DESC LIMIT 2000')
  .all(sessionId)
  .filter((r) => r.time_created >= since)
  .map((r) => {
    let d;
    try {
      d = JSON.parse(r.data);
    } catch {
      return null;
    }
    const mime = d?.mime || d?.file?.mime;
    if (!mime || !EXT[mime]) return null;
    const url = d?.url || d?.file?.url || d?.source?.url;
    const path = d?.path || d?.file?.path || d?.source?.path;
    // 粘贴/截图进来的是 base64 data URL；拖拽文件进来的可能是磁盘路径，两种都认
    if (typeof url === 'string' && url.startsWith('data:')) {
      return { partId: r.id, time: r.time_created, mime, kind: 'data', ref: url };
    }
    if (typeof path === 'string' && path) {
      return { partId: r.id, time: r.time_created, mime, kind: 'file', ref: path };
    }
    if (typeof url === 'string' && url.startsWith('file://')) {
      return { partId: r.id, time: r.time_created, mime, kind: 'file', ref: fileURLToPath(url) };
    }
    return null;
  })
  .filter(Boolean);

// --probe：诊断用，打印最近与附件有关的 part 形状（不落盘）
if (flags.probe) {
  const rows = db
    .prepare('SELECT id, time_created, substr(data, 1, 300) head FROM part WHERE session_id = ? ORDER BY time_created DESC LIMIT 400')
    .all(sessionId)
    .filter((r) => /"(mime|url|path|filename|source)"\s*:/.test(r.head));
  console.log(`会话 ${sessionId}，疑似附件的 part ${rows.length} 条：`);
  for (const r of rows.slice(0, 10)) {
    console.log(`\n--- ${r.id}  ${new Date(r.time_created).toISOString()}`);
    console.log('    ' + r.head.replace(/\s+/g, ' '));
  }
  if (!rows.length) console.log('（没有带 mime/url/path 字段的 part —— 说明这次拖拽/粘贴没被记成附件）');
  db.close();
  process.exit(0);
}

if (flags.list) {
  if (flags.json) console.log(JSON.stringify({ ok: true, meta: { session: sessionId }, data: parts.map((p) => ({ partId: p.partId, mime: p.mime, kind: p.kind, time: new Date(p.time).toISOString() })) }, null, 2));
  else if (!parts.length) console.log(`（最近 ${mins} 分钟内没有粘贴或拖进来的图片）`);
  else parts.forEach((p) => console.log(`${new Date(p.time).toISOString()}  ${p.mime}  ${p.kind === 'data' ? '粘贴' : '文件'}  ${p.partId}`));
  db.close();
  process.exit(0);
}

const subject = flags.subject;
if (!subject) fail('缺少 --subject');
const purpose = typeof flags.purpose === 'string' ? flags.purpose : '错题';
const targets = parts.slice(0, limit);
if (!targets.length) {
  db.close();
  if (flags.json) console.log(JSON.stringify({ ok: false, meta: { session: sessionId }, error: `最近 ${flags.minutes ?? 60} 分钟内没有粘贴的图片` }, null, 2));
  else console.log(`✗ 最近 ${flags.minutes ?? 60} 分钟内没有粘贴的图片（可放宽 --minutes 0 不限）`);
  process.exit(1);
}

// 3) 写入；用 .grabbed.json 记录 partId → 路径，保证同一张图不会重复落盘
let index = {};
if (existsSync(INDEX_FILE)) {
  try {
    index = JSON.parse(readFileSync(INDEX_FILE, 'utf8'));
  } catch {}
}
const dir = resolve(IMAGE_ROOT, subject);
if (!flags['dry-run'] && !existsSync(dir)) mkdirSync(dir, { recursive: true });

const written = [];
for (const t of targets) {
  if (index[t.partId]) {
    written.push({ partId: t.partId, path: index[t.partId], existed: true });
    continue;
  }
  const ext = EXT[t.mime];
  const date = today();
  let n = 1;
  let name;
  const taken = new Set([...Object.values(index).map((p) => p.split('/').pop()), ...written.map((w) => w.path.split('/').pop())]);
  do {
    name = `${purpose}-${date.replace(/-/g, '')}-${String(n).padStart(2, '0')}.${ext}`;
    n += 1;
  } while (taken.has(name));
  const rel = `学习数据/图片/${subject}/${name}`;
  if (!flags['dry-run']) {
    let bytes;
    if (t.kind === 'data') {
      const s = String(t.ref);
      bytes = Buffer.from(s.slice(s.indexOf(',') + 1), 'base64');
    } else {
      if (!existsSync(t.ref)) {
        console.error(`! 附件路径不存在，跳过：${t.ref}`);
        continue;
      }
      bytes = readFileSync(t.ref);
    }
    writeFileSync(resolve(ROOT, rel), bytes);
    index[t.partId] = rel;
  }
  written.push({ partId: t.partId, path: rel, mime: t.mime, kind: t.kind, time: new Date(t.time).toISOString() });
}

if (!flags['dry-run']) writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
db.close();

if (flags.json) {
  console.log(JSON.stringify({ ok: true, meta: { session: sessionId, dryRun: !!flags['dry-run'] }, data: written }, null, 2));
} else {
  for (const w of written) console.log(`${w.existed ? '已有' : flags['dry-run'] ? '将写入' : '已写入'}：${w.path}`);
}
