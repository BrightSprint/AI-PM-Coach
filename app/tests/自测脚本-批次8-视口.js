'use strict';
/*
 * AI PM Coach 批次 8 自测脚本（三）：视口矩阵（G-06）
 * 覆盖用例：VW-01（8+ 主要视图 × 3 视口无横向溢出）
 * 运行：node 自测脚本-批次8-视口.js（路径解析与其它脚本一致：测脚本所在副本）
 */
const path = require('path');
const fs = require('fs');
function __resolveAppDir() {
  const cands = [];
  if (process.env.AIPM_APP_DIR) cands.push(process.env.AIPM_APP_DIR);
  cands.push(path.resolve(__dirname, '..', 'app'));
  cands.push(path.resolve(__dirname, '..', 'ts-spaces', 'ai-pm-coach'));
  cands.push(__dirname);
  for (const c of cands) { if (fs.existsSync(path.join(c, 'index.html'))) return c; }
  return cands[0];
}
const AIPM_APP_DIR = __resolveAppDir();
const AIPM_APP_URL = 'file://' + path.join(AIPM_APP_DIR, 'index.html');
function __playwright() {
  try { return require('playwright-core'); }
  catch (e) { return require('/opt/muse/assets/spaces/ts-runtime/dist/node_modules/playwright-core'); }
}
function __chromiumArgs() {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  const gl = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
  if (fs.existsSync(gl)) {
    args.push('--hatch-webgl-allowed-domains-file=' + gl);
    args.push('--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6');
  }
  return args;
}
const { chromium } = __playwright();

let pass = 0, fail = 0; const failures = [];
function check(id, name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + id + ' · ' + name + (detail ? ' — ' + String(detail).slice(0, 200) : ''));
  if (cond) pass++; else { fail++; failures.push(id + ' ' + name); }
}
const pageErrors = [];

const VIEWPORTS = [
  { name: '1280×800 桌面', width: 1280, height: 800 },
  { name: '768×1024 平板', width: 768, height: 1024 },
  { name: '390×844 手机', width: 390, height: 844 },
];

async function overflowOf(page) {
  return page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
    bw: document.body ? document.body.scrollWidth : 0,
  }));
}

(async () => {
  const launchOpts = { args: __chromiumArgs() };
  if (!process.env.CHROMIUM_PATH && fs.existsSync('/opt/meta-chromium/chrome')) launchOpts.executablePath = '/opt/meta-chromium/chrome';
  if (process.env.CHROMIUM_PATH) launchOpts.executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(launchOpts);

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto(AIPM_APP_URL, { waitUntil: 'load' });
    await page.waitForTimeout(350);
    const results = [];
    const probe = async (label) => {
      await page.waitForTimeout(200);
      const o = await overflowOf(page);
      results.push(label + ':' + (o.sw <= o.iw + 1 ? 'ok' : 'OVERFLOW sw=' + o.sw + ' iw=' + o.iw));
    };
    await probe('落地页');
    const gotoView = async (id) => { await page.evaluate(v => { const el = document.querySelector('[data-goto="' + v + '"]'); if (el) el.click(); }, id); await page.waitForTimeout(250); };
    await gotoView('view-intro'); await probe('测评介绍页');
    await gotoView('view-learn'); await probe('学习页');
    await page.evaluate(() => { const b = document.querySelector('#path-list .point-list button, #path-list button'); if (b) b.click(); });
    await probe('知识点详情页');
    await gotoView('view-glossary'); await probe('知识搜索页');
    await page.evaluate(() => { const el = document.querySelector('#glossary-list .gl-item, #glossary-results .gl-item'); if (el) el.click(); });
    await probe('词条详情页');
    await gotoView('view-wrongbook'); await probe('错题本页');
    await gotoView('view-favorites'); await probe('收藏夹页');
    await gotoView('view-notes'); await probe('学习笔记页');
    await gotoView('view-drill'); await probe('面试演练页');
    await gotoView('view-landing'); await probe('落地页（回访）');
    const bad = results.filter(r => r.includes('OVERFLOW'));
    check('VW-01', vp.name + ' · 11 个视图无横向溢出', bad.length === 0, results.join(' '));
    await ctx.close();
  }

  check('GLOBAL', '全程 pageerror 为 0', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  console.log('\n==== 批次 8（三）视口汇总：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  if (failures.length) console.log('失败项：\n - ' + failures.join('\n - '));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
