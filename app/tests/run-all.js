'use strict';
/* AI PM Coach 全量自测运行器（批次 8 · 三-2/三-15 配套）
 * 用法：在 tests/ 目录执行 `node run-all.js`（或在包根执行 `node tests/run-all.js`）。
 * 依次运行本目录全部「自测脚本-*.js」，逐个打印其汇总行与退出状态；
 * 任一脚本失败（退出码非 0 或输出含 FAIL）则整体退出码为 1。
 * 浏览器类脚本需要 playwright-core（包根 `npm install`）与可用的 Chromium：
 * 无 node_modules 时会回退到系统已安装的 playwright-core（见各脚本头部路径解析说明），
 * Chromium 路径可用环境变量 CHROMIUM_PATH 指定。 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const scripts = fs.readdirSync(dir)
  .filter(f => f.startsWith('自测脚本-') && f.endsWith('.js'))
  .sort();

if (!scripts.length) { console.error('未找到自测脚本'); process.exit(1); }
let failed = 0;
const results = [];
for (const s of scripts) {
  console.log('\n===== ' + s + ' =====');
  const r = spawnSync(process.execPath, [path.join(dir, s)], { encoding: 'utf8', timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.split('\n').filter(l => /汇总|合计|passed|扫描完成/.test(l));
  lines.forEach(l => console.log(l.trim()));
  const hasFail = /\bFAIL\b|SCRIPT ERROR/.test(out) && !/FAIL 0/.test(out);
  const bad = r.status !== 0 || hasFail;
  if (bad) { failed++; console.log('!! 该脚本未通过（退出码 ' + r.status + '）'); }
  results.push({ script: s, ok: !bad });
}
console.log('\n===== run-all 汇总 =====');
results.forEach(x => console.log((x.ok ? 'PASS ' : 'FAIL ') + x.script));
console.log('脚本总数 ' + results.length + '，未通过 ' + failed);
process.exit(failed ? 1 : 0);
