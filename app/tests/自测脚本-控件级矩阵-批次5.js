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

/* AI PM Coach 批次 5 控件级矩阵补充脚本：逐行枚举收藏/笔记新控件 → 期望行为 → 实测
 * 运行：node 自测脚本-控件级矩阵-批次5.js
 * 无头 Chromium（playwright-core），对象为 ts-spaces 真源 index.html（file://）。
 * 每行打印 PASS/FAIL，汇总 JSON 落 /tmp/matrix5-results.json。 */
const fs = require('fs');
const { chromium } = __playwright();
const BASE = AIPM_APP_URL;
const CHROME = __chromePath();
const CARGS = __chromeArgs();

const results = [];
let pass = 0, fail = 0, row = 0;
function check(name, cond, detail) {
  row++;
  const id = 'MX5-' + String(row).padStart(2, '0');
  const d = detail == null ? '' : String(detail).slice(0, 260);
  console.log((cond ? 'PASS ' : 'FAIL ') + id + ' · ' + name + (d ? ' — ' + d : ''));
  results.push({ id, name, pass: !!cond, detail: d });
  if (cond) pass++; else fail++;
}
let browser;
const pageErrors = [];
async function newPage(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts || {});
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrors.push(e.message));
  return { ctx, page };
}
async function goto(page) { await page.goto(BASE, { waitUntil: 'load' }); await page.waitForTimeout(350); }
async function lsGet(page, k) { return page.evaluate(key => window.localStorage.getItem(key), k); }
async function lsSet(page, k, v) { await page.evaluate(([key, val]) => window.localStorage.setItem(key, val), [k, typeof v === 'string' ? v : JSON.stringify(v)]); }
async function lsJSON(page, k) { const v = await lsGet(page, k); return v == null ? null : JSON.parse(v); }
async function activeView(page) { return page.evaluate(() => { const v = document.querySelector('.view.active'); return v ? v.id : null; }); }
async function clickGoto(page, viewId) { await page.evaluate(id => { const el = document.querySelector('[data-goto="' + id + '"]'); if (el) el.click(); }, viewId); await page.waitForTimeout(280); }
async function gotoFavorites(page) { await page.evaluate(() => { const b = document.querySelector('#favorites-slot button') || document.querySelector('[data-goto="view-favorites"]'); if (b) b.click(); }); await page.waitForTimeout(300); }
async function gotoNotes(page) { await page.evaluate(() => { const el = document.querySelector('[data-goto="view-notes"]'); if (el) el.click(); }); await page.waitForTimeout(300); }
async function bankQ(page, stemSel, dimSel) {
  return page.evaluate(([ss, ds]) => {
    const stem = document.querySelector(ss).textContent;
    const dim = document.querySelector(ds).textContent;
    const q = window.QUIZ_BANK.find(x => x.stem === stem && x.dimension === dim) || window.QUIZ_BANK.find(x => x.stem === stem);
    return q ? JSON.parse(JSON.stringify(q)) : null;
  }, [stemSel, dimSel]);
}
async function answerQuiz(page, mode) {
  const q = await bankQ(page, '#q-stem', '#q-dim');
  const letter = mode === 'wrong' ? ['A', 'B', 'C', 'D'].find(L => L !== q.answer) : q.answer;
  await page.evaluate(i => { document.querySelectorAll('#q-options .opt')[i].click(); }, 'ABCD'.indexOf(letter));
  await page.waitForTimeout(60);
  await page.click('#q-next'); await page.waitForTimeout(140);
  return q;
}
async function startQuiz(page) { await clickGoto(page, 'view-intro'); await page.click('#view-intro .doc-actions .btn-primary'); await page.waitForTimeout(300); }

