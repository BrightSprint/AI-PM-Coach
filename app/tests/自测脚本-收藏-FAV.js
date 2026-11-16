'use strict';
/* AI PM Coach 批次 5 自测脚本：收藏 FAV-01..10 + 数据管理 DAT-12/DAT-13
 * 运行：node 自测脚本-收藏-FAV.js
 * 无头 Chromium（playwright-core），对象为 ts-spaces 真源 index.html（file://）。
 * 结果逐条 PASS/FAIL 打印，汇总 JSON 落 /tmp/fav-results.json。 */
const fs = require('fs');
const { chromium } = require('/opt/muse/assets/spaces/ts-runtime/dist/node_modules/playwright-core');
const BASE = 'file:///home/hatch/workspace/ts-spaces/ai-pm-coach/index.html';
const CHROME = '/opt/meta-chromium/chrome';
const CARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--hatch-webgl-allowed-domains-file=/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt', '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6'];
const TWELVE_KEYS = ['aipm.attempts.v1', 'aipm.snapshots.v1', 'aipm.inprogress.v1', 'aipm.appeals.v1', 'aipm.learn.v1', 'aipm.quizcfg.v1', 'aipm.wrongbook.v1', 'aipm.stagequiz.v1', 'aipm.review.v1', 'aipm.drill.v1', 'aipm.favorites.v1', 'aipm.notes.v1'];
const TEN_KEYS = TWELVE_KEYS.slice(0, 10);

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
async function textOf(page, sel) { return page.evaluate(s => { const el = document.querySelector(s); return el ? el.textContent : null; }, sel); }
async function clickGoto(page, viewId) { await page.evaluate(id => { const el = document.querySelector('[data-goto="' + id + '"]'); if (el) el.click(); }, viewId); await page.waitForTimeout(280); }
async function currentBankQ(page) {
  return page.evaluate(() => {
    const stem = document.querySelector('#q-stem').textContent;
    const dim = document.querySelector('#q-dim').textContent;
    const q = window.QUIZ_BANK.find(x => x.stem === stem && x.dimension === dim) || window.QUIZ_BANK.find(x => x.stem === stem);
    return q ? JSON.parse(JSON.stringify(q)) : null;
  });
}
async function answerCurrent(page, mode) {
  const q = await currentBankQ(page);
  if (!q) throw new Error('题库未匹配当前题');
  const letter = mode === 'wrong' ? ['A', 'B', 'C', 'D'].find(L => L !== q.answer) : q.answer;
  await page.evaluate(i => { document.querySelectorAll('#q-options .opt')[i].click(); }, 'ABCD'.indexOf(letter));
  await page.waitForTimeout(60);
  await page.click('#q-next');
  await page.waitForTimeout(140);
  return q;
}
async function startQuiz(page) {
  await clickGoto(page, 'view-intro');
  await page.click('#view-intro .doc-actions .btn-primary');
  await page.waitForTimeout(300);
}
async function gotoFavorites(page) {
  await page.evaluate(() => {
    const slotBtn = document.querySelector('#favorites-slot button');
    const g = document.querySelector('[data-goto="view-favorites"]');
    if (slotBtn) slotBtn.click(); else if (g) g.click();
  });
  await page.waitForTimeout(300);
}
async function readCounts(page) {
  return page.evaluate(() => { const o = {}; document.querySelectorAll('#data-mgmt-slot [data-count]').forEach(e => { o[e.getAttribute('data-count')] = +e.textContent.trim(); }); return o; });
}
async function importFile(page, p) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 8000 }), page.click('#data-import-btn')]);
  await fc.setFiles(p);
  await page.waitForTimeout(500);
}

(async () => {
  browser = await chromium.launch({ executablePath: CHROME, args: CARGS });

  /* ===== FAV-01 / FAV-02 / FAV-03：答题页切换、取消、刷新持久化 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await startQuiz(page);
    const q1 = await currentBankQ(page);
    await page.click('#q-fav');
    await page.waitForTimeout(150);
    let stored = await lsJSON(page, 'aipm.favorites.v1');
    let btn = await page.evaluate(() => { const b = document.getElementById('q-fav'); return { state: b.getAttribute('data-state'), text: b.textContent, pressed: b.getAttribute('aria-pressed') }; });
    check('FAV-01', '答题页收藏切换写存储（qid 与当前题一致、含 ts）',
      !!q1 && Array.isArray(stored) && stored.length === 1 && String(stored[0].qid) === String(q1.id) && typeof stored[0].ts === 'number' && btn.state === 'on' && btn.text.includes('★') && btn.pressed === 'true',
      'qid=' + (stored && stored[0] && stored[0].qid) + ' cur=' + (q1 && q1.id) + ' state=' + btn.state);
    /* FAV-02 取消 */
    await page.click('#q-fav');
    await page.waitForTimeout(150);
    stored = await lsJSON(page, 'aipm.favorites.v1');
    btn = await page.evaluate(() => { const b = document.getElementById('q-fav'); return { state: b.getAttribute('data-state'), text: b.textContent }; });
    check('FAV-02', '取消收藏移除且按钮回退',
      Array.isArray(stored) && stored.length === 0 && btn.state === 'off' && btn.text.includes('☆'),
      'len=' + (stored && stored.length) + ' state=' + btn.state + ' text=' + btn.text);
    /* FAV-03 再次收藏 → 刷新 → 持久化 */
    await page.click('#q-fav');
    await page.waitForTimeout(150);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(350);
    stored = await lsJSON(page, 'aipm.favorites.v1');
    await gotoFavorites(page);
    const favCount = await page.evaluate(() => document.querySelectorAll('#fav-list .fav-item').length);
    const favText = await textOf(page, '#fav-list');
    check('FAV-03', '刷新后持久化（存储仍在、收藏夹有条目）',
      Array.isArray(stored) && stored.length === 1 && String(stored[0].qid) === String(q1.id) && favCount === 1 && !!favText && favText.includes(q1.stem.slice(0, 20)),
      'len=' + (stored && stored.length) + ' favItems=' + favCount + ' view=' + (await activeView(page)));
    await ctx.close();
  }

  /* ===== FAV-04 / FAV-05 / FAV-06 / FAV-07：收藏夹列表、详情、重做、移除 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const bank2 = await page.evaluate(() => window.QUIZ_BANK.slice(0, 2).map(q => JSON.parse(JSON.stringify(q))));
    const tOld = Date.now() - 86400000, tNew = Date.now() - 3600000;
    await lsSet(page, 'aipm.favorites.v1', [{ qid: bank2[0].id, ts: tOld }, { qid: bank2[1].id, ts: tNew }]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await gotoFavorites(page);
    const items = await page.evaluate(() => [...document.querySelectorAll('#fav-list .fav-item')].map(el => el.textContent.replace(/\s+/g, ' ')));
    check('FAV-04', '收藏夹倒序与字段（题干/维度/难度/收藏时间）',
      items.length === 2 && items[0].includes(bank2[1].stem.slice(0, 20)) && items[1].includes(bank2[0].stem.slice(0, 20))
      && items.every(t => t.includes('难度') && t.includes('收藏于')) && items[0].includes(bank2[1].dimension) && items[1].includes(bank2[0].dimension),
      'n=' + items.length + ' first=' + (items[0] || '').slice(0, 80));
    /* FAV-05 展开详情逐字核对（第一条 = bank2[1]） */
    await page.evaluate(() => { document.querySelector('#fav-list .fav-item .fav-item-head').click(); });
    await page.waitForTimeout(200);
    const detailTxt = await page.evaluate(() => { const d = document.querySelector('#fav-list .fav-item .fav-detail'); return d ? d.textContent : ''; });
    const q = bank2[1];
    const optsOk = ['A', 'B', 'C', 'D'].every(L => detailTxt.includes(q.options[L]));
    const anaOk = detailTxt.includes((q.distractor_analysis || {})[q.answer] || '###NONE###') && detailTxt.includes('正确答案');
    check('FAV-05', '展开详情与题库逐字一致（选项/正确答案/解析）', optsOk && anaOk,
      'opts=' + optsOk + ' ana=' + anaOk + ' detail=' + detailTxt.slice(0, 120));
    /* FAV-06 重做：先答错再（另一条）答对，attempts 字节不变 */
    const attemptsBefore = await lsGet(page, 'aipm.attempts.v1');
    await page.evaluate(() => { document.querySelector('#fav-list .fav-item .fav-redo-btn').click(); });
    await page.waitForTimeout(200);
    const wrongLetter = ['A', 'B', 'C', 'D'].find(L => L !== q.answer);
    await page.evaluate(i => { document.querySelectorAll('#fav-list .fav-item .fav-redo .p-opt')[i].click(); }, 'ABCD'.indexOf(wrongLetter));
    await page.waitForTimeout(200);
    const verdictWrong = await page.evaluate(() => { const v = document.querySelector('#fav-list .fav-item .fav-redo-verdict'); return v ? v.textContent : ''; });
    /* 第二条答对 */
    await page.evaluate(() => { document.querySelectorAll('#fav-list .fav-item')[1].querySelector('.fav-redo-btn').click(); });
    await page.waitForTimeout(200);
    const q0 = bank2[0];
    await page.evaluate(i => { document.querySelectorAll('#fav-list .fav-item')[1].querySelectorAll('.fav-redo .p-opt')[i].click(); }, 'ABCD'.indexOf(q0.answer));
    await page.waitForTimeout(200);
    const verdictRight = await page.evaluate(() => { const items2 = document.querySelectorAll('#fav-list .fav-item'); const v = items2[1].querySelector('.fav-redo-verdict'); return v ? v.textContent : ''; });
    const attemptsAfter = await lsGet(page, 'aipm.attempts.v1');
    check('FAV-06', '重做即时判对错且 attempts 字节不变、无新测评记录',
      verdictWrong.includes('正确答案是 ' + q.answer) && verdictRight.includes('答对了') && attemptsBefore === attemptsAfter,
      'wrong=' + verdictWrong.slice(0, 60) + ' | right=' + verdictRight.slice(0, 40) + ' | attemptsSame=' + (attemptsBefore === attemptsAfter));
    /* FAV-07 收藏夹内取消收藏 → 逐条移除至空状态 */
    await page.evaluate(() => { document.querySelector('#fav-list .fav-item .fav-remove-btn').click(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const b = document.querySelector('#fav-list .fav-item .fav-remove-btn'); if (b) b.click(); });
    await page.waitForTimeout(200);
    const left = await page.evaluate(() => document.querySelectorAll('#fav-list .fav-item').length);
    const emptyVis = await page.evaluate(() => { const e = document.getElementById('fav-empty'); return e && e.style.display !== 'none' && e.offsetParent !== null || (e && getComputedStyle(e).display !== 'none' && document.querySelectorAll('#fav-list .fav-item').length === 0); });
    const storedAfter = await lsJSON(page, 'aipm.favorites.v1');
    check('FAV-07', '收藏夹内取消收藏后条目消失、空状态出现',
      left === 0 && !!emptyVis && Array.isArray(storedAfter) && storedAfter.length === 0,
      'left=' + left + ' stored=' + (storedAfter && storedAfter.length));
    await ctx.close();
  }

  /* ===== FAV-08：跨页同步（答题页 → 结果页 → 收藏夹） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await startQuiz(page);
    const q1 = await currentBankQ(page);
    await page.click('#q-fav');
    await page.waitForTimeout(120);
    /* 答完 18 题：收藏题故意答错，使其进入结果页弱点诊断逐题块（.fav-toggle 所在处）；
       其余混合对错保证诊断块多样性 */
    await answerCurrent(page, 'wrong');
    for (let i = 0; i < 17; i++) {
      if ((await activeView(page)) === 'view-result') break;
      await answerCurrent(page, i % 2 ? 'wrong' : 'correct');
    }
    const inResult = (await activeView(page)) === 'view-result';
    const toggles = await page.evaluate(() => [...document.querySelectorAll('#view-result .fav-toggle[data-fav-qid]')].map(b => ({ qid: b.getAttribute('data-fav-qid'), state: b.getAttribute('data-state') })));
    const hit = toggles.find(t => String(t.qid) === String(q1.id));
    check('FAV-08', '跨页同步·答题页收藏 → 结果页同题已收藏',
      inResult && !!hit && hit.state === 'on',
      'result=' + inResult + ' toggles=' + toggles.length + ' hit=' + JSON.stringify(hit));
    /* 在结果页取消第一道可操作收藏 → 收藏夹同步消失 */
    let syncOk = false, syncDetail = '';
    if (toggles.length) {
      const targetQid = toggles[0].qid;
      const before = await lsJSON(page, 'aipm.favorites.v1');
      const wasFav = (before || []).some(f => String(f.qid) === String(targetQid));
      await page.evaluate(qid => { const b = [...document.querySelectorAll('#view-result .fav-toggle[data-fav-qid]')].find(x => x.getAttribute('data-fav-qid') === qid); if (b) b.click(); }, String(targetQid));
      await page.waitForTimeout(200);
      const after = await lsJSON(page, 'aipm.favorites.v1');
      const nowFav = (after || []).some(f => String(f.qid) === String(targetQid));
      await gotoFavorites(page);
      const favStems = await page.evaluate(() => [...document.querySelectorAll('#fav-list .fav-item')].length);
      syncOk = wasFav !== nowFav || true; /* 切换本身生效即可；下面以存储为准判定同步 */
      syncOk = nowFav === !wasFav;
      syncDetail = 'qid=' + targetQid + ' was=' + wasFav + ' now=' + nowFav + ' favItems=' + favStems;
      /* 若取消了一条（was=true→now=false），收藏夹不得再含它：以条数与存储长度一致佐证 */
      if (wasFav && !nowFav) syncOk = syncOk && favStems === (after || []).length;
      if (!wasFav && nowFav) syncOk = syncOk && favStems === (after || []).length;
    }
    check('FAV-08', '跨页同步·结果页切换 → 存储与收藏夹同步', syncOk, syncDetail);
    await ctx.close();
  }

  /* ===== FAV-09：坏值矩阵 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const goodQ = await page.evaluate(() => window.QUIZ_BANK[0].id);
    const cases = [
      { name: '非数组字符串', raw: '"just-a-string"', expect: 0 },
      { name: '数字', raw: '12345', expect: 0 },
      { name: 'null字面量', raw: 'null', expect: 0 },
      { name: '条目缺字段', raw: JSON.stringify([{ qid: goodQ }, { ts: 123 }, {}]), expect: 0 },
      { name: '未知qid', raw: JSON.stringify([{ qid: 999999999, ts: Date.now() }]), expect: 0 },
      { name: '混合合法与坏条目+重复', raw: JSON.stringify([{ qid: goodQ, ts: Date.now() }, { qid: goodQ, ts: Date.now() }, { bad: 1 }]), expect: 1 },
      { name: '坏JSON', raw: '{corrupt!!', expect: 0 }
    ];
    const fails = [];
    for (const c of cases) {
      const e0 = pageErrors.length;
      await lsSet(page, 'aipm.favorites.v1', c.raw);
      await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
      await gotoFavorites(page);
      const n = await page.evaluate(() => document.querySelectorAll('#fav-list .fav-item').length);
      const view = await activeView(page);
      if (n !== c.expect || view !== 'view-favorites' || pageErrors.length !== e0) {
        fails.push(c.name + '→n=' + n + '/view=' + view + '/err=' + (pageErrors.length - e0));
      }
      await page.evaluate(() => window.localStorage.removeItem('aipm.favorites.v1'));
    }
    check('FAV-09', 'favorites 坏值矩阵（非数组/数字/null/缺字段/未知 qid → 不白屏、按空或过滤、pageerror 0）',
      fails.length === 0, fails.join(' | ') || '7 种坏值全过');
    await ctx.close();
  }

  /* ===== FAV-10：入口可达与空状态 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    /* 落地页收藏夹卡 */
    await page.evaluate(() => { document.querySelector('#favorites-slot button').click(); });
    await page.waitForTimeout(300);
    const v1 = await activeView(page);
    const empty1 = await page.evaluate(() => { const e = document.getElementById('fav-empty'); return !!e && e.textContent.includes('还没有收藏'); });
    /* 学习首页按钮 */
    await clickGoto(page, 'view-learn');
    await page.evaluate(() => { [...document.querySelectorAll('#view-learn [data-goto="view-favorites"]')][0].click(); });
    await page.waitForTimeout(300);
    const v2 = await activeView(page);
    check('FAV-10', '入口可达与空状态（落地页卡与学习页按钮均可进 view-favorites）',
      v1 === 'view-favorites' && v2 === 'view-favorites' && empty1,
      'landing=' + v1 + ' learn=' + v2 + ' empty=' + empty1);
    await ctx.close();
  }

  /* ===== DAT-12：旧版 10 键备份导入兼容 ===== */
  {
    const { ctx, page } = await newPage({ acceptDownloads: true });
    await goto(page);
    const payload10 = { app: 'ai-pm-coach', version: 1, exportedAt: new Date().toISOString(), data: {} };
    for (const k of TEN_KEYS) payload10.data[k] = null;
    payload10.data['aipm.attempts.v1'] = [{ id: 'old1', ts: Date.now(), records: [], dimScores: [60, 60, 60, 60, 60, 60], totalScore: 60 }];
    payload10.data['aipm.learn.v1'] = { learned: [0], practice: {}, lastPoint: 0, plan: null };
    const p10 = '/tmp/aipm-backup-10keys.json';
    fs.writeFileSync(p10, JSON.stringify(payload10));
    const e0 = pageErrors.length;
    await importFile(page, p10);
    const confirmShown = await page.evaluate(() => !!document.getElementById('data-import-confirm'));
    await page.click('#data-import-confirm-btn');
    await page.waitForTimeout(400);
    const favRaw = await lsGet(page, 'aipm.favorites.v1');
    const noteRaw = await lsGet(page, 'aipm.notes.v1');
    const counts = await readCounts(page);
    const msg = await textOf(page, '#data-mgmt-slot');
    check('DAT-12', '旧版 10 键备份导入兼容（成功、新键落 []、概览计数 0、无报错）',
      confirmShown && favRaw === '[]' && noteRaw === '[]' && counts.favorites === 0 && counts.notes === 0 && counts.attempts === 1
      && pageErrors.length === e0 && !!msg && msg.includes('导入完成'),
      'fav=' + favRaw + ' notes=' + noteRaw + ' counts=' + JSON.stringify(counts));
    await ctx.close();
  }

  /* ===== DAT-13：十二键往返 ===== */
  {
    const { ctx, page } = await newPage({ acceptDownloads: true });
    await goto(page);
    const seed = await page.evaluate(() => {
      const q = window.QUIZ_BANK[2];
      return { qid: q.id };
    });
    await lsSet(page, 'aipm.favorites.v1', [{ qid: seed.qid, ts: 1760000000000 }]);
    await lsSet(page, 'aipm.notes.v1', [{ id: 'note-seed-1', text: 'DAT-13 种子笔记正文', source: { type: 'custom', label: '自定义笔记' }, remark: '种子备注', createdAt: 1760000000000, updatedAt: 1760000001000 }]);
    await lsSet(page, 'aipm.attempts.v1', [{ id: 'd13', ts: Date.now(), records: [], dimScores: [65, 65, 65, 65, 65, 65], totalScore: 65 }]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    const favBefore = await lsGet(page, 'aipm.favorites.v1');
    const notesBefore = await lsGet(page, 'aipm.notes.v1');
    const countsBefore = await readCounts(page);
    const dlPromise = page.waitForEvent('download', { timeout: 8000 });
    await page.click('#data-export-btn');
    const dl = await dlPromise;
    const dlPath = '/tmp/aipm-backup-12keys.json';
    await dl.saveAs(dlPath);
    const payload = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
    const keysOk = JSON.stringify(Object.keys(payload.data).sort()) === JSON.stringify(TWELVE_KEYS.slice().sort());
    /* 清空 */
    await page.click('#data-clear-btn'); await page.waitForTimeout(250);
    const clearTxt = await textOf(page, '#data-clear-confirm');
    await page.click('#data-clear-confirm-btn'); await page.waitForTimeout(350);
    const presentAfterClear = await page.evaluate(ks => ks.filter(k => window.localStorage.getItem(k) !== null), TWELVE_KEYS);
    /* 导入还原 */
    await importFile(page, dlPath);
    await page.click('#data-import-confirm-btn'); await page.waitForTimeout(400);
    const favAfter = await lsGet(page, 'aipm.favorites.v1');
    const notesAfter = await lsGet(page, 'aipm.notes.v1');
    const countsAfter = await readCounts(page);
    check('DAT-13', '十二键往返（导出 12 键 → 清空 12 键全无 → 导入两键逐字还原、计数一致）',
      keysOk && !!clearTxt && clearTxt.includes('12 类') && presentAfterClear.length === 0
      && favAfter === favBefore && notesAfter === notesBefore
      && countsAfter.favorites === countsBefore.favorites && countsAfter.notes === countsBefore.notes && countsAfter.attempts === countsBefore.attempts,
      'keys=' + Object.keys(payload.data).length + ' clearLeft=' + presentAfterClear.length + ' favSame=' + (favAfter === favBefore) + ' notesSame=' + (notesAfter === notesBefore) + ' before=' + JSON.stringify(countsBefore) + ' after=' + JSON.stringify(countsAfter));
    await ctx.close();
  }

  await browser.close();
  console.log('\n==== FAV/DAT 汇总：PASS ' + pass + ' / FAIL ' + fail + ' / pageerror 总数 ' + pageErrors.length + ' ====');
  fs.writeFileSync('/tmp/fav-results.json', JSON.stringify({ pass, fail, results, pageErrors }, null, 1));
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FAV 脚本异常：', e); process.exit(2); });
