'use strict';
/* AI PM Coach 批次 8 自测脚本（一）：状态联动 LNK / 映射口径 MAP / 冲突组合 PLN-13·SET-09·PLN-14 /
 * 复习边界 REV-07·REV-09 / 小题池 STG-07 / 错题本 WRB-08·09 / 导入 DAT-14·16·17·18·19 / 导航 NAV-01 / 练习重练 PRC-01
 * 运行：node 自测脚本-批次8-联动与数据.js
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
vm.runInThisContext(fs.readFileSync(__path.join(AIPM_ASSETS, 'goal-link.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(__path.join(AIPM_ASSETS, 'review-link.js'), 'utf8'));
const BANK = global.QUIZ_BANK, PK = global.DIAG_DATA.POINT_KEYWORDS, RL = global.ReviewLink, GL = global.GoalLink;
const DIMS = ['AI 基础认知', '场景洞察', '产品设计', '数据与评估', '技术协作', '商业与落地'];
const TWELVE_KEYS = ['aipm.attempts.v1', 'aipm.snapshots.v1', 'aipm.inprogress.v1', 'aipm.appeals.v1', 'aipm.learn.v1', 'aipm.quizcfg.v1', 'aipm.wrongbook.v1', 'aipm.stagequiz.v1', 'aipm.review.v1', 'aipm.drill.v1', 'aipm.favorites.v1', 'aipm.notes.v1'];

const results = [];
let pass = 0, fail = 0;
function check(id, name, cond, detail) {
  const d = detail == null ? '' : String(detail).slice(0, 300);
  console.log((cond ? 'PASS ' : 'FAIL ') + id + ' · ' + name + (d ? ' — ' + d : ''));
  results.push({ id, name, pass: !!cond, detail: d });
  if (cond) pass++; else fail++;
}

/* ================= Node 层 ================= */
/* MAP-01（一-4）：两口径同为 380；POINTS_BY_DIM 三处一致 */
{
  let covRL = 0, covPractice = 0;
  BANK.forEach(q => {
    const di = DIMS.indexOf(q.dimension);
    if (RL.matchPointDetailed(q, di, PK).bestLen > 0) covRL++;
    if (RL.POINTS_BY_DIM[di].some(pi => GL.relevanceOf(q, PK[pi]).hits > 0)) covPractice++;
  });
  check('MAP-01', '统一口径覆盖 380/634（59.9%），与练习口径一致', covRL === 380 && covPractice === 380, 'reviewLink=' + covRL + ' practice=' + covPractice);
  const html = fs.readFileSync(__path.join(AIPM_APP_DIR, 'index.html'), 'utf8');
  const grab = t => { const m = t.match(/POINTS_BY_DIM = (\[\[.*?\]\])/s); return m ? m[1].replace(/\s+/g, '') : null; };
  const fromDiag = grab(fs.readFileSync(__path.join(AIPM_ASSETS, 'diagnosis.js'), 'utf8'));
  const fromGoal = grab(fs.readFileSync(__path.join(AIPM_ASSETS, 'goal-link.js'), 'utf8'));
  const canon = JSON.stringify(RL.POINTS_BY_DIM).replace(/\s+/g, '');
  check('MAP-01', 'POINTS_BY_DIM 三处（diagnosis/goal-link/review-link）逐字一致', fromDiag === canon && fromGoal === canon);
}
/* PLN-13（G-07）：normalizeQuizCfg 冲突组合 */
{
  const fake = GL.normalizeQuizCfg({ weakestNotice: { dim: '不存在的维度', score: 50 }, weakestPending: true, count: 12 }, DIMS);
  check('PLN-13', '伪维度 weakestNotice 被清为 null，其余字段保留', fake.weakestNotice === null && fake.weakestPending === true && fake.count === 12, JSON.stringify(fake.weakestNotice));
  const good = GL.normalizeQuizCfg({ weakestNotice: { dim: '数据与评估', score: 45 } }, DIMS);
  check('PLN-13', '合法 weakestNotice 原样保留', !!good.weakestNotice && good.weakestNotice.dim === '数据与评估' && good.weakestNotice.score === 45);
  const weird = GL.normalizeQuizCfg({ count: 13, dims: ['不存在的维度'], startDiff: 'xxx', scope: 'yyy', weakestPending: 'yes' }, DIMS);
  check('PLN-13', '全坏字段组合回落默认、不抛错', weird.count === 18 && weird.dims.length === 6 && weird.weakestPending === false, JSON.stringify(weird).slice(0, 120));
  const stages = new Array(27).fill(0);
  RL.POINTS_BY_DIM.forEach((pts, di) => pts.forEach(pi => { stages[pi] = di; }));
  const plan = GL.normalizePlan({ mode: 'custom', dims: ['AI 基础认知'], pointIds: [0, 999, -1, 3], pinnedFirst: [999, 0] }, DIMS, stages);
  check('PLN-13', '计划 pointIds 越界被剔除、pinnedFirst 只保留计划内成员', JSON.stringify(plan.pointIds) === '[0,3]' && JSON.stringify(plan.pinnedFirst) === '[0]',
    'pointIds=' + JSON.stringify(plan.pointIds) + ' pinned=' + JSON.stringify(plan.pinnedFirst));
  let threw = false, planBad = null;
  try { planBad = GL.normalizePlan({ mode: 'custom', pointIds: 'oops', pinnedFirst: 999 }, DIMS, stages); } catch (e) { threw = true; }
  check('PLN-13', 'pointIds/pinnedFirst 为非数组坏值时不抛错（G-07 衍生加固）', !threw && !!planBad && Array.isArray(planBad.pointIds),
    threw ? 'threw' : 'pointIds=' + JSON.stringify(planBad && planBad.pointIds));
}
/* REV-07（G-08）：闰年日期链 */
{
  check('REV-07', '2024-02-28 +1 = 2024-02-29（闰年）', RL.addDaysStr('2024-02-28', 1) === '2024-02-29', RL.addDaysStr('2024-02-28', 1));
  let rv = { 7: { stage: 0, due: '2024-02-28', lastResult: null, source: 'attempt' } };
  const chain = [];
  let today = '2024-02-28';
  for (let i = 0; i < 4; i++) { rv = RL.applyReviewResult(rv, 7, true, today); chain.push(rv[7].due); today = rv[7].due; }
  check('REV-07', '连对四级到期链跨闰日正确', JSON.stringify(chain) === JSON.stringify(['2024-03-02', '2024-03-09', '2024-03-23', '2024-04-22']), chain.join(' → '));
}
/* STG-07（G-09a）：小题池抽题 */
{
  const pool = BANK.slice(0, 3);
  const picked = RL.pickStageQuestions(pool, [], 5).questions;
  check('STG-07', '题池 3 题请求抽 5：返回 3 题不重复不抛错', picked.length === 3 && new Set(picked.map(q => q.id)).size === 3, 'n=' + picked.length);
}
/* 找一道统一口径下零命中的题（WRB-08 用） */
const UNMAPPED_Q = BANK.find(q => RL.matchPointDetailed(q, DIMS.indexOf(q.dimension), PK).bestLen === 0);
const MAPPED_Q = BANK.find(q => RL.matchPointDetailed(q, DIMS.indexOf(q.dimension), PK).bestLen > 0);

/* ================= 浏览器层 ================= */
const { chromium } = __playwright();
let browser;
const pageErrors = [];
async function newPage() {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(e.message + ' @ ' + String(e.stack || '').split('\n')[1]));
  return { ctx, page };
}
async function goto(page) { await page.goto(AIPM_APP_URL, { waitUntil: 'load' }); await page.waitForTimeout(350); }
async function lsGet(page, k) { return page.evaluate(key => window.localStorage.getItem(key), k); }
async function lsSet(page, k, v) { await page.evaluate(([key, val]) => window.localStorage.setItem(key, val), [k, typeof v === 'string' ? v : JSON.stringify(v)]); }
async function lsJSON(page, k) { const v = await lsGet(page, k); return v == null ? null : JSON.parse(v); }
async function activeView(page) { return page.evaluate(() => { const v = document.querySelector('.view.active'); return v ? v.id : null; }); }
function wrongAttempt(q, extra) {
  return Object.assign({
    id: 'att-seed-1', ts: Date.now() - 3600000, total: 1, right: 0,
    records: [{ questionId: q.id, src: q.src, dimension: q.dimension, userAnswer: ['A', 'B', 'C', 'D'].find(L => L !== q.answer), correct: false, skipped: false, timeSec: 5, difficulty: q.difficulty, stem: q.stem, sub_topic: q.sub_topic, exam_points: q.exam_points || [], difficulty_points: q.difficulty_points || [] }],
  }, extra || {});
}
async function importPayload(page, payload, fileName) {
  const p = __path.join('/tmp', fileName);
  fs.writeFileSync(p, typeof payload === 'string' ? payload : JSON.stringify(payload));
  const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), page.click('#data-import-btn')]);
  await fc.setFiles(p);
  await page.waitForTimeout(500);
}
function basePayload(dataOverrides) {
  const data = {};
  TWELVE_KEYS.forEach(k => {
    if (k === 'aipm.inprogress.v1') { data[k] = null; return; }
    data[k] = k === 'aipm.learn.v1' || k === 'aipm.quizcfg.v1' || k === 'aipm.wrongbook.v1' || k === 'aipm.stagequiz.v1' || k === 'aipm.review.v1' || k === 'aipm.drill.v1' ? {} : [];
  });
  Object.assign(data, dataOverrides || {});
  return { app: 'ai-pm-coach', version: 1, exportedAt: new Date().toISOString(), data };
}

(async () => {
  browser = await chromium.launch({ executablePath: __chromePath(), args: __chromeArgs() });
  const today = RL.todayStr();

  /* ===== LNK-01：错题本重做联动（答对进阶 / 答错回退） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const q = MAPPED_Q;
    await lsSet(page, 'aipm.attempts.v1', [wrongAttempt(q)]);
    await lsSet(page, 'aipm.review.v1', { [q.id]: { stage: 0, due: today, lastResult: null, source: 'attempt' } });
    const attemptsBefore = await lsGet(page, 'aipm.attempts.v1');
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await page.evaluate(() => { document.querySelector('[data-goto="view-wrongbook"]').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#wb-list .wb-item .sq-btn').click(); });
    await page.waitForTimeout(250);
    await page.evaluate(i => { document.querySelectorAll('#wb-list .wb-item .redo-box .p-opt')[i].click(); }, 'ABCD'.indexOf(q.answer));
    await page.waitForTimeout(300);
    let wb = await lsJSON(page, 'aipm.wrongbook.v1');
    let rv = await lsJSON(page, 'aipm.review.v1');
    check('LNK-01', '错题本重做答对：mastered 落盘 + 复习队列 stage 0→1、到期 +3 天',
      !!(wb.mastered && wb.mastered[q.id]) && rv[q.id].stage === 1 && rv[q.id].due === RL.addDaysStr(today, 3),
      'stage=' + (rv[q.id] && rv[q.id].stage) + ' due=' + (rv[q.id] && rv[q.id].due));
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await page.evaluate(() => { document.querySelector('[data-goto="view-wrongbook"]').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#wb-list .wb-item .sq-btn').click(); });
    await page.waitForTimeout(250);
    const wrongL = ['A', 'B', 'C', 'D'].find(L => L !== q.answer);
    await page.evaluate(i => { document.querySelectorAll('#wb-list .wb-item .redo-box .p-opt')[i].click(); }, 'ABCD'.indexOf(wrongL));
    await page.waitForTimeout(300);
    wb = await lsJSON(page, 'aipm.wrongbook.v1');
    rv = await lsJSON(page, 'aipm.review.v1');
    const attemptsAfter = await lsGet(page, 'aipm.attempts.v1');
    check('LNK-01', '错题本重做答错：mastered 清除 + 队列回 stage 0；attempts 字节不变',
      !(wb.mastered && wb.mastered[q.id]) && rv[q.id].stage === 0 && attemptsBefore === attemptsAfter,
      'stage=' + (rv[q.id] && rv[q.id].stage));
    await ctx.close();
  }

  /* ===== LNK-02：复习作答联动错题本 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const q = MAPPED_Q;
    await lsSet(page, 'aipm.attempts.v1', [wrongAttempt(q)]);
    await lsSet(page, 'aipm.review.v1', { [q.id]: { stage: 0, due: today, lastResult: null, source: 'attempt' } });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await page.evaluate(() => { document.querySelector('[data-goto="view-learn"]').click(); });
    await page.waitForTimeout(300);
    await page.click('#review-start-btn');
    await page.waitForTimeout(300);
    await page.evaluate(i => { document.querySelectorAll('#rv-options .opt')[i].click(); }, 'ABCD'.indexOf(q.answer));
    await page.waitForTimeout(300);
    const wb = await lsJSON(page, 'aipm.wrongbook.v1');
    check('LNK-02', '复习答对：错题本同步记已掌握', !!(wb.mastered && wb.mastered[q.id]), 'mastered=' + JSON.stringify(wb.mastered || {}));
    await ctx.close();
  }

  /* ===== WRB-08 / WRB-09：未映射题入口明示 + 空状态 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#view-learn .doc-actions button')].find(x => x.getAttribute('data-goto') === 'view-wrongbook'); b.click(); });
    await page.waitForTimeout(300);
    const emptyTxt = await page.evaluate(() => document.getElementById('wb-list').textContent);
    check('WRB-09', '无记录时错题本空状态可达', (await activeView(page)) === 'view-wrongbook' && emptyTxt.includes('还没有错题'), emptyTxt.slice(0, 40));
    const q = UNMAPPED_Q;
    await lsSet(page, 'aipm.attempts.v1', [wrongAttempt(q)]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await page.evaluate(() => { document.querySelector('[data-goto="view-wrongbook"]').click(); });
    await page.waitForTimeout(300);
    const btnTxt = await page.evaluate(() => { const b = document.querySelector('#wb-list .wb-item .wb-point-btn'); return b ? b.textContent : ''; });
    check('WRB-08', '未精确匹配题按钮明示且不点名知识点', btnTxt.includes('未精确匹配') && !btnTxt.includes('「'), btnTxt);
    await page.evaluate(() => { document.querySelector('#wb-list .wb-item .wb-point-btn').click(); });
    await page.waitForTimeout(400);
    check('WRB-08', '点击未映射入口跳学习页本维路径', (await activeView(page)) === 'view-learn');
    await ctx.close();
  }

  /* ===== REV-09：复习总览常驻 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await page.evaluate(() => { document.querySelector('[data-goto="view-learn"]').click(); });
    await page.waitForTimeout(300);
    const ov1 = await page.evaluate(() => { const o = document.getElementById('review-overview'); return { vis: !!o && o.offsetParent !== null, desc: document.getElementById('review-overview-desc').textContent }; });
    check('REV-09', '空队列时总览常驻可见且说明为空', ov1.vis && ov1.desc.includes('空的'), ov1.desc.slice(0, 40));
    await page.click('#review-overview-btn');
    await page.waitForTimeout(300);
    check('REV-09', '总览按钮可进入复习页', (await activeView(page)) === 'view-review');
    const q = MAPPED_Q;
    await lsSet(page, 'aipm.review.v1', { [q.id]: { stage: 2, due: RL.addDaysStr(today, 7), lastResult: 'correct', source: 'attempt' } });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await page.evaluate(() => { document.querySelector('[data-goto="view-learn"]').click(); });
    await page.waitForTimeout(300);
    const ov2 = await page.evaluate(() => document.getElementById('review-overview-desc').textContent);
    check('REV-09', '有队列无到期时总览显示总数与最近到期日', ov2.includes('共 1 道题') && ov2.includes(RL.addDaysStr(today, 7)), ov2.slice(0, 80));
    await ctx.close();
  }

  /* ===== DAT-14：导入清洁与计数一致（G-01） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const q1 = BANK[0], q2 = BANK[1];
    const payload = basePayload({
      'aipm.favorites.v1': [
        { qid: q1.id, ts: 1000 }, { qid: q1.id, ts: 2000 }, { qid: 999999, ts: 3000 }, { qid: q2.id, ts: 'bad' }, { qid: q2.id, ts: 4000 },
      ],
      'aipm.notes.v1': [
        { id: 'n-dup', text: '第一条', source: { type: 'custom', label: '自定义笔记' }, remark: '', createdAt: 1, updatedAt: 1 },
        { id: 'n-dup', text: '重复 id 第二条', source: { type: 'custom', label: '自定义笔记' }, remark: '', createdAt: 2, updatedAt: 2 },
        { id: 'n-bad', source: { type: 'custom', label: 'x' } },
        { id: 'n-ok', text: '正常一条', source: { type: 'kp', label: '知识点' }, remark: '', createdAt: 3, updatedAt: 3 },
      ],
      'aipm.snapshots.v1': [
        { attemptId: 'a1', total: 50, dimScores: [50, 50, 50, 50, 50, 50] },
        { attemptId: 'a1', total: 66, dimScores: [66, 66, 66, 66, 66, 66] },
        { attemptId: 'a2', total: 70, dimScores: [70, 70, 70, 70, 70, 70] },
        { attemptId: 'a3', total: 99 },
      ],
    });
    await importPayload(page, payload, 'b8-dat14.json');
    await page.click('#data-import-confirm-btn');
    await page.waitForTimeout(450);
    const counts = await page.evaluate(() => { const o = {}; document.querySelectorAll('#data-mgmt-slot [data-count]').forEach(e => { o[e.getAttribute('data-count')] = +e.textContent.trim(); }); return o; });
    const favStored = await lsJSON(page, 'aipm.favorites.v1');
    const notesStored = await lsJSON(page, 'aipm.notes.v1');
    const snapsStored = await lsJSON(page, 'aipm.snapshots.v1');
    check('DAT-14', '导入清洁：收藏去重/剔未知/剔坏 ts（剩 2）、笔记按 id 去重+剔坏条（剩 2）、快照按 attemptId 留最后且剔除无 dimScores 条（剩 2 且 total=66）',
      favStored.length === 2 && notesStored.length === 2 && snapsStored.length === 2 && snapsStored.find(s => s.attemptId === 'a1').total === 66,
      'fav=' + favStored.length + ' notes=' + notesStored.length + ' snaps=' + snapsStored.length);
    check('DAT-14', '概览计数与清洁后存储一致', counts.favorites === 2 && counts.notes === 2, JSON.stringify(counts));
    await page.evaluate(() => { document.querySelector('[data-goto="view-notes"]').click(); });
    await page.waitForTimeout(300);
    const noteItems = await page.evaluate(() => document.querySelectorAll('#note-list .note-item').length);
    check('DAT-14', '笔记页渲染条数与计数一致（重复 id 不重复渲染）', noteItems === 2, 'items=' + noteItems);
    await page.click('.note-item .note-delete-btn');
    await page.waitForTimeout(150);
    await page.click('.note-item .note-delete-btn');
    await page.waitForTimeout(300);
    const notesAfterDel = await lsJSON(page, 'aipm.notes.v1');
    check('DAT-14', '删一条笔记只减一条（重复 id 不连带删）', notesAfterDel.length === 1, 'left=' + notesAfterDel.length);
    await ctx.close();
  }

  /* ===== DAT-19：未来版本拒绝 / 未知键忽略（G-12） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.attempts.v1', [{ id: 'keep-me', records: [] }]);
    const v2 = basePayload({}); v2.version = 2;
    await importPayload(page, v2, 'b8-dat19-v2.json');
    const msg = await page.evaluate(() => { const m = document.querySelector('#data-mgmt-slot .data-msg'); return m ? m.textContent : ''; });
    const confirmVisible = await page.evaluate(() => !!document.getElementById('data-import-confirm'));
    const kept = await lsJSON(page, 'aipm.attempts.v1');
    check('DAT-19', 'version=2 备份被明确拒绝且不写入', !confirmVisible && msg.includes('版本') && kept.length === 1 && kept[0].id === 'keep-me', msg.slice(0, 60));
    const withUnknown = basePayload({}); withUnknown.data['aipm.unknown.v9'] = [1, 2, 3];
    await importPayload(page, withUnknown, 'b8-dat19-unknown.json');
    await page.click('#data-import-confirm-btn');
    await page.waitForTimeout(450);
    const unknownStored = await lsGet(page, 'aipm.unknown.v9');
    check('DAT-19', '未知额外键被忽略、不落盘', unknownStored === null);
    await ctx.close();
  }

  /* ===== DAT-18：BOM 备份可导入（G-10） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const payload = basePayload({ 'aipm.favorites.v1': [{ qid: BANK[2].id, ts: 5000 }] });
    await importPayload(page, '﻿' + JSON.stringify(payload), 'b8-dat18-bom.json');
    const confirmVisible = await page.evaluate(() => !!document.getElementById('data-import-confirm'));
    if (confirmVisible) { await page.click('#data-import-confirm-btn'); await page.waitForTimeout(450); }
    const favStored = await lsJSON(page, 'aipm.favorites.v1');
    check('DAT-18', '带 BOM 的备份可正常导入', confirmVisible && favStored.length === 1 && favStored[0].qid === BANK[2].id, 'fav=' + JSON.stringify(favStored));
    await ctx.close();
  }

  /* ===== DAT-17：跨环境导入往返（G-10） ===== */
  {
    const a = await newPage();
    await goto(a.page);
    const seedByKey = {
      'aipm.attempts.v1': [{ id: 'seed-att', ts: 1, records: [], dimScores: [60, 60, 60, 60, 60, 60], totalScore: 60, right: 0, total: 0 }],
      'aipm.snapshots.v1': [{ attemptId: 'seed-att', ts: 1, date: '2026-01-01T00:00:00.000Z', dimScores: [60, 60, 60, 60, 60, 60], totalScore: 60 }],
      'aipm.appeals.v1': [{ ts: 1, reason: 'seed' }],
      'aipm.learn.v1': { learned: [], practice: {}, plan: null },
      'aipm.quizcfg.v1': { count: 18, dims: DIMS.slice(), startDiff: 'adaptive', scope: 'unseen' },
      'aipm.wrongbook.v1': { mastered: {}, redo: {} },
      'aipm.stagequiz.v1': {},
      'aipm.review.v1': {},
      'aipm.drill.v1': {},
      'aipm.favorites.v1': [{ qid: 1, ts: 111 }],
      'aipm.notes.v1': [{ id: 'seed-note', text: '种子笔记', source: { type: 'custom', label: '自定义笔记' }, remark: '', createdAt: 1, updatedAt: 1 }],
    };
    for (const k of TWELVE_KEYS) {
      if (k === 'aipm.inprogress.v1') continue; /* 该键以 null 往返（两侧均无键，逐字一致） */
      await lsSet(a.page, k, seedByKey[k]);
    }
    const [dl] = await Promise.all([a.page.waitForEvent('download', { timeout: 8000 }), a.page.click('#data-export-btn')]);
    const dlPath = __path.join('/tmp', 'b8-dat17-export.json');
    await dl.saveAs(dlPath);
    const b = await newPage();
    await goto(b.page);
    const [fc] = await Promise.all([b.page.waitForEvent('filechooser', { timeout: 8000 }), b.page.click('#data-import-btn')]);
    await fc.setFiles(dlPath);
    await b.page.waitForTimeout(500);
    await b.page.click('#data-import-confirm-btn');
    await b.page.waitForTimeout(450);
    let allSame = true; const diffs = [];
    for (const k of TWELVE_KEYS) {
      const va = await lsGet(a.page, k); const vb = await lsGet(b.page, k);
      if (va !== vb) { allSame = false; diffs.push(k); }
    }
    check('DAT-17', '跨上下文导出→导入后 12 键逐字一致', allSame, diffs.join(','));
    await a.ctx.close(); await b.ctx.close();
  }

  /* ===== DAT-16：清空后各页空状态（G-09d） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const q = MAPPED_Q;
    await lsSet(page, 'aipm.attempts.v1', [wrongAttempt(q)]);
    await lsSet(page, 'aipm.favorites.v1', [{ qid: q.id, ts: 1 }]);
    await lsSet(page, 'aipm.notes.v1', [{ id: 'n1', text: 'x', source: { type: 'custom', label: '自定义笔记' }, remark: '', createdAt: 1, updatedAt: 1 }]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await page.click('#data-clear-btn');
    await page.waitForTimeout(250);
    await page.click('#data-clear-confirm-btn');
    await page.waitForTimeout(400);
    const keysLeft = await page.evaluate(() => Object.keys(window.localStorage).filter(k => k.startsWith('aipm.')));
    check('DAT-16', '清空后 12 键全无', keysLeft.length === 0, keysLeft.join(','));
    await page.evaluate(() => { document.querySelector('[data-goto="view-wrongbook"]').click(); });
    await page.waitForTimeout(300);
    const wbEmpty = await page.evaluate(() => document.getElementById('wb-list').textContent.includes('还没有错题'));
    await page.evaluate(() => { document.querySelector('[data-goto="view-favorites"]').click(); });
    await page.waitForTimeout(300);
    const favEmpty = await page.evaluate(() => { const e = document.getElementById('fav-empty'); return !!e && getComputedStyle(e).display !== 'none'; });
    check('DAT-16', '清空后错题本/收藏夹均呈空状态', wbEmpty && favEmpty);
    await ctx.close();
  }

  /* ===== NAV-01：药丸导航（五-2） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const targets = [['开始测评', 'view-intro'], ['学习路径', 'view-learn'], ['知识搜索', 'view-glossary'], ['错题本', 'view-wrongbook'], ['收藏夹', 'view-favorites'], ['学习笔记', 'view-notes'], ['面试演练', 'view-drill']];
    let okCount = 0;
    for (const [label, view] of targets) {
      await goto(page);
      await page.evaluate(l => { const b = [...document.querySelectorAll('#view-landing .pillnav button')].find(x => x.textContent.trim() === l); if (b) b.click(); }, label);
      await page.waitForTimeout(300);
      if ((await activeView(page)) === view) okCount++;
    }
    check('NAV-01', '落地页药丸导航 7 个入口全部可达', okCount === 7, 'ok=' + okCount + '/7');
    await goto(page);
    await page.evaluate(() => { document.querySelector('[data-goto="view-learn"]').click(); });
    await page.waitForTimeout(300);
    const learnNav = await page.evaluate(() => document.querySelectorAll('#view-learn .pillnav button').length);
    check('NAV-01', '学习页同样有药丸导航（8 个：7 视图 + 数据管理锚点，五-6 后口径）', learnNav === 8, 'n=' + learnNav);
    await ctx.close();
  }

  /* ===== PRC-01：练习再练一次（五-5） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await page.evaluate(() => { document.querySelector('[data-goto="view-learn"]').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#path-list .point-list button, #path-list button').click(); });
    await page.waitForTimeout(400);
    const reviewBefore = await lsGet(page, 'aipm.review.v1');
    await page.evaluate(() => { const card = document.querySelectorAll('.practice-card')[1]; card.querySelectorAll('.p-opt')[0].click(); });
    await page.waitForTimeout(300);
    const practiceAfterFirst = await lsGet(page, 'aipm.learn.v1');
    /* 「再练一次」按已保存状态渲染：离开知识点再重进才出现（与用户回访路径一致） */
    await page.evaluate(() => { document.querySelector('[data-goto="view-learn"]').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#path-list .point-list button, #path-list button').click(); });
    await page.waitForTimeout(400);
    const retryVisible = await page.evaluate(() => { const b = document.querySelector('.practice-retry'); return !!b && b.offsetParent !== null; });
    check('PRC-01', '重进已答知识点出现「再练一次（不计入记录）」', retryVisible);
    await page.evaluate(() => { document.querySelector('.practice-retry').click(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const card = document.querySelectorAll('.practice-card')[1]; const opts = card.querySelectorAll('.p-opt'); opts[opts.length - 1].click(); });
    await page.waitForTimeout(300);
    const practiceAfterRetry = await lsGet(page, 'aipm.learn.v1');
    const reviewAfter = await lsGet(page, 'aipm.review.v1');
    check('PRC-01', '再练一次不覆盖首次记录、不动复习队列', practiceAfterFirst === practiceAfterRetry && reviewBefore === reviewAfter);
    await ctx.close();
  }

  /* ===== SET-09 / PLN-14：待生效 × 自定义计划确认（二-8） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.learn.v1', { learned: [], practice: {}, plan: { mode: 'custom', dims: ['AI 基础认知'], pointIds: [0, 1], pinnedFirst: null } });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await page.evaluate(() => { document.querySelector('[data-goto="view-learn"]').click(); });
    await page.waitForTimeout(400);
    let dialogSeen = false;
    page.on('dialog', async d => { dialogSeen = true; await d.dismiss(); });
    await page.evaluate(() => { const b = [...document.querySelectorAll('.preset-btn')].find(x => x.textContent.includes('只学最弱维')); b.click(); });
    await page.waitForTimeout(400);
    const cfgAfterDismiss = await lsJSON(page, 'aipm.quizcfg.v1');
    check('SET-09', '已有自定义计划时点待生效先弹确认；取消则不置位', dialogSeen && !(cfgAfterDismiss && cfgAfterDismiss.weakestPending === true),
      'dialog=' + dialogSeen + ' pending=' + (cfgAfterDismiss && cfgAfterDismiss.weakestPending));
    page.removeAllListeners('dialog');
    page.on('dialog', async d => { await d.accept(); });
    await page.evaluate(() => { const b = [...document.querySelectorAll('.preset-btn')].find(x => x.textContent.includes('只学最弱维')); b.click(); });
    await page.waitForTimeout(400);
    const cfgAfterAccept = await lsJSON(page, 'aipm.quizcfg.v1');
    check('PLN-14', '确认后待生效置位（首次测评后将按最弱维替换自定义计划，PLN-09 覆盖生效链）',
      !!cfgAfterAccept && cfgAfterAccept.weakestPending === true, 'pending=' + (cfgAfterAccept && cfgAfterAccept.weakestPending));
    await ctx.close();
  }

  /* ===== LNK-03：收藏重做联动 + 诊断重做联动 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const q = MAPPED_Q;
    await lsSet(page, 'aipm.attempts.v1', [wrongAttempt(q)]);
    await lsSet(page, 'aipm.review.v1', { [q.id]: { stage: 0, due: today, lastResult: null, source: 'attempt' } });
    await lsSet(page, 'aipm.favorites.v1', [{ qid: q.id, ts: Date.now() }]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await page.evaluate(() => { document.querySelector('[data-goto="view-favorites"]').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#fav-list .fav-item .fav-redo-btn').click(); });
    await page.waitForTimeout(250);
    await page.evaluate(i => { document.querySelectorAll('#fav-list .fav-item .fav-redo .p-opt')[i].click(); }, 'ABCD'.indexOf(q.answer));
    await page.waitForTimeout(300);
    const wb = await lsJSON(page, 'aipm.wrongbook.v1');
    const rv = await lsJSON(page, 'aipm.review.v1');
    const attempts = await lsJSON(page, 'aipm.attempts.v1');
    check('LNK-03', '收藏重做答对：mastered + 队列进阶联动，attempts 不新增',
      !!(wb.mastered && wb.mastered[q.id]) && rv[q.id].stage === 1 && attempts.length === 1,
      'stage=' + (rv[q.id] && rv[q.id].stage) + ' attempts=' + attempts.length);
    await ctx.close();
  }

  /* ===== LNK-03（续）：诊断重做联动——真实测评一轮后在结果页诊断区重做 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await page.evaluate(() => { document.querySelector('[data-goto="view-intro"]').click(); });
    await page.waitForTimeout(300);
    await page.click('#view-intro .doc-actions .btn-primary');
    await page.waitForTimeout(350);
    /* 同一维度故意答错两道（诊断块的下一步按 learn/redo/resource 轮换，第二块才是 redo），其余答对 */
    let firstDim = null, wrongCount = 0;
    for (let i = 0; i < 24; i++) {
      if ((await activeView(page)) === 'view-result') break;
      const letter = await page.evaluate(([fd, wc]) => {
        const stem = document.querySelector('#q-stem').textContent;
        const dim = document.querySelector('#q-dim').textContent;
        const q = window.QUIZ_BANK.find(x => x.stem === stem && x.dimension === dim) || window.QUIZ_BANK.find(x => x.stem === stem);
        if (!q) return null;
        window.__dim = q.dimension;
        const wantWrong = (fd === null || q.dimension === fd) && wc < 2;
        window.__wantWrong = wantWrong;
        return wantWrong ? ['A', 'B', 'C', 'D'].find(L => L !== q.answer && q.options[L] != null) : q.answer;
      }, [firstDim, wrongCount]);
      const st = await page.evaluate(() => ({ dim: window.__dim, ww: !!window.__wantWrong }));
      if (firstDim === null) firstDim = st.dim;
      if (st.ww) wrongCount++;
      if (!letter) break;
      await page.evaluate(idx => { document.querySelectorAll('#q-options .opt')[idx].click(); }, 'ABCD'.indexOf(letter));
      await page.waitForTimeout(80);
      await page.click('#q-next');
      await page.waitForTimeout(150);
    }
    check('LNK-03', '真实测评一轮到达结果页（同维 2 错、其余对）', (await activeView(page)) === 'view-result' && wrongCount === 2, 'wrong=' + wrongCount);
    await page.waitForTimeout(400);
    const redoStem = await page.evaluate(() => { const s = document.querySelector('#diag-list .redo-box .practice-stem'); return s ? s.textContent : null; });
    const q2 = redoStem ? BANK.find(x => x.stem === redoStem) : null;
    check('LNK-03', '诊断区出现重做题', !!q2, redoStem ? redoStem.slice(0, 30) : 'none');
    if (q2) {
      await lsSet(page, 'aipm.review.v1', { [q2.id]: { stage: 0, due: today, lastResult: null, source: 'attempt' } });
      await page.evaluate(idx => { document.querySelectorAll('#diag-list .redo-box .p-opt')[idx].click(); }, 'ABCD'.indexOf(q2.answer));
      await page.waitForTimeout(300);
      const rv2 = await lsJSON(page, 'aipm.review.v1');
      const wb2 = await lsJSON(page, 'aipm.wrongbook.v1');
      const attempts2 = await lsJSON(page, 'aipm.attempts.v1');
      check('LNK-03', '诊断重做答对：队列进阶 + mastered 联动，attempts 仍为 1 条',
        rv2[q2.id].stage === 1 && !!(wb2.mastered && wb2.mastered[q2.id]) && attempts2.length === 1,
        'stage=' + (rv2[q2.id] && rv2[q2.id].stage) + ' attempts=' + attempts2.length);
    }
    await ctx.close();
  }

  check('GLOBAL', '全程 pageerror 为 0', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  await browser.close();
  console.log('\n==== 批次 8（一）汇总：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  fs.writeFileSync('/tmp/b8-part1-results.json', JSON.stringify(results, null, 2));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常', e); process.exit(2); });
