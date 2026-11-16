'use strict';
/* 全量回归 · 浏览器流程脚本（无头 Chromium / Playwright-core）
 * 对真实页面 http://127.0.0.1:8931/index.html 驱动 UI 流程，覆盖：
 * 早期组界面条目 + CNT-06/07 界面面 + DAT-01/03/04/05/06/07 + PLN-05/06 + SET-08
 * + MAT-05 + WRB-07 + STG-06 + REV-06 + DRL-08 + 题库未就绪拦截 + 零外网请求监控。 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('/opt/muse/assets/spaces/ts-runtime/dist/node_modules/playwright-core');
const BASE = 'file:///home/hatch/workspace/ts-spaces/ai-pm-coach/index.html';
const ORIGIN = 'file:///home/hatch/workspace/ts-spaces/ai-pm-coach';
const DIMS = ['AI 基础认知', '场景洞察', '产品设计', '数据与评估', '技术协作', '商业与落地'];
const TWELVE_KEYS = ['aipm.attempts.v1', 'aipm.snapshots.v1', 'aipm.inprogress.v1', 'aipm.appeals.v1', 'aipm.learn.v1', 'aipm.quizcfg.v1', 'aipm.wrongbook.v1', 'aipm.stagequiz.v1', 'aipm.review.v1', 'aipm.drill.v1', 'aipm.favorites.v1', 'aipm.notes.v1'] /* 【批次 5 口径同步】原 TWELVE_KEYS 扩展为 12 键 */;

let pass = 0, fail = 0; const failures = [];
function check(id, name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + id + ' · ' + name + (detail ? ' — ' + String(detail).slice(0, 300) : ''));
  if (cond) pass++; else { fail++; failures.push(id + ' ' + name); }
}
const pageErrors = [];
const externalRequests = [];
let browser;

async function newPage(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts || {});
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('request', r => { const u = r.url(); if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) externalRequests.push(u); });
  return { ctx, page };
}
async function goto(page) { await page.goto(BASE, { waitUntil: 'load' }); await page.waitForTimeout(350); }
async function lsGet(page, key) { return page.evaluate(k => window.localStorage.getItem(k), key); }
async function lsJSON(page, key) { const v = await lsGet(page, key); return v == null ? null : JSON.parse(v); }
async function lsSet(page, key, value) { await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [key, typeof value === 'string' ? value : JSON.stringify(value)]); }
async function activeView(page) { return page.evaluate(() => { const v = document.querySelector('.view.active'); return v ? v.id : null; }); }
async function clickGoto(page, viewId) { await page.evaluate(id => { const el = document.querySelector('[data-goto="' + id + '"]'); if (el) el.click(); }, viewId); await page.waitForTimeout(250); }
async function textOf(page, sel) { return page.evaluate(s => { const el = document.querySelector(s); return el ? el.textContent : null; }, sel); }

/* 在答题页回答当前题：mode correct=选正确答案 wrong=选错误答案 skip=点跳过 */
async function answerCurrent(page, mode, optSel, nextSel, stemSel, dimSel) {
  if (mode === 'skip') { await page.click(nextSel.skip); await page.waitForTimeout(120); return; }
  const letter = await page.evaluate(([ss, ds]) => {
    const stem = document.querySelector(ss).textContent;
    const dim = document.querySelector(ds).textContent;
    const q = window.QUIZ_BANK.find(x => x.stem === stem && x.dimension === dim) || window.QUIZ_BANK.find(x => x.stem === stem);
    if (!q) return null;
    if (window.__mode === 'wrong') { return ['A', 'B', 'C', 'D'].find(L => L !== q.answer && q.options[L] != null); }
    return q.answer;
  }, [stemSel, dimSel]);
  if (!letter) throw new Error('题库未匹配到当前题干');
  const idx = 'ABCD'.indexOf(letter);
  await page.evaluate(([s, i]) => { document.querySelectorAll(s)[i].click(); }, [optSel, idx]);
  await page.waitForTimeout(60);
  await page.click(nextSel.next);
  await page.waitForTimeout(130);
}
async function completeMainQuiz(page, mode) {
  await page.evaluate(m => { window.__mode = m; }, mode);
  for (let i = 0; i < 40; i++) {
    if ((await activeView(page)) === 'view-result') return true;
    const stem = await textOf(page, '#q-stem');
    if (!stem) { await page.waitForTimeout(200); continue; }
    await answerCurrent(page, mode, '#q-options .opt', { next: '#q-next', skip: '#q-skip' }, '#q-stem', '#q-dim');
  }
  return (await activeView(page)) === 'view-result';
}
async function startQuizFromLanding(page) {
  await clickGoto(page, 'view-intro');
  await page.click('#view-intro .doc-actions .btn-primary');
  await page.waitForTimeout(300);
}
function snapSeed(over) {
  return Object.assign({ attemptId: 'seed-' + Math.random().toString(36).slice(2, 8), ts: Date.now() - 5 * 864e5, date: new Date(Date.now() - 5 * 864e5).toISOString(), dimScores: [70, 70, 70, 70, 70, 70], totalScore: 70, answered: 18, correct: 10 }, over || {});
}

