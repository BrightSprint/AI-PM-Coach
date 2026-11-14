'use strict';
/* 全量回归 · 全局扫描：零 LLM 调用 / 零运行时外网请求 / 反游戏化 / 数据键清单 / 语法
 * 扫描对象：index.html + assets/*.js（页面实际加载的全部代码）。 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = '/home/hatch/workspace/ts-spaces/ai-pm-coach';
const files = ['index.html'].concat(fs.readdirSync(path.join(ROOT, 'assets')).filter(f => f.endsWith('.js')).map(f => 'assets/' + f));
const texts = {}; files.forEach(f => { texts[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });
const all = files.map(f => texts[f]).join('\n');
let issues = 0;
function report(name, ok, detail) { console.log((ok ? 'OK   ' : 'HIT  ') + name + (detail ? ' — ' + detail : '')); if (!ok) issues++; }

/* 1. 网络调用 API（代码层） */
const netApis = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'axios', '$.ajax', 'navigator.sendBeacon'];
for (const api of netApis) {
  const hits = files.filter(f => texts[f].includes(api));
  report('网络API ' + api, hits.length === 0, hits.join(','));
}
/* 2. LLM / 模型服务痕迹（代码层调用与端点） */
const llmPats = [/openai/i, /anthropic/i, /chat\/completions/i, /api[_-]?key/i, /generativelanguage/i, /dashscope/i, /bigmodel.*\/api/i, /coze.*api\.coze/i];
for (const p of llmPats) {
  const hits = files.filter(f => p.test(texts[f]));
  report('LLM痕迹 ' + p, hits.length === 0, hits.join(','));
}
/* 3. 外部 URL（src/href/url() 与字符串字面量） */
const urlRe = /https?:\/\/[^\s"'<>\\)]+/g;
const urlCount = {};
for (const f of files) { (texts[f].match(urlRe) || []).forEach(u => { urlCount[u] = (urlCount[u] || 0) + 1; }); }
console.log('INFO 外部 URL 字面量清单：');
Object.keys(urlCount).sort().forEach(u => console.log('  ' + urlCount[u] + 'x ' + u));
const srcExternal = files.filter(f => /(src|href)\s*=\s*"https?:\/\//.test(texts[f]));
report('外部 src/href 资源加载', srcExternal.length === 0, srcExternal.join(','));
/* 4. 反游戏化：功能性命中判定（词 + 功能上下文分类） */
const gameWords = ['打卡', '积分', '排行', '签到', '每日任务', '连续天数', '连续到访', 'streak', 'leaderboard', '签到奖励'];
for (const w of gameWords) {
  const occ = [];
  for (const f of files) {
    let idx = 0; const t = texts[f];
    while ((idx = t.indexOf(w, idx)) >= 0) { occ.push(f + '@' + idx + ' :: ' + t.slice(Math.max(0, idx - 40), idx + w.length + 40).replace(/\s+/g, ' ')); idx += w.length; }
  }
  console.log('INFO 游戏化词「' + w + '」出现 ' + occ.length + ' 处：');
  occ.forEach(o => console.log('   ' + o));
}
/* 5. localStorage 键清单 vs DATA_KEYS 十键 */
const keyRe = /aipm\.[a-z]+\.v1/g;
const usedKeys = [...new Set(all.match(keyRe) || [])].sort();
console.log('INFO 代码中出现的 aipm.* 键：' + JSON.stringify(usedKeys));
const m = texts['index.html'].match(/var DATA_KEYS = \[([^\]]+)\]/);
const dataKeys = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
report('数据键全部纳入 DATA_KEYS 十键口径', JSON.stringify(usedKeys) === JSON.stringify(dataKeys),
  'used=' + usedKeys.length + ' dataKeys=' + dataKeys.length);
/* 6. 语法检查（外置 + 内联） */
for (const f of files.filter(x => x.endsWith('.js'))) {
  try { execFileSync('node', ['--check', path.join(ROOT, f)]); console.log('OK   语法 ' + f); }
  catch (e) { report('语法 ' + f, false, 'node --check 失败'); }
}
const inline = texts['index.html'].match(/<script>([\s\S]*?)<\/script>/)[1];
fs.writeFileSync('/tmp/_inline_scan.js', inline);
try { execFileSync('node', ['--check', '/tmp/_inline_scan.js']); console.log('OK   语法 index.html 内联脚本'); }
catch (e) { report('语法 内联脚本', false, 'node --check 失败'); }

console.log('---- 扫描完成，硬命中（OK/HIT 中的 HIT，游戏化词面出现另行人工分类）见上');
process.exit(0);
