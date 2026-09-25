// 学习数据/scripts/db.mjs —— 错题本 / 背诵本共用的底层工具（Node 零依赖，node:sqlite）
// 被 wrong.mjs 与 recite.mjs 引用；不直接被学生调用。
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = resolve(ROOT, '学习数据');
export const SCHEMA_DIR = resolve(DATA_DIR, 'schema');
export const MIGRATIONS_DIR = resolve(SCHEMA_DIR, 'migrations');

// 各库当前 schema 版本；有结构变更时 +1，并在 schema/migrations/<库>/<新版本>_*.sql 写迁移
export const SCHEMA_VERSION = { wrongbook: 2, recite: 2, gap: 1 };

// 间隔重复阶梯：答对一次前进一档，第 5 档后视为已掌握
export const INTERVALS = [1, 3, 7, 15, 30];

/* ---------------- 日期 ---------------- */

export function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** 间隔重复：给定当前档位与基准日期，返回 { stage, due } */
export function schedule(stage, fromDate = today()) {
  const idx = Math.min(Math.max(stage, 0), INTERVALS.length - 1);
  return { stage: idx, due: addDays(fromDate, INTERVALS[idx]) };
}

/* ---------------- 指纹 ---------------- */

const norm = (s) =>
  String(s ?? '')
    .replace(/\s+/g, '')
    .replace(/[，。？！；：、“”‘’（）《》【】,.?!;:"'()\[\]<>]/g, '')
    .toLowerCase();

export function fingerprint(...parts) {
  return createHash('sha1').update(parts.map(norm).join('|'), 'utf8').digest('hex').slice(0, 16);
}

/* ---------------- 参数与输入 ---------------- */

/** 支持 --key value / --flag；值不会以 -- 开头 */
export function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args.flags[key] = true;
      else {
        args.flags[key] = next;
        i++;
      }
    } else args._.push(a);
  }
  return args;
}

/** 长文本走文件或 stdin，避免 shell 转义问题：--json-file <path> 或 --stdin（容忍 UTF-8 BOM） */
export function loadInput(flags) {
  const parse = (text) => {
    const clean = text.replace(/^\uFEFF/, '').trim();
    if (!clean) return {};
    try {
      return JSON.parse(clean);
    } catch (e) {
      fail(`JSON 解析失败（需 UTF-8 无 BOM 的合法 JSON）：${e.message}`);
    }
  };
  if (typeof flags['json-file'] === 'string') {
    const p = isAbsolute(flags['json-file']) ? flags['json-file'] : resolve(process.cwd(), flags['json-file']);
    return parse(readFileSync(p, 'utf8'));
  }
  if (flags.stdin) return parse(readFileSync(0, 'utf8'));
  return {};
}

export function pick(flags, input, key, { required = false, fallback = null } = {}) {
  let v = input[key];
  if (v === undefined || v === null || v === '') v = flags[key];
  if (v === true || v === undefined || v === null || v === '') v = fallback;
  if (required && (v === null || v === false)) {
    fail(`缺少必填参数 --${key}`);
  }
  return v;
}

export function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/* ---------------- 图片路径 ---------------- */

export const IMAGE_DIR = '学习数据/图片';

/** 规范化图片字段：统一正斜杠、去空项、多张用 ; 分隔；不在约定目录下时给出提醒（不阻断） */
export function normalizeImages(value) {
  if (value === undefined || value === null || value === '') return null;
  const parts = String(value)
    .split(';')
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf(`${IMAGE_DIR}/`);
      if (i >= 0) return p.slice(i);
      console.error(`! 建议把图片放进 ${IMAGE_DIR}/<学科>/ 并用相对仓库根的路径，当前：${p}`);
      return p;
    });
  return parts.length ? parts.join(';') : null;
}

/* ---------------- 数据库 ---------------- */

export function open(name) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) fail(`非法库名：${name}`);
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const file = resolve(DATA_DIR, `${name}.db`);
  const isNew = !existsSync(file);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(readFileSync(resolve(SCHEMA_DIR, `${name}.sql`), 'utf8'));
  if (isNew) metaSet(db, 'schema_version', SCHEMA_VERSION[name] ?? 1);
  else migrate(db, name);
  return db;
}

/* ---------------- schema 迁移 ---------------- */

function metaEnsure(db) {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
}

function metaGet(db, key) {
  metaEnsure(db);
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

function metaSet(db, key, value) {
  metaEnsure(db);
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

/**
 * 把已存在的库升到 SCHEMA_VERSION[name]。
 * 没有 meta 表 / 没有 schema_version 的历史库按版本 1 处理。
 * 返回 { from, to, applied[] }。
 */
export function migrate(db, name) {
  const target = SCHEMA_VERSION[name] ?? 1;
  const current = Number(metaGet(db, 'schema_version') ?? 1) || 1;
  const result = { from: current, to: target, applied: [], skipped: [] };
  if (current >= target) {
    metaSet(db, 'schema_version', target);
    result.from = target;
    return result;
  }
  const dir = resolve(MIGRATIONS_DIR, name);
  for (let v = current + 1; v <= target; v++) {
    const prefix = String(v).padStart(3, '0');
    const files = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.sql')).sort()
      : [];
    for (const f of files) {
      try {
        db.exec(readFileSync(resolve(dir, f), 'utf8'));
        result.applied.push(f);
      } catch (e) {
        // 列已存在的库（例如手工建的 v2 库没有 meta）→ 视作已应用，继续
        if (/duplicate column name/i.test(e.message)) result.skipped.push(f);
        else fail(`迁移 ${name}/${f} 失败：${e.message}`);
      }
    }
    metaSet(db, 'schema_version', v);
  }
  if (result.applied.length || result.skipped.length) {
    console.error(
      `↑ ${name} 已迁移 v${current} → v${target}` +
        (result.applied.length ? `，执行 ${result.applied.join(', ')}` : '') +
        (result.skipped.length ? `，跳过已应用的 ${result.skipped.join(', ')}` : '')
    );
  }
  return result;
}

/* ---------------- 输出 ---------------- */

const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

export function width(s) {
  let n = 0;
  for (const ch of String(s ?? '')) n += WIDE.test(ch) ? 2 : 1;
  return n;
}

const clip = (s, max) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return width(t) > max ? `${[...t].slice(0, max - 1).join('')}…` : t;
};

/** cols: [{key, label, max}] */
export function table(rows, cols) {
  if (!rows.length) return '（无记录）';
  const cells = rows.map((r) => cols.map((c) => clip(r[c.key], c.max ?? 32)));
  const w = cols.map((c, i) => Math.max(width(c.label), ...cells.map((row) => width(row[i]))));
  const line = (xs) => xs.map((x, i) => x + ' '.repeat(Math.max(0, w[i] - width(x)))).join('  ');
  return [line(cols.map((c) => c.label)), w.map((n) => '─'.repeat(n)).join('──'), ...cells.map(line)].join('\n');
}

export function out(rows, cols, flags, meta) {
  if (flags.json) {
    console.log(JSON.stringify({ ok: true, meta: meta ?? null, data: rows }, null, 2));
    return;
  }
  if (meta) console.log(meta);
  console.log(table(rows, cols));
  console.log(`共 ${rows.length} 条`);
}

/** result: 'pass' | 'fail'，返回复习后的状态 */
export function applyReview(db, tableName, reviewTable, id, result, note) {
  const key = tableName === 'wrong_questions' ? 'question_id' : 'card_id';
  const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
  if (!row) fail(`找不到 id=${id} 的记录`);
  if (row.mastered) fail(`id=${id} 已标记为已掌握；如需重练，先执行 reset`);

  const date = today();
  let { stage, streak, lapses, mastered, due } = row;
  if (result === 'pass') {
    streak += 1;
    const next = schedule(stage + 1, date);
    stage = next.stage;
    due = next.due;
    if (row.stage + 1 >= INTERVALS.length) mastered = 1;
  } else {
    lapses += 1;
    streak = 0;
    stage = 0;
    due = addDays(date, INTERVALS[0]);
  }

  db.prepare(
    `UPDATE ${tableName} SET due_date=?, stage=?, streak=?, lapses=?, mastered=?, updated_at=? WHERE id=?`
  ).run(due, stage, streak, lapses, mastered, date, id);
  db.prepare(`INSERT INTO ${reviewTable} (${key}, reviewed_at, result, stage_after, note) VALUES (?,?,?,?,?)`).run(
    id,
    date,
    result,
    stage,
    note ?? null
  );
  return { ...row, due_date: due, stage, streak, lapses, mastered, updated_at: date };
}
