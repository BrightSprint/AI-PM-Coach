'use strict';
/* AI PM Coach 批次 8 自测脚本（四）：补充验证——复审条目中已实现但此前无专属用例的三项
 * DAT-20（二-4 导入后最近成绩口径与横幅刷新）/ WRB-10 + FAV-12（二-5 错题本与收藏夹双向对称入口）/ SUB-01（二-7 子集测评结果页文案）
 * 运行：node 自测脚本-批次8-补充验证.js
 * 路径解析与运行环境同其他脚本（脚本所在副本优先）。结果逐条 PASS/FAIL 打印。 */

/* ===== 批次 8（三-2）可移植路径解析：脚本默认测「所在副本」 ===== */
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

const fs = require('fs');
const vm = require('vm');
global.window = globalThis;
vm.runInThisContext(fs.readFileSync(__path.join(AIPM_ASSETS, 'quiz-bank.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(__path.join(AIPM_ASSETS, 'diagnosis-data.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(__path.join(AIPM_ASSETS, 'review-link.js'), 'utf8'));
const BANK = global.QUIZ_BANK, PK = global.DIAG_DATA.POINT_KEYWORDS, RL = global.ReviewLink;
const DIMS = ['AI 基础认知', '场景洞察', '产品设计', '数据与评估', '技术协作', '商业与落地'];
const TWELVE_KEYS = ['aipm.attempts.v1', 'aipm.snapshots.v1', 'aipm.inprogress.v1', 'aipm.appeals.v1', 'aipm.learn.v1', 'aipm.quizcfg.v1', 'aipm.wrongbook.v1', 'aipm.stagequiz.v1', 'aipm.review.v1', 'aipm.drill.v1', 'aipm.favorites.v1', 'aipm.notes.v1'];

let pass = 0, fail = 0;
function check(id, name, cond, detail){
  const d = detail == null ? '' : String(detail).slice(0, 300);
  console.log((cond ? 'PASS ' : 'FAIL ') + id + ' · ' + name + (d ? ' — ' + d : ''));
  if (cond) pass++; else fail++;
}

const MAPPED_Q = BANK.find(q => RL.matchPointDetailed(q, DIMS.indexOf(q.dimension), PK).bestLen > 0);

const { chromium } = __playwright();
let browser;
const pageErrors = [];
async function newPage(){
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  return { ctx, page };
}
async function goto(page){ await page.goto(AIPM_APP_URL, { waitUntil: 'load' }); await page.waitForTimeout(350); }
async function lsGet(page, k){ return page.evaluate(key => window.localStorage.getItem(key), k); }
async function lsSet(page, k, v){ await page.evaluate(([key, val]) => window.localStorage.setItem(key, val), [k, typeof v === 'string' ? v : JSON.stringify(v)]); }
async function lsJSON(page, k){ const v = await lsGet(page, k); return v == null ? null : JSON.parse(v); }
async function activeView(page){ return page.evaluate(() => { const v = document.querySelector('.view.active'); return v ? v.id : null; }); }
async function clickGoto(page, viewId){ await page.evaluate(id => { const el = document.querySelector('[data-goto="' + id + '"]'); if (el) el.click(); }, viewId); await page.waitForTimeout(250); }
function rec(q, correct){
  return { questionId: q.id, src: q.src, dimension: q.dimension, userAnswer: correct ? q.answer : ['A','B','C','D'].find(L => L !== q.answer), correct: !!correct, skipped: false, timeSec: 5, difficulty: q.difficulty, stem: q.stem, sub_topic: q.sub_topic, exam_points: q.exam_points || [], difficulty_points: q.difficulty_points || [] };
}
function basePayload(overrides){
  const data = {};
  TWELVE_KEYS.forEach(k => {
    if (k === 'aipm.inprogress.v1'){ data[k] = null; return; }
    data[k] = (k === 'aipm.learn.v1' || k === 'aipm.quizcfg.v1' || k === 'aipm.wrongbook.v1' || k === 'aipm.stagequiz.v1' || k === 'aipm.review.v1' || k === 'aipm.drill.v1') ? {} : [];
  });
  Object.assign(data, overrides || {});
  return { app: 'ai-pm-coach', version: 1, exportedAt: new Date().toISOString(), data };
}
async function importPayload(page, payload, fileName){
  const p = __path.join('/tmp', fileName);
  fs.writeFileSync(p, JSON.stringify(payload));
  const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), page.click('#data-import-btn')]);
  await fc.setFiles(p);
  await page.waitForTimeout(500);
  await page.click('#data-import-confirm-btn');
  await page.waitForTimeout(500);
}

(async () => {
  browser = await chromium.launch({ executablePath: __chromePath(), args: __chromeArgs() });

  /* ===== DAT-20（二-4）：导入「最后一次是子集测评」的备份后，不刷新即按最近完整测评显示最弱维 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const fullQs = [];
    DIMS.forEach(d => fullQs.push(...BANK.filter(q => q.dimension === d).slice(0, 3)));
    const fullAttempt = { id: 'att-full', ts: Date.now() - 86400000, total: 18, right: 12, dimScores: [80, 80, 80, 40, 80, 80], records: fullQs.map(q => rec(q, true)) };
    const subDims = ['AI 基础认知', '产品设计', '技术协作'];
    const subQs = [];
    subDims.forEach(d => subQs.push(...BANK.filter(q => q.dimension === d).slice(0, 4)));
    const subAttempt = { id: 'att-sub', ts: Date.now() - 3600000, total: 12, right: 6, records: subQs.map(q => rec(q, false)) };
    const payload = basePayload({
      'aipm.attempts.v1': [fullAttempt, subAttempt],
      'aipm.snapshots.v1': [{ attemptId: 'att-full', ts: fullAttempt.ts, date: new Date(fullAttempt.ts).toISOString(), dimScores: [80, 80, 80, 40, 80, 80], totalScore: 73, answered: 18, correct: 12 }],
    });
    await importPayload(page, payload, 'b8-dat20.json');
    await clickGoto(page, 'view-learn');
    const recBefore = await page.evaluate(() => {
      const t = document.getElementById('learn-rec-title'); const d = document.getElementById('learn-rec-desc');
      return ((t ? t.textContent : '') + '|' + (d ? d.textContent : ''));
    });
    check('DAT-20', '导入后未刷新：学习推荐按最近完整测评的最弱维（数据与评估）呈现，不被最后的子集测评带偏', recBefore.includes('数据与评估'), recBefore.slice(0, 120));
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await clickGoto(page, 'view-learn');
    const recAfter = await page.evaluate(() => {
      const t = document.getElementById('learn-rec-title'); const d = document.getElementById('learn-rec-desc');
      return ((t ? t.textContent : '') + '|' + (d ? d.textContent : ''));
    });
    check('DAT-20', '导入后刷新：推荐口径与未刷新时一致（冷启动回溯同口径）', recAfter === recBefore, recAfter.slice(0, 120));
    await ctx.close();
  }

  /* ===== WRB-10 / FAV-12（二-5）：错题本条目有收藏按钮、收藏夹条目有去学知识点按钮 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const q = MAPPED_Q;
    const wrong = { id: 'att-w1', ts: Date.now() - 3600000, total: 1, right: 0, records: [rec(q, false)] };
    await lsSet(page, 'aipm.attempts.v1', [wrong]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await clickGoto(page, 'view-wrongbook');
    const wbInfo = await page.evaluate(() => {
      const item = document.querySelector('#wb-list .wb-item');
      if (!item) return { item: false };
      const fav = item.querySelector('.fav-toggle');
      return { item: true, favBtn: !!fav, favQid: fav ? fav.getAttribute('data-fav-qid') : null };
    });
    check('WRB-10', '错题本条目带收藏按钮（与结果页同款 .fav-toggle）', wbInfo.item && wbInfo.favBtn && String(wbInfo.favQid) === String(q.id), JSON.stringify(wbInfo));
    await page.evaluate(() => { document.querySelector('#wb-list .wb-item .fav-toggle').click(); });
    await page.waitForTimeout(250);
    const favs = await lsJSON(page, 'aipm.favorites.v1');
    check('WRB-10', '点错题本条目收藏按钮 → favorites 落盘该题', Array.isArray(favs) && favs.some(f => String(f.qid) === String(q.id)), 'favs=' + JSON.stringify(favs));
    await clickGoto(page, 'view-favorites');
    const favInfo = await page.evaluate(() => {
      const item = document.querySelector('#fav-list .fav-item, #fav-list .wb-item, .fav-item');
      if (!item) return { item: false };
      const b = item.querySelector('.wb-point-btn');
      return { item: true, pointBtn: !!b, label: b ? b.textContent : '' };
    });
    check('FAV-12', '收藏夹条目带「去学知识点」按钮（与错题本同口径）', favInfo.item && favInfo.pointBtn && favInfo.label.includes('去学知识点「'), JSON.stringify(favInfo));
    await page.evaluate(() => { document.querySelector('.wb-point-btn').click(); });
    await page.waitForTimeout(300);
    check('FAV-12', '点收藏夹「去学知识点」→ 对应知识点学习页', (await activeView(page)) === 'view-learn-detail', await activeView(page));
    await ctx.close();
  }

  /* ===== SUB-01（二-7）：子集测评结果页不出现「已切换到学习模式 / 优先补最弱维」文案 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.quizcfg.v1', { count: 12, dims: ['AI 基础认知', '产品设计', '技术协作'], startDiff: 'adaptive', scope: 'unseen' });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await clickGoto(page, 'view-intro');
    await page.click('#view-intro .doc-actions .btn-primary');
    await page.waitForTimeout(400);
    for (let i = 0; i < 30; i++) {
      if ((await activeView(page)) === 'view-result') break;
      const hasQ = await page.evaluate(() => !!document.querySelector('#q-options .opt'));
      if (!hasQ) { await page.waitForTimeout(200); continue; }
      await page.evaluate(() => { document.querySelectorAll('#q-options .opt')[0].click(); });
      await page.waitForTimeout(80);
      await page.click('#q-next');
      await page.waitForTimeout(160);
    }
    check('SUB-01', '子集测评（3 维 12 题）可完整走完到达结果页', (await activeView(page)) === 'view-result', await activeView(page));
    const resultText = await page.evaluate(() => document.getElementById('view-result').textContent);
    check('SUB-01', '子集结果页不写「已切换到学习模式」、不承诺「优先带你补」最弱维（推荐未更新，文案不撒谎）',
      !resultText.includes('已切换到学习模式') && !resultText.includes('路径会优先带你补'), resultText.slice(0, 100));
    await ctx.close();
  }

  /* ===== NAV-02（五-6）：药丸导航「数据管理」直达落地页底部数据管理区 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { const b = [...document.querySelectorAll('.pillnav [data-scrollto]')][0]; if (b) b.click(); });
    await page.waitForTimeout(600);
    const navInfo = await page.evaluate(() => {
      const slot = document.getElementById('data-mgmt-slot');
      const r = slot ? slot.getBoundingClientRect() : null;
      return { view: (document.querySelector('.view.active') || {}).id, slotTop: r ? Math.round(r.top) : null, vh: window.innerHeight, hasBtns: slot ? !!slot.querySelector('#data-import-btn, button') : false };
    });
    check('NAV-02', '学习页点药丸导航「数据管理」→ 回落地页且数据管理区进入视口（不再长滚动翻找）',
      navInfo.view === 'view-landing' && navInfo.slotTop !== null && navInfo.slotTop < navInfo.vh && navInfo.hasBtns, JSON.stringify(navInfo));
    await ctx.close();
  }

  /* ===== REV-10（G-08 残项）：快照时间戳在未来（改钟/时区漂移）时复测区不出现负天数/NaN ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const futureTs = Date.now() + 2 * 86400000;
    await lsSet(page, 'aipm.snapshots.v1', [{ attemptId: 'fut-1', ts: futureTs, date: new Date(futureTs).toISOString(), dimScores: [70, 70, 70, 70, 70, 70], totalScore: 70, answered: 18, correct: 10 }]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
    const homeText = await page.evaluate(() => document.getElementById('view-landing').textContent);
    check('REV-10', '未来时间戳快照：复测区正常渲染、无负天数与 NaN（天数差为负时落入「建议再过几天」分支）',
      !/NaN/.test(homeText) && !/-\s*\d+\s*天/.test(homeText) && homeText.includes('建议再过几天'), homeText.match(/建议再过几天[^。]*/) ? 'ok' : homeText.slice(0, 120));
    await ctx.close();
  }

  check('GLOBAL', '全程 pageerror 为 0', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  await browser.close();
  console.log('\n==== 批次 8（四）补充验证汇总：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
