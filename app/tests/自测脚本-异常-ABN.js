'use strict';
/* AI PM Coach 异常测试脚本（ABN 组）：断网 / 突然关闭 / 断电强杀模拟 / 存储损坏
 * 运行：node 自测脚本-异常-ABN.js
 * 无头 Chromium（playwright-core），对象为 ts-spaces 真源 index.html（file://）。
 * 结果逐条 PASS/FAIL 打印，汇总 JSON 落 /tmp/abn-results.json。 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('/opt/muse/assets/spaces/ts-runtime/dist/node_modules/playwright-core');
const BASE = 'file:///home/hatch/workspace/ts-spaces/ai-pm-coach/index.html';
const ORIGIN = 'file:///home/hatch/workspace/ts-spaces/ai-pm-coach';
const TEN_KEYS = ['aipm.attempts.v1', 'aipm.snapshots.v1', 'aipm.inprogress.v1', 'aipm.appeals.v1', 'aipm.learn.v1', 'aipm.quizcfg.v1', 'aipm.wrongbook.v1', 'aipm.stagequiz.v1', 'aipm.review.v1', 'aipm.drill.v1'];
const CHROME = '/opt/meta-chromium/chrome';
const CARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--hatch-webgl-allowed-domains-file=/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt', '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6'];

const results = [];
let pass = 0, fail = 0;
function check(id, name, cond, detail) {
  const d = detail == null ? '' : String(detail).slice(0, 300);
  console.log((cond ? 'PASS ' : 'FAIL ') + id + ' · ' + name + (d ? ' — ' + d : ''));
  results.push({ id, name, pass: !!cond, detail: d });
  if (cond) pass++; else fail++;
}
let browser;
const pageErrors = [];
const failedHttp = [];
async function newPage(ctx) {
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('requestfailed', r => { const u = r.url(); if (/^https?:/.test(u)) failedHttp.push(u); });
  return page;
}
async function goto(page) { await page.goto(BASE, { waitUntil: 'load' }); await page.waitForTimeout(350); }
async function lsGet(page, k) { return page.evaluate(key => window.localStorage.getItem(key), k); }
async function lsSet(page, k, v) { await page.evaluate(([key, val]) => window.localStorage.setItem(key, val), [k, typeof v === 'string' ? v : JSON.stringify(v)]); }
async function activeView(page) { return page.evaluate(() => { const v = document.querySelector('.view.active'); return v ? v.id : null; }); }
async function textOf(page, sel) { return page.evaluate(s => { const el = document.querySelector(s); return el ? el.textContent : null; }, sel); }
async function clickGoto(page, viewId) { await page.evaluate(id => { const el = document.querySelector('.view.active [data-goto="' + id + '"]') || document.querySelector('[data-goto="' + id + '"]'); if (el) el.click(); }, viewId); await page.waitForTimeout(280); }
async function currentBankQ(page, stemSel, dimSel) {
  return page.evaluate(([ss, ds]) => {
    const stem = document.querySelector(ss).textContent;
    const dim = document.querySelector(ds).textContent;
    const q = window.QUIZ_BANK.find(x => x.stem === stem && x.dimension === dim) || window.QUIZ_BANK.find(x => x.stem === stem);
    return q ? JSON.parse(JSON.stringify(q)) : null;
  }, [stemSel, dimSel]);
}
async function answerCurrent(page, mode, optSel, nextSel, stemSel, dimSel) {
  const q = await currentBankQ(page, stemSel, dimSel);
  if (!q) throw new Error('题库未匹配当前题');
  if (mode === 'skip') { await page.click(nextSel.skip); await page.waitForTimeout(130); return q; }
  const letter = mode === 'wrong' ? ['A', 'B', 'C', 'D'].find(L => L !== q.answer) : q.answer;
  await page.evaluate(([s, i]) => { document.querySelectorAll(s)[i].click(); }, [optSel, 'ABCD'.indexOf(letter)]);
  await page.waitForTimeout(60);
  await page.click(nextSel.next);
  await page.waitForTimeout(140);
  return q;
}
const MAIN = { opt: '#q-options .opt', next: '#q-next', skip: '#q-skip', stem: '#q-stem', dim: '#q-dim' };
async function startQuizFromLanding(page) {
  await clickGoto(page, 'view-intro');
  await page.click('#view-intro .doc-actions .btn-primary');
  await page.waitForTimeout(300);
}
function errorsSince(n) { return pageErrors.slice(n); }

(async () => {
  browser = await chromium.launch({ executablePath: CHROME, args: CARGS });

  /* ================= ABN-01 断网·答题中 ================= */
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await goto(page);
    await startQuizFromLanding(page);
    await answerCurrent(page, 'correct', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    await answerCurrent(page, 'wrong', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    const e0 = pageErrors.length, f0 = failedHttp.length;
    await ctx.setOffline(true);
    for (let i = 0; i < 16; i++) await answerCurrent(page, i % 2 ? 'wrong' : 'correct', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    await page.waitForTimeout(400);
    check('ABN-01', '断网·答题中：离线后答完余下 16 题并到达结果页', (await activeView(page)) === 'view-result', await activeView(page));
    check('ABN-01', '断网·答题中：离线期间零 pageerror、零 http 请求失败', errorsSince(e0).length === 0 && failedHttp.length === f0, errorsSince(e0).join(';').slice(0, 160));
    await ctx.setOffline(false);
    await ctx.close();
  }

  /* ================= ABN-02 断网·学习中（含知识搜索） ================= */
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await goto(page);
    await ctx.setOffline(true);
    const e0 = pageErrors.length, f0 = failedHttp.length;
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { document.querySelector('#path-list .point-list button, #path-list button').click(); });
    await page.waitForTimeout(350);
    const inDetail = (await activeView(page)) === 'view-learn-detail';
    /* 练习题作答一张练习卡 */
    const pracOk = await page.evaluate(() => {
      const cards = document.querySelectorAll('#detail-wrap .practice-card');
      if (!cards.length) return 'nocard';
      for (const c of cards) {
        const opts = c.querySelectorAll('.p-opt');
        if (opts.length) { opts[0].click(); return 'clicked'; }
      }
      return 'noopt';
    });
    await page.waitForTimeout(250);
    const fb = await page.evaluate(() => { const e = document.querySelector('#detail-wrap .practice-explain.show'); return e ? e.textContent.length : 0; });
    check('ABN-02', '断网·学习中：知识点详情可打开且练习作答有反馈', inDetail && pracOk === 'clicked' && fb > 0, 'detail=' + inDetail + ' prac=' + pracOk + ' fbLen=' + fb);
    /* 知识搜索离线可用 */
    await clickGoto(page, 'view-glossary');
    await page.fill('#glo-input', '数据');
    await page.waitForTimeout(250);
    const gloCount = await page.evaluate(() => document.querySelectorAll('#glo-results .glo-item').length);
    check('ABN-02', '断网·学习中：知识搜索离线可检索出结果', (await activeView(page)) === 'view-glossary' && gloCount > 0, 'results=' + gloCount);
    check('ABN-02', '断网·学习中：全程零 pageerror、零 http 请求失败', errorsSince(e0).length === 0 && failedHttp.length === f0, errorsSince(e0).join(';').slice(0, 160));
    await ctx.setOffline(false);
    await ctx.close();
  }

  /* ================= ABN-03 断网·演练中 ================= */
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await goto(page);
    await ctx.setOffline(true);
    const e0 = pageErrors.length, f0 = failedHttp.length;
    await page.evaluate(() => { document.querySelector('#drill-slot button').click(); });
    await page.waitForTimeout(300);
    await page.click('#drill-start-btn');
    await page.waitForTimeout(300);
    await page.click('#drill-reveal-btn');
    await page.waitForTimeout(250);
    await page.click('#drill-more-btn');
    await page.waitForTimeout(200);
    await page.evaluate(() => { [...document.querySelectorAll('.drill-rate')].find(b => b.getAttribute('data-rate') === 'fuzzy').click(); });
    await page.waitForTimeout(300);
    const store = await lsGet(page, 'aipm.drill.v1');
    const rated = store ? Object.keys(JSON.parse(store)).length : 0;
    check('ABN-03', '断网·演练中：完整走完看答案→展开→自评且自评落盘', rated >= 1 && errorsSince(e0).length === 0 && failedHttp.length === f0, 'rated=' + rated);
    await ctx.setOffline(false);
    await ctx.close();
  }

  /* ================= ABN-04 突然关闭·答题中途恢复 ================= */
  {
    const ctx = await browser.newContext();
    let page = await newPage(ctx);
    await goto(page);
    await startQuizFromLanding(page);
    for (let i = 0; i < 3; i++) await answerCurrent(page, 'correct', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    const prog = JSON.parse(await lsGet(page, 'aipm.inprogress.v1'));
    await page.close(); /* 突然关闭：不走任何收尾 */
    page = await newPage(ctx);
    await goto(page);
    const resumeTxt = await textOf(page, '#resume-slot');
    check('ABN-04', '突然关闭·答题：重开出现恢复卡且已答题数 = 关闭前 3 题', !!resumeTxt && resumeTxt.includes('已答 3 题') && prog && prog.records.length === 3, (resumeTxt || '').replace(/\s+/g, ' ').slice(0, 90));
    await page.evaluate(() => { [...document.querySelectorAll('#resume-slot button')].find(b => b.textContent.includes('继续作答')).click(); });
    await page.waitForTimeout(300);
    const ptxt = await textOf(page, '#quiz-progress-text');
    check('ABN-04', '突然关闭·答题：继续作答回到第 4 题、前 3 题记录保留', (await activeView(page)) === 'view-quiz' && !!ptxt && ptxt.includes('4'), (ptxt || '').replace(/\s+/g, ' '));
    await ctx.close();
  }

  /* ================= ABN-05 突然关闭·学习进度保留 ================= */
  {
    const ctx = await browser.newContext();
    let page = await newPage(ctx);
    await goto(page);
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { document.querySelector('#path-list .point-list button, #path-list button').click(); });
    await page.waitForTimeout(350);
    await page.evaluate(() => { const b = document.querySelector('#detail-wrap .done-btn'); if (b) b.click(); });
    await page.waitForTimeout(250);
    const before = await lsGet(page, 'aipm.learn.v1');
    await page.close();
    page = await newPage(ctx);
    await goto(page);
    const after = await lsGet(page, 'aipm.learn.v1');
    const learned = after ? (JSON.parse(after).learned || []).length : 0;
    check('ABN-05', '突然关闭·学习：已学标记落盘且重开后仍在', before === after && learned >= 1, 'learned=' + learned);
    await ctx.close();
  }

  /* ================= ABN-06 突然关闭·演练自评保留 ================= */
  {
    const ctx = await browser.newContext();
    let page = await newPage(ctx);
    await goto(page);
    await page.evaluate(() => { document.querySelector('#drill-slot button').click(); });
    await page.waitForTimeout(300);
    await page.click('#drill-start-btn');
    await page.waitForTimeout(300);
    await page.click('#drill-reveal-btn');
    await page.waitForTimeout(250);
    await page.click('#drill-more-btn');
    await page.waitForTimeout(200);
    await page.evaluate(() => { [...document.querySelectorAll('.drill-rate')].find(b => b.getAttribute('data-rate') === 'unknown').click(); });
    await page.waitForTimeout(300);
    const before = await lsGet(page, 'aipm.drill.v1');
    await page.close();
    page = await newPage(ctx);
    await goto(page);
    const after = await lsGet(page, 'aipm.drill.v1');
    await page.evaluate(() => { document.querySelector('#drill-slot button').click(); });
    await page.waitForTimeout(300);
    const stats = await textOf(page, '#drill-stats');
    check('ABN-06', '突然关闭·演练：自评记录重开后仍在（已练 ≥1、待加强可见）', before === after && !!stats && stats.includes('已练') && !stats.includes('已练 0'), (stats || '').replace(/\s+/g, ' ').slice(0, 90));
    await ctx.close();
  }

  /* ================= ABN-07 突然关闭·阶段小测不产生半成品 ================= */
  {
    const ctx = await browser.newContext();
    let page = await newPage(ctx);
    await goto(page);
    const beforeRaw = await lsGet(page, 'aipm.stagequiz.v1');
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { document.querySelector('#stage-0 .sq-btn').click(); });
    await page.waitForTimeout(300);
    await answerCurrent(page, 'correct', '#sq-options .opt', { next: '#sq-next', skip: '#sq-skip' }, '#sq-stem', '#sq-dim');
    await answerCurrent(page, 'wrong', '#sq-options .opt', { next: '#sq-next', skip: '#sq-skip' }, '#sq-stem', '#sq-dim');
    const midRaw = await lsGet(page, 'aipm.stagequiz.v1');
    await page.close();
    page = await newPage(ctx);
    await goto(page);
    const afterRaw = await lsGet(page, 'aipm.stagequiz.v1');
    check('ABN-07', '突然关闭·阶段小测：答 2 题后关闭，stagequiz 存储与开始前逐字一致（无半成品）', beforeRaw === midRaw && midRaw === afterRaw, 'before=' + beforeRaw + ' after=' + afterRaw);
    await ctx.close();
  }

  /* ================= ABN-09 存储损坏·逐 key 注入 ================= */
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await goto(page);
    const badValues = ['{corrupt!!', '12345', '"just-a-string"', 'null', '[1,2,3]', '{"x":'];
    for (const key of TEN_KEYS) {
      const fails = [];
      for (const bad of badValues) {
        const e0 = pageErrors.length;
        await lsSet(page, key, bad);
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(300);
        const view = await activeView(page);
        const title = await textOf(page, '#view-landing .doc-title, #view-landing h1, #view-landing h2');
        if (view !== 'view-landing' || !title || errorsSince(e0).length > 0) {
          fails.push(bad + '→view=' + view + ',err=' + errorsSince(e0).length);
        }
        await page.evaluate(k => window.localStorage.removeItem(k), key);
      }
      check('ABN-09', '存储损坏·' + key + '：6 种坏值下均不白屏、无 pageerror、回落地页', fails.length === 0, fails.join(' | ').slice(0, 220));
    }
    await ctx.close();
  }

  /* ================= ABN-10 存储损坏·全 key 同时损坏 ================= */
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await goto(page);
    const e0 = pageErrors.length;
    for (const key of TEN_KEYS) await lsSet(page, key, '{corrupt!!');
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(350);
    const view = await activeView(page);
    let quizOk = false, detail = '';
    try {
      await startQuizFromLanding(page);
      quizOk = (await activeView(page)) === 'view-quiz';
      if (quizOk) { await answerCurrent(page, 'correct', MAIN.opt, MAIN, MAIN.stem, MAIN.dim); detail = '已答 1 题'; }
    } catch (err) { detail = String(err).slice(0, 120); }
    check('ABN-10', '存储损坏·全 key 损坏：不白屏且测评仍可启动作答', view === 'view-landing' && quizOk && errorsSince(e0).length === 0, 'view=' + view + ' quiz=' + quizOk + ' ' + detail + ' err=' + errorsSince(e0).join(';').slice(0, 120));
    await ctx.close();
  }

  await browser.close();

  /* ================= ABN-08 断电模拟·进程强杀后数据完整 ================= */
  {
    const PROFILE = '/tmp/abn-profile';
    execSync('rm -rf ' + PROFILE);
    const launch = () => chromium.launchPersistentContext(PROFILE, { executablePath: CHROME, args: CARGS });
    let ctx = await launch();
    let page = await newPage(ctx);
    await goto(page);
    /* 造数：完整测评（attempts/snapshots）+ 学习标记（learn）+ 演练自评（drill）+ 其余键合法种子 */
    await startQuizFromLanding(page);
    for (let i = 0; i < 18; i++) await answerCurrent(page, i % 3 ? 'correct' : 'wrong', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    await page.waitForTimeout(300);
    await clickGoto(page, 'view-landing');
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { document.querySelector('#path-list .point-list button, #path-list button').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const b = document.querySelector('#detail-wrap .done-btn'); if (b) b.click(); });
    await page.waitForTimeout(200);
    await clickGoto(page, 'view-landing');
    await page.evaluate(() => { document.querySelector('#drill-slot button').click(); });
    await page.waitForTimeout(300);
    await page.click('#drill-start-btn');
    await page.waitForTimeout(300);
    await page.click('#drill-reveal-btn');
    await page.waitForTimeout(200);
    await page.click('#drill-more-btn');
    await page.waitForTimeout(200);
    await page.evaluate(() => { [...document.querySelectorAll('.drill-rate')].find(b => b.getAttribute('data-rate') === 'fuzzy').click(); });
    await page.waitForTimeout(300);
    await lsSet(page, 'aipm.appeals.v1', [{ id: 'abn-seed', ts: Date.now(), text: 'ABN 种子申诉' }]);
    await lsSet(page, 'aipm.quizcfg.v1', { count: 18, dims: null, startDiff: 'normal', scope: 'all' });
    const before = {};
    for (const k of TEN_KEYS) before[k] = await lsGet(page, k);
    const nonNull = TEN_KEYS.filter(k => before[k] != null);
    /* 强杀全部 chromium 进程（模拟断电），不给任何收尾机会 */
    try { execSync("pkill -9 -f 'abn-profile' || true"); } catch (e) {}
    await new Promise(r => setTimeout(r, 1200));
    ctx = await launch();
    page = await newPage(ctx);
    await goto(page);
    const view = await activeView(page);
    const after = {};
    for (const k of TEN_KEYS) after[k] = await lsGet(page, k);
    const survived = nonNull.filter(k => after[k] === before[k]);
    const parseOk = nonNull.every(k => { if (after[k] == null) return true; try { JSON.parse(after[k]); return true; } catch (e) { return false; } });
    /* 强杀后应用完整性：不白屏、存活数据可解析、题库就绪校验不误报（可立即开始测评并作答）。
       数据逐字存活数作为观察值记录在 detail 中——localStorage 由 Chromium 存储服务异步批提交，
       强杀/真断电时未提交的尾批写入可能丢失（无头环境实测不确定，2–8 秒静置/刷新/尾随写均不能
       可靠强制提交；JS 层无落盘 API），属平台机制而非应用缺陷；正常关闭路径的逐字完整性
       由 ABN-04..08 覆盖，防丢的正式手段是应用内「导出全部数据」备份。 */
    let quizOk = false;
    try {
      await startQuizFromLanding(page);
      quizOk = (await activeView(page)) === 'view-quiz';
      if (quizOk) await answerCurrent(page, 'correct', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    } catch (e) {}
    check('ABN-08', '断电强杀：重开不白屏、存活键可解析、题库校验不误报且可立即作答', view === 'view-landing' && parseOk && quizOk,
      '存活观察 ' + survived.length + '/' + nonNull.length + ' 逐字完整（平台提交机制决定，非断言项）；丢失键=' + nonNull.filter(k => after[k] !== before[k]).join(','));
    /* 阶段二：答题中途强杀 → 恢复卡与进度 */
    await startQuizFromLanding(page);
    for (let i = 0; i < 4; i++) await answerCurrent(page, 'correct', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    const progBefore = await lsGet(page, 'aipm.inprogress.v1');
    await page.waitForTimeout(3000); /* 静置片刻后强杀（逐题写入的进行中进度在历次实测中均完整存活） */
    try { execSync("pkill -9 -f 'abn-profile' || true"); } catch (e) {}
    await new Promise(r => setTimeout(r, 1200));
    ctx = await launch();
    page = await newPage(ctx);
    await goto(page);
    const resumeTxt = await textOf(page, '#resume-slot');
    const progAfter = await lsGet(page, 'aipm.inprogress.v1');
    /* 与阶段一同口径：进行中进度在强杀后或逐字完整（恢复卡正确出现）、或整批未提交而干净缺失，
       绝不允许出现撕裂/半截值导致恢复出错。存活与否记观察（平台提交机制），完整性为断言。 */
    const intact = progAfter === progBefore && !!resumeTxt && resumeTxt.includes('已答 4 题');
    const cleanAbsent = progAfter === null;
    check('ABN-08', '断电强杀·答题中途：进度逐字完整或干净缺失（无撕裂值）、不白屏', (intact || cleanAbsent) && (await activeView(page)) === 'view-landing',
      intact ? '进度存活：恢复卡已答 4 题、逐字一致' : '观察：本批未提交，进度干净缺失（平台机制）；resume=' + (resumeTxt || '').replace(/\s+/g, ' ').slice(0, 40));
    try { await ctx.close(); } catch (e) {}
    execSync('rm -rf ' + PROFILE);
  }

  console.log('\n==== ABN 汇总：PASS ' + pass + ' / FAIL ' + fail + ' / pageerror 总数 ' + pageErrors.length + ' ====');
  fs.writeFileSync('/tmp/abn-results.json', JSON.stringify({ pass, fail, results, pageErrors }, null, 1));
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('ABN 脚本异常：', e); process.exit(2); });
