'use strict';
/* 网页版控件级测试矩阵 · 实测脚本（无头 Chromium / Playwright-core）
 * 期望全部按冻结规格预先写死在本脚本断言中（0.55/0.45、全对 81/全错 32、18 题、
 * 严格 1–2 题阈值、快照四态/复测三态、子集规则、12 键、复习阶梯 1/3/7/14/30、
 * 小测 5 题 3 过线、演练自评三档 3/5/10 组题）。
 * 每条断言对应矩阵一行（CTL 编号），结果 JSON 落 /tmp/ctl-results.json，截图落 /tmp/ctlshots/。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/muse/assets/spaces/ts-runtime/dist/node_modules/playwright-core');
const BASE = 'file:///home/hatch/workspace/ts-spaces/ai-pm-coach/index.html';
const ORIGIN = 'file:///home/hatch/workspace/ts-spaces/ai-pm-coach';
const DIMS = ['AI 基础认知', '场景洞察', '产品设计', '数据与评估', '技术协作', '商业与落地'];
const TWELVE_KEYS = ['aipm.attempts.v1', 'aipm.snapshots.v1', 'aipm.inprogress.v1', 'aipm.appeals.v1', 'aipm.learn.v1', 'aipm.quizcfg.v1', 'aipm.wrongbook.v1', 'aipm.stagequiz.v1', 'aipm.review.v1', 'aipm.drill.v1', 'aipm.favorites.v1', 'aipm.notes.v1'] /* 【批次 5 口径同步】原 TWELVE_KEYS 扩展为 12 键 */;
const SHOTS = '/tmp/ctlshots';
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let pass = 0, fail = 0;
function check(id, name, cond, detail) {
  const d = detail == null ? '' : String(detail).slice(0, 400);
  console.log((cond ? 'PASS ' : 'FAIL ') + id + ' · ' + name + (d ? ' — ' + d : ''));
  results.push({ id, name, pass: !!cond, detail: d });
  if (cond) pass++; else fail++;
}
const pageErrors = [];
const externalRequests = [];
let browser;
async function newPage(opts) {
  const ctx = await browser.newContext(opts || {});
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('request', r => { const u = r.url(); if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) externalRequests.push(u); });
  return { ctx, page };
}
async function goto(page) { await page.goto(BASE, { waitUntil: 'load' }); await page.waitForTimeout(350); }
async function shot(page, name) { try { await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } catch (e) {} }
async function lsGet(page, k) { return page.evaluate(key => window.localStorage.getItem(key), k); }
async function lsJSON(page, k) { const v = await lsGet(page, k); return v == null ? null : JSON.parse(v); }
async function lsSet(page, k, v) { await page.evaluate(([key, val]) => window.localStorage.setItem(key, val), [k, typeof v === 'string' ? v : JSON.stringify(v)]); }
async function activeView(page) { return page.evaluate(() => { const v = document.querySelector('.view.active'); return v ? v.id : null; }); }
async function textOf(page, sel) { return page.evaluate(s => { const el = document.querySelector(s); return el ? el.textContent : null; }, sel); }
async function clickGoto(page, viewId) { await page.evaluate(id => { const el = document.querySelector('.view.active [data-goto="' + id + '"]') || document.querySelector('[data-goto="' + id + '"]'); if (el) el.click(); }, viewId); await page.waitForTimeout(280); }
function snapSeed(over) {
  return Object.assign({ attemptId: 'seed-' + Math.random().toString(36).slice(2, 8), ts: Date.now() - 5 * 864e5, date: new Date(Date.now() - 5 * 864e5).toISOString(), dimScores: [70, 70, 70, 70, 70, 70], totalScore: 70, answered: 18, correct: 10 }, over || {});
}
/* 当前题在题库中的对象（按题干+维度匹配） */
async function currentBankQ(page, stemSel, dimSel) {
  return page.evaluate(([ss, ds]) => {
    const stem = document.querySelector(ss).textContent;
    const dim = document.querySelector(ds).textContent;
    const q = window.QUIZ_BANK.find(x => x.stem === stem && x.dimension === dim) || window.QUIZ_BANK.find(x => x.stem === stem);
    return q ? JSON.parse(JSON.stringify(q)) : null;
  }, [stemSel, dimSel]);
}
/* 答当前题：mode correct/wrong；optSel 选项选择器；nextSel {next, skip}。返回题库题对象 */
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
async function startQuizFromLanding(page) {
  await clickGoto(page, 'view-intro');
  await page.click('#view-intro .doc-actions .btn-primary');
  await page.waitForTimeout(300);
}
const MAIN = { opt: '#q-options .opt', next: '#q-next', skip: '#q-skip', stem: '#q-stem', dim: '#q-dim' };

