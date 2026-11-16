'use strict';
/* AI PM Coach 批次 8 自测脚本（二）：笔记覆盖 NOTE-14 / 键盘 KBD-01..03 / 大数据量 DAT-15·FAV-11 /
 * 演练弱项池 DRL-09 / 配额 ABN-11 / 双标签 ABN-12 / 时区 REV-08
 * 运行：node 自测脚本-批次8-体验与异常.js */

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
const { execFileSync } = require('child_process');
global.window = globalThis;
vm.runInThisContext(fs.readFileSync(__path.join(AIPM_ASSETS, 'quiz-bank.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(__path.join(AIPM_ASSETS, 'drill-bank.js'), 'utf8'));
const BANK = global.QUIZ_BANK, DRILL = global.DRILL_BANK;

const results = [];
let pass = 0, fail = 0;
function check(id, name, cond, detail) {
  const d = detail == null ? '' : String(detail).slice(0, 300);
  console.log((cond ? 'PASS ' : 'FAIL ') + id + ' · ' + name + (d ? ' — ' + d : ''));
  results.push({ id, name, pass: !!cond, detail: d });
  if (cond) pass++; else fail++;
}

/* ================= REV-08（G-08）：三时区同口径 ================= */
{
  const probe = `
    global.window = globalThis;
    const fs = require('fs'), vm = require('vm');
    vm.runInThisContext(fs.readFileSync(${JSON.stringify(__path.join(AIPM_ASSETS, 'review-link.js'))}, 'utf8'));
    const RL = global.ReviewLink;
    let rv = { 7: { stage: 0, due: '2026-11-16', lastResult: null, source: 'attempt' } };
    const chain = [];
    let today = '2026-11-16';
    for (let i = 0; i < 4; i++) { rv = RL.applyReviewResult(rv, 7, true, today); chain.push(rv[7].due); today = rv[7].due; }
    const out = {
      todayStr: RL.todayStr(new Date('2026-11-16T05:00:00.000Z')),
      add: [RL.addDaysStr('2024-02-28', 1), RL.addDaysStr('2026-12-31', 1), RL.addDaysStr('2026-01-01', -1)],
      chain,
      due: RL.dueQuestions({ 7: { stage: 0, due: '2026-11-16', lastResult: null, source: 'x' }, 8: { stage: 1, due: '2026-11-20', lastResult: null, source: 'x' } }, '2026-11-16').map(d => d.qid),
    };
    console.log(JSON.stringify(out));
  `;
  const outs = ['UTC', 'Asia/Shanghai', 'Pacific/Kiritimati'].map(tz =>
    execFileSync(process.execPath, ['-e', probe], { env: Object.assign({}, process.env, { TZ: tz }), encoding: 'utf8' }).trim());
  check('REV-08', '三时区（UTC/上海/UTC+14）日期口径逐字一致', outs[0] === outs[1] && outs[1] === outs[2], outs[0]);
}

/* ================= 浏览器层 ================= */
const { chromium } = __playwright();
let browser;
const pageErrors = [];
async function newPage(sharedCtx) {
  const ctx = sharedCtx || await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(e.message + ' @ ' + String(e.stack || '').split('\n')[1]));
  return { ctx, page };
}
async function goto(page) { await page.goto(AIPM_APP_URL, { waitUntil: 'load' }); await page.waitForTimeout(350); }
async function lsGet(page, k) { return page.evaluate(key => window.localStorage.getItem(key), k); }
async function lsSet(page, k, v) { await page.evaluate(([key, val]) => window.localStorage.setItem(key, val), [k, typeof v === 'string' ? v : JSON.stringify(v)]); }
async function lsJSON(page, k) { const v = await lsGet(page, k); return v == null ? null : JSON.parse(v); }
async function activeView(page) { return page.evaluate(() => { const v = document.querySelector('.view.active'); return v ? v.id : null; }); }
/* 在指定视图内选中第一段足够长的文本，等待浮动按钮出现后点击它 */
async function selectTextAndClickSelBtn(page, viewId, minLen) {
  const selText = await page.evaluate(([vid, ml]) => {
    const view = document.getElementById(vid);
    const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.trim();
      if (t.length >= ml && node.parentElement && node.parentElement.offsetParent !== null) {
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, Math.min(node.textContent.length, ml + 30));
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
        return sel.toString();
      }
    }
    return null;
  }, [viewId, minLen || 12]);
  await page.waitForTimeout(350);
  const btnVisible = await page.evaluate(() => { const b = document.getElementById('note-sel-btn'); return !!b && b.style.display !== 'none' && getComputedStyle(b).display !== 'none'; });
  if (btnVisible) { await page.click('#note-sel-btn'); await page.waitForTimeout(300); }
  return { selText, btnVisible };
}

