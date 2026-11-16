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

/* AI PM Coach 批次 5 自测脚本：学习笔记 NOTE-01..13
 * 运行：node 自测脚本-笔记-NOTE.js
 * 无头 Chromium（playwright-core），对象为 ts-spaces 真源 index.html（file://）。
 * 选区用 Selection API 按节点文本构造 Range；右键用真实 mouse 右键 + contextmenu 派发双保险。
 * 结果逐条 PASS/FAIL 打印，汇总 JSON 落 /tmp/note-results.json。 */
const fs = require('fs');
const { chromium } = __playwright();
const BASE = AIPM_APP_URL;
const CHROME = __chromePath();
const CARGS = __chromeArgs();

const results = [];
let pass = 0, fail = 0;
function check(id, name, cond, detail) {
  const d = detail == null ? '' : String(detail).slice(0, 320);
  console.log((cond ? 'PASS ' : 'FAIL ') + id + ' · ' + name + (d ? ' — ' + d : ''));
  results.push({ id, name, pass: !!cond, detail: d });
  if (cond) pass++; else fail++;
}
let browser;
const pageErrors = [];
async function newPage() {
  const ctx = await browser.newContext();
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
async function menuVisible(page) { return page.evaluate(() => { const m = document.getElementById('note-ctx-menu'); return !!m && m.style.display === 'block'; }); }
async function toastText(page) { return page.evaluate(() => { const t = document.getElementById('app-toast'); return t ? t.textContent : ''; }); }
async function gotoNotes(page) { await page.evaluate(() => { const el = document.querySelector('[data-goto="view-notes"]'); if (el) el.click(); }); await page.waitForTimeout(300); }

/* 在指定视图内选中第一个足够长的文本节点片段，派发 contextmenu，返回 {text, menu} */
async function selectAndCtx(page, viewSel, opts) {
  opts = opts || {};
  return page.evaluate(([vs, minLen]) => {
    const view = document.querySelector(vs);
    if (!view) return { err: 'no-view' };
    const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
    let node = null;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim().length >= minLen && node.parentElement && node.parentElement.offsetParent !== null) break;
    }
    if (!node) return { err: 'no-node' };
    const full = node.textContent;
    const start = full.search(/\S/);
    const text = full.slice(start, start + Math.min(40, full.trim().length)).trim();
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + text.length);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const rect = range.getBoundingClientRect();
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: Math.max(5, rect.left + 5), clientY: Math.max(5, rect.top + 5), button: 2 });
    view.dispatchEvent(ev);
    const menu = document.getElementById('note-ctx-menu');
    return { text: window.getSelection().toString(), selText: text, menu: !!menu && menu.style.display === 'block' };
  }, [viewSel, opts.minLen || 12]);
}
async function clickAddNote(page) {
  await page.click('#note-ctx-add');
  await page.waitForTimeout(250);
}
async function openFirstPoint(page) {
  await clickGoto(page, 'view-learn');
  await page.evaluate(() => { document.querySelector('#path-list .point-list button, #path-list button').click(); });
  await page.waitForTimeout(350);
  return page.evaluate(() => { const h = document.querySelector('#detail-wrap h2'); return h ? h.textContent : ''; });
}