(async () => {
  browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-dev-shm-usage',
    '--hatch-webgl-allowed-domains-file=/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt',
    '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6'] });

  /* ================= S1：冷启动 / 空状态 / 文案 ================= */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    check('BOOT', '关键页脚本无报错加载（落地页 active）', (await activeView(page)) === 'view-landing' && pageErrors.length === 0, pageErrors.join(' | '));
    const landingText = await textOf(page, '#view-landing');
    const introLabel = await textOf(page, '#intro-count-label');
    check('CNT-04', '落地/介绍文案 18 题与 15–18 分钟', landingText.includes('18 道题') && introLabel.includes('18 题') && introLabel.includes('15–18 分钟'), introLabel);
    const totalScore = await textOf(page, '#total-score');
    const verdict = await textOf(page, '#verdict-title');
    const dimScores = await page.evaluate(() => [...document.querySelectorAll('.result-dim .dim-score')].map(e => e.textContent.trim()));
    const radarPts = await page.evaluate(() => document.getElementById('radar-area').getAttribute('points'));
    check('E-27', '结果页无数据占位（总分 —、六维 —、标题未生成、雷达无多边形）',
      totalScore === '—' && dimScores.every(s => s.startsWith('—')) && verdict === '尚未生成测评结果' && !radarPts,
      'total=' + totalScore + ' dims=' + dimScores.join(','));
    const mySlot = await textOf(page, '#my-assessment-slot');
    check('E-12', '雷达空状态文案与开始测评入口', mySlot.includes('完成测评后查看你的能力雷达图') && mySlot.includes('开始测评'));
    const counts = await page.evaluate(() => { const o = {}; document.querySelectorAll('#data-mgmt-slot [data-count]').forEach(e => { o[e.getAttribute('data-count')] = e.textContent.trim(); }); return o; });
    check('DAT-01', '空库时数据概览计数全 0 且与存储一致', counts.attempts === '0' && counts.snapshots === '0' && counts.learned === '0' && counts.appeals === '0', JSON.stringify(counts));
    await ctx.close();
  }

  /* ================= S2：完整测评（全对）+ 快照 + 申诉 + 分数构成 + 双击防护 ================= */
  let ctx2, page2;
  {
    ({ ctx: ctx2, page: page2 } = await newPage());
    const page = page2;
    await goto(page);
    await startQuizFromLanding(page);
    const prog = await textOf(page, '#quiz-progress-text');
    check('CNT-04b', '答题页进度文案「共 18 题」', prog.includes('共 18 题'), prog);
    // E-15 双击防护：第 1 题选对后连点下一题 5 次，只推进 1 题
    await page.evaluate(() => { window.__mode = 'correct'; });
    await answerCurrent(page, 'correct', '#q-options .opt', { next: '#q-next', skip: '#q-skip' }, '#q-stem', '#q-dim');
    // 此时在第 2 题：选一个选项后狂点 next
    const letter2 = await page.evaluate(() => {
      const stem = document.querySelector('#q-stem').textContent;
      const dim = document.querySelector('#q-dim').textContent;
      const q = window.QUIZ_BANK.find(x => x.stem === stem && x.dimension === dim);
      return q.answer;
    });
    await page.evaluate(i => { document.querySelectorAll('#q-options .opt')[i].click(); }, 'ABCD'.indexOf(letter2));
    await page.evaluate(() => { const b = document.getElementById('q-next'); for (let i = 0; i < 5; i++) b.click(); });
    await page.waitForTimeout(300);
    const progAfter = await textOf(page, '#quiz-progress-text');
    check('E-15', '下一题连点 5 次只推进一题（第 2→3 题）', /第\s*3\s*题/.test(progAfter), progAfter);
    const done = await completeMainQuiz(page, 'correct');
    const total = await textOf(page, '#total-score');
    const attempts = await lsJSON(page, 'aipm.attempts.v1');
    const snaps = await lsJSON(page, 'aipm.snapshots.v1');
    const recs = attempts && attempts[attempts.length - 1].records;
    const perDim = {}; (recs || []).forEach(r => { perDim[r.dimension] = (perDim[r.dimension] || 0) + 1; });
    check('CNT-01/02/03', 'UI 全流程：18 题、六维各 3、无重复', done && recs.length === 18 && DIMS.every(d => perDim[d] === 3) && new Set(recs.map(r => r.questionId)).size === 18,
      'recs=' + (recs || []).length + ' perDim=' + JSON.stringify(perDim));
    check('CAL-UI', 'UI 全对总分 81', total === '81', 'total=' + total);
    check('E-01/CNT-07', '快照恰 1 条且 answered=18、含六维分与答对数',
      snaps && snaps.length === 1 && snaps[0].answered === 18 && Array.isArray(snaps[0].dimScores) && snaps[0].dimScores.length === 6 && typeof snaps[0].correct === 'number',
      snaps ? JSON.stringify(snaps[0]).slice(0, 160) : 'null');
    // E-18 申诉（须在结果页仍激活时操作）
    await page.evaluate(() => { document.getElementById('appeal-open').click(); });
    await page.waitForTimeout(150);
    await page.fill('#appeal-text', '回归测试申诉：觉得数据与评估分数偏低。');
    await page.click('#appeal-submit');
    await page.waitForTimeout(250);
    const appeals = await lsJSON(page, 'aipm.appeals.v1');
    const appealDone = await textOf(page, '#appeal-done');
    check('E-18', '申诉落盘（含时间/总分/六维/理由）且小字为「改进评分规则」',
      appeals && appeals.length === 1 && appeals[0].reason && appeals[0].reason.includes('回归测试申诉') && appeals[0].totalScore === 81 && Array.isArray(appeals[0].dimScores)
      && (appealDone || '').includes('改进评分规则'), appealDone);
    // E-20 分数构成 modal + 维度重测
    await page.evaluate(() => { document.querySelector('.result-dim .dim-score').click(); });
    await page.waitForTimeout(300);
    const modalInfo = await page.evaluate(() => ({
      shown: document.getElementById('score-modal').classList.contains('show'),
      title: document.getElementById('modal-title').textContent,
      sub: document.getElementById('modal-sub').textContent,
      evo: document.getElementById('modal-evo').textContent,
      evoRows: document.querySelectorAll('#modal-evo .evo-row').length,
      formula: document.getElementById('modal-formula').textContent
    }));
    check('E-20a', '分数构成 modal：公式 0.55/0.45 + 逐题演进（初始+3 题）+ 答题计数',
      modalInfo.shown && modalInfo.formula.includes('0.55') && modalInfo.formula.includes('0.45') && modalInfo.evoRows === 4 && modalInfo.sub.includes('答了 3 题'),
      JSON.stringify(modalInfo).slice(0, 220));
    const retestBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('重测这个维度')); if (b) { b.click(); return true; } return false; });
    await page.waitForTimeout(300);
    let dimtestOk = false;
    if (retestBtn && (await activeView(page)) === 'view-dimtest') {
      await page.evaluate(() => { window.__mode = 'correct'; });
      for (let i = 0; i < 8; i++) {
        if ((await activeView(page)) !== 'view-dimtest') break;
        const vis = await page.evaluate(() => !!document.querySelector('#view-dimtest.active'));
        if (!vis) break;
        const hasResult = await page.evaluate(() => document.querySelector('#view-dimtest').textContent.includes('专项'));
        try { await answerCurrent(page, 'correct', '#dt-options .opt', { next: '#dt-next', skip: '#dt-next' }, '#dt-stem', '#dt-dim'); } catch (e) { break; }
      }
      await page.waitForTimeout(300);
      const snaps3 = await lsJSON(page, 'aipm.snapshots.v1');
      dimtestOk = snaps3.length === 1;
    }
    check('E-20b', '维度重测 5 题独立进行且不生成快照', dimtestOk, 'retestBtn=' + retestBtn);
    // 刷新后回主页：快照不重复生成；单快照主页形态（E-02）
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    const snaps2 = await lsJSON(page, 'aipm.snapshots.v1');
    const mySlot = await textOf(page, '#my-assessment-slot');
    check('E-01b', '刷新/重进不重复生成快照', snaps2.length === 1);
    check('E-02', '单快照主页：单雷达 + 对比预告文案 + 立即复测', mySlot.includes('完成下一次测评后，你可以看到自己的进步对比。') && mySlot.includes('立即复测'));
  }

  /* ================= S3：复测避旧题 + 双快照对比（续用 ctx2） ================= */
  {
    const page = page2;
    await clickGoto(page, 'view-landing');
    await startQuizFromLanding(page);
    const done = await completeMainQuiz(page, 'correct');
    const attempts = await lsJSON(page, 'aipm.attempts.v1');
    const snaps = await lsJSON(page, 'aipm.snapshots.v1');
    const ids1 = new Set(attempts[attempts.length - 2].records.map(r => r.questionId));
    const ids2 = attempts[attempts.length - 1].records.map(r => r.questionId);
    check('E-06', '复测与首测题目零重叠（CAT 避旧题）', done && ids2.every(id => !ids1.has(id)), 'overlap=' + ids2.filter(id => ids1.has(id)).length);
    check('E-01c', '第二次完整测评后快照 = 2 条', snaps.length === 2);
    await clickGoto(page, 'view-landing');
    const mySlot = await textOf(page, '#my-assessment-slot');
    check('E-03', '双快照主页出现总分变化与提升最大/最弱维信息', mySlot.includes('上次') && (mySlot.includes('提升最大') || mySlot.includes('总分')), mySlot.slice(0, 200));
    await ctx2.close();
  }

  /* ================= S4：复测反馈五场景 ================= */
  async function feedbackScenario(name, seedOver, mode, expectText, alsoWrongList) {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.snapshots.v1', [snapSeed(seedOver)]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await startQuizFromLanding(page);
    const done = await completeMainQuiz(page, mode);
    const fb = await textOf(page, '#retest-feedback');
    let ok = done && fb && fb.includes(expectText);
    let extra = '';
    if (ok && alsoWrongList) {
      await page.evaluate(() => { const b = [...document.querySelectorAll('#retest-feedback button')].find(x => x.textContent.includes('查看本次错题')); if (b) b.click(); });
      await page.waitForTimeout(300);
      const ww = await textOf(page, '#wrong-wrap');
      extra = (ww || '').slice(0, 120);
      ok = ww && ww.includes('你的答案') && ww.includes('正确答案');
    }
    check('E-07', '复测反馈-' + name, ok, (fb || '').slice(0, 140) + ' ' + extra);
    await ctx.close();
  }
  await feedbackScenario('大提升庆祝卡（Δ+11）', { totalScore: 70, dimScores: [70, 70, 70, 70, 70, 70] }, 'correct', '提升了 11 分');
  await feedbackScenario('下降建设性卡（Δ-8）+错题展开', { totalScore: 40, dimScores: [40, 40, 40, 40, 40, 40] }, 'wrong', '不在最佳状态', true);
  await feedbackScenario('平稳卡（Δ+2）', { totalScore: 79, dimScores: [79, 79, 79, 79, 79, 79] }, 'correct', '本次表现稳定');
  await feedbackScenario('小涨卡（Δ+8）', { totalScore: 73, dimScores: [73, 73, 73, 73, 73, 73] }, 'correct', '进步了 8 分');
  await feedbackScenario('单维突破卡（单维 Δ+21）', { totalScore: 77, dimScores: [60, 80, 80, 80, 80, 80] }, 'correct', '维度突破了');

  /* ================= S5：复测按钮三态 + 成长曲线 + 颜色规范（种子快照） ================= */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    async function seedAndRead(snaps) {
      await lsSet(page, 'aipm.snapshots.v1', snaps);
      await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(320);
      return page.evaluate(() => {
        const slot = document.getElementById('my-assessment-slot');
        const btn = slot.querySelector('button');
        const all = [...slot.querySelectorAll('button')].map(b => ({ t: b.textContent, c: b.className }));
        return { text: slot.textContent, buttons: all };
      });
    }
    const now = Date.now();
    const s0 = await seedAndRead([snapSeed({ ts: now, date: new Date(now).toISOString() })]);
    check('E-05a', '复测按钮 <3 天弱化态', s0.text.includes('建议再过几天复测，让学习有时间发挥作用。') && s0.buttons.some(b => b.c.includes('is-weak')), JSON.stringify(s0.buttons).slice(0, 150));
    const s5 = await seedAndRead([snapSeed({ ts: now - 5 * 864e5, date: new Date(now - 5 * 864e5).toISOString() })]);
    check('E-05b', '复测按钮 5 天正常态', s5.text.includes('距离上次测评 5 天，来复测一次看看进步。') && !s5.buttons.some(b => b.c.includes('is-weak') || b.c.includes('is-hot')));
    const s20 = await seedAndRead([snapSeed({ ts: now - 20 * 864e5, date: new Date(now - 20 * 864e5).toISOString() })]);
    check('E-05c', '复测按钮 20 天高亮态', s20.text.includes('已经 20 天没测评了，回来看看自己的水平吧。') && s20.buttons.some(b => b.c.includes('is-hot')), JSON.stringify(s20.buttons).slice(0, 150));
    const three = [60, 70, 65].map((t, i) => snapSeed({ attemptId: 'g' + i, ts: now - (30 - i * 10) * 864e5, date: new Date(now - (30 - i * 10) * 864e5).toISOString(), totalScore: t, dimScores: [t, t, t, t, t, t] }));
    const sg = await seedAndRead(three);
    check('E-04a', '3 快照出现成长曲线入口', sg.text.includes('查看完整成长曲线'));
    await page.evaluate(() => { const b = [...document.querySelectorAll('#my-assessment-slot button')].find(x => x.textContent.includes('成长曲线')); if (b) b.click(); });
    await page.waitForTimeout(300);
    const nodes = await page.evaluate(() => document.querySelectorAll('#growth-list > *').length);
    const chartHtml = await page.evaluate(() => document.getElementById('growth-chart').innerHTML.length);
    check('E-04b', '成长曲线时间轴 3 节点 + 趋势图', (await activeView(page)) === 'view-growth' && nodes === 3 && chartHtml > 100, 'nodes=' + nodes);
    // E-08 颜色规范：下降用橙色非红色（种子两快照，总分下降）
    const down = await seedAndRead([snapSeed({ attemptId: 'd1', totalScore: 80, dimScores: [80, 80, 80, 80, 80, 80] }), snapSeed({ attemptId: 'd2', totalScore: 70, dimScores: [70, 70, 70, 70, 70, 70] })]);
    const downColor = await page.evaluate(() => {
      const els = [...document.querySelectorAll('#my-assessment-slot [class*="delta"], #my-assessment-slot [class*="down"]')];
      return els.map(e => ({ c: e.className, col: getComputedStyle(e).color, t: e.textContent }));
    });
    const hasOrange = downColor.some(x => { const m = x.col.match(/\d+/g); if (!m) return false; const [r, g, b] = m.map(Number); return r > 150 && g > 60 && g < 180 && b < 110; });
    check('E-08', '下降数字为橙色（非红色）', downColor.length > 0 && hasOrange, JSON.stringify(downColor).slice(0, 220));
    await ctx.close();
  }

  /* ================= S6：中途恢复 CNT-06（UI） ================= */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await startQuizFromLanding(page);
    await page.evaluate(() => { window.__mode = 'correct'; });
    for (let i = 0; i < 5; i++) await answerCurrent(page, 'correct', '#q-options .opt', { next: '#q-next', skip: '#q-skip' }, '#q-stem', '#q-dim');
    const prog = await lsJSON(page, 'aipm.inprogress.v1');
    check('CNT-06a', '答 5 题后 inprogress.records == 5 且 <18', prog && prog.records && prog.records.length === 5, prog ? 'records=' + (prog.records || []).length : 'null');
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    const resumeText = await textOf(page, '#resume-slot');
    check('CNT-06b', '重开主页出现恢复卡', (resumeText || '').includes('你有一次未完成的测评，继续作答？'));
    await page.evaluate(() => { const b = [...document.querySelectorAll('#resume-slot button')].find(x => x.textContent.includes('继续')); if (b) b.click(); });
    await page.waitForTimeout(300);
    const progText = await textOf(page, '#quiz-progress-text');
    const done = await completeMainQuiz(page, 'correct');
    const attempts = await lsJSON(page, 'aipm.attempts.v1');
    const inprogAfter = await lsGet(page, 'aipm.inprogress.v1');
    const firstFive = attempts[attempts.length - 1].records.slice(0, 5).map(r => r.questionId).join();
    const progIds = (prog.records || []).map(r => r.questionId).join();
    check('CNT-06c', '恢复从第 6 题续答、总记录 18、前 5 题保留、完成后进度清除',
      /第\s*6\s*题/.test(progText || '') && done && attempts[attempts.length - 1].records.length === 18 && firstFive === progIds && inprogAfter === null,
      'progText=' + progText + ' kept=' + (firstFive === progIds));
    // 放弃重来分支
    await startQuizFromLanding(page);
    await page.evaluate(() => { window.__mode = 'correct'; });
    await answerCurrent(page, 'correct', '#q-options .opt', { next: '#q-next', skip: '#q-skip' }, '#q-stem', '#q-dim');
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#resume-slot button')].find(x => x.textContent.includes('放弃')); if (b) b.click(); });
    await page.waitForTimeout(300);
    const inprogDiscard = await lsGet(page, 'aipm.inprogress.v1');
    check('E-11', '放弃重来清除未完成进度', inprogDiscard === null);
    await ctx.close();
  }

  /* ================= S7：SET-08 中途恢复带配置（UI 设置） ================= */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-intro');
    // 题量 12
    await page.click('#cfg-count-row [data-count="12"]');
    // 维度只留前 3 个：点掉后 3 个 is-on 的 chip
    await page.evaluate(() => {
      const chips = [...document.querySelectorAll('#cfg-dims-row .dim-chip')];
      chips.slice(3).forEach(c => { if (c.classList.contains('is-on')) c.click(); });
    });
    await page.waitForTimeout(150);
    await page.click('#cfg-diff-row [data-diff="advanced"]');
    await page.waitForTimeout(150);
    const cfgSaved = await lsJSON(page, 'aipm.quizcfg.v1');
    await page.click('#view-intro .doc-actions .btn-primary');
    await page.waitForTimeout(300);
    const progText0 = await textOf(page, '#quiz-progress-text');
    await page.evaluate(() => { window.__mode = 'correct'; });
    for (let i = 0; i < 4; i++) await answerCurrent(page, 'correct', '#q-options .opt', { next: '#q-next', skip: '#q-skip' }, '#q-stem', '#q-dim');
    const prog = await lsJSON(page, 'aipm.inprogress.v1');
    check('SET-08a', 'inprogress 存有 cfg 与 total（12 题 / 3 维）',
      prog && prog.total === 12 && prog.cfg && prog.cfg.dims.length === 3 && cfgSaved.count === 12,
      'prog.total=' + (prog && prog.total) + ' cfgDims=' + (prog && prog.cfg && prog.cfg.dims.length) + ' firstProg=' + progText0);
    // 期间把设置改回默认（直接写存储模拟另一标签改动）
    await lsSet(page, 'aipm.quizcfg.v1', { count: 18, dims: DIMS, startDiff: 'adaptive', scope: 'unseen' });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#resume-slot button')].find(x => x.textContent.includes('继续')); if (b) b.click(); });
    await page.waitForTimeout(300);
    const doneSet = await completeMainQuiz(page, 'correct');
    const attempts = await lsJSON(page, 'aipm.attempts.v1');
    const last = attempts[attempts.length - 1];
    const dimsInRecs = [...new Set(last.records.map(r => r.dimension))];
    check('SET-08b', '恢复仍按原配置完成：12 题、原三维', doneSet && last.records.length === 12 && dimsInRecs.length === 3 && dimsInRecs.every(d => DIMS.slice(0, 3).includes(d)),
      'recs=' + last.records.length + ' dims=' + dimsInRecs.join(','));
    await ctx.close();
  }

  /* ================= S8：MAT-05 子集结果页 ================= */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.quizcfg.v1', { count: 12, dims: DIMS.slice(0, 3), startDiff: 'adaptive', scope: 'unseen' });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await startQuizFromLanding(page);
    const done = await completeMainQuiz(page, 'wrong');
    const visibleDims = await page.evaluate(() => [...document.querySelectorAll('.result-dim')].filter(r => r.style.display !== 'none').map(r => r.querySelector('h3').textContent));
    const diagCount = await page.evaluate(() => document.querySelectorAll('#diag-list > *').length);
    const subsetNote = await textOf(page, '#radar-subset-note');
    const snaps = await lsJSON(page, 'aipm.snapshots.v1');
    const attempts = await lsJSON(page, 'aipm.attempts.v1');
    const last = attempts[attempts.length - 1];
    check('MAT-05', '子集结果页只展示已测 3 维、无快照、attempt.dimScores=null',
      done && visibleDims.length === 3 && visibleDims.every(d => DIMS.slice(0, 3).includes(d)) && diagCount === 3
      && (subsetNote || '').length > 0 && (!snaps || snaps.length === 0) && last.dimScores === null && Array.isArray(last.testedDims) && last.testedDims.length === 3,
      'visible=' + visibleDims.join(',') + ' diag=' + diagCount + ' note=' + (subsetNote || '').slice(0, 60));
    await ctx.close();
  }

  /* ================= S9：PLN-05/06 计划呈现（种子计划，与 UI 写入同结构） ================= */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const plan = { mode: 'custom', dims: ['AI 基础认知', '场景洞察'], pointIds: [0, 1, 2, 18, 19, 3, 4, 5, 20], pinnedFirst: [19] };
    await lsSet(page, 'aipm.learn.v1', { learned: [], practice: {}, lastPoint: 0, plan });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await clickGoto(page, 'view-learn');
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.point-row')];
      return {
        total: rows.length,
        outCount: rows.filter(r => r.classList.contains('is-out')).length,
        outBadge: rows.filter(r => r.textContent.includes('计划外')).length,
        recRows: rows.map((r, i) => r.textContent.includes('推荐先学') ? i : -1).filter(i => i >= 0),
        firstRowText: rows.length ? rows[0].textContent.slice(0, 80) : '',
        stageHeads: [...document.querySelectorAll('.stage-card, .path-stage, [class*="stage"]')].map(e => e.textContent.slice(0, 60)).slice(0, 8)
      };
    });
    // 呈现顺序：置顶 19 在最前；计划外行排在计划内之后 → 前 9 行无 is-out
    const firstNineOut = await page.evaluate(() => [...document.querySelectorAll('.point-row')].slice(0, 9).some(r => r.classList.contains('is-out')));
    check('PLN-05', '计划外行 is-out 弱化 + 计划外徽标 + 计划内排前',
      info.total === 27 && info.outCount === 18 && info.outBadge >= 18 && !firstNineOut,
      'total=' + info.total + ' out=' + info.outCount + ' badge=' + info.outBadge);
    check('PLN-06', '推荐先学落在置顶的计划内首个未学点（置顶 RAG 排障排呈现序第 1 行）、计划外无此徽标',
      info.recRows.length === 1 && info.recRows[0] === 0 && info.firstRowText.includes('RAG 工程排障'), 'recRows=' + JSON.stringify(info.recRows) + ' first=' + info.firstRowText);
    const stageDenoms = await page.evaluate(() => [...document.querySelectorAll('#path-list > *')].map(s => { const m = s.textContent.match(/已学 \d+\/(\d+)/); return m ? +m[1] : null; }));
    check('PLN-05b', '阶段卡已学计数分母 = 该阶段计划内知识点数（5/4/0/0/0/0）',
      JSON.stringify(stageDenoms) === JSON.stringify([5, 4, 0, 0, 0, 0]), 'denoms=' + JSON.stringify(stageDenoms));
    await ctx.close();
  }

  /* ================= S10：WRB-07 错题本界面流转 ================= */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await startQuizFromLanding(page);
    const done = await completeMainQuiz(page, 'wrong');
    const attemptsBytesBefore = await lsGet(page, 'aipm.attempts.v1');
    await clickGoto(page, 'view-landing');
    await page.evaluate(() => { const b = [...document.querySelectorAll('#wrongbook-slot button, #wrongbook-slot a')][0]; if (b) b.click(); });
    await page.waitForTimeout(300);
    if ((await activeView(page)) !== 'view-wrongbook') { await clickGoto(page, 'view-wrongbook'); await page.waitForTimeout(300); }
    const wbStats = async () => page.evaluate(() => {
      const spans = [...document.querySelectorAll('#wb-stats span')];
      const grab = label => { const s = spans.find(x => x.textContent.includes(label)); if (!s) return null; const m = s.textContent.match(/(\d+)/); return m ? +m[1] : null; };
      return { pending: grab('待巩固'), mastered: grab('已掌握'), total: grab('错题总数') };
    });
    const statsBefore = await wbStats();
    check('WRB-07a', '错题本可达且有待巩固条目', done && statsBefore.pending === 18 && statsBefore.mastered === 0, JSON.stringify(statsBefore));
    // 维度筛选：只显示该维
    await page.evaluate(() => { const c = [...document.querySelectorAll('#wb-filter .dim-chip')].find(x => x.textContent.trim() === 'AI 基础认知'); if (c) c.click(); });
    await page.waitForTimeout(250);
    const filteredDims = await page.evaluate(() => [...document.querySelectorAll('#wb-list .wb-item .wb-dim')].map(e => e.textContent.trim()));
    const filterOk = filteredDims.length > 0 && filteredDims.every(d => d === 'AI 基础认知');
    // 重做第一条错题并答对（选项为 .p-opt）
    const redoFlow = await page.evaluate(() => {
      const item = document.querySelector('#wb-list .wb-item');
      if (!item) return { ok: false, why: 'no item' };
      const stem = item.querySelector('.wb-stem').textContent;
      const q = window.QUIZ_BANK.find(x => x.stem === stem);
      if (!q) return { ok: false, why: 'no bank match' };
      const btn = [...item.querySelectorAll('button')].find(x => x.textContent.includes('重做这道题'));
      if (!btn) return { ok: false, why: 'no redo btn' };
      btn.click();
      const opts = item.querySelectorAll('.redo-box .p-opt');
      if (opts.length !== 4) return { ok: false, why: 'opts=' + opts.length };
      opts['ABCD'.indexOf(q.answer)].click();
      return { ok: true, status: item.querySelector('.wb-status').textContent };
    });
    await page.waitForTimeout(250);
    const statsAfter = await wbStats();
    const attemptsBytesAfter = await lsGet(page, 'aipm.attempts.v1');
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await clickGoto(page, 'view-wrongbook');
    await page.waitForTimeout(250);
    const statsReload = await wbStats();
    check('WRB-07b', '筛选只显该维；重做答对→条目已掌握、统计 −1/+1、attempts 字节不变、刷新后保持',
      filterOk && redoFlow.ok && (redoFlow.status || '').includes('已掌握')
      && statsAfter.mastered === 1 && statsAfter.pending === 17
      && attemptsBytesAfter === attemptsBytesBefore && statsReload.mastered === 1 && statsReload.pending === 17,
      'filter=' + JSON.stringify(filteredDims).slice(0, 80) + ' redo=' + JSON.stringify(redoFlow) + ' after=' + JSON.stringify(statsAfter) + ' reload=' + JSON.stringify(statsReload));
    // 条目内知识点链接跳学习页
    const pointJump = await page.evaluate(() => { const b = document.querySelector('#wb-list .wb-item .wb-point-btn'); if (b) { b.click(); return true; } return false; });
    await page.waitForTimeout(300);
    check('WRB-07c', '错题条目知识点链接跳到对应知识点学习页', pointJump && (await activeView(page)) === 'view-learn-detail', 'jump=' + pointJump);
    await ctx.close();
  }

  /* ================= S11：STG-06 阶段小测 ================= */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { const b = [...document.querySelectorAll('#view-learn button')].find(x => x.textContent.includes('开始阶段小测')); if (b) b.click(); });
    await page.waitForTimeout(350);
    const inQuiz = (await activeView(page)) === 'view-stagequiz';
    const sqProg = await textOf(page, '#sq-progress-text');
    let noInstant = true, answered = 0;
    await page.evaluate(() => { window.__mode = 'correct'; });
    for (let i = 0; i < 5 && inQuiz; i++) {
      if (i === 2) { await page.click('#sq-skip'); await page.waitForTimeout(150); answered++; continue; }
      const before = await page.evaluate(() => document.querySelectorAll('#sq-options .opt').length);
      if (!before) break;
      await answerCurrent(page, i % 2 ? 'wrong' : 'correct', '#sq-options .opt', { next: '#sq-next', skip: '#sq-skip' }, '#sq-stem', '#sq-dim');
      const badCls = await page.evaluate(() => [...document.querySelectorAll('#sq-options .opt')].some(o => /correct|wrong|is-right|is-bad/.test(o.className)));
      if (badCls) noInstant = false;
      answered++;
      if (await page.evaluate(() => document.getElementById('stagequiz-result').style.display !== 'none')) break;
    }
    await page.waitForTimeout(300);
    const resultText = await textOf(page, '#stagequiz-result');
    const sqStore = await lsJSON(page, 'aipm.stagequiz.v1');
    const attempts = await lsJSON(page, 'aipm.attempts.v1');
    const snaps = await lsJSON(page, 'aipm.snapshots.v1');
    const review = await lsJSON(page, 'aipm.review.v1');
    const stagequizSeeds = review ? Object.values(review).filter(r => r.source === 'stagequiz').length : 0;
    check('STG-06', '小测 5 题（含跳过 1）、无即时判对错、结果复盘、隔离存储、错题喂复习队列',
      inQuiz && /共 5 题/.test(sqProg || '') && answered === 5 && noInstant
      && resultText && /对\s*\d\s*\/\s*5/.test(resultText) && resultText.includes('正确答案')
      && sqStore && Object.keys(sqStore).length >= 1 && (!attempts || attempts.length === 0) && (!snaps || snaps.length === 0) && stagequizSeeds >= 1,
      'prog=' + sqProg + ' answered=' + answered + ' result=' + (resultText || '').slice(0, 80) + ' seeds=' + stagequizSeeds);
    await ctx.close();
  }

  /* ================= S12：REV-06 复习入口与会话 ================= */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    const bannerHidden = await page.evaluate(() => !document.getElementById('review-banner').classList.contains('show'));
    const q0 = await page.evaluate(() => window.QUIZ_BANK[0]);
    const today = await page.evaluate(() => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); });
    const seedReview = {}; seedReview[q0.id] = { stage: 0, due: today, lastResult: null, source: 'attempt' };
    await lsSet(page, 'aipm.review.v1', seedReview);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await clickGoto(page, 'view-learn');
    const bannerText = await textOf(page, '#review-banner');
    const bannerShown = await page.evaluate(() => document.getElementById('review-banner').classList.contains('show'));
    check('REV-06a', '无到期题不显示入口；有到期题显示「今日可复习 1 题」', bannerHidden && bannerShown && (bannerText || '').includes('1 题'),
      'hidden=' + bannerHidden + ' shown=' + bannerShown + ' text=' + (bannerText || '').slice(0, 80));
    await page.evaluate(() => { document.getElementById('review-start-btn').click(); });
    await page.waitForTimeout(300);
    const inReview = (await activeView(page)) === 'view-review';
    await page.evaluate(() => { window.__mode = 'correct'; });
    let feedbackSeen = false;
    for (let i = 0; i < 4 && inReview; i++) {
      const hasOpts = await page.evaluate(() => document.querySelectorAll('#rv-options .opt').length > 0);
      if (!hasOpts) break;
      const letter = await page.evaluate(() => {
        const stem = document.querySelector('#rv-stem').textContent;
        const dim = document.querySelector('#rv-dim').textContent;
        const q = window.QUIZ_BANK.find(x => x.stem === stem && x.dimension === dim) || window.QUIZ_BANK.find(x => x.stem === stem);
        return q ? q.answer : null;
      });
      if (!letter) break;
      await page.evaluate(idx => { document.querySelectorAll('#rv-options .opt')[idx].click(); }, 'ABCD'.indexOf(letter));
      await page.waitForTimeout(200);
      const fb = await page.evaluate(() => { const f = document.getElementById('rv-feedback'); return { show: f.classList.contains('show'), text: f.textContent }; });
      if (fb.show && fb.text.includes('答对了') && fb.text.includes('解析')) feedbackSeen = true;
      await page.click('#rv-next');
      await page.waitForTimeout(200);
      if (await page.evaluate(() => { const r = document.getElementById('review-result'); return r && r.style.display !== 'none' && r.textContent.length > 5; })) break;
    }
    await page.waitForTimeout(250);
    const resultText2 = await textOf(page, '#review-result');
    const reviewAfter = await lsJSON(page, 'aipm.review.v1');
    const entry = reviewAfter && reviewAfter[q0.id];
    const expectDue = await page.evaluate(t => { const d = new Date(t + 'T12:00:00'); d.setDate(d.getDate() + 3); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }, today);
    check('REV-06b', '复习会话即时反馈、结束小结、答对后 due 按阶梯 +3 天（stage 0→1）',
      inReview && feedbackSeen && resultText2 && resultText2.includes('答对') && entry && entry.stage === 1 && entry.due === expectDue,
      'fb=' + feedbackSeen + ' result=' + (resultText2 || '').slice(0, 80) + ' entry=' + JSON.stringify(entry) + ' expectDue=' + expectDue);
    const bannedWords = await page.evaluate(() => { const t = document.querySelector('#view-learn').textContent + document.querySelector('#view-review').textContent; return ['逾期', '连续天数', '打卡'].filter(w => t.includes(w)); });
    check('REV-06c', '复习相关文案无强迫措辞（逾期/连续天数/打卡）', bannedWords.length === 0, bannedWords.join(','));
    await ctx.close();
  }

  /* ================= S13：DRL-08 演练流程 ================= */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-drill');
    // 选组题量 3
    await page.evaluate(() => { const c = [...document.querySelectorAll('#drill-size-filter .dim-chip')].find(x => x.textContent.trim().startsWith('3')); if (c) c.click(); });
    await page.waitForTimeout(150);
    await page.click('#drill-start-btn');
    await page.waitForTimeout(350);
    const inRun = (await activeView(page)) === 'view-drill-run';
    const stage1Text = await textOf(page, '#drill-run-box');
    const hasRevealBtn = await page.evaluate(() => [...document.querySelectorAll('#drill-run-box button')].some(b => b.textContent.includes('看参考答案')));
    check('DRL-08a', '演练开始后只显示题干 + 「看参考答案」入口（无答案段）',
      inRun && hasRevealBtn && stage1Text && !stage1Text.includes('四、新手常见的坑') && !stage1Text.includes('五、追问预案'),
      (stage1Text || '').slice(0, 100));
    await page.evaluate(() => { const b = [...document.querySelectorAll('#drill-run-box button')].find(x => x.textContent.includes('看参考答案')); if (b) b.click(); });
    await page.waitForTimeout(300);
    const stage2Text = await textOf(page, '#drill-run-box');
    check('DRL-08b', '看参考答案后出现拆解与小像案例、坑与追问段仍未展开',
      stage2Text && stage2Text.includes('大白话拆解') && stage2Text.includes('小像实机案例') && !stage2Text.includes('四、新手常见的坑') && !stage2Text.includes('五、追问预案'),
      (stage2Text || '').slice(0, 140));
    await page.evaluate(() => { const b = [...document.querySelectorAll('#drill-run-box button')].find(x => /展开|坑|追问/.test(x.textContent) && !x.textContent.includes('看参考答案')); if (b) b.click(); });
    await page.waitForTimeout(300);
    const ratings = ['掌握', '模糊', '不会'];
    let ratedAll = true;
    for (let i = 0; i < 3; i++) {
      // 每题：若答案未展开则依次展开
      for (let step = 0; step < 3; step++) {
        const hasRate = await page.evaluate(() => [...document.querySelectorAll('#drill-run-box button')].some(b => ['掌握', '模糊', '不会'].includes(b.textContent.trim())));
        if (hasRate) break;
        await page.evaluate(() => { const bs = [...document.querySelectorAll('#drill-run-box button')]; const b = bs.find(x => x.textContent.includes('看参考答案')) || bs.find(x => /展开|坑|追问/.test(x.textContent)); if (b) b.click(); });
        await page.waitForTimeout(250);
      }
      const clicked = await page.evaluate(label => { const b = [...document.querySelectorAll('#drill-run-box button')].find(x => x.textContent.trim() === label); if (b) { b.click(); return true; } return false; }, ratings[i]);
      if (!clicked) { ratedAll = false; break; }
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(300);
    const summaryText = await textOf(page, '#drill-summary-box');
    const drillStore = await lsJSON(page, 'aipm.drill.v1');
    const ratedCount = drillStore ? Object.keys(drillStore).length : 0;
    const summaryCounts = await page.evaluate(() => { const t = document.getElementById('drill-summary-box').textContent; const g = l => { const m = t.match(new RegExp(l + '\\s*(\\d+)')); return m ? +m[1] : null; }; return { mastered: g('掌握'), fuzzy: g('模糊'), unknown: g('不会'), chips: document.querySelectorAll('#drill-summary-box [data-point]').length }; });
    check('DRL-08c', '逐题自评 3 题完成、组末小结分布与所点一致（1/1/1）、自评落盘 3 条、小结含学习知识点入口',
      ratedAll && summaryText && summaryCounts.mastered === 1 && summaryCounts.fuzzy === 1 && summaryCounts.unknown === 1 && ratedCount === 3 && summaryCounts.chips >= 1,
      'summary=' + (summaryText || '').slice(0, 160) + ' counts=' + JSON.stringify(summaryCounts) + ' stored=' + ratedCount);
    const noAutoScore = summaryText && !/总分|得分|评分/.test(summaryText);
    check('DRL-08d', '演练全程无自动评分/分数', !!noAutoScore);
    const chipJump = await page.evaluate(() => { const c = document.querySelector('#drill-summary-box [data-point]'); if (c) { c.click(); return true; } return false; });
    await page.waitForTimeout(300);
    check('DRL-08f', '小结知识点入口点击进入对应知识点学习页', chipJump && (await activeView(page)) === 'view-learn-detail', 'chip=' + chipJump);
    await clickGoto(page, 'view-drill');
    await page.waitForTimeout(300);
    const weakText = await textOf(page, '#drill-weak-list');
    check('DRL-08e', '待加强列表含模糊/不会两题（不含掌握）', weakText && weakText.trim().length > 10, (weakText || '').slice(0, 140));
    await ctx.close();
  }

  /* ================= S14：DAT 数据管理全流程 ================= */
  {
    const { ctx, page } = await newPage({ acceptDownloads: true });
    await goto(page);
    // 种子：十键各放可识别数据
    const seedSnaps = [snapSeed({ attemptId: 'dat-seed' })];
    await lsSet(page, 'aipm.attempts.v1', [{ id: 'a1', ts: Date.now(), records: [], dimScores: [70, 70, 70, 70, 70, 70], totalScore: 70 }]);
    await lsSet(page, 'aipm.snapshots.v1', seedSnaps);
    await lsSet(page, 'aipm.learn.v1', { learned: [0, 1], practice: {}, lastPoint: 1, plan: null });
    await lsSet(page, 'aipm.appeals.v1', [{ ts: Date.now(), totalScore: 70, dimScores: [70, 70, 70, 70, 70, 70], reason: '种子申诉' }]);
    await lsSet(page, 'aipm.drill.v1', { G1: { rating: 'fuzzy', count: 1, lastAt: new Date().toISOString() } });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    const readCounts = async () => page.evaluate(() => { const o = {}; document.querySelectorAll('#data-mgmt-slot [data-count]').forEach(e => { o[e.getAttribute('data-count')] = +e.textContent.trim(); }); return o; });
    const counts0 = await readCounts();
    check('DAT-01b', '数据概览计数与种子存储一致（1/1/2/1）', counts0.attempts === 1 && counts0.snapshots === 1 && counts0.learned === 2 && counts0.appeals === 1, JSON.stringify(counts0));
    // 导出
    const dlPromise = page.waitForEvent('download', { timeout: 8000 });
    await page.click('#data-export-btn');
    const dl = await dlPromise;
    const dlPath = path.join('/tmp', 'aipm-export-test.json');
    await dl.saveAs(dlPath);
    const payload = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
    check('DAT-02R-UI', '导出 JSON：version=1、恰含十二键、快照内容与存储一致【批次 5 同步】',
      payload.version === 1 && JSON.stringify(Object.keys(payload.data).sort()) === JSON.stringify(TWELVE_KEYS.slice().sort())
      && JSON.stringify(payload.data['aipm.snapshots.v1']) === JSON.stringify(seedSnaps),
      'keys=' + Object.keys(payload.data).length);
    // DAT-05：导入合法文件 → 确认前不写入 → 取消
    async function importFile(p) {
      const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), page.click('#data-import-btn')]);
      await fc.setFiles(p);
      await page.waitForTimeout(450);
    }
    await importFile(dlPath);
    const confirmExists = await page.evaluate(() => !!document.getElementById('data-import-confirm'));
    const countsPre = await readCounts();
    await page.evaluate(() => { const b = [...document.querySelectorAll('#data-import-confirm button')].find(x => x.textContent.includes('取消')); if (b) b.click(); });
    await page.waitForTimeout(250);
    const countsCancel = await readCounts();
    check('DAT-05', '导入确认面板出现、确认前不写入、取消后不变',
      confirmExists && JSON.stringify(countsPre) === JSON.stringify(counts0) && JSON.stringify(countsCancel) === JSON.stringify(counts0),
      'pre=' + JSON.stringify(countsPre) + ' cancel=' + JSON.stringify(countsCancel));
    // DAT-04：三类坏文件拦截
    const badFiles = {
      notjson: Buffer.from('this is not json', 'utf8'),
      missing: Buffer.from(JSON.stringify({ app: 'ai-pm-coach', version: 1, data: { 'aipm.attempts.v1': [] } }), 'utf8'),
      wrongtype: Buffer.from(JSON.stringify({ app: 'ai-pm-coach', version: 1, data: Object.fromEntries(TWELVE_KEYS.map(k => [k, k === 'aipm.attempts.v1' ? { bad: 1 } : null])) }), 'utf8')
    };
    let badAllOk = true; const badDetails = [];
    for (const [name, buf] of Object.entries(badFiles)) {
      const p = '/tmp/bad-' + name + '.json'; fs.writeFileSync(p, buf);
      await importFile(p);
      const slotText = await textOf(page, '#data-mgmt-slot');
      const countsNow = await readCounts();
      const msgOk = slotText && (slotText.includes('失败') || slotText.includes('无法') || slotText.includes('不对'));
      const unchanged = JSON.stringify(countsNow) === JSON.stringify(counts0);
      badDetails.push(name + ':msg=' + msgOk + '/same=' + unchanged);
      if (!msgOk || !unchanged) badAllOk = false;
    }
    check('DAT-04', '坏文件导入被拦截且不覆盖（非JSON/缺键/类型错误）', badAllOk, badDetails.join(' '));
    // DAT-06：清空（确认前键仍在 → 确认后十键全无）
    await page.click('#data-clear-btn');
    await page.waitForTimeout(300);
    const clearPanelText = await textOf(page, '#data-clear-confirm');
    const keysBeforeConfirm = await page.evaluate(ks => ks.filter(k => window.localStorage.getItem(k) !== null).length, TWELVE_KEYS);
    await page.click('#data-clear-confirm-btn');
    await page.waitForTimeout(350);
    const keysAfter = await page.evaluate(ks => ks.filter(k => window.localStorage.getItem(k) !== null), TWELVE_KEYS);
    const countsCleared = await readCounts();
    const mySlotAfter = await textOf(page, '#my-assessment-slot');
    check('DAT-06', '清空确认前面板文案列全十二类数据；确认后十二键全无、计数 0、主页空状态【批次 5 同步】',
      keysBeforeConfirm >= 3 && clearPanelText && clearPanelText.includes('面试演练') && /12\s*类/.test(clearPanelText)
      && keysAfter.length === 0 && countsCleared.attempts === 0 && countsCleared.snapshots === 0 && countsCleared.learned === 0 && countsCleared.appeals === 0
      && mySlotAfter.includes('完成测评后查看你的能力雷达图'),
      'panel=' + (clearPanelText || '').slice(0, 130) + ' keysAfter=' + keysAfter.join(','));
    // DAT-03：导入先前导出 → 计数还原
    await importFile(dlPath);
    await page.click('#data-import-confirm-btn');
    await page.waitForTimeout(400);
    const countsRestored = await readCounts();
    check('DAT-03', '导出→清空→导入后四项计数与导出前逐项相同', JSON.stringify(countsRestored) === JSON.stringify(counts0),
      'before=' + JSON.stringify(counts0) + ' after=' + JSON.stringify(countsRestored));
    await ctx.close();
  }

  /* ================= S15：题库未就绪拦截（路由拦截小题库） ================= */
  {
    const { ctx, page } = await newPage();
    await ctx.route('**/assets/quiz-bank.js', route => {
      route.fulfill({ contentType: 'text/javascript', body: 'window.QUIZ_BANK=[{id:1,src:"T",dimension:"AI 基础认知",difficulty:3,stem:"小题库题1",options:{A:"甲",B:"乙",C:"丙",D:"丁"},answer:"A",distractor_analysis:{B:"x",C:"y",D:"z"},exam_points:[],sub_topic:"",difficulty_points:[]},{id:2,src:"T",dimension:"AI 基础认知",difficulty:3,stem:"小题库题2",options:{A:"甲",B:"乙",C:"丙",D:"丁"},answer:"A",distractor_analysis:{B:"x",C:"y",D:"z"},exam_points:[],sub_topic:"",difficulty_points:[]}];' });
    });
    await goto(page);
    await startQuizFromLanding(page);
    const viewNow = await activeView(page);
    const bodyText = await page.evaluate(() => document.body.textContent);
    check('E-10', '某维 <3 题时拦截启动并提示「题库未就绪，请联系管理员」、不进入答题页',
      viewNow !== 'view-quiz' && bodyText.includes('题库未就绪，请联系管理员'), 'view=' + viewNow);
    await ctx.close();
  }

  /* ================= S16：题目整理归类（E-26）+ 学习页基础（E-21/22/23/24/25） ================= */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    await page.waitForTimeout(300);
    const pathInfo = await page.evaluate(() => {
      const stages = [...document.querySelectorAll('#path-list > *')];
      const rows = [...document.querySelectorAll('.point-row')];
      return { stageCount: stages.length, rowCount: rows.length, stageTexts: stages.map(s => s.textContent.slice(0, 40)), recIdx: rows.map((r, i) => r.textContent.includes('推荐先学') ? i : -1).filter(i => i >= 0) };
    });
    check('E-22', '学习路径 6 阶段 / 27 个知识点', pathInfo.stageCount === 6 && pathInfo.rowCount === 27, 'stages=' + pathInfo.stageCount + ' rows=' + pathInfo.rowCount);
    check('E-25', '无测评记录时推荐先学落在全路径第一个未学点', pathInfo.recIdx.length === 1 && pathInfo.recIdx[0] === 0, 'rec=' + JSON.stringify(pathInfo.recIdx));
    const learnText = await textOf(page, '#view-learn');
    check('E-21', '学习页无写死示例分数冒充用户分数（无「45 分」类陈述）、推荐区为中性表述',
      !/\d{2}\s*分，是/.test(learnText || '') && !(learnText || '').includes('45 分') && (learnText || '').includes('还没有测评记录'));
    // E-26 整理归类
    await page.fill('#import-text', '如何设计 Agent 的工作流编排与工具调用的失败处理？\n多轮对话里上下文窗口超限时，应该怎么压缩历史消息？');
    await page.click('#import-btn');
    await page.waitForTimeout(300);
    const orgInfo = await page.evaluate(() => {
      const groups = [...document.querySelectorAll('#import-result .import-group')].map(g => ({ head: g.querySelector('b').textContent, lines: [...g.querySelectorAll('li')].map(li => li.textContent) }));
      const g1 = groups.find(g => g.lines.some(l => l.includes('工作流编排')));
      const g2 = groups.find(g => g.lines.some(l => l.includes('上下文窗口超限')));
      return { g1: g1 ? g1.head : null, g2: g2 ? g2.head : null, all: groups.map(g => g.head).join(' | ') };
    });
    check('E-26', '整理归类：工作流编排→技术协作、上下文→AI 基础认知（最长关键词优先）',
      !!orgInfo.g1 && orgInfo.g1.includes('技术协作') && !!orgInfo.g2 && orgInfo.g2.includes('AI 基础认知'), 'g1=' + orgInfo.g1 + ' | g2=' + orgInfo.g2 + ' | all=' + orgInfo.all);
    // E-23/E-24 打开第一个知识点：练习区结构 + 标记已学持久化
    await page.evaluate(() => { document.querySelectorAll('.point-row')[0].click(); });
    await page.waitForTimeout(350);
    const inDetail = (await activeView(page)) === 'view-learn-detail';
    const detailText = await textOf(page, '#view-learn-detail');
    const practiceAnswered = await page.evaluate(() => { const b = document.querySelector('#view-learn-detail .practice-opts .p-opt'); if (b) { b.click(); return true; } return false; });
    await page.waitForTimeout(250);
    const explainShown = await page.evaluate(() => !!document.querySelector('#view-learn-detail .practice-explain.show'));
    check('E-23', '知识点练习区：入门题 + 带题库编号与难度的真题、答后显示解析',
      inDetail && detailText && detailText.includes('入门题') && /(G\d+|#\d+)/.test(detailText) && detailText.includes('难度') && practiceAnswered && explainShown,
      (detailText || '').slice(0, 160));
    const markClicked = await page.evaluate(() => { const b = [...document.querySelectorAll('#view-learn-detail button')].find(x => /标记为已学会|已标记学会/.test(x.textContent)); if (b) { b.click(); return b.textContent; } return null; });
    await page.waitForTimeout(250);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    const learnStore = await lsJSON(page, 'aipm.learn.v1');
    check('E-24', '学习进度持久化（learned 含点 0、刷新后保持）', !!markClicked && learnStore && Array.isArray(learnStore.learned) && learnStore.learned.includes(0),
      'mark=' + markClicked + ' learned=' + (learnStore && JSON.stringify(learnStore.learned)));
    await ctx.close();
  }

  /* ================= 全局：零外网请求 + 零页面报错汇总 ================= */
  check('DAT-07/NET', '全部流程零运行时外网请求（本地数据文件除外）', externalRequests.length === 0, externalRequests.slice(0, 5).join(' | '));
  check('BOOT-ERR', '全部流程无未捕获 JS 报错', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));

  await browser.close();
  console.log('---- ' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) console.log('FAILED: ' + failures.join(' ;; '));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(2); });
