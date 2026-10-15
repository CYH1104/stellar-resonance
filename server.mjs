/*
 * 群星共振 · 本地后端 v0.1
 * 实现 docs/API.md 的 v0.1 契约:/api/access、/api/generate(SSE)、/api/utility、/api/embeddings。
 * 同时挂载两个前端:
 *   /         → dist/(群星共振,对话框界面)
 *   /terminal → 星穹游戏终端 (1).html(星际学院大前端,聊天页从这里同源调用 /api/*)
 * 上游为 OpenAI 兼容 /chat/completions(server.config.json 里配置 baseUrl/apiKey/model)。
 * 未配置 Key 或上游失败时,自动退回本地演示流,两个前端都始终可用。零依赖,Node >= 20。
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CFG_PATH = path.join(HERE, 'server.config.json');
const DEFAULT_CFG = {
  port: 8807,
  host: '127.0.0.1',
  baseUrl: 'https://gcli.ggchan.dev/v1',
  apiKey: '',
  model: '',
  utilityModel: '',
  embeddingModel: '',
  temperature: 0.7,
  maxTokens: 1600,
  terminalPath: path.join(HERE, '星穹游戏终端 (1).html')
};
let CFG = DEFAULT_CFG;
try { CFG = { ...DEFAULT_CFG, ...JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')) }; }
catch { fs.writeFileSync(CFG_PATH, JSON.stringify(DEFAULT_CFG, null, 2)); console.log('[cfg] 已生成默认 server.config.json,填入 apiKey/model 后重启即接真实模型'); }
const DIST = path.join(HERE, 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const demoNote = () => CFG.apiKey && CFG.model ? '' : '[演示]';

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}
function sseHead(res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
}
const sse = (res, obj) => res.write('data: ' + JSON.stringify(obj) + '\n\n');

/* ---------- 提示词组装 ---------- */
function buildMessages(r) {
  const sys = [
    '你是「群星共振 / STELLAR RESONANCE」的叙事引擎,以第二人称外的常规叙事视角描写剧情,文风干净、克制、有画面感。',
    '只输出正文本身,不要输出任何解释、标题或协议字段。',
    r.persona?.name ? `玩家角色:${r.persona.name}${r.persona.personality ? '(性格:' + r.persona.personality + ')' : ''}${r.persona.background ? '(背景:' + r.persona.background + ')' : ''}` : '',
    r.opening ? `开局设定:${r.opening}` : '',
    r.presets?.length ? '叙事要求:\n- ' + r.presets.join('\n- ') : '',
    r.memories?.length ? '可用记忆:\n- ' + r.memories.join('\n- ') : '',
    r.dice ? `本轮骰点:${r.dice.value} / 100,判定「${r.dice.grade}」,情节走向需与判定相符。` : '',
    r.state ? `当前状态:${JSON.stringify(r.state)}` : ''
  ].filter(Boolean).join('\n\n');
  const msgs = [{ role: 'system', content: sys }];
  for (const h of (r.history || []).slice(-16)) if (h && typeof h.content === 'string') msgs.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content });
  msgs.push({ role: 'user', content: String(r.input || '').slice(0, 16000) });
  if (r.continuation?.partial) msgs.push({ role: 'user', content: '续写提示:已有半截正文「' + String(r.continuation.partial).slice(-200) + '」,只输出剩余部分,不要重复。' });
  return msgs;
}

/* ---------- 上游调用 ---------- */
async function upstreamChat(messages, model, temperature, maxTokens, signal) {
  if (!CFG.apiKey || !CFG.baseUrl || !model) throw new Error('upstream not configured');
  const res = await fetch(CFG.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CFG.apiKey },
    body: JSON.stringify({ model, messages, temperature: temperature ?? CFG.temperature, max_tokens: maxTokens ?? CFG.maxTokens, stream: true }),
    signal
  });
  if (!res.ok || !res.body) throw new Error('upstream ' + res.status);
  return res.body;
}
const DEMO_TEXT = (r) =>
  '接待站的指示灯由蓝转白。样例引导员合上手里的终端,抬眼看你。\n\n' +
  `「${r.persona?.name || '朋友'},你的讯息我收到了——『${String(r.input || '').slice(0, 60)}』。频道已经接通,这里的记录会同步进星图。」\n\n` +
  (r.dice ? `本轮骰点 ${r.dice.value},判定「${r.dice.grade}」。` : '本轮未启用骰子。') +
  (r.memories?.length ? `\n\n你想起此前的一件事:${r.memories[0].slice(0, 60)}。` : '') +
  '\n\n他留出片刻,等你决定下一步。';

/* ---------- /api/generate:SSE 流 ---------- */
async function handleGenerate(req, res) {
  let r;
  try { r = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad json' }); }
  sseHead(res);
  let full = '';
  const abort = new AbortController();
  req.on('close', () => abort.abort());
  try {
    const model = r.profile?.model || CFG.model;
    const body = await upstreamChat(buildMessages(r), model, r.profile?.temperature, r.profile?.maxTokens, abort.signal);
    const reader = body.getReader(); const dec = new TextDecoder(); let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const piece = JSON.parse(data).choices?.[0]?.delta?.content;
          if (piece) { full += piece; sse(res, { type: 'delta', text: piece }); }
        } catch {}
      }
      if (buf.length > 1024 * 1024) throw new Error('upstream chunk too large');
    }
  } catch (e) {
    if (!full) {
      /* 演示流:未配置或上游失败时保证两个前端始终有完整回复 */
      log('generate upstream fallback:', e.message);
      const text = DEMO_TEXT(r) + (demoNote() ? '\n\n' + demoNote() + '当前为本地演示回复:在 server.config.json 填入 apiKey / model 后接入真实模型。' : '');
      const chars = Array.from(text);
      for (let i = 0; i < chars.length; i += 6) {
        if (abort.signal.aborted) break;
        sse(res, { type: 'delta', text: chars.slice(i, i + 6).join('') });
        await new Promise(ok => setTimeout(ok, 55));
      }
      full = text;
    }
  }
  if (abort.signal.aborted) { try { res.end(); } catch {} return; }
  sse(res, { type: 'done', outcome: { event: (full || '一场对话悄然结束。').slice(0, 200) } });
  res.end();
  log('generate ok, chars =', full.length);
}