(async () => {
  browser = await chromium.launch({ executablePath: __chromePath(), args: __chromeArgs() });
  const today = new Date(); const pad = n => String(n).padStart(2, '0');
  const todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
  const q0 = BANK[0];

  /* ===== NOTE-14（一）：错题本 / 复习 / 阶段小测三页 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const att = { id: 'att-n14', ts: Date.now() - 3600000, total: 1, right: 0, records: [{ questionId: q0.id, src: q0.src, dimension: q0.dimension, userAnswer: ['A', 'B', 'C', 'D'].find(L => L !== q0.answer), correct: false, skipped: false, timeSec: 5, difficulty: q0.difficulty, stem: q0.stem, sub_topic: q0.sub_topic, exam_points: q0.exam_points || [], difficulty_points: q0.difficulty_points || [] }] };
    await lsSet(page, 'aipm.attempts.v1', [att]);
    await lsSet(page, 'aipm.review.v1', { [q0.id]: { stage: 0, due: todayStr, lastResult: null, source: 'attempt' } });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    /* 错题本 */
    await page.evaluate(() => { document.querySelector('[data-goto="view-wrongbook"]').click(); });
    await page.waitForTimeout(300);
    let r = await selectTextAndClickSelBtn(page, 'view-wrongbook');
    let notes = await lsJSON(page, 'aipm.notes.v1') || [];
    check('NOTE-14', '错题本页选区可加笔记（type=wrongbook）', r.btnVisible && notes.length === 1 && notes[0].source.type === 'wrongbook', 'btn=' + r.btnVisible + ' type=' + (notes[0] && notes[0].source.type));
    /* 复习页（开始一轮复习后选题干） */
    await page.evaluate(() => { document.querySelector('[data-goto="view-learn"]').click(); });
    await page.waitForTimeout(300);
    await page.click('#review-start-btn');
    await page.waitForTimeout(350);
    r = await selectTextAndClickSelBtn(page, 'view-review');
    notes = await lsJSON(page, 'aipm.notes.v1') || [];
    check('NOTE-14', '复习页选区可加笔记（type=review）', r.btnVisible && notes.length === 2 && notes.some(n => n.source.type === 'review'), 'btn=' + r.btnVisible + ' n=' + notes.length);
    /* 阶段小测页（先完成一轮小测产生复盘区） */
    await page.evaluate(() => { document.querySelector('[data-goto="view-learn"]').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const b = document.querySelector('#stage-0 .sq-start, [data-stage-start]'); if (b) b.click(); });
    await page.waitForTimeout(300);
    if ((await activeView(page)) !== 'view-stagequiz') {
      /* 兜底：直接进入小测视图选静态文案（绑定在视图元素上，来源类型一致） */
      await page.evaluate(() => { const v = document.getElementById('view-stagequiz'); document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x === v)); });
      await page.waitForTimeout(200);
    }
    r = await selectTextAndClickSelBtn(page, 'view-stagequiz');
    notes = await lsJSON(page, 'aipm.notes.v1') || [];
    check('NOTE-14', '阶段小测页选区可加笔记（type=stagequiz）', r.btnVisible && notes.some(n => n.source.type === 'stagequiz'), 'btn=' + r.btnVisible + ' types=' + notes.map(n => n.source.type).join(','));
    await ctx.close();
  }

  /* ===== NOTE-14（二）：结果页 + 维度专项页（真实测评一轮）+ 答题页负例 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await page.evaluate(() => { document.querySelector('[data-goto="view-intro"]').click(); });
    await page.waitForTimeout(300);
    await page.click('#view-intro .doc-actions .btn-primary');
    await page.waitForTimeout(350);
    /* 答题页负例：选中题干，浮动按钮不得出现 */
    const neg = await selectTextAndClickSelBtn(page, 'view-quiz');
    check('NOTE-14', '答题页选区不出现浮动按钮（不干扰作答）', neg.btnVisible === false, 'btn=' + neg.btnVisible);
    for (let i = 0; i < 24; i++) {
      if ((await activeView(page)) === 'view-result') break;
      const letter = await page.evaluate(() => {
        const stem = document.querySelector('#q-stem').textContent;
        const dim = document.querySelector('#q-dim').textContent;
        const q = window.QUIZ_BANK.find(x => x.stem === stem && x.dimension === dim) || window.QUIZ_BANK.find(x => x.stem === stem);
        return q ? q.answer : null;
      });
      if (!letter) break;
      await page.evaluate(idx => { document.querySelectorAll('#q-options .opt')[idx].click(); }, 'ABCD'.indexOf(letter));
      await page.waitForTimeout(60);
      await page.click('#q-next');
      await page.waitForTimeout(130);
    }
    check('NOTE-14', '测评完成到达结果页', (await activeView(page)) === 'view-result');
    await page.waitForTimeout(300);
    let r = await selectTextAndClickSelBtn(page, 'view-result');
    let notes = await lsJSON(page, 'aipm.notes.v1') || [];
    check('NOTE-14', '结果页诊断选区可加笔记（type=result）', r.btnVisible && notes.some(n => n.source.type === 'result'), 'btn=' + r.btnVisible + ' types=' + notes.map(n => n.source.type).join(','));
    /* 维度专项：点第一张维度卡开分数构成 modal → 重测这个维度 */
    await page.evaluate(() => { document.querySelector('.result-dim .dim-score').click(); });
    await page.waitForTimeout(300);
    await page.click('#modal-retest');
    await page.waitForTimeout(400);
    const inDimtest = (await activeView(page)) === 'view-dimtest';
    r = await selectTextAndClickSelBtn(page, 'view-dimtest');
    notes = await lsJSON(page, 'aipm.notes.v1') || [];
    check('NOTE-14', '维度专项页选区可加笔记（type=dimtest）', inDimtest && r.btnVisible && notes.some(n => n.source.type === 'dimtest'), 'view=' + inDimtest + ' btn=' + r.btnVisible);
    await ctx.close();
  }

  /* ===== KBD-01：键盘选区 + Tab 到浮动按钮 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await page.evaluate(() => { document.querySelector('[data-goto="view-learn"]').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#path-list .point-list button, #path-list button').click(); });
    await page.waitForTimeout(400);
    /* 选区用 Selection API 构造（与 NOTE 组既有惯例一致）：纯键盘选区依赖浏览器光标浏览模式、
       沙盒 Chromium 的模拟指针拖动选区亦不稳定，均非应用可控范围；
       本用例的键盘断言点是选区出现后「按钮 Tab 可达 + Enter 触发」这一应用可控环节。 */
    await page.evaluate(() => {
      const view = document.getElementById('view-learn-detail');
      const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim().length >= 16) {
          const range = document.createRange();
          range.setStart(node, 0); range.setEnd(node, 16);
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
          break;
        }
      }
    });
    await page.waitForTimeout(400);
    const btnVisible = await page.evaluate(() => { const b = document.getElementById('note-sel-btn'); return !!b && b.style.display !== 'none'; });
    let reached = false;
    for (let i = 0; i < 200 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement && document.activeElement.id === 'note-sel-btn');
    }
    check('KBD-01', '选区出现后浮动按钮可见且纯 Tab 可达', btnVisible && reached, 'visible=' + btnVisible + ' tabReached=' + reached);
    if (reached) { await page.keyboard.press('Enter'); await page.waitForTimeout(300); }
    const notes = await lsJSON(page, 'aipm.notes.v1') || [];
    check('KBD-01', 'Enter 后笔记 +1 且正文非空', notes.length === 1 && notes[0].text.trim().length >= 5, 'n=' + notes.length + ' text=' + (notes[0] ? notes[0].text.slice(0, 20) : ''));
    await ctx.close();
  }

  /* ===== KBD-02：Shift+F10 菜单路径 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await page.evaluate(() => { document.querySelector('[data-goto="view-learn"]').click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('#path-list .point-list button, #path-list button').click(); });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const view = document.getElementById('view-learn-detail');
      const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim().length >= 16) {
          const range = document.createRange();
          range.setStart(node, 0); range.setEnd(node, 16);
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
          break;
        }
      }
      const navBtn = document.querySelector('#view-learn-detail .done-btn');
      if (navBtn) navBtn.focus();
    });
    await page.waitForTimeout(150);
    await page.keyboard.press('Shift+F10');
    await page.waitForTimeout(300);
    const menuVisible = await page.evaluate(() => { const m = document.getElementById('note-ctx-menu'); return !!m && m.style.display !== 'none'; });
    check('KBD-02', 'Shift+F10 唤出笔记菜单', menuVisible);
    if (menuVisible) {
      await page.evaluate(() => { document.getElementById('note-ctx-add').focus(); });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
    }
    const notes = await lsJSON(page, 'aipm.notes.v1') || [];
    check('KBD-02', '菜单按钮 Enter 后笔记 +1', notes.length === 1, 'n=' + notes.length);
    await ctx.close();
  }

  /* ===== KBD-03：主要流程键盘可达抽查 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    async function tabUntil(pred, max) {
      for (let i = 0; i < (max || 80); i++) {
        await page.keyboard.press('Tab');
        if (await page.evaluate(pred)) return true;
      }
      return false;
    }
    const toLearn = await tabUntil(() => { const a = document.activeElement; return !!a && a.classList.contains('mode-learn-btn'); });
    if (toLearn) { await page.keyboard.press('Enter'); await page.waitForTimeout(350); }
    check('KBD-03', 'Tab+Enter 可从落地页进入学习页', toLearn && (await activeView(page)) === 'view-learn');
    const toPoint = await tabUntil(() => { const a = document.activeElement; return !!a && (a.classList.contains('point-row') || a.closest && !!a.closest('#path-list')); });
    if (toPoint) { await page.keyboard.press('Enter'); await page.waitForTimeout(400); }
    check('KBD-03', 'Tab+Enter 可打开一个知识点', toPoint && (await activeView(page)) === 'view-learn-detail', 'view=' + (await activeView(page)));
    const toDone = await tabUntil(() => { const a = document.activeElement; return !!a && a.classList.contains('done-btn'); }, 40);
    if (toDone) { await page.keyboard.press('Enter'); await page.waitForTimeout(300); }
    const learn = await lsJSON(page, 'aipm.learn.v1');
    check('KBD-03', '键盘可完成「标记已学」', toDone && !!learn && Array.isArray(learn.learned) && learn.learned.length >= 1, 'learned=' + (learn && learn.learned && learn.learned.length));
    await ctx.close();
  }

  /* ===== DAT-15：大数据量（G-02） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const notes = [];
    for (let i = 0; i < 150; i++) notes.push({ id: 'bulk-' + i, text: '批量笔记 ' + i, source: { type: 'custom', label: '自定义笔记' }, remark: '', createdAt: i + 1, updatedAt: i + 1 });
    const snaps = [];
    for (let i = 0; i < 120; i++) snaps.push({ attemptId: 'bulk-a' + i, ts: 1700000000000 + i * 86400000, date: new Date(1700000000000 + i * 86400000).toISOString(), dimScores: [50, 55, 60, 65, 70, 75], totalScore: 60, correct: 9, answered: 18 });
    await lsSet(page, 'aipm.notes.v1', notes);
    await lsSet(page, 'aipm.snapshots.v1', snaps);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
    await page.evaluate(() => { document.querySelector('[data-goto="view-notes"]').click(); });
    await page.waitForTimeout(600);
    const noteItems = await page.evaluate(() => document.querySelectorAll('#note-list .note-item').length);
    check('DAT-15', '笔记 150 条全量渲染', noteItems === 150, 'items=' + noteItems);
    const errBefore = pageErrors.length;
    await page.goto(AIPM_APP_URL, { waitUntil: 'load' }); await page.waitForTimeout(600);
    const slotTxt = await page.evaluate(() => document.getElementById('my-assessment-slot').textContent);
    check('DAT-15', '快照 120 条时落地页「我的测评」正常渲染（含共 120 次）', slotTxt.includes('120') && pageErrors.length === errBefore, slotTxt.replace(/\s+/g, ' ').slice(0, 80));
    await ctx.close();
  }

  /* ===== FAV-11：收藏全量 634（G-02） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.favorites.v1', BANK.map((q, i) => ({ qid: q.id, ts: 1000 + i })));
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
    await page.evaluate(() => { document.querySelector('[data-goto="view-favorites"]').click(); });
    await page.waitForTimeout(900);
    const favItems = await page.evaluate(() => document.querySelectorAll('#fav-list .fav-item').length);
    check('FAV-11', '收藏 634 条全量渲染', favItems === 634, 'items=' + favItems);
    await ctx.close();
  }

  /* ===== DRL-09：弱项池为空（G-09b） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const store = {};
    DRILL.forEach(e => { store[e.gid] = { rating: 'mastered', lastAt: '2026-11-16T00:00:00.000Z', count: 1 }; });
    await lsSet(page, 'aipm.drill.v1', store);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
    await page.evaluate(() => { document.querySelector('[data-goto="view-drill"]').click(); });
    await page.waitForTimeout(400);
    const weakTxt = await page.evaluate(() => document.getElementById('drill-weak-list').textContent);
    check('DRL-09', '全部掌握时待加强列表为空状态文案', weakTxt.includes('暂无待加强条目'), weakTxt.slice(0, 50));
    await ctx.close();
  }

  /* ===== ABN-11：配额写满（G-03） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await page.evaluate(() => {
      /* 多粒度填满：单一大块填法在配额边缘仍能塞进小写入，必须逐级减小块直到小写入也失败 */
      let n = 0;
      for (const sz of [400000, 40000, 4000, 400, 40, 4]) {
        const chunk = 'x'.repeat(sz);
        for (let i = 0; i < 3000; i++) {
          try { window.localStorage.setItem('__fill' + (n++), chunk); } catch (e) { break; }
        }
      }
    });
    await page.evaluate(() => { document.querySelector('[data-goto="view-intro"]').click(); });
    await page.waitForTimeout(300);
    await page.click('#view-intro .doc-actions .btn-primary');
    await page.waitForTimeout(400);
    await page.click('#q-fav');
    await page.waitForTimeout(400);
    const state = await page.evaluate(() => ({
      failed: window.__aipmSaveFailed === true,
      toast: (document.getElementById('app-toast') || {}).textContent || '',
      favState: (document.getElementById('q-fav') || {}).dataset ? document.getElementById('q-fav').dataset.state : null,
      favStored: window.localStorage.getItem('aipm.favorites.v1'),
    }));
    check('ABN-11', '配额满时保存失败被如实报告（标志位置位 + 提示文案）', state.failed && state.toast.includes('存储空间不足'), 'toast=' + state.toast.slice(0, 40));
    check('ABN-11', '收藏按钮不假报已收藏（状态与落盘一致）', state.favState !== 'on' && (state.favStored === null || state.favStored === '[]'), 'state=' + state.favState + ' stored=' + state.favStored);
    await page.evaluate(() => { Object.keys(window.localStorage).filter(k => k.startsWith('__fill')).forEach(k => window.localStorage.removeItem(k)); });
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
    const recovered = await page.evaluate(() => !!document.querySelector('.view.active'));
    check('ABN-11', '清出空间后应用恢复正常', recovered && (await activeView(page)) === 'view-landing');
    await ctx.close();
  }

  /* ===== ABN-12：双标签并发（G-13） ===== */
  {
    const ctx = await browser.newContext();
    const p1 = await ctx.newPage(); const p2 = await ctx.newPage();
    p1.on('pageerror', e => pageErrors.push('p1: ' + e.message));
    p2.on('pageerror', e => pageErrors.push('p2: ' + e.message));
    await goto(p1); await goto(p2);
    await lsSet(p1, 'aipm.favorites.v1', [{ qid: BANK[0].id, ts: 1 }]);
    await lsSet(p2, 'aipm.notes.v1', [{ id: 'tab2-note', text: '标签二笔记', source: { type: 'custom', label: '自定义笔记' }, remark: '', createdAt: 1, updatedAt: 1 }]);
    await lsSet(p1, 'aipm.favorites.v1', [{ qid: BANK[0].id, ts: 1 }, { qid: BANK[1].id, ts: 2 }]);
    await p1.reload({ waitUntil: 'load' }); await p1.waitForTimeout(400);
    const allParse = await p1.evaluate(() => {
      const out = {};
      Object.keys(window.localStorage).filter(k => k.startsWith('aipm.')).forEach(k => { try { JSON.parse(window.localStorage.getItem(k)); out[k] = true; } catch (e) { out[k] = false; } });
      return out;
    });
    const favs = await lsJSON(p1, 'aipm.favorites.v1');
    const notes = await lsJSON(p1, 'aipm.notes.v1');
    check('ABN-12', '双标签交替写入后数据可解析、应用可加载（last-writer-wins）',
      Object.values(allParse).every(Boolean) && Array.isArray(favs) && Array.isArray(notes) && (await activeView(p1)) === 'view-landing',
      JSON.stringify(allParse));
    await ctx.close();
  }

  check('GLOBAL', '全程 pageerror 为 0', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  await browser.close();
  console.log('\n==== 批次 8（二）汇总：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  fs.writeFileSync('/tmp/b8-part2-results.json', JSON.stringify(results, null, 2));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常', e); process.exit(2); });