(async () => {
  browser = await chromium.launch({ executablePath: CHROME, args: CARGS });

  /* ===== NOTE-01：知识点详情 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const title = await openFirstPoint(page);
    const r = await selectAndCtx(page, '#view-learn-detail');
    let notes = null;
    if (r.menu) { await clickAddNote(page); notes = await lsJSON(page, 'aipm.notes.v1'); }
    check('NOTE-01', '知识点详情选区右键出菜单→加入→存储 text 一致、type=kp、label=知识点标题',
      !!r.menu && !!r.text && Array.isArray(notes) && notes.length === 1 && notes[0].text === r.text && notes[0].source.type === 'kp' && notes[0].source.label === title,
      JSON.stringify(r).slice(0, 120) + ' notes=' + (notes ? JSON.stringify(notes[0] && { t: notes[0].text.slice(0, 30), s: notes[0].source }) : 'null') + ' title=' + title);
    await ctx.close();
  }

  /* ===== NOTE-02：词条详情 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { [...document.querySelectorAll('#view-learn [data-goto="view-glossary"]')][0].click(); });
    await page.waitForTimeout(300);
    await page.fill('#glo-input', '向量数据库');
    await page.waitForTimeout(250);
    await page.evaluate(() => { document.querySelector('#glo-results .glo-item').click(); });
    await page.waitForTimeout(300);
    const term = await page.evaluate(() => { const h = document.querySelector('#glo-detail-wrap h2'); return h ? h.textContent : ''; });
    const r = await selectAndCtx(page, '#view-glossary-detail');
    let notes = null;
    if (r.menu) { await clickAddNote(page); notes = await lsJSON(page, 'aipm.notes.v1'); }
    check('NOTE-02', '词条详情同路径（type=glossary、label=词条名）',
      (await activeView(page)) === 'view-glossary-detail' && !!r.menu && Array.isArray(notes) && notes.length === 1 && notes[0].source.type === 'glossary' && notes[0].source.label === term && notes[0].text === r.text,
      'term=' + term + ' menu=' + (r && r.menu) + ' notes=' + (notes ? JSON.stringify(notes[0] && notes[0].source) : 'null'));
    await ctx.close();
  }

  /* ===== NOTE-03：演练条目页 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await page.evaluate(() => { document.querySelector('#drill-slot button').click(); });
    await page.waitForTimeout(300);
    await page.click('#drill-start-btn');
    await page.waitForTimeout(350);
    const inRun = (await activeView(page)) === 'view-drill-run';
    const r = await selectAndCtx(page, '#view-drill-run', { minLen: 8 });
    let notes = null;
    if (r.menu) { await clickAddNote(page); notes = await lsJSON(page, 'aipm.notes.v1'); }
    check('NOTE-03', '演练条目页同路径（type=drill）',
      inRun && !!r.menu && Array.isArray(notes) && notes.length === 1 && notes[0].source.type === 'drill' && notes[0].text === r.text,
      'run=' + inRun + ' ' + JSON.stringify(r).slice(0, 100) + ' notes=' + (notes ? JSON.stringify(notes[0] && notes[0].source) : 'null'));
    await ctx.close();
  }

  /* ===== NOTE-04：无选区不拦截 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await openFirstPoint(page);
    await page.evaluate(() => {
      window.getSelection().removeAllRanges();
      const view = document.getElementById('view-learn-detail');
      view.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50, button: 2 }));
    });
    await page.waitForTimeout(150);
    check('NOTE-04', '无选区右键不拦截（菜单不显示）', !(await menuVisible(page)), 'menuVisible=' + (await menuVisible(page)));
    await ctx.close();
  }

  /* ===== NOTE-05：菜单关闭四路径 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await openFirstPoint(page);
    const paths = [];
    /* 路径1：点别处（document mousedown） */
    let r = await selectAndCtx(page, '#view-learn-detail');
    const opened1 = r.menu && (await menuVisible(page));
    await page.evaluate(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    await page.waitForTimeout(120);
    paths.push('mousedown:' + (opened1 && !(await menuVisible(page))));
    /* 路径2：Esc */
    r = await selectAndCtx(page, '#view-learn-detail');
    const opened2 = r.menu && (await menuVisible(page));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    paths.push('esc:' + (opened2 && !(await menuVisible(page))));
    /* 路径3：滚动 */
    r = await selectAndCtx(page, '#view-learn-detail');
    const opened3 = r.menu && (await menuVisible(page));
    await page.evaluate(() => { window.dispatchEvent(new Event('scroll')); document.dispatchEvent(new Event('scroll')); });
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(150);
    paths.push('scroll:' + (opened3 && !(await menuVisible(page))));
    /* 路径4：resize */
    r = await selectAndCtx(page, '#view-learn-detail');
    const opened4 = r.menu && (await menuVisible(page));
    await page.evaluate(() => { window.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(120);
    paths.push('resize:' + (opened4 && !(await menuVisible(page))));
    check('NOTE-05', '菜单关闭四路径（点别处/Esc/滚动/resize 各验一次）',
      paths.every(p => p.endsWith(':true')), paths.join(' '));
    await ctx.close();
  }

  /* ===== NOTE-06：重复加入去重 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await openFirstPoint(page);
    const r1 = await selectAndCtx(page, '#view-learn-detail');
    if (r1.menu) await clickAddNote(page);
    const n1 = (await lsJSON(page, 'aipm.notes.v1') || []).length;
    /* 同一选区再次加入：重新构造相同选区（文本节点内容未变） */
    const r2 = await selectAndCtx(page, '#view-learn-detail');
    if (r2.menu) await clickAddNote(page);
    const toast = await toastText(page);
    const n2 = (await lsJSON(page, 'aipm.notes.v1') || []).length;
    check('NOTE-06', '重复加入去重（toast 含「已在笔记中」、条数不变）',
      n1 === 1 && n2 === 1 && r1.text === r2.text && toast.includes('已在笔记中'),
      'n1=' + n1 + ' n2=' + n2 + ' toast=' + toast + ' sameText=' + (r1.text === r2.text));
    await ctx.close();
  }

  /* ===== NOTE-07：超长选区截断 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await openFirstPoint(page);
    const longText = await page.evaluate(() => {
      const wrap = document.getElementById('detail-wrap');
      const p = document.createElement('p');
      p.id = 'note-long-para';
      p.textContent = '长'.repeat(2500);
      wrap.appendChild(p);
      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      const view = document.getElementById('view-learn-detail');
      const rect = range.getBoundingClientRect();
      view.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20, button: 2 }));
      return { len: sel.toString().length, menu: document.getElementById('note-ctx-menu').style.display === 'block' };
    });
    let notes = null, toast = '';
    if (longText.menu) { await clickAddNote(page); notes = await lsJSON(page, 'aipm.notes.v1'); toast = await toastText(page); }
    check('NOTE-07', '超长选区截断（>2000 字 → 存储 text 长 2000、toast 含截断说明）',
      longText.len > 2000 && !!longText.menu && Array.isArray(notes) && notes.length === 1 && notes[0].text.length === 2000 && toast.includes('截断'),
      'selLen=' + longText.len + ' storedLen=' + (notes && notes[0] && notes[0].text.length) + ' toast=' + toast);
    await ctx.close();
  }

  /* ===== NOTE-08：跨段落选区 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await openFirstPoint(page);
    const r = await page.evaluate(() => {
      const wrap = document.getElementById('detail-wrap');
      /* 注入两段已知文本（仅测试 DOM），构造跨段 Range——走的仍是应用真实的选区/右键/加入路径 */
      const pA = document.createElement('p'); pA.textContent = '跨段落选区第一段独特文字甲甲甲';
      const pB = document.createElement('p'); pB.textContent = '跨段落选区第二段独特文字乙乙乙';
      wrap.appendChild(pA); wrap.appendChild(pB);
      const t1 = pA.firstChild, t2 = pB.firstChild;
      const p1El = pA, p2El = pB;
      const range = document.createRange();
      range.setStart(t1, 2);
      range.setEnd(t2, 12);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      const text = sel.toString();
      const view = document.getElementById('view-learn-detail');
      view.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20, button: 2 }));
      return { text, p1: p1El.textContent.trim().slice(2, 14), p2: p2El.textContent.trim().slice(0, 10), menu: document.getElementById('note-ctx-menu').style.display === 'block' };
    });
    let notes = null;
    if (r.menu) { await clickAddNote(page); notes = await lsJSON(page, 'aipm.notes.v1'); }
    check('NOTE-08', '跨段落选区（text 同时含两段文字）',
      !!r.menu && Array.isArray(notes) && notes.length === 1 && notes[0].text.includes('第一段独特文字') && notes[0].text.includes('第二段独特文字'),
      JSON.stringify({ menu: r.menu, p1: r.p1, p2: r.p2, err: r.err }).slice(0, 160) + ' stored=' + (notes && notes[0] ? notes[0].text.replace(/\s+/g, ' ').slice(0, 80) : 'null'));
    await ctx.close();
  }

  /* ===== NOTE-09：备注编辑保存并持久化 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const t0 = Date.now() - 100000;
    await lsSet(page, 'aipm.notes.v1', [
      { id: 'n-old', text: '较旧笔记正文', source: { type: 'kp', label: '知识点甲' }, remark: '', createdAt: t0, updatedAt: t0 },
      { id: 'n-new', text: '较新笔记正文', source: { type: 'kp', label: '知识点乙' }, remark: '', createdAt: t0 + 50000, updatedAt: t0 + 50000 }
    ]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await gotoNotes(page);
    /* 第一条（较新 n-new）编辑备注 */
    await page.evaluate(() => { document.querySelector('.note-item .note-remark-edit-btn').click(); });
    await page.waitForTimeout(200);
    await page.fill('.note-item .note-remark-input', '这是我的备注XYZ');
    const updBefore = (await lsJSON(page, 'aipm.notes.v1')).find(n => n.id === 'n-new').updatedAt;
    await page.evaluate(() => { document.querySelector('.note-item .note-remark-save').click(); });
    await page.waitForTimeout(300);
    const stored = await lsJSON(page, 'aipm.notes.v1');
    const edited = stored.find(n => n.id === 'n-new');
    /* 列表重排：编辑后 n-new 仍应在首位（updatedAt 最新）；刷新后备注仍在 */
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await gotoNotes(page);
    const listTxt = await page.evaluate(() => [...document.querySelectorAll('.note-item')].map(el => el.textContent.replace(/\s+/g, ' ')));
    check('NOTE-09', '备注编辑保存并刷新持久化（updatedAt 更新、列表重排）',
      !!edited && edited.remark === '这是我的备注XYZ' && edited.updatedAt > updBefore
      && listTxt.length === 2 && listTxt[0].includes('较新笔记正文') && listTxt[0].includes('这是我的备注XYZ'),
      'remark=' + (edited && edited.remark) + ' upd ' + updBefore + '→' + (edited && edited.updatedAt) + ' first=' + (listTxt[0] || '').slice(0, 70));
    await ctx.close();
  }

  /* ===== NOTE-10：删除两步确认 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.notes.v1', [{ id: 'n-del', text: '待删除笔记正文', source: { type: 'custom', label: '自定义笔记' }, remark: '', createdAt: Date.now(), updatedAt: Date.now() }]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await gotoNotes(page);
    await page.click('.note-item .note-delete-btn');
    await page.waitForTimeout(200);
    const afterFirst = (await lsJSON(page, 'aipm.notes.v1') || []).length;
    const armedTxt = await page.evaluate(() => document.querySelector('.note-item .note-delete-btn').textContent);
    /* 取消路径 */
    await page.evaluate(() => { const c = document.querySelector('.note-delete-cancel'); if (c) c.click(); });
    await page.waitForTimeout(200);
    const afterCancel = (await lsJSON(page, 'aipm.notes.v1') || []).length;
    const disarmedTxt = await page.evaluate(() => document.querySelector('.note-item .note-delete-btn').textContent);
    /* 再次点删除 → 确认 */
    await page.click('.note-item .note-delete-btn');
    await page.waitForTimeout(150);
    await page.click('.note-item .note-delete-btn');
    await page.waitForTimeout(250);
    const afterConfirm = (await lsJSON(page, 'aipm.notes.v1') || []).length;
    const itemsLeft = await page.evaluate(() => document.querySelectorAll('.note-item').length);
    const emptyShown = await page.evaluate(() => { const e = document.getElementById('note-empty'); return !!e && e.style.display !== 'none'; });
    check('NOTE-10', '删除两步确认（第一次点不删、确认后删、取消路径保留）',
      afterFirst === 1 && armedTxt.includes('确认删除') && afterCancel === 1 && disarmedTxt.trim() === '删除' && afterConfirm === 0 && itemsLeft === 0 && emptyShown,
      'first=' + afterFirst + ' armed=' + armedTxt + ' cancel=' + afterCancel + ' confirm=' + afterConfirm);
    await ctx.close();
  }

  /* ===== NOTE-11：自由笔记新建 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await gotoNotes(page);
    await page.click('#note-new-btn');
    await page.waitForTimeout(200);
    /* 正文为空被拦截 */
    await page.fill('#note-new-title', '空正文标题');
    await page.click('#note-new-save');
    await page.waitForTimeout(200);
    const toastEmpty = await toastText(page);
    const nAfterEmpty = (await lsJSON(page, 'aipm.notes.v1') || []).length;
    /* 带标题 */
    await page.fill('#note-new-title', '我的标题笔记');
    await page.fill('#note-new-text', '带标题的正文内容');
    await page.click('#note-new-save');
    await page.waitForTimeout(250);
    /* 不带标题（编辑器已关闭，重新打开） */
    await page.click('#note-new-btn');
    await page.waitForTimeout(200);
    await page.fill('#note-new-text', '不带标题的正文内容');
    await page.click('#note-new-save');
    await page.waitForTimeout(250);
    const notes = await lsJSON(page, 'aipm.notes.v1');
    const labels = (notes || []).map(n => n.source.label);
    check('NOTE-11', '自由笔记新建（带标题/不带标题 label 分别为标题与「自定义笔记」；正文为空被拦截）',
      nAfterEmpty === 0 && toastEmpty.includes('不能为空') && Array.isArray(notes) && notes.length === 2
      && labels.includes('我的标题笔记') && labels.includes('自定义笔记') && notes.every(n => n.source.type === 'custom'),
      'emptyN=' + nAfterEmpty + ' toast=' + toastEmpty + ' labels=' + JSON.stringify(labels));
    await ctx.close();
  }

  /* ===== NOTE-12：字段与排序 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const t0 = Date.now() - 200000;
    await lsSet(page, 'aipm.notes.v1', [
      { id: 'n-a', text: '排序旧条正文', source: { type: 'glossary', label: '词条甲' }, remark: '', createdAt: t0, updatedAt: t0 },
      { id: 'n-b', text: '排序新条正文', source: { type: 'drill', label: '演练乙' }, remark: '有备注', createdAt: t0 + 1000, updatedAt: t0 + 100000 }
    ]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
    await gotoNotes(page);
    const items = await page.evaluate(() => [...document.querySelectorAll('.note-item')].map(el => ({
      text: el.querySelector('.note-text') ? el.querySelector('.note-text').textContent : '',
      source: el.querySelector('.note-source') ? el.querySelector('.note-source').textContent : '',
      full: el.textContent.replace(/\s+/g, ' ')
    })));
    check('NOTE-12', '笔记页字段与排序（来源 chip、时间显示、按 updatedAt 倒序）',
      items.length === 2 && items[0].text === '排序新条正文' && items[1].text === '排序旧条正文'
      && items[0].source === '演练乙' && items[1].source === '词条甲'
      && items.every(i => i.full.includes('创建') && i.full.includes('更新')),
      JSON.stringify(items.map(i => ({ t: i.text, s: i.source }))));
    await ctx.close();
  }

  /* ===== NOTE-13：坏值矩阵 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const now = Date.now();
    const good = { id: 'n-good', text: '合法笔记正文', source: { type: 'kp', label: '知识点' }, remark: '', createdAt: now, updatedAt: now };
    const cases = [
      { name: '非数组字符串', raw: '"just-a-string"', expect: 0 },
      { name: '数字', raw: '12345', expect: 0 },
      { name: 'null字面量', raw: 'null', expect: 0 },
      { name: '条目缺text', raw: JSON.stringify([{ id: 'x1', source: { type: 'kp', label: 'L' } }]), expect: 0 },
      { name: '条目缺id', raw: JSON.stringify([{ text: '有正文无id', source: { type: 'kp', label: 'L' } }]), expect: 0 },
      { name: '混合合法与非法', raw: JSON.stringify([good, { id: 'x2' }, { text: '无id条目' }, null, 42]), expect: 1 },
      { name: '坏JSON', raw: '{corrupt!!', expect: 0 }
    ];
    const fails = [];
    for (const c of cases) {
      const e0 = pageErrors.length;
      await lsSet(page, 'aipm.notes.v1', c.raw);
      await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
      await gotoNotes(page);
      const n = await page.evaluate(() => document.querySelectorAll('#note-list .note-item').length);
      const view = await activeView(page);
      if (n !== c.expect || view !== 'view-notes' || pageErrors.length !== e0) {
        fails.push(c.name + '→n=' + n + '/view=' + view + '/err=' + (pageErrors.length - e0));
      }
      await page.evaluate(() => window.localStorage.removeItem('aipm.notes.v1'));
    }
    check('NOTE-13', 'notes 坏值矩阵（缺 text/id 被剔除、不白屏、pageerror 0）',
      fails.length === 0, fails.join(' | ') || '7 种坏值全过');
    await ctx.close();
  }

  await browser.close();
  console.log('\n==== NOTE 汇总：PASS ' + pass + ' / FAIL ' + fail + ' / pageerror 总数 ' + pageErrors.length + ' ====');
  fs.writeFileSync('/tmp/note-results.json', JSON.stringify({ pass, fail, results, pageErrors }, null, 1));
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('NOTE 脚本异常：', e); process.exit(2); });