/* ---------- /api/utility ---------- */
async function handleUtility(req, res) {
  let r;
  try { r = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad json' }); }
  const texts = Array.isArray(r.texts) ? r.texts.map(String).slice(0, 8) : [];
  const prompt = r.task === 'summary'
    ? '把下面的事件标题摘要成一段不超过 120 字的章节摘要,直接输出摘要正文:\n- ' + texts.join('\n- ')
    : '根据下面的剧情文本,给出 3 条玩家下一步可以采取的简短行动建议(每条不超过 20 字),以 JSON 数组输出,例如 ["建议一","建议二","建议三"],不要输出其他内容:\n' + texts.join('\n');
  try {
    const res2 = await fetch(CFG.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CFG.apiKey },
      body: JSON.stringify({ model: r.profile?.model || CFG.utilityModel || CFG.model, messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 500, stream: false })
    });
    if (!res2.ok) throw new Error('upstream ' + res2.status);
    const j = await res2.json();
    const text = j.choices?.[0]?.message?.content || '';
    if (r.task === 'summary') return json(res, 200, { items: [text.trim().slice(0, 120) || '章节摘要生成失败'] });
    const m = text.match(/\[[\s\S]*\]/);
    const items = m ? JSON.parse(m[0]) : [];
    return json(res, 200, { items: (Array.isArray(items) ? items.filter(x => typeof x === 'string') : []).slice(0, 4) });
  } catch (e) {
    log('utility fallback:', e.message);
    return json(res, 200, { items: r.task === 'summary' ? ['章节摘要(演示):' + texts.join('；').slice(0, 300)] : ['询问站点里有哪些公开设施。', '请引导员介绍眼前的情况。', '回顾刚才的约定。'] });
  }
}

/* ---------- /api/embeddings ---------- */
async function handleEmbeddings(req, res) {
  let r;
  try { r = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad json' }); }
  const texts = Array.isArray(r.texts) ? r.texts.map(String).slice(0, 64) : [];
  const model = r.profile?.model || CFG.embeddingModel;
  if (CFG.apiKey && model) {
    try {
      const res2 = await fetch(CFG.baseUrl.replace(/\/+$/, '') + '/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + CFG.apiKey },
        body: JSON.stringify({ model, input: texts })
      });
      if (res2.ok) {
        const j = await res2.json();
        const vectors = (j.data || []).map(d => d.embedding);
        if (Array.isArray(vectors) && vectors.length === texts.length) return json(res, 200, { vectors });
      }
    } catch (e) { log('embeddings fallback:', e.message); }
  }
  /* 本地演示向量:字符频次哈希,32 维,仅供前端功能链路演示,非语义向量 */
  const vectors = texts.map(t => { const v = Array(32).fill(0); for (const c of t) v[c.codePointAt(0) % 32]++; return v; });
  json(res, 200, { vectors });
}

/* ---------- 静态文件 ---------- */
function serveFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);
  /* SPA 兜底 */
  const index = path.join(DIST, 'index.html');
  if (fs.existsSync(index)) return serveFile(res, index);
  res.writeHead(404); res.end('dist/ 尚未构建,先运行 npm run build');
}

/* ---------- 服务器 ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = u.pathname;
  try {
    if (req.method === 'GET' && p === '/terminal') {
      const file = CFG.terminalPath;
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end('terminal html not found'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(file).pipe(res);
    }
    if (req.method === 'GET' && p === '/api/status') {
      return json(res, 200, { ok: true, upstream: Boolean(CFG.apiKey && CFG.baseUrl && CFG.model), model: CFG.model || '(演示模式)', contract: 'v0.1' });
    }
    if (req.method === 'POST' && p === '/api/access') {
      await readBody(req);
      return json(res, 200, { capabilities: { continue: true } });
    }
    if (req.method === 'POST' && p === '/api/generate') return await handleGenerate(req, res);
    if (req.method === 'POST' && p === '/api/utility') return await handleUtility(req, res);
    if (req.method === 'POST' && p === '/api/embeddings') return await handleEmbeddings(req, res);
    if (req.method === 'GET') return serveStatic(req, res, p);
    res.writeHead(405); res.end();
  } catch (e) {
    log('error:', e.message);
    if (!res.headersSent) json(res, 500, { error: 'internal' }); else try { res.end(); } catch {}
  }
});
server.listen(CFG.port, CFG.host, () => {
  log(`群星共振后端 http://${CFG.host}:${CFG.port}`);
  log(`  对话框前端  → http://${CFG.host}:${CFG.port}/`);
  log(`  星穹终端    → http://${CFG.host}:${CFG.port}/terminal`);
  log(`  上游模型    → ${CFG.apiKey && CFG.model ? CFG.baseUrl + ' (' + CFG.model + ')' : '未配置,使用演示流'}`);
});
