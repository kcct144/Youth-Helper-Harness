const app = document.getElementById('app');
let queue = [];
let idx = 0;
let stats = { pass: 0, fail: 0, missed: [] };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const el = (html) => { app.innerHTML = html; };

const parseOptions = (s) =>
  (s || '').split('\n').map((x) => x.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^([A-Za-z])[.、．]\s*(.*)$/);
    return m ? { letter: m[1].toUpperCase(), text: m[2] } : { letter: '', text: line };
  });

async function start() {
  const res = await fetch('/api/due').then((r) => r.json()).catch(() => ({ ok: false, error: '连不上本地服务' }));
  if (!res.ok) return el(`<h1>出错了</h1><p class="muted">${esc(res.error)}</p>`);
  queue = res.items || [];
  if (!queue.length) {
    return el(`<h1>今天没有到期的</h1><p class="muted">明天再来。也可以回对话里说一句"讲道新题"。</p>`);
  }
  const nw = queue.filter((q) => q.kind === 'wrong').length;
  el(`
    <h1>今日复习</h1>
    <p class="muted">${esc(res.date)}　共 ${res.total} 条${res.total > queue.length ? `（这轮先做 ${queue.length} 条）` : ''}</p>
    <div class="card">
      <p>错题 ${nw} 条 · 背诵卡 ${queue.length - nw} 张</p>
      <div class="row"><button class="primary" id="go">开始</button></div>
      <p class="muted" style="margin-top:14px">会就会，不会就不会——不用逞强，没过的明天还来。</p>
    </div>`);
  document.getElementById('go').onclick = () => { idx = 0; stats = { pass: 0, fail: 0, missed: [] }; render(); };
}

function render() {
  const q = queue[idx];
  if (!q) return finish();
  const tags = `<span class="tag">${esc(q.subject)}</span><span class="tag">${esc(q.topic)}</span>` +
    `<span class="tag">${esc(q.kind === 'wrong' ? q.form : q.kindName)}</span>`;
  el(`
    <div class="progress"><i style="width:${Math.round((idx / queue.length) * 100)}%"></i></div>
    <p class="muted">第 ${idx + 1} / ${queue.length} 条　·　已过 ${stats.pass} · 没过 ${stats.fail}</p>
    <div class="card" id="card">
      <div>${tags}</div>
      <div class="prompt">${esc(q.prompt)}</div>
      <div id="body"></div>
    </div>`);
  if (q.kind === 'wrong' && q.form === '单选') renderChoice(q);
  else renderReveal(q);
}

function renderChoice(q) {
  const body = document.getElementById('body');
  const correct = String(q.answer || '').trim().toUpperCase();
  body.innerHTML = parseOptions(q.options)
    .map((o) => `<button class="opt" data-l="${esc(o.letter)}">${esc(o.letter ? o.letter + '. ' : '')}${esc(o.text)}</button>`)
    .join('');
  body.querySelectorAll('.opt').forEach((b) => {
    b.onclick = () => {
      const right = b.dataset.l === correct;
      body.querySelectorAll('.opt').forEach((x) => {
        if (x.dataset.l === correct) x.classList.add('right');
        else if (x === b) x.classList.add('wrong');
        x.disabled = true;
      });
      body.insertAdjacentHTML('beforeend',
        `<div class="answer"><b>答案：${esc(q.answer)}</b>${q.analysis ? '\n' + esc(q.analysis) : ''}</div>`);
      record(right);
    };
  });
}

function renderReveal(q) {
  const body = document.getElementById('body');
  const isCard = q.kind === 'recite';
  body.innerHTML = `<div class="row"><button class="primary" id="show">${isCard ? '想不起来，看答案' : '看答案'}</button></div>`;
  document.getElementById('show').onclick = () => {
    const extra = isCard
      ? (q.hook ? `<div class="hook">钩子：${esc(q.hook)}</div>` : '')
      : (q.analysis ? '\n' + esc(q.analysis) : '');
    let html = `<div class="answer"><b>${isCard ? '反面' : '答案'}：</b>${esc(isCard ? q.back : q.answer)}${extra}</div>`;
    if (isCard && q.hint) html += `<div class="hook">提示：${esc(q.hint)}</div>`;
    if (!isCard && q.stem && q.stem !== q.prompt) html += `<div class="stem">原题：${esc(q.stem)}</div>`;
    body.innerHTML = html + `<div class="row">
      <button class="ok" id="p">${isCard ? '记住了' : '做对了'}</button>
      <button class="no" id="f">${isCard ? '没记住' : '没做对'}</button></div>`;
    document.getElementById('p').onclick = () => record(true);
    document.getElementById('f').onclick = () => record(false);
  };
}

async function record(pass) {
  const q = queue[idx];
  const body = document.getElementById('body');
  body.insertAdjacentHTML('beforeend', '<p class="muted">记录中…</p>');
  try {
    const r = await fetch('/api/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: q.kind, id: q.id, result: pass ? 'pass' : 'fail' }),
    }).then((x) => x.json());
    if (!r.ok) throw new Error(r.error || '写入失败');
  } catch (e) {
    body.insertAdjacentHTML('beforeend', `<p class="muted">⚠ 没记上：${esc(e.message)}　刷新页面可重试</p>`);
    return;
  }
  if (pass) stats.pass += 1;
  else { stats.fail += 1; stats.missed.push(`${q.subject}·${q.topic}`); }
  idx += 1;
  render();
}

function finish() {
  const missed = [...new Set(stats.missed)];
  el(`
    <h1>这一轮完了</h1>
    <p class="muted">过了 ${stats.pass} 条 · 没过 ${stats.fail} 条</p>
    <div class="card">
      ${missed.length
        ? `<p>没过的：</p><ul class="missed">${missed.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
           <p class="muted">它们明天会再出现。</p>
           <p>想让人讲讲，回对话里说一句：<b>“讲讲刚才没过的”</b>。</p>`
        : '<p>全过，稳。</p>'}
      <div class="row"><button id="again">再看一遍今天的</button></div>
    </div>`);
  document.getElementById('again').onclick = () => start();
}

start();
