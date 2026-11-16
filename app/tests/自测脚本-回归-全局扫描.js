'use strict';
/* ===== 批次 8（三-2）可移植路径解析：脚本默认测「所在副本」 =====
 * 应用目录解析顺序：环境变量 AIPM_APP_DIR → ../app（导出包布局）→
 * ../ts-spaces/ai-pm-coach（开发布局）→ 脚本同级目录。playwright-core 优先走
 * node_modules（导出包在根目录 npm install），回退沙盒内置路径；
 * Chromium 路径可用 CHROMIUM_PATH 指定，hatch 专用参数仅在对应文件存在时附加。 */
const __path = require('path');
const __fs = require('fs');
function __resolveAppDir(){
  const cands = [];
  if(process.env.AIPM_APP_DIR){ cands.push(process.env.AIPM_APP_DIR); }
  cands.push(__path.join(__dirname, '..', 'app'));
  cands.push(__path.join(__dirname, '..', 'ts-spaces', 'ai-pm-coach'));
  cands.push(__dirname);
  for(const c of cands){
    try { if(__fs.existsSync(__path.join(c, 'index.html')) && __fs.existsSync(__path.join(c, 'assets'))){ return __path.resolve(c); } } catch(e){}
  }
  return __path.resolve(cands[0]);
}
const AIPM_APP_DIR = __resolveAppDir();
const AIPM_APP_URL = 'file://' + AIPM_APP_DIR + '/index.html';
const AIPM_ASSETS = __path.join(AIPM_APP_DIR, 'assets');
function __playwright(){
  try { return require('playwright-core'); } catch(e){}
  try { return require('/opt/muse/assets/spaces/ts-runtime/dist/node_modules/playwright-core'); } catch(e){}
  throw new Error('找不到 playwright-core：请在应用根目录执行 npm install（见 README 的测试运行说明）');
}
function __chromePath(){
  if(process.env.CHROMIUM_PATH){ return process.env.CHROMIUM_PATH; }
  if(__fs.existsSync('/opt/meta-chromium/chrome')){ return '/opt/meta-chromium/chrome'; }
  return undefined;
}
function __chromeArgs(){
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  const f = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
  if(__fs.existsSync(f)){ args.push('--hatch-webgl-allowed-domains-file=' + f, '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6'); }
  return args;
}

/* 全量回归 · 全局扫描：零 LLM 调用 / 零运行时外网请求 / 反游戏化 / 数据键清单 / 语法
 * 扫描对象：index.html + assets/*.js（页面实际加载的全部代码）。 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = AIPM_APP_DIR;
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
/* 5. localStorage 键清单 vs DATA_KEYS 十二键【批次 5 口径同步】 */
const keyRe = /aipm\.[a-z]+\.v1/g;
const usedKeys = [...new Set(all.match(keyRe) || [])].sort();
console.log('INFO 代码中出现的 aipm.* 键：' + JSON.stringify(usedKeys));
const m = texts['index.html'].match(/var DATA_KEYS = \[([^\]]+)\]/);
const dataKeys = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort();
report('数据键全部纳入 DATA_KEYS 十二键口径【批次 5 同步】', JSON.stringify(usedKeys) === JSON.stringify(dataKeys),
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