(async () => {
  browser = await chromium.launch({ executablePath: CHROME, args: CARGS });

  /* ===== A. 答题页 #q-fav ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await startQuiz(page);
    const init = await page.evaluate(() => { const b = document.getElementById('q-fav'); return b ? { state: b.getAttribute('data-state'), text: b.textContent, cls: b.className } : null; });
    check('#q-fav 存在且初始为未收藏态（☆ 收藏 / data-state=off / .fav-toggle）', !!init && init.state === 'off' && init.text.includes('☆') && init.cls.includes('fav-toggle'), JSON.stringify(init));
    const q1 = await bankQ(page, '#q-stem', '#q-dim');
    await page.click('#q-fav'); await page.waitForTimeout(150);
    const on = await page.evaluate(() => { const b = document.getElementById('q-fav'); return { state: b.getAttribute('data-state'), text: b.textContent }; });
    const stored = await lsJSON(page, 'aipm.favorites.v1');
    check('#q-fav 点击 → 变已收藏（★ / data-state=on）且写 aipm.favorites.v1', on.state === 'on' && on.text.includes('★') && Array.isArray(stored) && stored.length === 1 && String(stored[0].qid) === String(q1.id), JSON.stringify(on));
    await page.click('#q-fav'); await page.waitForTimeout(150);
    const off = await page.evaluate(() => { const b = document.getElementById('q-fav'); return { state: b.getAttribute('data-state'), text: b.textContent }; });
    check('#q-fav 再点 → 回退未收藏且存储移除', off.state === 'off' && off.text.includes('☆') && (await lsJSON(page, 'aipm.favorites.v1')).length === 0, JSON.stringify(off));
    /* 换题后按钮跟随当前题：收藏第一题 → 下一题按钮应为未收藏 */
    await page.click('#q-fav'); await page.waitForTimeout(120);
    await answerQuiz(page, 'correct');
    const nextState = await page.evaluate(() => document.getElementById('q-fav').getAttribute('data-state'));
    check('#q-fav 换题后跟随当前题状态（新题未收藏 → off）', nextState === 'off', 'state=' + nextState);
    await ctx.close();
  }

  /* ===== B. 结果页 .fav-toggle + 阶段小测复盘 .fav-toggle ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await startQuiz(page);
    const q1 = await bankQ(page, '#q-stem', '#q-dim');
    await page.click('#q-fav'); await page.waitForTimeout(120);
    await answerQuiz(page, 'wrong');
    for (let i = 0; i < 17; i++) { if ((await activeView(page)) === 'view-result') break; await answerQuiz(page, i % 2 ? 'wrong' : 'correct'); }
    const tg = await page.evaluate(() => [...document.querySelectorAll('#view-result .fav-toggle[data-fav-qid]')].map(b => ({ qid: b.getAttribute('data-fav-qid'), state: b.getAttribute('data-state'), text: b.textContent })));
    check('结果页逐题块 .fav-toggle[data-fav-qid] 存在（弱点块/重做框）', (await activeView(page)) === 'view-result' && tg.length >= 1, 'n=' + tg.length);
    const hit = tg.find(t => String(t.qid) === String(q1.id));
    check('结果页与答题页收藏的同题按钮显示已收藏', !!hit && hit.state === 'on' && hit.text.includes('★'), JSON.stringify(hit || null));
    if (tg.length) {
      const target = tg[0];
      const was = (await lsJSON(page, 'aipm.favorites.v1') || []).some(f => String(f.qid) === String(target.qid));
      await page.evaluate(qid => { [...document.querySelectorAll('#view-result .fav-toggle[data-fav-qid]')].find(b => b.getAttribute('data-fav-qid') === qid).click(); }, target.qid);
      await page.waitForTimeout(200);
      const now = (await lsJSON(page, 'aipm.favorites.v1') || []).some(f => String(f.qid) === String(target.qid));
      const btnNow = await page.evaluate(qid => { const b = [...document.querySelectorAll('#view-result .fav-toggle[data-fav-qid]')].find(x => x.getAttribute('data-fav-qid') === qid); return b ? b.getAttribute('data-state') : null; }, target.qid);
      check('结果页 .fav-toggle 点击 → 存储切换且同页所有同题按钮同步', now === !was && btnNow === (now ? 'on' : 'off'), 'was=' + was + ' now=' + now + ' btn=' + btnNow);
    } else {
      check('结果页 .fav-toggle 点击 → 存储切换且同页所有同题按钮同步', false, '无可点按钮');
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { document.querySelector('#stage-0 .sq-btn').click(); });
    await page.waitForTimeout(300);
    for (let i = 0; i < 5; i++) {
      const q = await bankQ(page, '#sq-stem', '#sq-dim');
      if (!q) break;
      await page.evaluate(idx => { document.querySelectorAll('#sq-options .opt')[idx].click(); }, 'ABCD'.indexOf(q.answer));
      await page.waitForTimeout(60);
      await page.click('#sq-next'); await page.waitForTimeout(160);
    }
    const sqToggles = await page.evaluate(() => document.querySelectorAll('#stagequiz-result .fav-toggle[data-fav-qid]').length);
    check('阶段小测复盘逐题块 .fav-toggle[data-fav-qid] 存在（5 题）', sqToggles === 5, 'n=' + sqToggles);
    await ctx.close();
  }

  /* ===== C. 收藏夹入口与视图控件 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const cardTxt = await page.evaluate(() => { const b = document.querySelector('#favorites-slot button'); return b ? b.textContent.replace(/\s+/g, ' ') : null; });
    check('落地页收藏夹入口卡存在且空态文案含「已收藏 0 道题」', !!cardTxt && cardTxt.includes('收藏夹') && cardTxt.includes('已收藏 0 道题'), (cardTxt || '').slice(0, 90));
    await page.evaluate(() => { document.querySelector('#favorites-slot button').click(); });
    await page.waitForTimeout(300);
    const emptyVis = await page.evaluate(() => { const e = document.getElementById('fav-empty'); return !!e && e.style.display !== 'none'; });
    check('落地页卡点击 → view-favorites 且 #fav-empty 空状态可见', (await activeView(page)) === 'view-favorites' && emptyVis, 'view=' + (await activeView(page)));
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { [...document.querySelectorAll('#view-learn [data-goto="view-favorites"]')][0].click(); });
    await page.waitForTimeout(300);
    check('学习首页「打开收藏夹」按钮 → view-favorites', (await activeView(page)) === 'view-favorites', 'view=' + (await activeView(page)));
    /* 造 1 条收藏后逐控件验 */
    const qid = await page.evaluate(() => window.QUIZ_BANK[5].id);
    await lsSet(page, 'aipm.favorites.v1', [{ qid, ts: Date.now() }]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    const cardTxt2 = await page.evaluate(() => document.querySelector('#favorites-slot button').textContent.replace(/\s+/g, ' '));
    check('落地页卡计数随存储更新（含「已收藏 1 道题」）', cardTxt2.includes('已收藏 1 道题'), cardTxt2.slice(0, 80));
    await gotoFavorites(page);
    const itemCount = await page.evaluate(() => document.querySelectorAll('#fav-list .fav-item').length);
    const emptyHidden = await page.evaluate(() => document.getElementById('fav-empty').style.display === 'none');
    check('.fav-item 渲染 1 条且 #fav-empty 隐藏', itemCount === 1 && emptyHidden, 'items=' + itemCount);
    await page.evaluate(() => { document.querySelector('.fav-item .fav-item-head').click(); });
    await page.waitForTimeout(200);
    const detailShown = await page.evaluate(() => document.querySelector('.fav-item .fav-detail').classList.contains('show'));
    check('.fav-item 头部点击 → .fav-detail 展开（show）', detailShown, 'show=' + detailShown);
    await page.evaluate(() => { document.querySelector('.fav-item .fav-redo-btn').click(); });
    await page.waitForTimeout(200);
    const redoShown = await page.evaluate(() => document.querySelector('.fav-item .fav-redo').classList.contains('show'));
    const optCount = await page.evaluate(() => document.querySelectorAll('.fav-item .fav-redo .p-opt').length);
    check('.fav-redo-btn 点击 → .fav-redo 展开且含 4 个选项按钮', redoShown && optCount === 4, 'show=' + redoShown + ' opts=' + optCount);
    const qq = await page.evaluate(id => JSON.parse(JSON.stringify(window.QUIZ_BANK.find(x => String(x.id) === String(id)))), qid);
    await page.evaluate(i => { document.querySelectorAll('.fav-item .fav-redo .p-opt')[i].click(); }, 'ABCD'.indexOf(qq.answer));
    await page.waitForTimeout(200);
    const verdict = await page.evaluate(() => { const v = document.querySelector('.fav-item .fav-redo-verdict'); return { show: v.classList.contains('show'), text: v.textContent }; });
    check('.fav-redo 选项点击 → .fav-redo-verdict 显示判定（答对了）', verdict.show && verdict.text.includes('答对了'), verdict.text.slice(0, 50));
    await page.evaluate(() => { document.querySelector('.fav-item .fav-remove-btn').click(); });
    await page.waitForTimeout(250);
    const afterRemove = await page.evaluate(() => document.querySelectorAll('#fav-list .fav-item').length);
    check('.fav-remove-btn 点击 → 条目移除、存储清空', afterRemove === 0 && (await lsJSON(page, 'aipm.favorites.v1')).length === 0, 'items=' + afterRemove);
    await page.evaluate(() => { document.querySelector('#view-favorites [data-goto="view-landing"]').click(); });
    await page.waitForTimeout(300);
    check('#view-favorites 返回按钮 → view-landing', (await activeView(page)) === 'view-landing', 'view=' + (await activeView(page)));
    await ctx.close();
  }

  /* ===== D. 复习完成页收藏夹按钮 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const seedQ = await page.evaluate(() => window.QUIZ_BANK[7].id);
    const now = new Date();
    const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const rev = {}; rev[String(seedQ)] = { stage: 0, due: today, lastResult: 'wrong', source: 'attempt' };
    await lsSet(page, 'aipm.review.v1', rev);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await clickGoto(page, 'view-learn');
    await page.click('#review-start-btn');
    await page.waitForTimeout(300);
    const q = await bankQ(page, '#rv-stem', '#rv-dim');
    await page.evaluate(i => { document.querySelectorAll('#rv-options .opt')[i].click(); }, 'ABCD'.indexOf(q.answer));
    await page.waitForTimeout(200);
    await page.click('#rv-next'); await page.waitForTimeout(300);
    const btns = await page.evaluate(() => [...document.querySelectorAll('#review-result button')].map(b => b.textContent));
    await page.evaluate(() => { [...document.querySelectorAll('#review-result button')].find(b => b.textContent.includes('收藏夹')).click(); });
    await page.waitForTimeout(300);
    check('复习完成页「打开收藏夹」按钮存在且 → view-favorites', btns.some(t => t.includes('收藏夹')) && (await activeView(page)) === 'view-favorites', 'btns=' + btns.join('/') + ' view=' + (await activeView(page)));
    await ctx.close();
  }

  /* ===== E. 笔记右键菜单控件 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const menuInit = await page.evaluate(() => { const m = document.getElementById('note-ctx-menu'); const a = document.getElementById('note-ctx-add'); return { disp: m ? m.style.display : null, addText: a ? a.textContent : null, toastExists: !!document.getElementById('app-toast') }; });
    check('#note-ctx-menu 初始隐藏且 #note-ctx-add 文案为「加入学习笔记」、#app-toast 存在', !!menuInit && menuInit.disp !== 'block' && menuInit.addText === '加入学习笔记' && menuInit.toastExists, JSON.stringify(menuInit));
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { document.querySelector('#path-list .point-list button, #path-list button').click(); });
    await page.waitForTimeout(350);
    const sel = await page.evaluate(() => {
      const view = document.getElementById('view-learn-detail');
      const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
      let node = null;
      while ((node = walker.nextNode())) { if (node.textContent.trim().length >= 12 && node.parentElement.offsetParent !== null) break; }
      const full = node.textContent; const start = full.search(/\S/);
      const text = full.slice(start, start + 24).trim();
      const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + text.length);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
      view.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 30, button: 2 }));
      return { text: s.toString(), menu: document.getElementById('note-ctx-menu').style.display === 'block' };
    });
    check('知识点详情选区右键 → #note-ctx-menu 显示', sel.menu && !!sel.text, JSON.stringify(sel).slice(0, 100));
    await page.click('#note-ctx-add'); await page.waitForTimeout(250);
    const notes = await lsJSON(page, 'aipm.notes.v1');
    const toast = await page.evaluate(() => document.getElementById('app-toast').textContent);
    const menuAfter = await page.evaluate(() => document.getElementById('note-ctx-menu').style.display);
    check('#note-ctx-add 点击 → 写笔记、菜单关闭、#app-toast 提示已加入', Array.isArray(notes) && notes.length === 1 && notes[0].text === sel.text && menuAfter !== 'block' && toast.includes('已加入学习笔记'), 'toast=' + toast + ' menu=' + menuAfter);
    await ctx.close();
  }

  /* ===== F. 笔记页控件 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await gotoNotes(page);
    const emptyVis = await page.evaluate(() => { const e = document.getElementById('note-empty'); return !!e && e.style.display !== 'none'; });
    check('笔记页空态：#note-empty 可见且 #note-new-btn 存在', (await activeView(page)) === 'view-notes' && emptyVis && !!(await page.$('#note-new-btn')), 'view=' + (await activeView(page)));
    await page.click('#note-new-btn'); await page.waitForTimeout(200);
    const editorShown = await page.evaluate(() => document.getElementById('note-editor').classList.contains('show'));
    check('#note-new-btn 点击 → #note-editor 展开（show）', editorShown, 'show=' + editorShown);
    await page.click('#note-new-cancel'); await page.waitForTimeout(200);
    const editorHidden = await page.evaluate(() => !document.getElementById('note-editor').classList.contains('show'));
    check('#note-new-cancel 点击 → 编辑器收起', editorHidden, 'hidden=' + editorHidden);
    await page.click('#note-new-btn'); await page.waitForTimeout(150);
    await page.fill('#note-new-text', '矩阵行笔记正文');
    await page.click('#note-new-save'); await page.waitForTimeout(250);
    const item = await page.evaluate(() => { const el = document.querySelector('.note-item'); return el ? { text: el.querySelector('.note-text').textContent, source: el.querySelector('.note-source').textContent, hasRemarkBtn: !!el.querySelector('.note-remark-edit-btn'), hasDelBtn: !!el.querySelector('.note-delete-btn') } : null; });
    check('#note-new-save 保存 → .note-item 出现（.note-text/.note-source/备注/删除控件齐全）', !!item && item.text === '矩阵行笔记正文' && item.source === '自定义笔记' && item.hasRemarkBtn && item.hasDelBtn, JSON.stringify(item));
    await page.evaluate(() => { document.querySelector('.note-item .note-remark-edit-btn').click(); });
    await page.waitForTimeout(200);
    const inputShown = await page.evaluate(() => !!document.querySelector('.note-item .note-remark-input') && !!document.querySelector('.note-item .note-remark-save') && !!document.querySelector('.note-item .note-remark-cancel'));
    check('.note-remark-edit-btn 点击 → 出现 .note-remark-input 与保存/取消按钮', inputShown, 'shown=' + inputShown);
    await page.fill('.note-item .note-remark-input', '矩阵备注');
    await page.evaluate(() => { document.querySelector('.note-item .note-remark-cancel').click(); });
    await page.waitForTimeout(250);
    const afterCancel = await lsJSON(page, 'aipm.notes.v1');
    check('.note-remark-cancel 点击 → 不落盘（remark 仍为空）且回查看态', Array.isArray(afterCancel) && afterCancel[0].remark === '' && !!(await page.$('.note-item .note-remark-edit-btn')), 'remark=' + JSON.stringify(afterCancel && afterCancel[0] && afterCancel[0].remark));
    await page.evaluate(() => { document.querySelector('.note-item .note-remark-edit-btn').click(); });
    await page.waitForTimeout(200);
    await page.fill('.note-item .note-remark-input', '矩阵备注');
    await page.evaluate(() => { document.querySelector('.note-item .note-remark-save').click(); });
    await page.waitForTimeout(250);
    const afterSave = await lsJSON(page, 'aipm.notes.v1');
    const remarkShown = await page.evaluate(() => document.querySelector('.note-item').textContent.includes('矩阵备注'));
    check('.note-remark-save 点击 → 备注落盘且列表显示', Array.isArray(afterSave) && afterSave[0].remark === '矩阵备注' && remarkShown, 'remark=' + (afterSave && afterSave[0] && afterSave[0].remark));
    await page.click('.note-item .note-delete-btn'); await page.waitForTimeout(200);
    const armed = await page.evaluate(() => { const b = document.querySelector('.note-item .note-delete-btn'); const c = document.querySelector('.note-delete-cancel'); return { text: b.textContent, cancelShown: !!c && c.style.display !== 'none' }; });
    check('.note-delete-btn 第一次点击 → 武装确认态（文案「确认删除？」+ 取消按钮出现）、不删', armed.text.includes('确认删除') && armed.cancelShown && (await lsJSON(page, 'aipm.notes.v1')).length === 1, JSON.stringify(armed));
    await page.evaluate(() => { document.querySelector('.note-delete-cancel').click(); });
    await page.waitForTimeout(200);
    const disarmed = await page.evaluate(() => document.querySelector('.note-item .note-delete-btn').textContent.trim());
    check('.note-delete-cancel 点击 → 解除武装（文案回「删除」）、条目保留', disarmed === '删除' && (await lsJSON(page, 'aipm.notes.v1')).length === 1, 'text=' + disarmed);
    await page.click('.note-item .note-delete-btn'); await page.waitForTimeout(150);
    await page.click('.note-item .note-delete-btn'); await page.waitForTimeout(250);
    const gone = await page.evaluate(() => document.querySelectorAll('.note-item').length);
    check('.note-delete-btn 武装后再次点击 → 删除且空态恢复', gone === 0 && (await lsJSON(page, 'aipm.notes.v1')).length === 0, 'items=' + gone);
    await page.evaluate(() => { document.querySelector('#view-notes [data-goto="view-learn"]').click(); });
    await page.waitForTimeout(300);
    check('#view-notes 返回按钮 → view-learn', (await activeView(page)) === 'view-learn', 'view=' + (await activeView(page)));
    /* 学习页笔记入口卡 */
    await page.evaluate(() => { [...document.querySelectorAll('#view-learn [data-goto="view-notes"]')][0].click(); });
    await page.waitForTimeout(300);
    check('学习首页「打开学习笔记」按钮 → view-notes', (await activeView(page)) === 'view-notes', 'view=' + (await activeView(page)));
    await ctx.close();
  }

  /* ===== G. 数据概览两新计数 + 清空文案 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.favorites.v1', [{ qid: 1, ts: 1 }, { qid: 2, ts: 2 }]);
    await lsSet(page, 'aipm.notes.v1', [{ id: 'x', text: 't', source: { type: 'custom', label: '自定义笔记' }, remark: '', createdAt: 1, updatedAt: 1 }]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    const counts = await page.evaluate(() => { const o = {}; document.querySelectorAll('#data-mgmt-slot [data-count]').forEach(e => { o[e.getAttribute('data-count')] = e.textContent.trim(); }); return o; });
    check('概览新计数 data-count=favorites 与存储一致（2）', counts.favorites === '2', JSON.stringify(counts));
    check('概览新计数 data-count=notes 与存储一致（1）', counts.notes === '1', JSON.stringify(counts));
    await page.click('#data-clear-btn'); await page.waitForTimeout(250);
    const clearTxt = await page.evaluate(() => { const el = document.getElementById('data-clear-confirm'); return el ? el.textContent.replace(/\s+/g, ' ') : ''; });
    check('清空确认文案含「共 12 类本地数据」且列明收藏与学习笔记', clearTxt.includes('共 12 类本地数据') && clearTxt.includes('收藏') && clearTxt.includes('学习笔记'), clearTxt.slice(0, 160));
    await ctx.close();
  }

  check('全矩阵过程零 pageerror', pageErrors.length === 0, pageErrors.join(';').slice(0, 200));

  await browser.close();
  console.log('\n==== 控件级矩阵·批次5 汇总：PASS ' + pass + ' / FAIL ' + fail + ' / 共 ' + row + ' 行 / pageerror 总数 ' + pageErrors.length + ' ====');
  fs.writeFileSync('/tmp/matrix5-results.json', JSON.stringify({ pass, fail, rows: row, results, pageErrors }, null, 1));
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('矩阵·批次5 脚本异常：', e); process.exit(2); });