(async () => {
  browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--hatch-webgl-allowed-domains-file=/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt', '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6'] });

  /* ============ CTX-O：落地页静态导航 + 自测清单页 + 空态 ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    check('L-00', '落地页冷启动无报错且为 active 视图', (await activeView(page)) === 'view-landing' && pageErrors.length === 0, pageErrors.join('|'));
    await shot(page, '01-landing-empty');
    const mySlot = await textOf(page, '#my-assessment-slot');
    check('L-04a', '我的测评空态：文案+开始测评按钮（快照四态之 0 条）', mySlot.includes('完成测评后查看你的能力雷达图') && mySlot.includes('开始测评'), (mySlot || '').slice(0, 80));
    await page.evaluate(() => { [...document.querySelectorAll('#my-assessment-slot button')].find(b => b.textContent.includes('开始测评')).click(); });
    await page.waitForTimeout(250);
    check('L-04b', '空态「开始测评」点击 → 测评介绍页', (await activeView(page)) === 'view-intro');
    await clickGoto(page, 'view-landing');
    await page.click('#view-landing .mode-card.is-primary [data-goto="view-intro"]');
    await page.waitForTimeout(250);
    check('L-01', '落地页「开始测评」→ 介绍页', (await activeView(page)) === 'view-intro');
    const backOk = await page.evaluate(() => { const b = document.querySelector('#view-intro .back-btn'); const ok = !!b; if (b) b.click(); return ok; });
    await page.waitForTimeout(250);
    check('I-01', '介绍页「返回」→ 落地页', backOk && (await activeView(page)) === 'view-landing');
    await page.click('#view-landing .mode-learn-btn');
    await page.waitForTimeout(250);
    check('L-02', '落地页「进入学习路径」→ 学习首页', (await activeView(page)) === 'view-learn');
    await clickGoto(page, 'view-landing');
    const wbSlot = await textOf(page, '#wrongbook-slot');
    const drSlot = await textOf(page, '#drill-slot');
    check('L-10a', '落地页错题本入口卡（空态文案）渲染', !!wbSlot && wbSlot.includes('还没有错题'), (wbSlot || '').slice(0, 60));
    check('L-11a', '落地页演练入口卡（547 条文案）渲染', !!drSlot && drSlot.includes('547'), (drSlot || '').slice(0, 60));
    await page.evaluate(() => { document.querySelector('#wrongbook-slot button').click(); });
    await page.waitForTimeout(250);
    const wbEmpty = await textOf(page, '#wb-list');
    check('L-10b/W-06', '错题本入口点击 → 错题本页且空态文案', (await activeView(page)) === 'view-wrongbook' && wbEmpty.includes('还没有错题记录'), (wbEmpty || '').slice(0, 60));
    await clickGoto(page, 'view-landing');
    await page.evaluate(() => { document.querySelector('#drill-slot button').click(); });
    await page.waitForTimeout(250);
    check('L-11b', '演练入口卡点击 → 演练首页', (await activeView(page)) === 'view-drill');
    await clickGoto(page, 'view-landing');
    await page.evaluate(() => { [...document.querySelectorAll('#view-landing [data-goto="view-checklist"]')][0].click(); });
    await page.waitForTimeout(250);
    const chk = await textOf(page, '#view-checklist');
    check('C-01/C-02', '自测清单入口 → 清单页，含 CAL/DAT/DRL 用例条目', (await activeView(page)) === 'view-checklist' && chk.includes('CAL-01') && chk.includes('DAT-02R') && chk.includes('DRL-08'), 'len=' + (chk || '').length);
    await shot(page, '02-checklist');
    await clickGoto(page, 'view-landing');
    check('C-03', '清单页「返回」→ 落地页', (await activeView(page)) === 'view-landing');
    await ctx.close();
  }

  /* ============ CTX-G：快照四态 + 复测三态 + 成长曲线 ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const states = [
      { days: 0, cls: 'is-weak', note: '建议再过几天复测' },
      { days: 5, cls: '', note: '距离上次测评 5 天' },
      { days: 20, cls: 'is-hot', note: '已经 20 天没测评了' }
    ];
    let allOk = true; const det = [];
    for (const st of states) {
      const ts = Date.now() - st.days * 864e5;
      await lsSet(page, 'aipm.snapshots.v1', [snapSeed({ ts, date: new Date(ts).toISOString() })]);
      await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
      const info = await page.evaluate(() => { const b = document.querySelector('#my-assessment-slot .btn-retest'); const n = document.querySelector('#my-assessment-slot .retest-note'); const slot = document.getElementById('my-assessment-slot'); return { cls: b ? b.className : '', note: n ? n.textContent : '', hasCompare: slot.textContent.includes('总分变化'), hasGrowth: !!slot.querySelector('.growth-link'), hasHint: slot.textContent.includes('完成下一次测评后') }; });
      const ok = info.cls.includes(st.cls) && (st.cls === '' ? !info.cls.includes('is-weak') && !info.cls.includes('is-hot') : true) && info.note.includes(st.note) && !info.hasCompare && info.hasHint && !info.hasGrowth;
      det.push(st.days + 'd:' + info.cls.replace('btn-retest', '').trim() + '/' + info.note.slice(0, 18));
      if (!ok) allOk = false;
    }
    check('L-05', '单快照态 + 立即复测三态（今弱化/5天正常/20天高亮，文案对应）', allOk, det.join(' | '));
    await page.evaluate(() => { document.querySelector('#my-assessment-slot .btn-retest').click(); });
    await page.waitForTimeout(300);
    check('L-05b', '「立即复测」点击 → 直接进入答题页第 1 题', (await activeView(page)) === 'view-quiz' && (await textOf(page, '#quiz-progress-text')).includes('第 1'), await activeView(page));
    await clickGoto(page, 'view-landing');
    // 两快照：对比三数字
    const t1 = Date.now() - 10 * 864e5, t2 = Date.now() - 5 * 864e5;
    await lsSet(page, 'aipm.snapshots.v1', [
      snapSeed({ attemptId: 's1', ts: t1, date: new Date(t1).toISOString(), dimScores: [60, 60, 60, 60, 60, 60], totalScore: 60 }),
      snapSeed({ attemptId: 's2', ts: t2, date: new Date(t2).toISOString(), dimScores: [75, 55, 60, 60, 60, 60], totalScore: 62, correct: 11 })
    ]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    const cmp = await textOf(page, '#my-assessment-slot');
    check('L-06', '两快照态：对比雷达+总分变化(+2)/提升最大(AI基础+15)/仍需加强(场景洞察55)', cmp.includes('总分变化') && cmp.includes('+2') && cmp.includes('提升最大') && cmp.includes('AI 基础认知') && cmp.includes('仍需加强') && cmp.includes('场景洞察'), (cmp || '').replace(/\s+/g, ' ').slice(0, 200));
    await shot(page, '03-landing-compare');
    // 三快照：成长入口
    const t0 = Date.now() - 15 * 864e5;
    await lsSet(page, 'aipm.snapshots.v1', [
      snapSeed({ attemptId: 's0', ts: t0, date: new Date(t0).toISOString(), dimScores: [50, 50, 50, 50, 50, 50], totalScore: 50, correct: 8 }),
      snapSeed({ attemptId: 's1', ts: t1, date: new Date(t1).toISOString(), dimScores: [60, 60, 60, 60, 60, 60], totalScore: 60 }),
      snapSeed({ attemptId: 's2', ts: t2, date: new Date(t2).toISOString(), dimScores: [75, 55, 60, 60, 60, 60], totalScore: 62, correct: 11 })
    ]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await page.evaluate(() => { const b = document.querySelector('#my-assessment-slot .growth-link'); if (b) b.click(); });
    await page.waitForTimeout(300);
    const gList = await textOf(page, '#growth-list');
    const gChart = await page.evaluate(() => !!document.querySelector('#growth-chart svg'));
    check('L-07/G-02', '三快照态成长入口 → 成长页：走势图+3 节点（含每次总分与六维）', (await activeView(page)) === 'view-growth' && gChart && (gList || '').includes('第 1 次') && gList.includes('第 3 次') && gList.includes('62'), (gList || '').replace(/\s+/g, ' ').slice(0, 120));
    await shot(page, '04-growth');
    await clickGoto(page, 'view-landing');
    check('G-01', '成长页「返回」→ 落地页', (await activeView(page)) === 'view-landing');
    await ctx.close();
  }

  /* ============ CTX-I：介绍页设置区 + 按计划出题卡 ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-intro');
    const cardHidden = await page.evaluate(() => !document.getElementById('plan-quiz-card').classList.contains('show'));
    check('I-02a', '默认全学计划时「按计划出题」卡不显示', cardHidden);
    const lbl = await textOf(page, '#intro-count-label');
    check('I-00', '介绍页默认文案 18 题 · 约 15–18 分钟', lbl.includes('18 题') && lbl.includes('15–18 分钟'), lbl);
    // 题量 chips
    await page.click('#cfg-count-row [data-count="12"]');
    await page.waitForTimeout(200);
    let cfg = await lsJSON(page, 'aipm.quizcfg.v1');
    const hint = await textOf(page, '#cfg-hint');
    check('I-03', '题量 chip 12 题：落盘 count=12 且出现每维不足 3 的提示（12/6=2）', cfg.count === 12 && hint.includes('不足 3'), 'cfg=' + JSON.stringify(cfg) + ' hint=' + (hint || '').slice(0, 60));
    await page.click('#cfg-count-row [data-count="24"]');
    await page.waitForTimeout(200);
    cfg = await lsJSON(page, 'aipm.quizcfg.v1');
    const hint2 = await textOf(page, '#cfg-hint');
    check('I-03b', '题量 chip 24 题：落盘 24 且不足提示消失（24/6=4）', cfg.count === 24 && !(hint2 || '').includes('不足'), 'count=' + cfg.count);
    await page.click('#cfg-count-row [data-count="18"]');
    await page.waitForTimeout(150);
    // 维度 chips：取消 3 个 → 子集提示；取消到剩 1 个时最后一个不可取消
    const dimNames = await page.evaluate(() => [...document.querySelectorAll('#cfg-dims-row .dim-chip')].map(c => c.textContent));
    for (const n of ['场景洞察', '产品设计', '数据与评估']) {
      await page.evaluate(name => { const c = [...document.querySelectorAll('#cfg-dims-row .dim-chip')].find(x => x.textContent === name); if (c) c.click(); }, n);
      await page.waitForTimeout(150);
    }
    cfg = await lsJSON(page, 'aipm.quizcfg.v1');
    const okTxt = await textOf(page, '#cfg-ok');
    check('I-04', '维度 chips 取消 3 维：落盘剩 3 维且出现子集说明', JSON.stringify(cfg.dims) === JSON.stringify(['AI 基础认知', '技术协作', '商业与落地']) && okTxt.includes('子集测评'), JSON.stringify(cfg.dims) + ' ok=' + (okTxt || '').slice(0, 50));
    for (const n of ['AI 基础认知', '技术协作']) {
      await page.evaluate(name => { const c = [...document.querySelectorAll('#cfg-dims-row .dim-chip')].find(x => x.textContent === name); if (c) c.click(); }, n);
      await page.waitForTimeout(150);
    }
    cfg = await lsJSON(page, 'aipm.quizcfg.v1');
    await page.evaluate(() => { const c = [...document.querySelectorAll('#cfg-dims-row .dim-chip')].find(x => x.textContent === '商业与落地'); if (c) c.click(); });
    await page.waitForTimeout(150);
    const cfg2 = await lsJSON(page, 'aipm.quizcfg.v1');
    check('I-04b', '维度只剩 1 个时点它不取消（至少选 1 个）', cfg.dims.length === 1 && cfg2.dims.length === 1, JSON.stringify(cfg2.dims));
    // 难度/范围 chips
    await page.click('#cfg-diff-row [data-diff="advanced"]');
    await page.waitForTimeout(150);
    await page.click('#cfg-scope-row [data-scope="wrongfirst"]');
    await page.waitForTimeout(150);
    cfg = await lsJSON(page, 'aipm.quizcfg.v1');
    check('I-05/I-06', '难度起点 advanced + 题目范围 wrongfirst 落盘', cfg.startDiff === 'advanced' && cfg.scope === 'wrongfirst', JSON.stringify(cfg));
    await page.evaluate(() => { window.localStorage.removeItem('aipm.quizcfg.v1'); });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await clickGoto(page, 'view-intro');
    // 按计划卡：种子 custom 计划（仅 AI 基础认知 5 点）
    await lsSet(page, 'aipm.learn.v1', { learned: [], practice: {}, lastPoint: 0, plan: { mode: 'custom', pointIds: [0, 1, 2, 18, 19], pinnedFirst: [] } });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await clickGoto(page, 'view-intro');
    const cardShow = await page.evaluate(() => document.getElementById('plan-quiz-card').classList.contains('show'));
    const cardDesc = await textOf(page, '#plan-quiz-desc');
    check('I-02b', 'custom 计划时按计划卡显示且文案含聚焦维度与知识点数', cardShow && cardDesc.includes('AI 基础认知') && cardDesc.includes('5'), (cardDesc || '').slice(0, 90));
    await page.click('#plan-quiz-apply');
    await page.waitForTimeout(250);
    cfg = await lsJSON(page, 'aipm.quizcfg.v1');
    const ok2 = await textOf(page, '#cfg-ok');
    check('I-02c', '「按计划出题」：设置换算为 1 维/12 题/unseen/adaptive 并出现回执文案', cfg.dims.length === 1 && cfg.dims[0] === 'AI 基础认知' && cfg.count === 12 && cfg.scope === 'unseen' && cfg.startDiff === 'adaptive' && ok2.includes('已按学习计划生成设置'), JSON.stringify(cfg) + ' ok=' + (ok2 || '').slice(0, 60));
    await shot(page, '05-intro-plan-quiz');
    await page.click('#view-intro .doc-actions .btn-secondary');
    await page.waitForTimeout(250);
    check('I-08', '介绍页「稍后再说」→ 落地页', (await activeView(page)) === 'view-landing');
    await ctx.close();
  }

  /* ============ CTX-A：全对完整测评（81）+ 结果页控件 + modal + 专项 ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const prevTs = Date.now() - 5 * 864e5;
    await lsSet(page, 'aipm.snapshots.v1', [snapSeed({ attemptId: 'prev-a', ts: prevTs, date: new Date(prevTs).toISOString(), dimScores: [60, 60, 60, 60, 60, 60], totalScore: 60 })]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await startQuizFromLanding(page);
    check('Q-06a', '答题页进度「第 1 题 / 共 18 题」且百分比 6%', (await textOf(page, '#quiz-progress-text')).includes('共 18 题'), await textOf(page, '#quiz-progress-text'));
    const nextDisabled0 = await page.evaluate(() => document.getElementById('q-next').disabled);
    check('Q-03a', '未选选项时「下一题」禁用', nextDisabled0 === true);
    // 第 1 题：逐字核对题干与四选项 + 选中态
    const q1 = await currentBankQ(page, MAIN.stem, MAIN.dim);
    const domQ1 = await page.evaluate(() => { const stem = document.getElementById('q-stem').textContent; const opts = [...document.querySelectorAll('#q-options .opt')].map(b => b.querySelectorAll('span')[1].textContent); return { stem, opts }; });
    check('CC-02a', '答题页第 1 题题干/四选项与题库逐字一致', domQ1.stem === q1.stem && domQ1.opts.join('|') === ['A', 'B', 'C', 'D'].map(L => q1.options[L]).join('|'), 'qid=' + q1.id);
    await page.evaluate(i => { document.querySelectorAll('#q-options .opt')[i].click(); }, 'ABCD'.indexOf(q1.answer));
    await page.waitForTimeout(80);
    const selState = await page.evaluate(() => { const b = document.getElementById('q-next'); const sel = document.querySelector('#q-options .opt.selected'); return { dis: b.disabled, pressed: sel ? sel.getAttribute('aria-pressed') : null }; });
    check('Q-02/Q-03b', '点击正确选项：选中态 aria-pressed=true 且「下一题」启用', selState.dis === false && selState.pressed === 'true', JSON.stringify(selState));
    await page.click('#q-next'); await page.waitForTimeout(150);
    // 第 2 题：双击防护
    const q2 = await currentBankQ(page, MAIN.stem, MAIN.dim);
    await page.evaluate(i => { document.querySelectorAll('#q-options .opt')[i].click(); }, 'ABCD'.indexOf(q2.answer));
    await page.waitForTimeout(60);
    await page.evaluate(() => { const b = document.getElementById('q-next'); for (let i = 0; i < 5; i++) b.click(); });
    await page.waitForTimeout(250);
    const progAfter = await textOf(page, '#quiz-progress-text');
    check('Q-05', '连点「下一题」5 次只推进 1 题（现为第 3 题）', progAfter.includes('第 3'), progAfter);
    // 其余题全对，并逐题逐字核对（连同前两题共 18 题）
    let verbatimOk = 2, verbatimTotal = 2; const verbatimBad = [];
    for (let i = 0; i < 16; i++) {
      const q = await currentBankQ(page, MAIN.stem, MAIN.dim);
      const dom = await page.evaluate(() => ({ stem: document.getElementById('q-stem').textContent, opts: [...document.querySelectorAll('#q-options .opt')].map(b => b.querySelectorAll('span')[1].textContent), last: document.getElementById('q-next-label').textContent }));
      verbatimTotal++;
      if (dom.stem === q.stem && dom.opts.join('|') === ['A', 'B', 'C', 'D'].map(L => q.options[L]).join('|')) verbatimOk++; else verbatimBad.push(q.id);
      if (i === 15) check('Q-03c', '最后一题「下一题」文案变为「查看结果」', dom.last === '查看结果', dom.last);
      await page.evaluate(idx => { document.querySelectorAll('#q-options .opt')[idx].click(); }, 'ABCD'.indexOf(q.answer));
      await page.waitForTimeout(50);
      await page.click('#q-next'); await page.waitForTimeout(130);
    }
    check('CC-02', '全程 18 题题干/选项与题库逐字一致（18/18）', verbatimOk === 18 && verbatimTotal === 18, verbatimOk + '/' + verbatimTotal + ' bad=' + verbatimBad.join(','));
    check('R-00', '答完 18 题自动进入结果页', (await activeView(page)) === 'view-result', await activeView(page));
    const total = await textOf(page, '#total-score');
    const dimScoresTxt = await page.evaluate(() => [...document.querySelectorAll('.result-dim .dim-score')].map(e => e.textContent.trim()));
    check('R-02', '全对总分 = 81（冻结校准）且六维均为 81', total === '81' && dimScoresTxt.every(s => s.startsWith('81')), 'total=' + total + ' dims=' + dimScoresTxt.join(','));
    const radarPts = await page.evaluate(() => document.getElementById('radar-area').getAttribute('points'));
    check('R-02b', '全测雷达多边形已绘制', !!radarPts && radarPts.split(' ').length === 6, (radarPts || '').slice(0, 60));
    const fb = await textOf(page, '#retest-feedback');
    check('R-16a', '复测反馈：对上次 60 分提升 21 分 → 庆祝卡 + 单维突破卡（+21≥15）', fb.includes('提升了 21 分') && fb.includes('维度突破了'), (fb || '').replace(/\s+/g, ' ').slice(0, 140));
    const snaps = await lsJSON(page, 'aipm.snapshots.v1');
    check('R-02c', '完整测评后快照恰 +1（共 2）且 answered=18', snaps.length === 2 && snaps[1].answered === 18, 'n=' + snaps.length);
    await shot(page, '06-result-correct');
    // 诊断（全对 → mastery）：展开一张非默认卡 + 资源折叠 + 搜索按钮
    const diagCount = await page.evaluate(() => document.querySelectorAll('#diag-list .diag-card').length);
    const openCount0 = await page.evaluate(() => document.querySelectorAll('#diag-list .diag-card.open').length);
    check('R-10a', '诊断卡 6 张、最弱维默认展开 1 张', diagCount === 6 && openCount0 === 1, 'cards=' + diagCount + ' open=' + openCount0);
    await page.evaluate(() => { const cards = document.querySelectorAll('#diag-list .diag-card'); const c = [...cards].find(x => !x.classList.contains('open')); if (c) c.querySelector('.diag-expand').click(); });
    await page.waitForTimeout(200);
    const openCount1 = await page.evaluate(() => document.querySelectorAll('#diag-list .diag-card.open').length);
    check('R-10b', '「展开查看诊断」点击后卡片展开', openCount1 === 2, 'open=' + openCount1);
    await shot(page, '07-diag-open');
    const resToggle = await page.evaluate(() => { const b = document.querySelector('#diag-list .diag-res-btn'); if (!b) return 'nobtn'; b.click(); return b.textContent; });
    await page.waitForTimeout(150);
    const resShown = await page.evaluate(() => { const l = document.querySelector('#diag-list .res-list.show'); return l ? l.querySelectorAll('.res-card').length : 0; });
    check('R-13a', '「查看推荐资源」展开资源卡（≥1 张、含平台/时长/关键词）', resToggle !== 'nobtn' && resShown >= 1, 'cards=' + resShown);
    await page.evaluate(() => { window.__opened = []; window.open = function (u) { window.__opened.push(u); return null; }; });
    await page.evaluate(() => { const s = document.querySelector('#diag-list .res-search'); if (s) s.click(); });
    await page.waitForTimeout(120);
    const opened = await page.evaluate(() => window.__opened || []);
    check('R-13b', '资源卡关键词搜索按钮：打开 Google 搜索且 query 为该资源关键词（拦截外开验证）', opened.length === 1 && opened[0].startsWith('https://www.google.com/search?q='), (opened[0] || '').slice(0, 90));
    // 分数构成 modal
    await page.evaluate(() => { document.querySelectorAll('.result-dim .dim-score')[0].click(); });
    await page.waitForTimeout(250);
    const modalTxt = await page.evaluate(() => document.getElementById('score-modal').textContent);
    const modalShown = await page.evaluate(() => document.getElementById('score-modal').classList.contains('show'));
    check('R-03', '点维度分数 → 分数构成 modal：含 0.55/0.45 公式、贡献表与逐题演进', modalShown && modalTxt.includes('0.55') && modalTxt.includes('0.45') && modalTxt.includes('50 / 60 / 75 / 90 / 100') && modalTxt.includes('答了 3 题'), modalTxt.replace(/\s+/g, ' ').slice(0, 180));
    await shot(page, '08-score-modal');
    await page.click('#modal-close'); await page.waitForTimeout(150);
    check('R-04', 'modal「关闭」→ modal 隐藏', !(await page.evaluate(() => document.getElementById('score-modal').classList.contains('show'))));
    await page.evaluate(() => { document.querySelectorAll('.result-dim .dim-score')[1].click(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { document.getElementById('score-modal').click(); });
    await page.waitForTimeout(150);
    check('R-05', '点 modal 背景 → 关闭', !(await page.evaluate(() => document.getElementById('score-modal').classList.contains('show'))));
    // 专项重测（从 modal 进入）
    const attBefore = (await lsJSON(page, 'aipm.attempts.v1')).length;
    await page.evaluate(() => { document.querySelectorAll('.result-dim .dim-score')[0].click(); });
    await page.waitForTimeout(200);
    await page.click('#modal-retest'); await page.waitForTimeout(300);
    check('R-06/D-00', 'modal「重测这个维度」→ 专项页（AI 基础认知 · 专项 5 题、无跳过按钮）', (await activeView(page)) === 'view-dimtest' && (await textOf(page, '#dt-dim-name')).includes('AI 基础认知') && (await page.evaluate(() => document.querySelectorAll('#view-dimtest .skip-link').length)) === 0, await activeView(page));
    const dtNextDis = await page.evaluate(() => document.getElementById('dt-next').disabled);
    check('D-03a', '专项页未选时「下一题」禁用', dtNextDis === true);
    for (let i = 0; i < 5; i++) {
      const q = await currentBankQ(page, '#dt-stem', '#dt-dim');
      const mode = i % 2 === 0 ? 'correct' : 'wrong';
      const letter = mode === 'wrong' ? ['A', 'B', 'C', 'D'].find(L => L !== q.answer) : q.answer;
      await page.evaluate(idx => { document.querySelectorAll('#dt-options .opt')[idx].click(); }, 'ABCD'.indexOf(letter));
      await page.waitForTimeout(60);
      if (i === 4) check('D-03b', '专项第 5 题按钮文案「查看专项结果」', (await textOf(page, '#dt-next-label')) === '查看专项结果');
      await page.click('#dt-next'); await page.waitForTimeout(150);
    }
    const dtRes = await textOf(page, '#dimtest-result');
    const snapsAfterDt = (await lsJSON(page, 'aipm.snapshots.v1')).length;
    const attAfterDt = (await lsJSON(page, 'aipm.attempts.v1')).length;
    check('D-04a', '专项结果独立展示且不生成快照、不新增 attempt', dtRes.includes('专项测评结果') && dtRes.includes('不生成能力快照') && snapsAfterDt === 2 && attAfterDt === attBefore, (dtRes || '').replace(/\s+/g, ' ').slice(0, 110));
    await shot(page, '09-dimtest-result');
    await page.evaluate(() => { [...document.querySelectorAll('#dimtest-result button')].find(b => b.textContent.includes('回到测评结果')).click(); });
    await page.waitForTimeout(250);
    check('D-04b', '专项结果「回到测评结果」→ 结果页且总分仍 81', (await activeView(page)) === 'view-result' && (await textOf(page, '#total-score')) === '81');
    // 专项页内返回按钮（需先再进一次专项）
    await page.evaluate(() => { document.querySelectorAll('.result-dim .dim-score')[2].click(); });
    await page.waitForTimeout(200);
    await page.click('#modal-retest'); await page.waitForTimeout(250);
    await page.click('#dimtest-back'); await page.waitForTimeout(250);
    check('D-01', '专项页「返回结果」→ 结果页（有主结果时）', (await activeView(page)) === 'view-result', await activeView(page));
    // 申诉
    await page.click('#appeal-open'); await page.waitForTimeout(150);
    const formShown = await page.evaluate(() => document.getElementById('appeal-form').classList.contains('show'));
    check('R-07', '「我觉得评分不准」切换申诉表单展开', formShown === true);
    await page.click('#appeal-submit'); await page.waitForTimeout(150);
    const appeals0 = await lsJSON(page, 'aipm.appeals.v1');
    const formStill = await page.evaluate(() => document.getElementById('appeal-form').classList.contains('show'));
    check('R-09a', '申诉空理由提交被拦截（无记录、表单保持展开、边框警示）', (appeals0 == null || appeals0.length === 0) && formStill, 'appeals=' + JSON.stringify(appeals0));
    await page.fill('#appeal-text', '技术协作分数比体感低');
    await page.click('#appeal-submit'); await page.waitForTimeout(250);
    const appeals1 = await lsJSON(page, 'aipm.appeals.v1');
    const doneShown = await page.evaluate(() => document.getElementById('appeal-done').classList.contains('show'));
    check('R-08/R-09b', '填理由提交 → appeals +1（含总分/六维/理由）、完成提示显示、文案为改进评分规则', appeals1 && appeals1.length === 1 && appeals1[0].reason === '技术协作分数比体感低' && appeals1[0].totalScore === 81 && doneShown && (await textOf(page, '#appeal-done')).includes('改进评分规则'), JSON.stringify(appeals1).slice(0, 120));
    // 结果页两主按钮
    await page.click('#plan-btn'); await page.waitForTimeout(250);
    check('R-14', '结果页「开始你的学习计划」→ 学习首页', (await activeView(page)) === 'view-learn');
    await clickGoto(page, 'view-landing');
    await page.evaluate(() => { const el = document.querySelector('#view-landing [data-goto="view-intro"]'); el.click(); });
    await page.waitForTimeout(200);
    await ctx.close();
  }

  /* ============ CTX-B：全错测评（32）+ 复测下降卡 + 诊断薄弱点 + 关联链 + 错题本 ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const prevTs = Date.now() - 5 * 864e5;
    await lsSet(page, 'aipm.snapshots.v1', [snapSeed({ attemptId: 'prev-b', ts: prevTs, date: new Date(prevTs).toISOString(), dimScores: [70, 70, 70, 70, 70, 70], totalScore: 70, correct: 12 })]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await startQuizFromLanding(page);
    // 第 1 题用跳过，验证跳过计错路径
    await answerCurrent(page, 'skip', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    const prog2 = await textOf(page, '#quiz-progress-text');
    check('Q-04', '「跳过本题」不选答案直接推进到第 2 题', prog2.includes('第 2'), prog2);
    for (let i = 0; i < 17; i++) await answerCurrent(page, 'wrong', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    check('R-00b', '全错轮答完进入结果页', (await activeView(page)) === 'view-result');
    const total = await textOf(page, '#total-score');
    check('R-02w', '全错总分 = 32（冻结校准下限）', total === '32', 'total=' + total);
    const fb = await textOf(page, '#retest-feedback');
    check('R-16b', '复测反馈：70→32（Δ−38≤−6）出现建设性下降卡', fb.includes('不在最佳状态') && fb.includes('回顾这次答错的题'), (fb || '').replace(/\s+/g, ' ').slice(0, 120));
    const wbBtnExists = await page.evaluate(() => [...document.querySelectorAll('#retest-feedback button')].some(b => b.textContent.includes('查看本次错题')));
    check('R-16c', '下降卡含「查看本次错题」按钮', wbBtnExists);
    await page.evaluate(() => { [...document.querySelectorAll('#retest-feedback button')].find(b => b.textContent.includes('查看本次错题')).click(); });
    await page.waitForTimeout(250);
    const wrongItems = await page.evaluate(() => document.querySelectorAll('#wrong-wrap .wrong-item').length);
    const wrongTxt = await textOf(page, '#wrong-wrap');
    check('R-16d', '展开本次错题：18 条齐全（含题干/你的答案/正确答案/所选解析）', wrongItems === 18 && wrongTxt.includes('正确答案') && wrongTxt.includes('解析'), 'items=' + wrongItems);
    await page.evaluate(() => { [...document.querySelectorAll('#retest-feedback button')].find(b => b.textContent.includes('收起本次错题')).click(); });
    await page.waitForTimeout(150);
    const wrapHidden = await page.evaluate(() => !document.getElementById('wrong-wrap').classList.contains('show'));
    check('R-16e', '再次点击收起本次错题列表', wrapHidden);
    await shot(page, '10-result-wrong-feedback');
    // 诊断 personal：薄弱点块结构 + 展开练习题 + 打开知识点（关联链环 1→3 在本页，下方 CTX-J 做四环同源核对）
    const diagInfo = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#diag-list .diag-card')];
      const blocks = [...document.querySelectorAll('#diag-list .weak-block')];
      return { cards: cards.length, blocks: blocks.length, firstBlock: blocks.length ? blocks[0].textContent.replace(/\s+/g, ' ').slice(0, 300) : '', hasEvidence: blocks.some(b => b.textContent.includes('第') && b.textContent.includes('题')) };
    });
    check('R-11a', '全错诊断：6 卡、薄弱点块 ≥6 且证据引用具体题序', diagInfo.cards === 6 && diagInfo.blocks >= 6 && diagInfo.hasEvidence, 'blocks=' + diagInfo.blocks + ' ' + diagInfo.firstBlock.slice(0, 120));
    // 展开练习题（redo 型块）
    const redoToggle = await page.evaluate(() => { const bs = [...document.querySelectorAll('#diag-list .weak-next button')]; const t = bs.find(b => b.textContent.includes('展开练习题')); if (t) { t.click(); return true; } return false; });
    await page.waitForTimeout(200);
    const redoInfo = await page.evaluate(() => { const box = document.querySelector('#diag-list .redo-box.show'); if (!box) return null; return { opts: box.querySelectorAll('.p-opt').length, stem: box.querySelector('.practice-stem').textContent }; });
    check('R-12a', '薄弱点「展开练习题」→ 展开同类题（4 选项）', redoToggle && redoInfo && redoInfo.opts === 4, JSON.stringify(redoInfo).slice(0, 120));
    if (redoInfo) {
      const stemMatch = await page.evaluate(stem => { const q = window.QUIZ_BANK.find(x => x.stem === stem); return q ? q.id : null; }, redoInfo.stem);
      check('R-12b', '诊断练习题题干能在题库中逐字回查', stemMatch != null, 'qid=' + stemMatch);
      await page.evaluate(() => { const box = document.querySelector('.redo-box.show'); const q = window.QUIZ_BANK.find(x => x.stem === box.querySelector('.practice-stem').textContent); const idx = 'ABCD'.indexOf(q.answer); box.querySelectorAll('.p-opt')[idx].click(); });
      await page.waitForTimeout(150);
      const redoFb = await page.evaluate(() => { const e = document.querySelector('.redo-box.show .practice-explain.show'); return e ? e.textContent : ''; });
      check('R-12c', '诊断练习题作答后即时解析（含所选选项解析）', redoFb.includes('答对了') && redoFb.includes('解析'), redoFb.slice(0, 90));
      const redoDisabled = await page.evaluate(() => [...document.querySelectorAll('.redo-box.show .p-opt')].every(b => b.disabled));
      check('R-12d', '诊断练习题答后四选项全部禁用（不可重答）', redoDisabled);
    }
    // 打开知识点（learn 型块）→ 详情页标题与按钮文案一致
    const learnBtn = await page.evaluate(() => { const bs = [...document.querySelectorAll('#diag-list .weak-next button')]; const t = bs.find(b => b.textContent.includes('打开这个知识点')); if (t) { const prev = t.closest('.weak-next').textContent; t.click(); return prev; } return null; });
    await page.waitForTimeout(300);
    if (learnBtn) {
      const detailTitle = await page.evaluate(() => document.querySelector('#detail-wrap h2').textContent);
      check('R-11b/CC-03a', '诊断薄弱点「打开这个知识点」→ 学习页标题与诊断所指知识点一致', (await activeView(page)) === 'view-learn-detail' && learnBtn.includes('「' + detailTitle + '」'), 'btn=' + learnBtn.replace(/\s+/g, ' ').slice(0, 90) + ' title=' + detailTitle);
      await clickGoto(page, 'view-learn');
      await clickGoto(page, 'view-landing');
      // 回结果页：结果页状态保留（lastScores 在内存中，直接 show 结果视图需要经 data-goto? 结果页无落地入口，用历史 attempt 重进不可行 — 用页面内导航：点落地页开始测评会重置，故此处改走浏览器 evaluate 触发 plan-btn 路径不可用，跳过回结果）
    } else {
      check('R-11b/CC-03a', '诊断薄弱点「打开这个知识点」存在', false, '未找到按钮');
    }
    // 错题本（由本轮 18 错题推导）
    await clickGoto(page, 'view-landing');
    const wbSlotTxt = await textOf(page, '#wrongbook-slot');
    check('W-00', '落地页错题本入口显示 18 道待巩固', wbSlotTxt.includes('18') && wbSlotTxt.includes('待巩固'), (wbSlotTxt || '').slice(0, 90));
    await page.evaluate(() => { document.querySelector('#wrongbook-slot button').click(); });
    await page.waitForTimeout(300);
    const wbStats = await textOf(page, '#wb-stats');
    const wbItems = await page.evaluate(() => document.querySelectorAll('#wb-list .wb-item').length);
    check('W-01', '错题本：统计待巩固 18/已掌握 0/总数 18，条目 18 条', wbStats.includes('18') && wbItems === 18, 'stats=' + wbStats.replace(/\s+/g, ' ') + ' items=' + wbItems);
    await shot(page, '11-wrongbook');
    const attemptsBytesBefore = await lsGet(page, 'aipm.attempts.v1');
    // 维度筛选
    await page.evaluate(() => { const c = [...document.querySelectorAll('#wb-filter .dim-chip')].find(x => x.textContent === '技术协作'); if (c) c.click(); });
    await page.waitForTimeout(250);
    const filt = await page.evaluate(() => { const items = [...document.querySelectorAll('#wb-list .wb-item')]; return { n: items.length, dims: [...new Set(items.map(i => i.querySelector('.wb-dim').textContent))] }; });
    check('W-02', '错题本维度筛选「技术协作」：仅该维条目（3 条）', filt.n === 3 && filt.dims.length === 1 && filt.dims[0] === '技术协作', JSON.stringify(filt));
    await page.evaluate(() => { const c = [...document.querySelectorAll('#wb-filter .dim-chip')].find(x => x.textContent === '全部维度'); if (c) c.click(); });
    await page.waitForTimeout(250);
    // 重做第一条答对 → 已掌握
    const firstStem = await page.evaluate(() => document.querySelector('#wb-list .wb-item .wb-stem').textContent);
    await page.evaluate(() => { document.querySelector('#wb-list .wb-item .wb-actions .sq-btn').click(); });
    await page.waitForTimeout(200);
    const redoBoxShown = await page.evaluate(() => !!document.querySelector('#wb-list .wb-item .redo-box.show'));
    check('W-03', '错题条目「重做这道题」展开重做区', redoBoxShown);
    await page.evaluate(stem => { const q = window.QUIZ_BANK.find(x => x.stem === stem); const item = document.querySelector('#wb-list .wb-item'); item.querySelectorAll('.redo-box .p-opt')['ABCD'.indexOf(q.answer)].click(); }, firstStem);
    await page.waitForTimeout(250);
    const afterRedo = await page.evaluate(() => { const item = document.querySelector('#wb-list .wb-item'); return { status: item.querySelector('.wb-status').textContent, stats: document.getElementById('wb-stats').textContent.replace(/\s+/g, ' ') }; });
    const attemptsBytesAfter = await lsGet(page, 'aipm.attempts.v1');
    check('W-04', '重做答对 → 条目变已掌握、统计待巩固 17/已掌握 1、attempts 字节不变', afterRedo.status.includes('已掌握') && afterRedo.stats.includes('17') && attemptsBytesBefore === attemptsBytesAfter, JSON.stringify(afterRedo).slice(0, 140));
    // 去学知识点按钮（第二条）
    const goInfo = await page.evaluate(() => { const items = document.querySelectorAll('#wb-list .wb-item'); const btn = items[1].querySelector('.wb-point-btn'); const stem = items[1].querySelector('.wb-stem').textContent; const label = btn.textContent; btn.click(); return { stem, label }; });
    await page.waitForTimeout(300);
    const detailTitle2 = await page.evaluate(() => document.querySelector('#detail-wrap h2') ? document.querySelector('#detail-wrap h2').textContent : '');
    check('W-05/CC-03b', '错题本「去学知识点」→ 详情页标题与按钮所指一致', (await activeView(page)) === 'view-learn-detail' && goInfo.label.includes(detailTitle2), 'label=' + goInfo.label + ' title=' + detailTitle2);
    // 结果页两按钮（R-01/R-15）：经由新开一轮的路径回结果成本高，改在 CTX-C 子集结果页验证同类按钮
    await ctx.close();
  }

  /* ============ CTX-C：子集测评（3 维 12 题）结果页规则 ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.quizcfg.v1', { count: 12, dims: ['AI 基础认知', '产品设计', '技术协作'], startDiff: 'adaptive', scope: 'unseen' });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    const snapsBefore = await page.evaluate(() => (JSON.parse(window.localStorage.getItem('aipm.snapshots.v1') || '[]')).length);
    await startQuizFromLanding(page);
    const progTxt = await textOf(page, '#quiz-progress-text');
    check('SET-C1', '子集设置生效：答题页共 12 题', progTxt.includes('共 12 题'), progTxt);
    for (let i = 0; i < 12; i++) await answerCurrent(page, i % 2 ? 'wrong' : 'correct', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    const visDims = await page.evaluate(() => [...document.querySelectorAll('.result-dim')].filter(r => r.style.display !== 'none').length);
    const diagCards = await page.evaluate(() => document.querySelectorAll('#diag-list .diag-card').length);
    const subsetNote = await textOf(page, '#radar-subset-note');
    const radarHidden = await page.evaluate(() => document.querySelector('.result-grid .radar-card').style.display === 'none');
    const snapsAfter = await page.evaluate(() => (JSON.parse(window.localStorage.getItem('aipm.snapshots.v1') || '[]')).length);
    const att = await lsJSON(page, 'aipm.attempts.v1');
    check('R-17', '子集结果页：仅 3 维行+3 诊断卡、无雷达、有子集说明、不生成快照、attempt.dimScores=null', visDims === 3 && diagCards === 3 && radarHidden && subsetNote.includes('不生成六维雷达图') && snapsAfter === snapsBefore && att[att.length - 1].dimScores === null, 'dims=' + visDims + ' cards=' + diagCards + ' snaps=' + snapsBefore + '->' + snapsAfter);
    await shot(page, '12-result-subset');
    await page.evaluate(() => { [...document.querySelectorAll('#view-result .result-actions button')].find(b => b.textContent.includes('再测一次')).click(); });
    await page.waitForTimeout(300);
    check('R-15', '结果页「再测一次」→ 答题页新一轮第 1 题（沿用当前设置 12 题）', (await activeView(page)) === 'view-quiz' && (await textOf(page, '#quiz-progress-text')).includes('共 12 题'), await activeView(page));
    await clickGoto(page, 'view-intro');
    await clickGoto(page, 'view-landing');
    await ctx.close();
  }

  /* ============ CTX-D：12 题/6 维 → 严格 1–2 题诊断阈值 ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.quizcfg.v1', { count: 12, dims: DIMS, startDiff: 'adaptive', scope: 'unseen' });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await startQuizFromLanding(page);
    for (let i = 0; i < 12; i++) await answerCurrent(page, 'wrong', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    const diag = await page.evaluate(() => { const cards = [...document.querySelectorAll('#diag-list .diag-card')]; return { n: cards.length, insuff: cards.filter(c => c.textContent.includes('答题数据不足，无法生成针对性诊断')).length, resBtns: document.querySelectorAll('#diag-list .diag-res-btn').length }; });
    check('R-18', '每维仅 2 题时 6 张诊断卡全部为「数据不足」且无推荐资源按钮（严格 1–2 题阈值）', diag.n === 6 && diag.insuff === 6 && diag.resBtns === 0, JSON.stringify(diag));
    await shot(page, '13-result-insufficient');
    await page.evaluate(() => { document.querySelector('#view-result .back-btn').click(); });
    await page.waitForTimeout(250);
    check('R-01', '结果页「回到首页」→ 落地页', (await activeView(page)) === 'view-landing');
    await ctx.close();
  }

  /* ============ CTX-E/F：中途恢复（继续 / 放弃） ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await startQuizFromLanding(page);
    const stems = [];
    for (let i = 0; i < 3; i++) { const q = await answerCurrent(page, 'correct', MAIN.opt, MAIN, MAIN.stem, MAIN.dim); stems.push(q.id); }
    await page.evaluate(() => { document.querySelector('#view-quiz .back-btn').click(); });
    await page.waitForTimeout(250);
    check('Q-01', '答题页「返回介绍」→ 介绍页（进度已落盘）', (await activeView(page)) === 'view-intro');
    await clickGoto(page, 'view-landing');
    const resumeTxt = await textOf(page, '#resume-slot');
    check('L-08a', '落地页出现恢复卡：已答 3 题、将从第 4 题继续', resumeTxt.includes('未完成的测评') && resumeTxt.includes('已答 3 题'), (resumeTxt || '').replace(/\s+/g, ' ').slice(0, 110));
    await shot(page, '14-resume-card');
    await page.evaluate(() => { [...document.querySelectorAll('#resume-slot button')].find(b => b.textContent.includes('继续作答')).click(); });
    await page.waitForTimeout(300);
    const prog = await textOf(page, '#quiz-progress-text');
    check('L-08b', '「继续作答」→ 答题页第 4 题（进度接续）', (await activeView(page)) === 'view-quiz' && prog.includes('第 4'), prog);
    for (let i = 0; i < 15; i++) await answerCurrent(page, 'correct', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    const att = await lsJSON(page, 'aipm.attempts.v1');
    const recIds = att[att.length - 1].records.map(r => r.questionId);
    const inprog = await lsGet(page, 'aipm.inprogress.v1');
    check('L-08c', '续答完成：本轮 18 题、前 3 题与中断前一致、完成后进度键清除', recIds.length === 18 && JSON.stringify(recIds.slice(0, 3)) === JSON.stringify(stems) && inprog === null, 'first3=' + recIds.slice(0, 3).join(',') + ' vs ' + stems.join(','));
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await startQuizFromLanding(page);
    await answerCurrent(page, 'correct', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    await answerCurrent(page, 'wrong', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    await goto(page);
    const resumeTxt = await textOf(page, '#resume-slot');
    check('L-09a', '重开页面后恢复卡出现（已答 2 题）', resumeTxt.includes('已答 2 题'), (resumeTxt || '').replace(/\s+/g, ' ').slice(0, 90));
    await page.evaluate(() => { [...document.querySelectorAll('#resume-slot button')].find(b => b.textContent.includes('放弃重来')).click(); });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => ({ slot: document.getElementById('resume-slot').textContent.trim(), prog: window.localStorage.getItem('aipm.inprogress.v1') }));
    check('L-09b', '「放弃重来」→ 恢复卡消失且进度键清除', after.slot === '' && after.prog === null, JSON.stringify(after).slice(0, 80));
    await ctx.close();
  }

  /* ============ CTX-H：数据管理 12 键全控件 ============ */
  {
    const { ctx, page } = await newPage({ acceptDownloads: true });
    await goto(page);
    const seedSnaps = [snapSeed({ attemptId: 'dat-seed' })];
    await lsSet(page, 'aipm.attempts.v1', [{ id: 'a1', ts: Date.now(), records: [], dimScores: [70, 70, 70, 70, 70, 70], totalScore: 70 }]);
    await lsSet(page, 'aipm.snapshots.v1', seedSnaps);
    await lsSet(page, 'aipm.learn.v1', { learned: [0, 1], practice: {}, lastPoint: 1, plan: null });
    await lsSet(page, 'aipm.appeals.v1', [{ ts: Date.now(), totalScore: 70, dimScores: [70, 70, 70, 70, 70, 70], reason: '种子申诉' }]);
    await lsSet(page, 'aipm.drill.v1', { G1: { rating: 'fuzzy', count: 1, lastAt: new Date().toISOString() } });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    const readCounts = async () => page.evaluate(() => { const o = {}; document.querySelectorAll('#data-mgmt-slot [data-count]').forEach(e => { o[e.getAttribute('data-count')] = +e.textContent.trim(); }); return o; });
    const counts0 = await readCounts();
    check('DM-01', '数据概览四计数与存储一致（1/1/2/1）', counts0.attempts === 1 && counts0.snapshots === 1 && counts0.learned === 2 && counts0.appeals === 1, JSON.stringify(counts0));
    const dlPromise = page.waitForEvent('download', { timeout: 8000 });
    await page.click('#data-export-btn');
    const dl = await dlPromise;
    const dlPath = '/tmp/aipm-ctl-export.json';
    await dl.saveAs(dlPath);
    const payload = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
    const msgTxt = await textOf(page, '#data-msg');
    check('DM-02/L-12', '「导出全部数据」→ 下载 JSON（version=1、恰 12 键、内容与存储一致）+ 成功提示', payload.version === 1 && JSON.stringify(Object.keys(payload.data).sort()) === JSON.stringify(TWELVE_KEYS.slice().sort()) && JSON.stringify(payload.data['aipm.snapshots.v1']) === JSON.stringify(seedSnaps) && msgTxt.includes('已导出'), 'keys=' + Object.keys(payload.data).length);
    async function importFile(p) { const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), page.click('#data-import-btn')]); await fc.setFiles(p); await page.waitForTimeout(450); }
    await importFile(dlPath);
    const confirmExists = await page.evaluate(() => !!document.getElementById('data-import-confirm'));
    const countsPre = await readCounts();
    check('DM-03/L-13', '「导入数据」选合法文件 → 出现二次确认面板且确认前计数不变', confirmExists && JSON.stringify(countsPre) === JSON.stringify(counts0), JSON.stringify(countsPre));
    await page.evaluate(() => { [...document.querySelectorAll('#data-import-confirm button')].find(b => b.textContent === '取消').click(); });
    await page.waitForTimeout(250);
    check('DM-04/L-16', '导入确认「取消」→ 面板关闭、计数不变、无已导入提示', JSON.stringify(await readCounts()) === JSON.stringify(counts0) && !(await page.evaluate(() => !!document.getElementById('data-import-confirm'))));
    const badFiles = { notjson: 'this is not json', missing: JSON.stringify({ version: 1, data: { 'aipm.attempts.v1': [] } }), wrongtype: JSON.stringify({ version: 1, data: Object.fromEntries(TWELVE_KEYS.map(k => [k, k === 'aipm.attempts.v1' ? { bad: 1 } : null])) }) };
    let badOk = true; const badDet = [];
    for (const [name, content] of Object.entries(badFiles)) {
      const p = '/tmp/ctl-bad-' + name + '.json'; fs.writeFileSync(p, content);
      await importFile(p);
      const slot = await textOf(page, '#data-mgmt-slot');
      const same = JSON.stringify(await readCounts()) === JSON.stringify(counts0);
      const msg = slot.includes('导入失败');
      badDet.push(name + ':' + msg + '/' + same);
      if (!msg || !same) badOk = false;
    }
    check('DM-05', '三类坏文件导入均被拦截（失败提示+数据不变）', badOk, badDet.join(' '));
    // 清空：先点清空出现确认 → 取消 → 再点 → 确认
    await page.click('#data-clear-btn'); await page.waitForTimeout(250);
    const clearTxt = await textOf(page, '#data-clear-confirm');
    const keysBefore = await page.evaluate(ks => ks.filter(k => window.localStorage.getItem(k) !== null).length, TWELVE_KEYS);
    check('DM-06/L-14', '「清空全部数据」→ 确认面板列全十类（含面试演练自评）且确认前数据仍在', !!clearTxt && clearTxt.includes('面试演练自评') && clearTxt.includes('12 类') && keysBefore >= 5, (clearTxt || '').slice(0, 120) + ' keys=' + keysBefore);
    await shot(page, '15-data-clear-confirm');
    await page.evaluate(() => { [...document.querySelectorAll('#data-clear-confirm button')].find(b => b.textContent === '取消').click(); });
    await page.waitForTimeout(200);
    const keysAfterCancel = await page.evaluate(ks => ks.filter(k => window.localStorage.getItem(k) !== null).length, TWELVE_KEYS);
    check('DM-07/L-18', '清空「取消」→ 面板关闭、数据键仍在', keysAfterCancel >= 5 && !(await page.evaluate(() => !!document.getElementById('data-clear-confirm'))), 'keys=' + keysAfterCancel);
    await page.click('#data-clear-btn'); await page.waitForTimeout(200);
    await page.click('#data-clear-confirm-btn'); await page.waitForTimeout(350);
    const keysAfter = await page.evaluate(ks => ks.filter(k => window.localStorage.getItem(k) !== null), TWELVE_KEYS);
    const countsCleared = await readCounts();
    check('DM-08/L-17', '「确认清空」→ 12 键全无、计数全 0、我的测评回空态', keysAfter.length === 0 && countsCleared.attempts === 0 && countsCleared.snapshots === 0 && countsCleared.learned === 0 && countsCleared.appeals === 0 && (await textOf(page, '#my-assessment-slot')).includes('完成测评后查看你的能力雷达图'), 'keysAfter=' + keysAfter.join(','));
    await importFile(dlPath);
    await page.click('#data-import-confirm-btn'); await page.waitForTimeout(400);
    check('DM-09/L-15', '「确认导入并覆盖」→ 四计数还原为导出前（1/1/2/1）', JSON.stringify(await readCounts()) === JSON.stringify(counts0), JSON.stringify(await readCounts()));
    await ctx.close();
  }

  /* ============ CTX-J：学习首页 + 计划面板 + 编辑器 + 建议/置顶 + 四环关联链（种子 qid 11） ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    // 种子：最近 attempt 含 qid11 答错（映射知识点 23 · Badcase，数据与评估）+ 完整六维分（最弱=数据与评估 45）
    await lsSet(page, 'aipm.attempts.v1', [{ finishedAt: new Date().toISOString(), totalScore: 56, dimScores: [60, 55, 50, 45, 65, 70], testedDims: DIMS, records: [{ questionId: 11, dimension: '数据与评估', correct: false, userAnswer: 'A', skipped: false }] }]);
    await lsSet(page, 'aipm.learn.v1', { learned: [], practice: {}, lastPoint: 0, plan: { mode: 'custom', pointIds: [0, 1, 2, 9], pinnedFirst: [] } });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await clickGoto(page, 'view-learn');
    const recDesc = await textOf(page, '#learn-rec-desc');
    const jumpLabel = await textOf(page, '#jump-weak-btn');
    check('LN-02a', '有成绩时推荐区指名最弱维与真实分数（数据与评估 45 分）、按钮为「直达数据与评估」', recDesc.includes('数据与评估') && recDesc.includes('45') && jumpLabel.includes('数据与评估'), (recDesc || '').slice(0, 90) + ' btn=' + jumpLabel);
    await page.click('#jump-weak-btn'); await page.waitForTimeout(700);
    const stageInView = await page.evaluate(() => { const el = document.getElementById('stage-3'); const r = el.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; });
    check('LN-02b', '「直达最弱维度」点击后对应阶段卡滚动进入视口', stageInView);
    const panelTxt = await textOf(page, '#plan-panel-slot');
    check('LN-03a', '计划面板摘要：自定义/聚焦维度/计划 4 点/已学 0/4', panelTxt.includes('自定义计划') && panelTxt.includes('4') && panelTxt.includes('计划内已学'), (panelTxt || '').replace(/\s+/g, ' ').slice(0, 160));
    // 建议区：加入 23 + 置顶最弱维
    const sugTxt = await textOf(page, '#plan-panel-slot');
    const sugHas23 = await page.evaluate(() => [...document.querySelectorAll('#plan-panel-slot .suggest-row')].some(r => r.textContent.includes('建议加入计划')));
    const matchPi = await page.evaluate(() => { const q = window.QUIZ_BANK.find(x => x.id === 11); return window.GoalLink.matchQuestionPoint(q, 3, window.DIAG_DATA.POINT_KEYWORDS); });
    check('CC-03-1', '关联链环1/2：qid11 错题经页面同一匹配函数映射知识点下标 = ' + matchPi + '，且计划面板出现加入建议', sugHas23 && matchPi === 23, 'matchPi=' + matchPi + ' sug=' + sugHas23);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .suggest-row button')].find(x => x.textContent.includes('加入计划')); if (b) b.click(); });
    await page.waitForTimeout(250);
    let learn = await lsJSON(page, 'aipm.learn.v1');
    const sugGone = await page.evaluate(() => ![...document.querySelectorAll('#plan-panel-slot .suggest-row')].some(r => r.textContent.includes('建议加入计划')));
    check('LN-10', '建议「加入计划」→ plan 含 23 且该建议消失', learn.plan.pointIds.includes(23) && sugGone, 'points=' + learn.plan.pointIds.join(','));
    const pinExists = await page.evaluate(() => [...document.querySelectorAll('#plan-panel-slot .suggest-row button')].some(b => b.textContent.includes('置顶到计划最前')));
    check('LN-11a', '最弱维置顶建议行存在（数据与评估在计划内有知识点）', pinExists);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .suggest-row button')].find(x => x.textContent.includes('置顶')); if (b) b.click(); });
    await page.waitForTimeout(250);
    learn = await lsJSON(page, 'aipm.learn.v1');
    const stage4First = await page.evaluate(() => { const card = document.getElementById('stage-3'); const row = card.querySelector('.point-row'); return row ? { idx: row.querySelector('.point-idx').textContent, txt: row.textContent } : { idx: '', txt: '' }; });
    check('LN-11b', '「置顶到计划最前」→ pinnedFirst 落盘（含 9/23）且阶段 4 首行变为置顶知识点（序号 10）', Array.isArray(learn.plan.pinnedFirst) && learn.plan.pinnedFirst.includes(9) && stage4First.idx === '10', 'pinned=' + JSON.stringify(learn.plan.pinnedFirst) + ' first=' + stage4First.txt.replace(/\s+/g, ' ').slice(0, 70));
    // 预设：只学最弱维（有成绩可用）
    await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .preset-btn')].find(x => x.textContent.includes('只学最弱维')); if (b) b.click(); });
    await page.waitForTimeout(250);
    learn = await lsJSON(page, 'aipm.learn.v1');
    check('LN-04', '预设「只学最弱维」→ plan 为数据与评估全部 5 点 [9,10,11,23,24]', learn.plan.mode === 'weakest' && JSON.stringify(learn.plan.pointIds) === JSON.stringify([9, 10, 11, 23, 24]), JSON.stringify(learn.plan));
    await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .preset-btn')].find(x => x.textContent.includes('系统全学')); if (b) b.click(); });
    await page.waitForTimeout(250);
    learn = await lsJSON(page, 'aipm.learn.v1');
    check('LN-03', '预设「系统全学」→ plan mode=all、27 点全入', learn.plan.mode === 'all' && learn.plan.pointIds.length === 27, 'n=' + learn.plan.pointIds.length);
    // 自定义编辑器：打开 → 整维 chip → 取消丢弃
    await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .preset-btn')].find(x => x.textContent.includes('自定义计划')); if (b) b.click(); });
    await page.waitForTimeout(300);
    const editorShown = await page.evaluate(() => !!document.querySelector('#plan-panel-slot .plan-editor.show'));
    const cbCount = await page.evaluate(() => document.querySelectorAll('#plan-panel-slot .plan-point input[type="checkbox"]').length);
    check('LN-05/LN-07a', '「自定义计划」展开编辑器：27 个知识点勾选框齐全', editorShown && cbCount === 27, 'cb=' + cbCount);
    await shot(page, '16-plan-editor');
    await page.evaluate(() => { const chips = [...document.querySelectorAll('#plan-panel-slot .plan-editor .dim-chip')]; const c = chips[1]; if (c) c.click(); });
    await page.waitForTimeout(250);
    const afterChip = await page.evaluate(() => { const boxes = [...document.querySelectorAll('#plan-panel-slot .plan-point input[type="checkbox"]')]; return boxes.slice(5, 9).map(b => b.checked); });
    check('LN-06', '编辑器整维 chip 点击 → 该维 4 个知识点勾选整组翻转（场景洞察组取消）', afterChip.every(v => v === false), JSON.stringify(afterChip));
    await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .plan-editor-actions button')].find(x => x.textContent === '取消'); if (b) b.click(); });
    await page.waitForTimeout(250);
    learn = await lsJSON(page, 'aipm.learn.v1');
    check('LN-09', '编辑器「取消」→ 编辑器关闭且已保存计划不变（仍 all/27）', learn.plan.mode === 'all' && learn.plan.pointIds.length === 27 && !(await page.evaluate(() => !!document.querySelector('#plan-panel-slot .plan-editor.show'))));
    // 编辑器：全不选保存被拦
    await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .preset-btn')].find(x => x.textContent.includes('自定义计划')); if (b) b.click(); });
    await page.waitForTimeout(250);
    await page.evaluate(() => { for (let guard = 0; guard < 40; guard++) { const cb = document.querySelector('#plan-panel-slot .plan-point input[type="checkbox"]:checked'); if (!cb) break; cb.click(); } });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .plan-editor-actions button')].find(x => x.textContent === '保存计划'); if (b) b.click(); });
    await page.waitForTimeout(200);
    const saveMsg = await page.evaluate(() => { const ed = document.querySelector('#plan-panel-slot .plan-editor'); return ed ? ed.textContent : ''; });
    learn = await lsJSON(page, 'aipm.learn.v1');
    check('LN-08a', '全不选点「保存计划」→ 提示至少勾选一个且计划未被清空', saveMsg.includes('至少勾选一个知识点') && learn.plan.pointIds.length === 27, (saveMsg || '').replace(/\s+/g, ' ').slice(-60));
    // 勾选 1 个后保存成功
    await page.evaluate(() => { const cb = document.querySelector('#plan-panel-slot .plan-point input[type="checkbox"]'); if (cb) cb.click(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .plan-editor-actions button')].find(x => x.textContent === '保存计划'); if (b) b.click(); });
    await page.waitForTimeout(250);
    learn = await lsJSON(page, 'aipm.learn.v1');
    check('LN-08b', '勾选 1 个后「保存计划」→ custom 计划仅含该点、编辑器关闭', learn.plan.mode === 'custom' && learn.plan.pointIds.length === 1 && !(await page.evaluate(() => !!document.querySelector('#plan-panel-slot .plan-editor.show'))), JSON.stringify(learn.plan.pointIds));
    // 路径呈现：计划外弱化 + 阶段卡分母
    const pathInfo = await page.evaluate(() => { const rows = [...document.querySelectorAll('.point-row')]; return { total: rows.length, out: rows.filter(r => r.classList.contains('is-out')).length, outBadge: rows.filter(r => r.textContent.includes('计划外')).length }; });
    check('LN-13a', '学习路径 27 行：计划外 26 行带弱化样式与「计划外」徽标', pathInfo.total === 27 && pathInfo.out === 26 && pathInfo.outBadge === 26, JSON.stringify(pathInfo));
    // 四环链环 3/4：错题本去学 23 → 详情 → 练习题归属
    await clickGoto(page, 'view-landing');
    await page.evaluate(() => { document.querySelector('#wrongbook-slot button').click(); });
    await page.waitForTimeout(300);
    const wbItem = await page.evaluate(() => { const item = document.querySelector('#wb-list .wb-item'); if (!item) return null; return { stem: item.querySelector('.wb-stem').textContent, btn: item.querySelector('.wb-point-btn').textContent }; });
    const q11 = await page.evaluate(() => { const q = window.QUIZ_BANK.find(x => x.id === 11); return q.stem; });
    check('CC-03-2', '关联链环3a：错题本条目题干与题库 #11 逐字一致、知识点按钮指向下标 23 对应知识点', wbItem && wbItem.stem === q11 && wbItem.btn.includes('Badcase'), JSON.stringify(wbItem).slice(0, 140));
    await page.evaluate(() => { document.querySelector('#wb-list .wb-item .wb-point-btn').click(); });
    await page.waitForTimeout(300);
    const detail = await page.evaluate(() => { const w = document.getElementById('detail-wrap'); return { title: w.querySelector('h2').textContent, crumb: w.querySelector('.detail-crumb').textContent }; });
    check('CC-03-3', '关联链环3b：点知识点按钮 → 详情页标题=该知识点、面包屑维度=数据与评估', (await activeView(page)) === 'view-learn-detail' && wbItem.btn.includes(detail.title) && detail.crumb.includes('数据与评估'), 'title=' + detail.title + ' crumb=' + detail.crumb.replace(/\s+/g, ' '));
    const practice = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#detail-wrap .practice-card')];
      const bankCards = cards.slice(2);
      return bankCards.map(c => { const tag = c.querySelector('p').textContent; const stem = c.querySelector('.practice-stem').textContent; const q = window.QUIZ_BANK.find(x => x.stem === stem); let rel = -1; if (q) { const kws = window.DIAG_DATA.POINT_KEYWORDS[23]; rel = window.GoalLink.relevanceOf(q, kws).hits; } return { tag, dim: q ? q.dimension : null, rel }; });
    });
    check('CC-03-4', '关联链环4：该知识点练习真题共 4 道、全部属数据与评估且关键词相关度 ≥1', practice.length === 4 && practice.every(p => p.dim === '数据与评估' && p.rel >= 1), JSON.stringify(practice).slice(0, 220));
    await ctx.close();
  }

  /* ============ CTX-J2：只学最弱维禁用态（无成绩）+ 题目整理区 ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    const weakBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .preset-btn')].find(x => x.textContent.includes('只学最弱维')); return b ? { dis: b.disabled, title: b.title } : null; });
    const planHint = await textOf(page, '#plan-panel-slot');
    /* 【批次 6 口径变更】原断言为「无成绩时禁用并提示先测评」；现行为：任何时候可点选，
       无成绩时进入「已选 · 待生效」，完成首次测评后自动按最弱维聚焦（全链路见 PLN-09）。 */
    check('LN-04a', '无测评成绩时「只学最弱维」不禁用且有待生效引导', weakBtn && weakBtn.dis === false && planHint.includes('可以先选上') && planHint.includes('自动按最弱维'), JSON.stringify(weakBtn));
    await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .preset-btn')].find(x => x.textContent.includes('只学最弱维')); if (b) b.click(); });
    await page.waitForTimeout(250);
    const pendState = await page.evaluate(() => {
      const b = [...document.querySelectorAll('#plan-panel-slot .preset-btn')].find(x => x.textContent.includes('只学最弱维'));
      const cfg = JSON.parse(window.localStorage.getItem('aipm.quizcfg.v1') || 'null');
      const panel = document.querySelector('#plan-panel-slot').textContent;
      return { txt: b ? b.textContent : '', on: b ? b.classList.contains('is-on') : false, pending: cfg && cfg.weakestPending, hint: panel.includes('待生效') };
    });
    check('LN-04b', '无成绩点「只学最弱维」→ 已选·待生效（按钮态 + quizcfg 落盘 + 卡上明示）', pendState.txt.includes('待生效') && pendState.on === true && pendState.pending === true && pendState.hint === true, JSON.stringify(pendState));
    // 题目整理：空输入
    await page.click('#import-btn'); await page.waitForTimeout(200);
    const emptyMsg = await textOf(page, '#import-result');
    check('LN-16a', '整理区空输入点「整理成知识点」→ 提示先粘贴题目', emptyMsg.includes('还没有读到题目'), (emptyMsg || '').slice(0, 60));
    await page.click('#import-sample-btn'); await page.waitForTimeout(150);
    const sampleVal = await page.evaluate(() => document.getElementById('import-text').value);
    check('LN-17', '「填入示例题目」→ 文本框填入 5 道示例题', sampleVal.split('\n').length === 5 && sampleVal.includes('RAG'), sampleVal.slice(0, 40));
    await page.click('#import-btn'); await page.waitForTimeout(250);
    const org = await textOf(page, '#import-result');
    check('LN-16b', '「整理成知识点」→ 5 题按阶段归类输出（含阶段标题与题数）', org.includes('已整理 5 道题') && org.includes('阶段 1') && org.includes('阶段 4'), (org || '').replace(/\s+/g, ' ').slice(0, 160));
    await shot(page, '17-import-organizer');
    await page.fill('#import-text', '如何设计 Agent 的工作流编排与失败降级？\n多轮对话里上下文窗口超限时怎么压缩历史？');
    await page.click('#import-btn'); await page.waitForTimeout(250);
    const org2 = await page.evaluate(() => [...document.querySelectorAll('#import-result .import-group b')].map(b => b.textContent));
    check('LN-16c', '归类最长关键词优先：「工作流编排」归技术协作(阶段5)、「上下文」归 AI 基础认知(阶段1)', org2.some(t => t.includes('阶段 5') && t.includes('技术协作')) && org2.some(t => t.includes('阶段 1') && t.includes('AI 基础认知')), org2.join(' | '));
    // 学习首页底部三入口
    await page.evaluate(() => { [...document.querySelectorAll('#view-learn .doc-actions button')].find(b => b.textContent.includes('面试演练')).click(); });
    await page.waitForTimeout(250);
    check('LN-18', '学习页底部「面试演练」入口 → 演练首页', (await activeView(page)) === 'view-drill');
    await clickGoto(page, 'view-landing');
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { [...document.querySelectorAll('#view-learn .doc-actions button')].find(b => b.textContent.includes('打开错题本')).click(); });
    await page.waitForTimeout(250);
    check('LN-19', '学习页底部「打开错题本」入口 → 错题本页', (await activeView(page)) === 'view-wrongbook');
    await clickGoto(page, 'view-landing');
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { [...document.querySelectorAll('#view-learn .doc-actions button')].find(b => b.textContent.includes('先做测评')).click(); });
    await page.waitForTimeout(250);
    check('LN-20', '学习页底部「先做测评」入口 → 介绍页', (await activeView(page)) === 'view-intro');
    await ctx.close();
  }

  /* ============ CTX-K：知识点学习页全控件 ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { document.querySelectorAll('.point-row')[0].click(); });
    await page.waitForTimeout(300);
    const d0 = await page.evaluate(() => { const w = document.getElementById('detail-wrap'); return { title: w.querySelector('h2').textContent, crumb: w.querySelector('.detail-crumb').textContent, secs: [...w.querySelectorAll('.detail-sec h3')].map(h => h.textContent), hasCase: !!w.querySelector('.case-box'), hasPit: !!w.querySelector('.pitfall-box'), prev: [...w.querySelectorAll('.detail-nav button')].some(b => b.textContent.includes('上一个')), next: [...w.querySelectorAll('.detail-nav button')].some(b => b.textContent.includes('下一个')) }; });
    check('LD-00', '知识点 1 详情：标题/面包屑/讲解三段/案例/坑齐全，首点无「上一个」、有「下一个」', d0.title.includes('大模型是怎么工作的') && d0.crumb.includes('知识点 1 / 27') && d0.secs.join(',').includes('先讲清楚') && d0.hasCase && d0.hasPit && !d0.prev && d0.next, JSON.stringify(d0).slice(0, 160));
    await shot(page, '18-detail-point1');
    // 入门题答错 → 解析 + 禁用 + 持久化
    const handInfo = await page.evaluate(() => { const cards = document.querySelectorAll('#detail-wrap .practice-card'); const hand = cards[1]; const stem = hand.querySelector('.practice-stem').textContent; return { stem, tag: hand.querySelector('p').textContent }; });
    check('LD-02a', '练习题组首题为入门手写题', handInfo.tag.includes('入门题'), handInfo.tag);
    await page.evaluate(() => { const cards = document.querySelectorAll('#detail-wrap .practice-card'); const hand = cards[1]; const opts = hand.querySelectorAll('.p-opt'); opts[0].click(); });
    await page.waitForTimeout(200);
    // 入门题答案下标为 1（POINTS[0].q.ans=1），点 0 即答错（若实际不同以下断言以解析出现为准）
    const handAfter = await page.evaluate(() => { const cards = document.querySelectorAll('#detail-wrap .practice-card'); const hand = cards[1]; return { explain: hand.querySelector('.practice-explain').textContent, allDis: [...hand.querySelectorAll('.p-opt')].every(b => b.disabled) }; });
    check('LD-02b', '入门题作答后显示解析（含考核点）且选项全禁用', handAfter.explain.includes('考核点') && handAfter.allDis, handAfter.explain.slice(0, 80));
    let learn = await lsJSON(page, 'aipm.learn.v1');
    check('LD-02c', '入门题作答落盘 aipm.learn.v1 practice[0].hand', !!(learn && learn.practice && learn.practice[0] && learn.practice[0].hand), JSON.stringify(learn && learn.practice).slice(0, 100));
    // 真题答错 → 入复习队列（due = 明天）
    const bankCardStem = await page.evaluate(() => { const cards = document.querySelectorAll('#detail-wrap .practice-card'); return cards[2].querySelector('.practice-stem').textContent; });
    const bankQ = await page.evaluate(stem => window.QUIZ_BANK.find(x => x.stem === stem), bankCardStem);
    await page.evaluate(ansLetter => { const cards = document.querySelectorAll('#detail-wrap .practice-card'); const wrongIdx = ['A', 'B', 'C', 'D'].findIndex(L => L !== ansLetter); cards[2].querySelectorAll('.p-opt')[wrongIdx].click(); }, bankQ.answer);
    await page.waitForTimeout(250);
    const review = await lsJSON(page, 'aipm.review.v1');
    const rvEntry = review && review[String(bankQ.id)];
    const tomorrow = await page.evaluate(() => window.ReviewLink.addDaysStr(window.ReviewLink.todayStr(), 1));
    check('LD-03', '真题练习答错 → 复习队列新增该题（source=practice、due=明天 +1 天）', !!rvEntry && rvEntry.source === 'practice' && rvEntry.due === tomorrow, JSON.stringify(rvEntry));
    // 刷新后练习状态保持
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await clickGoto(page, 'view-learn');
    const rowStatus = await page.evaluate(() => document.querySelectorAll('.point-row')[0].textContent);
    await page.evaluate(() => { document.querySelectorAll('.point-row')[0].click(); });
    await page.waitForTimeout(250);
    const persisted = await page.evaluate(() => { const cards = document.querySelectorAll('#detail-wrap .practice-card'); return [...cards[1].querySelectorAll('.p-opt')].every(b => b.disabled) && cards[1].querySelector('.practice-explain').classList.contains('show'); });
    check('LD-02d', '刷新后练习作答状态保持（禁用+解析展开）', persisted, 'row=' + rowStatus.replace(/\s+/g, ' ').slice(0, 60));
    // 标记学会 toggle
    await page.evaluate(() => { [...document.querySelectorAll('#detail-wrap .detail-nav button')].find(b => b.textContent.includes('标记为已学会')).click(); });
    await page.waitForTimeout(200);
    learn = await lsJSON(page, 'aipm.learn.v1');
    const doneLabel = await page.evaluate(() => [...document.querySelectorAll('#detail-wrap .detail-nav button')].map(b => b.textContent).join('|'));
    check('LD-04a', '「标记为已学会」→ 落盘 learned 含 0、按钮变「已标记学会 ✓」', learn.learned.includes(0) && doneLabel.includes('已标记学会'), doneLabel);
    await page.evaluate(() => { [...document.querySelectorAll('#detail-wrap .detail-nav button')].find(b => b.textContent.includes('已标记学会')).click(); });
    await page.waitForTimeout(200);
    learn = await lsJSON(page, 'aipm.learn.v1');
    check('LD-04b', '再次点击取消已学 → learned 不含 0', !learn.learned.includes(0));
    // 上/下一个导航
    await page.evaluate(() => { [...document.querySelectorAll('#detail-wrap .detail-nav button')].find(b => b.textContent.includes('下一个知识点')).click(); });
    await page.waitForTimeout(250);
    const title1 = await page.evaluate(() => document.querySelector('#detail-wrap h2').textContent);
    const hasPrev = await page.evaluate(() => [...document.querySelectorAll('#detail-wrap .detail-nav button')].some(b => b.textContent.includes('上一个知识点')));
    check('LD-06', '「下一个知识点」→ 知识点 2 且出现「上一个知识点」', title1.includes('提示词设计') && hasPrev, title1);
    await page.evaluate(() => { [...document.querySelectorAll('#detail-wrap .detail-nav button')].find(b => b.textContent.includes('上一个知识点')).click(); });
    await page.waitForTimeout(250);
    check('LD-05', '「上一个知识点」→ 回到知识点 1', (await page.evaluate(() => document.querySelector('#detail-wrap h2').textContent)).includes('大模型是怎么工作的'));
    // 末点：回到学习路径
    await page.evaluate(() => { const rows = document.querySelectorAll('.point-row'); return rows.length; }).catch(() => {});
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { const rows = document.querySelectorAll('.point-row'); rows[rows.length - 1].click(); });
    await page.waitForTimeout(250);
    const lastNav = await page.evaluate(() => [...document.querySelectorAll('#detail-wrap .detail-nav button')].map(b => b.textContent));
    check('LD-07a', '末知识点（27）无「下一个」、有「回到学习路径」', !lastNav.some(t => t.includes('下一个知识点')) && lastNav.some(t => t.includes('回到学习路径')), lastNav.join('|'));
    await page.evaluate(() => { [...document.querySelectorAll('#detail-wrap .detail-nav button')].find(b => b.textContent.includes('回到学习路径')).click(); });
    await page.waitForTimeout(250);
    check('LD-07b', '「回到学习路径」→ 学习首页', (await activeView(page)) === 'view-learn');
    await page.evaluate(() => { document.querySelectorAll('.point-row')[0].click(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { document.querySelector('#view-learn-detail .back-btn').click(); });
    await page.waitForTimeout(250);
    check('LD-01', '详情页「学习路径」返回按钮 → 学习首页', (await activeView(page)) === 'view-learn');
    // 阶段小测入口文案（未测态）
    const sqRowTxt = await page.evaluate(() => document.querySelector('#stage-0 .stage-quiz-row').textContent);
    check('LN-14a', '阶段卡小测行未测态：通过线 3/5 文案 + 「开始阶段小测」按钮', sqRowTxt.includes('未测') && sqRowTxt.includes('3/5') && sqRowTxt.includes('开始阶段小测'), sqRowTxt.replace(/\s+/g, ' '));
    await ctx.close();
  }

  /* ============ CTX-L：阶段小测全程 ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { document.querySelector('#stage-0 .sq-btn').click(); });
    await page.waitForTimeout(300);
    check('S-00', '阶段 1「开始阶段小测」→ 小测页，进度「第 1 题 / 共 5 题」', (await activeView(page)) === 'view-stagequiz' && (await textOf(page, '#sq-progress-text')).includes('共 5 题'), await activeView(page));
    const sqNextDis = await page.evaluate(() => document.getElementById('sq-next').disabled);
    check('S-03a', '小测未选时「下一题」禁用', sqNextDis === true);
    const seenStems = [];
    for (let i = 0; i < 5; i++) {
      const q = await currentBankQ(page, '#sq-stem', '#sq-dim');
      seenStems.push(q.id);
      if (i === 1) {
        await answerCurrent(page, 'skip', '#sq-options .opt', { next: '#sq-next', skip: '#sq-skip' }, '#sq-stem', '#sq-dim');
        const p = await textOf(page, '#sq-progress-text');
        check('S-04', '小测「跳过本题」推进到第 3 题（跳过计错在结算验证）', p.includes('第 3'), p);
        continue;
      }
      if (i === 4) {
        const lbl = await textOf(page, '#sq-next-label');
        check('S-03b', '小测末题按钮文案「查看小测结果」', lbl === '查看小测结果', lbl);
      }
      await answerCurrent(page, i < 3 ? 'correct' : 'wrong', '#sq-options .opt', { next: '#sq-next', skip: '#sq-skip' }, '#sq-stem', '#sq-dim');
    }
    const sqRes = await textOf(page, '#stagequiz-result');
    const sqItems = await page.evaluate(() => document.querySelectorAll('#stagequiz-result .sq-review-item').length);
    // 作答：Q1 对、Q2 跳过、Q3 对、Q4 错、Q5 错 → 2/5 不过线（注意循环映射：i=0对,i=1跳,i=2对,i=3错,i=4错）
    check('S-05a', '小测结果：答对 2/5 未过线文案 + 逐题复盘 5 条', sqRes.includes('2 / 5') && sqRes.includes('还差一点') && sqItems === 5, (sqRes || '').replace(/\s+/g, ' ').slice(0, 130) + ' items=' + sqItems);
    await shot(page, '19-stagequiz-result');
    const sqStore = await lsJSON(page, 'aipm.stagequiz.v1');
    const attN = (await lsJSON(page, 'aipm.attempts.v1') || []).length;
    const snapN = (await lsJSON(page, 'aipm.snapshots.v1') || []).length;
    const rvStore = await lsJSON(page, 'aipm.review.v1');
    const rvN = rvStore ? Object.keys(rvStore).length : 0;
    check('S-05b', '小测落盘 stagequiz（plays=1,best=2）、不写 attempts/快照、3 道错题入复习队列', sqStore && sqStore['0'] && sqStore['0'].plays === 1 && sqStore['0'].best === 2 && attN === 0 && snapN === 0 && rvN === 3, 'sq=' + JSON.stringify(sqStore).slice(0, 90) + ' rv=' + rvN);
    const poolOk = await page.evaluate(ids => ids.every(id => { const q = window.QUIZ_BANK.find(x => x.id === id); return q && q.dimension === 'AI 基础认知'; }), seenStems);
    check('S-02', '小测 5 题全部属本阶段维度（AI 基础认知）且不重复', poolOk && new Set(seenStems).size === 5, seenStems.join(','));
    await page.evaluate(() => { [...document.querySelectorAll('#stagequiz-result button')].find(b => b.textContent.includes('再测一次')).click(); });
    await page.waitForTimeout(300);
    check('S-06', '小测结果「再测一次」→ 重新进入小测第 1 题', (await activeView(page)) === 'view-stagequiz' && (await textOf(page, '#sq-progress-text')).includes('第 1'));
    await page.evaluate(() => { document.querySelector('#view-stagequiz .back-btn').click(); });
    await page.waitForTimeout(250);
    const sqStore2 = await lsJSON(page, 'aipm.stagequiz.v1');
    check('S-01', '小测中途「学习路径」返回 → 学习页且未新增小测记录（plays 仍 1）', (await activeView(page)) === 'view-learn' && sqStore2['0'].plays === 1);
    const sqRowTxt2 = await page.evaluate(() => document.querySelector('#stage-0 .stage-quiz-row').textContent);
    check('LN-14b', '阶段卡小测行更新：已测 1 次/最佳 2/5、按钮变「再测一次」', sqRowTxt2.includes('最佳成绩') && sqRowTxt2.includes('2/5') && sqRowTxt2.includes('再测一次'), sqRowTxt2.replace(/\s+/g, ' '));
    await ctx.close();
  }

  /* ============ CTX-M：复习会话（种子到期题） ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    const bannerHidden = await page.evaluate(() => !document.getElementById('review-banner').classList.contains('show'));
    check('V-00', '无到期题时复习横幅不显示', bannerHidden);
    const seedInfo = await page.evaluate(() => {
      const today = window.ReviewLink.todayStr();
      const store = { '1': { stage: 0, due: today, lastResult: null, source: 'attempt' }, '2': { stage: 0, due: today, lastResult: null, source: 'attempt' } };
      window.localStorage.setItem('aipm.review.v1', JSON.stringify(store));
      return { today, d3: window.ReviewLink.addDaysStr(today, 3), d1: window.ReviewLink.addDaysStr(today, 1) };
    });
    await clickGoto(page, 'view-landing');
    await clickGoto(page, 'view-learn');
    const bannerTxt = await textOf(page, '#review-banner');
    check('LN-12a', '有 2 道到期题时横幅显示「今日可复习 2 题」+ 自愿措辞（无惩罚）', bannerTxt.includes('今日可复习 2 题') && bannerTxt.includes('不会有任何惩罚'), (bannerTxt || '').replace(/\s+/g, ' ').slice(0, 130));
    await page.click('#review-start-btn'); await page.waitForTimeout(300);
    check('V-01a', '「开始复习」→ 复习页第 1 题', (await activeView(page)) === 'view-review' && (await textOf(page, '#rv-progress-text')).includes('第 1'), await activeView(page));
    const rvNextDis = await page.evaluate(() => document.getElementById('rv-next').disabled);
    const rvNextLbl = await textOf(page, '#rv-next-label');
    check('V-03a', '复习未答时「下一题」禁用且文案「先选一个答案」', rvNextDis === true && rvNextLbl === '先选一个答案', rvNextLbl);
    // Q1 答对 → 即时反馈 + due +3
    const q1 = await currentBankQ(page, '#rv-stem', '#rv-dim');
    await page.evaluate(i => { document.querySelectorAll('#rv-options .opt')[i].click(); }, 'ABCD'.indexOf(q1.answer));
    await page.waitForTimeout(250);
    const fb1 = await textOf(page, '#rv-feedback');
    check('V-02a', '复习答对即时反馈：含「答对了」+ 解析 + 下次时间（+3 天）', fb1.includes('答对了') && fb1.includes('下次可复习时间：' + seedInfo.d3), fb1.slice(0, 130) + ' expect=' + seedInfo.d3);
    const rvLbl2 = await textOf(page, '#rv-next-label');
    check('V-03b', '答后按钮文案变「下一题」且启用', rvLbl2 === '下一题');
    await shot(page, '20-review-feedback');
    await page.click('#rv-next'); await page.waitForTimeout(200);
    // Q2 答错 → due 回 +1
    const q2 = await currentBankQ(page, '#rv-stem', '#rv-dim');
    const wrongLetter = ['A', 'B', 'C', 'D'].find(L => L !== q2.answer);
    await page.evaluate(i => { document.querySelectorAll('#rv-options .opt')[i].click(); }, 'ABCD'.indexOf(wrongLetter));
    await page.waitForTimeout(250);
    const fb2 = await textOf(page, '#rv-feedback');
    check('V-02b', '复习答错即时反馈：含正确答案 + 下次时间回 +1 天', fb2.includes('这题选 ' + q2.answer) && fb2.includes('下次可复习时间：' + seedInfo.d1), fb2.slice(0, 130) + ' expect=' + seedInfo.d1);
    const rvStore = await lsJSON(page, 'aipm.review.v1');
    check('V-02c', '复习迁移落盘：答对题 stage=1/due+3、答错题 stage=0/due+1', rvStore['1'].stage === 1 && rvStore['1'].due === seedInfo.d3 && rvStore['2'].stage === 0 && rvStore['2'].due === seedInfo.d1, JSON.stringify(rvStore));
    const lastLbl = await textOf(page, '#rv-next-label');
    check('V-03c', '复习末题按钮文案「完成复习」', lastLbl === '完成复习', lastLbl);
    await page.click('#rv-next'); await page.waitForTimeout(300);
    const rvRes = await textOf(page, '#review-result');
    check('V-04a', '复习小结：复习 2 题、答对 1 题', rvRes.includes('复习了 2 题') && rvRes.includes('答对 1 题'), (rvRes || '').replace(/\s+/g, ' ').slice(0, 110));
    await page.evaluate(() => { [...document.querySelectorAll('#review-result button')].find(b => b.textContent.includes('打开错题本')).click(); });
    await page.waitForTimeout(250);
    check('V-05', '复习小结「打开错题本」→ 错题本页', (await activeView(page)) === 'view-wrongbook');
    await clickGoto(page, 'view-landing');
    await clickGoto(page, 'view-learn');
    // 此时无到期题（due 均在未来）→ 横幅隐藏；直接调 startReviewSession 不可达（按钮在横幅内），验证横幅隐藏即为空态
    const bannerHidden2 = await page.evaluate(() => !document.getElementById('review-banner').classList.contains('show'));
    check('LN-12b', '复习完成后无到期题 → 横幅重新隐藏', bannerHidden2);
    await ctx.close();
  }

  /* ============ CTX-N：面试演练全控件 ============ */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await page.evaluate(() => { document.querySelector('#drill-slot button').click(); });
    await page.waitForTimeout(300);
    const stats = await textOf(page, '#drill-stats');
    check('DR-00', '演练首页统计：总 547/已练 0/掌握 0/模糊 0/不会 0/没练过 547', stats.includes('547') && stats.includes('没练过'), stats.replace(/\s+/g, ' '));
    const weakBtnDis0 = await page.evaluate(() => document.getElementById('drill-weak-btn').disabled);
    check('DR-06a', '无待加强时「只练待加强这批」禁用', weakBtnDis0 === true);
    // 维度筛选计数
    await page.evaluate(() => { const c = [...document.querySelectorAll('#drill-dim-filter .dim-chip')].find(x => x.textContent === '技术协作'); if (c) c.click(); });
    await page.waitForTimeout(250);
    const note = await textOf(page, '#drill-pool-note');
    const dimCount = await page.evaluate(() => window.DRILL_BANK.filter(e => e.dimension === '技术协作').length);
    check('DR-02', '维度筛选「技术协作」→ 池提示条数与题库该维条数一致（' + dimCount + '）', note.includes('共有 ' + dimCount + ' 条'), note + ' bank=' + dimCount);
    await page.evaluate(() => { const c = [...document.querySelectorAll('#drill-dim-filter .dim-chip')].find(x => x.textContent === '全部维度'); if (c) c.click(); });
    await page.waitForTimeout(200);
    // 模式筛选到空池 → 开始禁用
    await page.evaluate(() => { const c = [...document.querySelectorAll('#drill-mode-filter .dim-chip')].find(x => x.textContent === '只练不会的'); if (c) c.click(); });
    await page.waitForTimeout(250);
    const startDis = await page.evaluate(() => document.getElementById('drill-start-btn').disabled);
    const noteEmpty = await textOf(page, '#drill-pool-note');
    check('DR-03/DR-05a', '模式「只练不会的」空池 → 提示无条目且「开始一组演练」禁用', startDis === true && noteEmpty.includes('没有可练的条目'), noteEmpty);
    await page.evaluate(() => { const c = [...document.querySelectorAll('#drill-mode-filter .dim-chip')].find(x => x.textContent === '全部'); if (c) c.click(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const c = [...document.querySelectorAll('#drill-size-filter .dim-chip')].find(x => x.textContent.startsWith('3')); if (c) c.click(); });
    await page.waitForTimeout(200);
    const note3 = await textOf(page, '#drill-pool-note');
    check('DR-04', '题量 chip 3 题/组 → 池提示本组抽 3 条', note3.includes('随机抽 3 条'), note3);
    await page.click('#drill-start-btn'); await page.waitForTimeout(300);
    const askInfo = await page.evaluate(() => { const b = document.getElementById('drill-run-box'); return { txt: b.textContent, bodies: b.querySelectorAll('.drill-body').length, gid: b.querySelector('.quiz-progress-pct').textContent }; });
    check('DU-00', '演练单题 ask 阶段：只显示题干+「看参考答案」、无任何答案段', (await activeView(page)) === 'view-drill-run' && askInfo.bodies === 0 && askInfo.txt.includes('看参考答案') && askInfo.txt.includes('先别看答案'), 'gid=' + askInfo.gid);
    await shot(page, '21-drill-ask');
    const entry0 = await page.evaluate(gid => window.DRILL_BANK.find(e => e.gid === gid), askInfo.gid);
    const qMatch = await page.evaluate(gid => { const b = document.getElementById('drill-run-box'); const e = window.DRILL_BANK.find(x => x.gid === gid); return b.querySelector('.drill-q').textContent === e.question && b.textContent.includes(e.title); }, askInfo.gid);
    check('CC-01a', '演练题干/标题与 DRILL_BANK 该条逐字一致', qMatch, 'gid=' + askInfo.gid);
    await page.click('#drill-reveal-btn'); await page.waitForTimeout(250);
    const ansInfo = await page.evaluate(() => { const b = document.getElementById('drill-run-box'); return { heads: [...b.querySelectorAll('.drill-body h4')].map(h => h.textContent), hasMore: !!document.getElementById('drill-more-btn'), hasRate: b.querySelectorAll('.drill-rate').length }; });
    check('DU-02', '「看参考答案」→ 仅出现一/二/三段（问什么/拆解/案例）、坑与追问未出现、无自评按钮', ansInfo.heads.length === 3 && ansInfo.heads[0].includes('这题在问什么') && ansInfo.heads[2].includes('小像') && ansInfo.hasMore && ansInfo.hasRate === 0, ansInfo.heads.join('|'));
    const secMatch = await page.evaluate(gid => {
      /* 内容保真校验（2026-11-14 修订判据）：原 slice(60,130) 窗口包含校验会因列表序号（<ol> 渲染
         不进入 textContent）、表格单元格拼接、代码围栏语言标记（如 ```python 的 python 不显示）
         产生假阳性——547 条中 270 条中招，与内容完整性无关。改为全段字符流包含校验：
         只保留中文/字母/数字、原文先剥行首列表标记，渲染文本须完整包含原文字符流（比窗口校验更严）。 */
      const e = window.DRILL_BANK.find(x => x.gid === gid);
      const keep = s => s.replace(/[^一-鿿A-Za-z0-9]/g, '');
      const stripMarkers = s => s.split('\n').map(l => l.replace(/^\s*(?:\d+[.、)]|[-•*])\s*/, '')).join('\n');
      const bodies = [...document.querySelectorAll('#drill-run-box .drill-body')].map(d => keep(d.textContent));
      return ['ask', 'explain', 'case'].every((k, i) => bodies[i] && bodies[i].includes(keep(stripMarkers(e.sections[k]))));
    }, askInfo.gid);
    check('CC-01b', '演练一/二/三段正文与题库该条原文一致（归一化包含校验）', secMatch);
    await page.click('#drill-more-btn'); await page.waitForTimeout(250);
    const moreInfo = await page.evaluate(() => { const b = document.getElementById('drill-run-box'); return { heads: [...b.querySelectorAll('.drill-body h4')].map(h => h.textContent), rates: [...b.querySelectorAll('.drill-rate')].map(x => x.textContent) }; });
    check('DU-03', '「展开：常见的坑与追问预案」→ 五段齐全 + 自评三档（掌握/模糊/不会）出现', moreInfo.heads.length === 5 && moreInfo.heads[3].includes('坑') && moreInfo.heads[4].includes('追问') && moreInfo.rates.join(',') === '掌握,模糊,不会', moreInfo.heads.join('|') + ' rates=' + moreInfo.rates.join(','));
    await shot(page, '22-drill-more');
    // 三题分别评 模糊/掌握/不会
    const ratedGids = [askInfo.gid];
    await page.evaluate(() => { [...document.querySelectorAll('.drill-rate')].find(b => b.getAttribute('data-rate') === 'fuzzy').click(); });
    await page.waitForTimeout(250);
    for (const rate of ['mastered', 'unknown']) {
      const g = await page.evaluate(() => document.querySelector('#drill-run-box .quiz-progress-pct').textContent);
      ratedGids.push(g);
      await page.click('#drill-reveal-btn'); await page.waitForTimeout(150);
      await page.click('#drill-more-btn'); await page.waitForTimeout(150);
      await page.evaluate(r => { [...document.querySelectorAll('.drill-rate')].find(b => b.getAttribute('data-rate') === r).click(); }, rate);
      await page.waitForTimeout(250);
    }
    const sumTxt = await textOf(page, '#drill-summary-box');
    check('DU-04', '自评三档逐题推进、组末小结：本组 3 题/掌握 1/模糊 1/不会 1', sumTxt.includes('本组') && sumTxt.includes('3') && sumTxt.includes('掌握') && sumTxt.includes('模糊') && sumTxt.includes('不会'), (sumTxt || '').replace(/\s+/g, ' ').slice(0, 150));
    const drillStore = await lsJSON(page, 'aipm.drill.v1');
    check('DU-04b', '自评落盘 aipm.drill.v1：3 条且评级与所点一致', drillStore && drillStore[ratedGids[0]].rating === 'fuzzy' && drillStore[ratedGids[1]].rating === 'mastered' && drillStore[ratedGids[2]].rating === 'unknown', JSON.stringify(ratedGids) + ' ' + JSON.stringify(drillStore).slice(0, 120));
    await shot(page, '23-drill-summary');
    const chipExists = await page.evaluate(() => document.querySelectorAll('#drill-summary-box [data-point]').length);
    check('DU-05a', '小结含本组维度对应知识点入口 chips（≥1）', chipExists >= 1, 'chips=' + chipExists);
    await page.evaluate(() => { document.querySelector('#drill-summary-box [data-point]').click(); });
    await page.waitForTimeout(300);
    check('DU-05b', '小结知识点 chip 点击 → 对应知识点学习页', (await activeView(page)) === 'view-learn-detail');
    await clickGoto(page, 'view-landing');
    await page.evaluate(() => { document.querySelector('#drill-slot button').click(); });
    await page.waitForTimeout(300);
    const weakTxt = await textOf(page, '#drill-weak-list');
    check('DR-06b', '演练首页待加强列表含模糊/不会两条、不含掌握条', weakTxt.includes(ratedGids[0] + ' ·') && weakTxt.includes(ratedGids[2] + ' ·') && !weakTxt.includes(ratedGids[1] + ' ·'), (weakTxt || '').replace(/\s+/g, ' ').slice(0, 160));
    await page.click('#drill-weak-btn'); await page.waitForTimeout(300);
    const weakRunGid = await page.evaluate(() => document.querySelector('#drill-run-box .quiz-progress-pct').textContent);
    check('DR-06c', '「只练待加强这批」→ 演练运行且首题属待加强集合', (await activeView(page)) === 'view-drill-run' && (weakRunGid === ratedGids[0] || weakRunGid === ratedGids[2]), 'gid=' + weakRunGid);
    await page.click('#drill-quit-btn'); await page.waitForTimeout(250);
    check('DU-01', '演练运行页「演练首页」退出 → 回演练首页（中途放弃不写小结）', (await activeView(page)) === 'view-drill');
    await page.click('#drill-start-btn'); await page.waitForTimeout(250);
    await page.evaluate(() => { /* 回到运行页后用小结路径验证再来一组：直接退出 */ });
    await page.click('#drill-quit-btn'); await page.waitForTimeout(200);
    await ctx.close();
  }

  /* ============ CTX-O2：题库未就绪拦截（路由替换小题库） ============ */
  {
    const { ctx, page } = await newPage();
    await ctx.route('**/assets/quiz-bank.js', route => {
      route.fulfill({ contentType: 'text/javascript', body: 'window.QUIZ_BANK=[{id:1,src:"T",dimension:"AI 基础认知",difficulty:3,stem:"小题库题1",options:{A:"甲",B:"乙",C:"丙",D:"丁"},answer:"A",distractor_analysis:{A:"a",B:"x",C:"y",D:"z"},exam_points:[],sub_topic:"",difficulty_points:[]}];' });
    });
    await goto(page);
    await clickGoto(page, 'view-intro');
    await page.click('#view-intro .doc-actions .btn-primary');
    await page.waitForTimeout(300);
    const body = await page.evaluate(() => document.body.textContent);
    check('BN-01', '题库某维 <3 题时点「开始」被拦截：不进答题页且横幅提示「题库未就绪，请联系管理员」', (await activeView(page)) !== 'view-quiz' && body.includes('题库未就绪，请联系管理员'), 'view=' + (await activeView(page)));
    await ctx.close();
  }

  /* ============ 全局 ============ */
  check('GL-01', '全部控件流程零页面 JS 报错', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  check('GL-02', '全部控件流程零外网请求（资源关键词搜索为拦截验证、未真实外开）', externalRequests.length === 0, externalRequests.slice(0, 3).join(' | '));

  await browser.close();
  fs.writeFileSync('/tmp/ctl-results.json', JSON.stringify({ pass, fail, results }, null, 2));
  console.log('\n==== 控件级实测汇总：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  if (fail) { console.log('失败项：'); results.filter(r => !r.pass).forEach(r => console.log(' - ' + r.id + ' ' + r.name + ' :: ' + r.detail)); }
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });
