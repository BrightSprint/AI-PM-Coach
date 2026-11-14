'use strict';
/* 控件级矩阵 · 补充实测：首轮未覆盖的次要控件/另一分支（收起类切换、重做答错分支、
 * 小测/复习结果页返回按钮、演练小结两按钮、子集 modal 与专项「回到首页」、末题跳过、
 * 选项改选、申诉收起、编辑器单框勾选、整理区待归类、演练模式筛选计数）。 */
const fs = require('fs');
const { chromium } = require('/opt/muse/assets/spaces/ts-runtime/dist/node_modules/playwright-core');
const BASE = 'file:///home/hatch/workspace/ts-spaces/ai-pm-coach/index.html';
const ORIGIN = 'file:///home/hatch/workspace/ts-spaces/ai-pm-coach';
const results = [];
let pass = 0, fail = 0;
function check(id, name, cond, detail) {
  const d = detail == null ? '' : String(detail).slice(0, 300);
  console.log((cond ? 'PASS ' : 'FAIL ') + id + ' · ' + name + (d ? ' — ' + d : ''));
  results.push({ id, name, pass: !!cond, detail: d });
  if (cond) pass++; else fail++;
}
const pageErrors = []; const externalRequests = [];
let browser;
async function newPage(opts) {
  const ctx = await browser.newContext(opts || {});
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('request', r => { const u = r.url(); if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) externalRequests.push(u); });
  return { ctx, page };
}
async function goto(page) { await page.goto(BASE, { waitUntil: 'load' }); await page.waitForTimeout(350); }
async function lsJSON(page, k) { const v = await page.evaluate(key => window.localStorage.getItem(key), k); return v == null ? null : JSON.parse(v); }
async function lsSet(page, k, v) { await page.evaluate(([key, val]) => window.localStorage.setItem(key, val), [k, JSON.stringify(v)]); }
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
  if (mode === 'skip') { await page.click(nextSel.skip); await page.waitForTimeout(130); return q; }
  const letter = mode === 'wrong' ? ['A', 'B', 'C', 'D'].find(L => L !== q.answer) : q.answer;
  await page.evaluate(([s, i]) => { document.querySelectorAll(s)[i].click(); }, [optSel, 'ABCD'.indexOf(letter)]);
  await page.waitForTimeout(60);
  await page.click(nextSel.next);
  await page.waitForTimeout(140);
  return q;
}
const MAIN = { opt: '#q-options .opt', next: '#q-next', skip: '#q-skip', stem: '#q-stem', dim: '#q-dim' };

(async () => {
  browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--hatch-webgl-allowed-domains-file=/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt', '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6'] });

  /* ===== SUP-A：单维 12 题子集（全错）→ 资源收起 / redo 收起 / 申诉收起 / 子集 modal / 末题跳过 / 专项回到首页 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.quizcfg.v1', { count: 12, dims: ['数据与评估'], startDiff: 'adaptive', scope: 'unseen' });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await clickGoto(page, 'view-intro');
    await page.click('#view-intro .doc-actions .btn-primary'); await page.waitForTimeout(300);
    // 选项改选：先点 A 再点 C → 只有 C 选中
    await page.evaluate(() => { document.querySelectorAll('#q-options .opt')[0].click(); });
    await page.waitForTimeout(60);
    await page.evaluate(() => { document.querySelectorAll('#q-options .opt')[2].click(); });
    await page.waitForTimeout(60);
    const switchState = await page.evaluate(() => [...document.querySelectorAll('#q-options .opt')].map(b => b.classList.contains('selected')));
    check('SUP-06', '答题选项可改选：点 A 后点 C → 仅 C 为选中态', JSON.stringify(switchState) === JSON.stringify([false, false, true, false]), JSON.stringify(switchState));
    await page.click('#q-next'); await page.waitForTimeout(140);
    for (let i = 0; i < 10; i++) await answerCurrent(page, 'wrong', MAIN.opt, MAIN, MAIN.stem, MAIN.dim);
    // 第 12 题（末题）用跳过收尾
    const lastLbl = await textOf(page, '#q-next-label');
    await page.click('#q-skip'); await page.waitForTimeout(300);
    check('SUP-05', '末题点「跳过本题」→ 直接结算进结果页（末题按钮文案为查看结果）', lastLbl === '查看结果' && (await activeView(page)) === 'view-result', 'lbl=' + lastLbl + ' view=' + (await activeView(page)));
    // 资源展开→收起
    await page.evaluate(() => { const b = document.querySelector('#diag-list .diag-res-btn'); if (b) b.click(); });
    await page.waitForTimeout(150);
    const resOpen = await page.evaluate(() => ({ shown: !!document.querySelector('#diag-list .res-list.show'), label: document.querySelector('#diag-list .diag-res-btn').textContent }));
    await page.evaluate(() => { const b = document.querySelector('#diag-list .diag-res-btn'); if (b) b.click(); });
    await page.waitForTimeout(150);
    const resClosed = await page.evaluate(() => ({ shown: !!document.querySelector('#diag-list .res-list.show'), label: document.querySelector('#diag-list .diag-res-btn').textContent }));
    check('SUP-01', '推荐资源可收起：展开文案「收起推荐资源」→ 再点变回「查看推荐资源」且列表隐藏', resOpen.shown && resOpen.label === '收起推荐资源' && !resClosed.shown && resClosed.label === '查看推荐资源', JSON.stringify(resOpen) + ' -> ' + JSON.stringify(resClosed));
    // redo 展开→收起
    const redoBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('#diag-list .weak-next button')].find(x => x.textContent.includes('展开练习题')); if (b) { b.click(); return true; } return false; });
    await page.waitForTimeout(150);
    const redoOpen = await page.evaluate(() => !!document.querySelector('#diag-list .redo-box.show'));
    await page.evaluate(() => { const b = [...document.querySelectorAll('#diag-list .weak-next button')].find(x => x.textContent.includes('收起练习题')); if (b) b.click(); });
    await page.waitForTimeout(150);
    const redoClosed = await page.evaluate(() => !!document.querySelector('#diag-list .redo-box.show'));
    check('SUP-02', '诊断练习题可收起：展开后 .redo-box.show，再点「收起练习题」隐藏', redoBtn && redoOpen && !redoClosed);
    // 申诉展开→收起
    await page.click('#appeal-open'); await page.waitForTimeout(120);
    const f1 = await page.evaluate(() => document.getElementById('appeal-form').classList.contains('show'));
    await page.click('#appeal-open'); await page.waitForTimeout(120);
    const f2 = await page.evaluate(() => document.getElementById('appeal-form').classList.contains('show'));
    check('SUP-03', '申诉按钮为开关：再点一次收起表单', f1 === true && f2 === false);
    // 子集结果页 modal
    await page.evaluate(() => { const sc = [...document.querySelectorAll('.result-dim')].find(r => r.style.display !== 'none').querySelector('.dim-score'); sc.click(); });
    await page.waitForTimeout(250);
    const mTxt = await page.evaluate(() => document.getElementById('score-modal').textContent);
    check('SUP-04a', '子集结果页点已测维度分数 → modal 正常打开（12 题演进、含公式）', mTxt.includes('答了 12 题') && mTxt.includes('0.55'), mTxt.replace(/\s+/g, ' ').slice(0, 120));
    await page.click('#modal-retest'); await page.waitForTimeout(300);
    for (let i = 0; i < 5; i++) {
      const q = await currentBankQ(page, '#dt-stem', '#dt-dim');
      await page.evaluate(idx => { document.querySelectorAll('#dt-options .opt')[idx].click(); }, 'ABCD'.indexOf(q.answer));
      await page.waitForTimeout(60);
      await page.click('#dt-next'); await page.waitForTimeout(140);
    }
    await page.evaluate(() => { [...document.querySelectorAll('#dimtest-result button')].find(b => b.textContent.includes('回到首页')).click(); });
    await page.waitForTimeout(250);
    check('SUP-04b/D-05', '专项结果「回到首页」→ 落地页', (await activeView(page)) === 'view-landing', await activeView(page));
    await ctx.close();
  }

  /* ===== SUP-B：错题本重做答错分支 + 重做收起 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.attempts.v1', [{ finishedAt: new Date().toISOString(), totalScore: 40, dimScores: [40, 40, 40, 40, 40, 40], testedDims: ['AI 基础认知', '场景洞察', '产品设计', '数据与评估', '技术协作', '商业与落地'], records: [{ questionId: 11, dimension: '数据与评估', correct: false, userAnswer: 'A', skipped: false, difficulty: 4, selectedAnalysis: '种子解析', stem: '' }] }]);
    // 补齐 record 的 stem/analysis 取自题库，保证推导完整
    await page.evaluate(() => {
      const arr = JSON.parse(window.localStorage.getItem('aipm.attempts.v1'));
      const q = window.QUIZ_BANK.find(x => x.id === 11);
      arr[0].records[0].stem = q.stem;
      arr[0].records[0].selectedAnalysis = (q.distractor_analysis || {})['A'];
      window.localStorage.setItem('aipm.attempts.v1', JSON.stringify(arr));
    });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#wrongbook-slot button').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#wb-list .wb-item .wb-actions .sq-btn').click(); });
    await page.waitForTimeout(200);
    const stem = await page.evaluate(() => document.querySelector('#wb-list .wb-item .wb-stem').textContent);
    const q = await page.evaluate(s => window.QUIZ_BANK.find(x => x.stem === s), stem);
    const wrongIdx = ['A', 'B', 'C', 'D'].findIndex(L => L !== q.answer);
    await page.evaluate(i => { document.querySelectorAll('#wb-list .wb-item .redo-box .p-opt')[i].click(); }, wrongIdx);
    await page.waitForTimeout(250);
    const st = await page.evaluate(() => { const item = document.querySelector('#wb-list .wb-item'); return { status: item.querySelector('.wb-status').textContent, explain: item.querySelector('.redo-box .practice-explain').textContent }; });
    const wbStore = await lsJSON(page, 'aipm.wrongbook.v1');
    check('SUP-07a', '错题重做答错 → 保持待巩固、解析显示正确答案、wrongbook 记录 lastCorrect=false', st.status.includes('待巩固') && st.explain.includes('正确答案是 ' + q.answer) && wbStore.redo['11'] && wbStore.redo['11'].lastCorrect === false, JSON.stringify(st).slice(0, 130));
    await page.evaluate(() => { document.querySelector('#wb-list .wb-item .wb-actions .sq-btn').click(); });
    await page.waitForTimeout(150);
    const boxHidden = await page.evaluate(() => !document.querySelector('#wb-list .wb-item .redo-box').classList.contains('show'));
    const btnLbl = await page.evaluate(() => document.querySelector('#wb-list .wb-item .wb-actions .sq-btn').textContent);
    check('SUP-07b', '重做区可收起：再点按钮 → 隐藏且文案恢复「重做这道题」', boxHidden && btnLbl === '重做这道题', btnLbl);
    await ctx.close();
  }

  /* ===== SUP-C：复习中途返回 + 小测/复习结果页「回到学习路径」 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await page.evaluate(() => {
      const today = window.ReviewLink.todayStr();
      window.localStorage.setItem('aipm.review.v1', JSON.stringify({ '1': { stage: 0, due: today, lastResult: null, source: 'attempt' }, '2': { stage: 0, due: today, lastResult: null, source: 'attempt' } }));
    });
    await clickGoto(page, 'view-learn');
    await page.click('#review-start-btn'); await page.waitForTimeout(300);
    const q1 = await currentBankQ(page, '#rv-stem', '#rv-dim');
    await page.evaluate(i => { document.querySelectorAll('#rv-options .opt')[i].click(); }, 'ABCD'.indexOf(q1.answer));
    await page.waitForTimeout(200);
    await page.evaluate(() => { document.querySelector('#view-review .back-btn').click(); });
    await page.waitForTimeout(300);
    const banner = await textOf(page, '#review-banner');
    const store = await lsJSON(page, 'aipm.review.v1');
    check('SUP-08', '复习中途「学习路径」返回：已答题已迁移(stage=1)、未答题仍到期、横幅剩 1 题', (await activeView(page)) === 'view-learn' && store['1'].stage === 1 && store['2'].stage === 0 && banner.includes('今日可复习 1 题'), (banner || '').replace(/\s+/g, ' ').slice(0, 80));
    await page.click('#review-start-btn'); await page.waitForTimeout(300);
    const q2 = await currentBankQ(page, '#rv-stem', '#rv-dim');
    await page.evaluate(i => { document.querySelectorAll('#rv-options .opt')[i].click(); }, 'ABCD'.indexOf(q2.answer));
    await page.waitForTimeout(200);
    await page.click('#rv-next'); await page.waitForTimeout(300);
    await page.evaluate(() => { [...document.querySelectorAll('#review-result button')].find(b => b.textContent.includes('回到学习路径')).click(); });
    await page.waitForTimeout(250);
    check('SUP-10', '复习小结「回到学习路径」→ 学习首页', (await activeView(page)) === 'view-learn');
    // 小测结果页「回到学习路径」
    await page.evaluate(() => { document.querySelector('#stage-0 .sq-btn').click(); });
    await page.waitForTimeout(300);
    for (let i = 0; i < 5; i++) await answerCurrent(page, 'correct', '#sq-options .opt', { next: '#sq-next', skip: '#sq-skip' }, '#sq-stem', '#sq-dim');
    const sqRes = await textOf(page, '#stagequiz-result');
    check('SUP-09a', '小测全对结果：5 / 5 已通过文案', sqRes.includes('5 / 5') && sqRes.includes('已通过'), (sqRes || '').replace(/\s+/g, ' ').slice(0, 90));
    await page.evaluate(() => { [...document.querySelectorAll('#stagequiz-result button')].find(b => b.textContent.includes('回到学习路径')).click(); });
    await page.waitForTimeout(250);
    const sqRow = await page.evaluate(() => document.querySelector('#stage-0 .stage-quiz-row').textContent);
    check('SUP-09b', '小测结果「回到学习路径」→ 学习页且阶段卡显示已通过/最佳 5/5', (await activeView(page)) === 'view-learn' && sqRow.includes('已通过') && sqRow.includes('5/5'), sqRow.replace(/\s+/g, ' '));
    await ctx.close();
  }

  /* ===== SUP-D：演练模式筛选计数 + 小结「再来一组」「回演练首页」 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const gid0 = await page.evaluate(() => window.DRILL_BANK[0].gid);
    await lsSet(page, 'aipm.drill.v1', { [gid0]: { rating: 'fuzzy', count: 1, lastAt: new Date().toISOString() } });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#drill-slot button').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const c = [...document.querySelectorAll('#drill-mode-filter .dim-chip')].find(x => x.textContent === '只练模糊的'); if (c) c.click(); });
    await page.waitForTimeout(200);
    const noteF = await textOf(page, '#drill-pool-note');
    await page.evaluate(() => { const c = [...document.querySelectorAll('#drill-mode-filter .dim-chip')].find(x => x.textContent === '只练没练过的'); if (c) c.click(); });
    await page.waitForTimeout(200);
    const noteU = await textOf(page, '#drill-pool-note');
    check('SUP-12', '演练模式筛选计数：只练模糊的=1 条、只练没练过的=546 条', noteF.includes('共有 1 条') && noteU.includes('共有 546 条'), noteF + ' / ' + noteU);
    await page.evaluate(() => { const c = [...document.querySelectorAll('#drill-mode-filter .dim-chip')].find(x => x.textContent === '全部'); if (c) c.click(); });
    await page.waitForTimeout(150);
    await page.evaluate(() => { const c = [...document.querySelectorAll('#drill-size-filter .dim-chip')].find(x => x.textContent.startsWith('3')); if (c) c.click(); });
    await page.waitForTimeout(150);
    async function runGroup(rate) {
      await page.click('#drill-start-btn'); await page.waitForTimeout(300);
      for (let i = 0; i < 3; i++) {
        await page.click('#drill-reveal-btn'); await page.waitForTimeout(150);
        await page.click('#drill-more-btn'); await page.waitForTimeout(150);
        await page.evaluate(r => { [...document.querySelectorAll('.drill-rate')].find(b => b.getAttribute('data-rate') === r).click(); }, rate);
        await page.waitForTimeout(250);
      }
    }
    await runGroup('mastered');
    const sumShown = await page.evaluate(() => document.getElementById('drill-summary-box').style.display !== 'none');
    check('SUP-11a', '演练一组完成 → 小结显示', sumShown);
    await page.click('#drill-again-btn'); await page.waitForTimeout(300);
    check('SUP-11b', '小结「再来一组」→ 直接进入新一组演练（ask 阶段）', (await activeView(page)) === 'view-drill-run' && !!(await page.evaluate(() => document.getElementById('drill-reveal-btn'))));
    for (let i = 0; i < 3; i++) {
      await page.click('#drill-reveal-btn'); await page.waitForTimeout(150);
      await page.click('#drill-more-btn'); await page.waitForTimeout(150);
      await page.evaluate(() => { [...document.querySelectorAll('.drill-rate')].find(b => b.getAttribute('data-rate') === 'mastered').click(); });
      await page.waitForTimeout(250);
    }
    await page.click('#drill-back-btn'); await page.waitForTimeout(300);
    check('SUP-11c', '小结「回演练首页」→ 演练首页', (await activeView(page)) === 'view-drill', await activeView(page));
    await ctx.close();
  }

  /* ===== SUP-E：计划编辑器单框勾选 + 整理区待归类 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .preset-btn')].find(x => x.textContent.includes('自定义计划')); if (b) b.click(); });
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => [...document.querySelectorAll('#plan-panel-slot .plan-point input[type="checkbox"]')].filter(b => b.checked).length);
    await page.evaluate(() => { document.querySelector('#plan-panel-slot .plan-point input[type="checkbox"]').click(); });
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => { const boxes = [...document.querySelectorAll('#plan-panel-slot .plan-point input[type="checkbox"]')]; return { checked: boxes.filter(b => b.checked).length, first: boxes[0].checked }; });
    check('SUP-14', '编辑器单个勾选框：取消第 1 个 → 勾选数 27→26、其余不变（草稿态）', before === 27 && after.checked === 26 && after.first === false, before + '->' + after.checked);
    await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .plan-editor-actions button')].find(x => x.textContent === '取消'); if (b) b.click(); });
    await page.waitForTimeout(200);
    await page.fill('#import-text', '今天天气怎么样啊朋友们');
    await page.click('#import-btn'); await page.waitForTimeout(250);
    const org = await textOf(page, '#import-result');
    check('SUP-13', '整理区无关键词题 → 落入「待归类」组并说明后续按考核点标注', org.includes('待归类') && org.includes('没识别到维度关键词'), (org || '').replace(/\s+/g, ' ').slice(0, 130));
    await ctx.close();
  }

  check('SUP-GL', '补充流程零页面报错、零外网请求', pageErrors.length === 0 && externalRequests.length === 0, pageErrors.slice(0, 2).join('|') + ' ' + externalRequests.slice(0, 2).join('|'));
  await browser.close();
  fs.writeFileSync('/tmp/ctl-results-supp.json', JSON.stringify({ pass, fail, results }, null, 2));
  console.log('\n==== 补充实测汇总：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  if (fail) results.filter(r => !r.pass).forEach(r => console.log(' - ' + r.id + ' ' + r.name + ' :: ' + r.detail));
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });
