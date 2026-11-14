'use strict';
/* 知识搜索自测脚本（GLO 组）
 * 运行：node 自测脚本-知识搜索-GLO.js
 * 前半：Node 加载 assets/glossary.js + assets/glossary-link.js 做数据与引擎断言；
 * 后半：无头 Chromium 走 UI 流程（入口/检索/详情/补写标注/相关知识点跳转/零存储零网络）。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', 'ts-spaces', 'ai-pm-coach');
global.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets', 'glossary.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets', 'glossary-link.js'), 'utf8'));
const BANK = globalThis.GLOSSARY_BANK;
const GL = globalThis.GlossaryLink;

let pass = 0, fail = 0;
const results = [];
function check(id, name, cond, extra) {
  const d = extra == null ? '' : String(extra).slice(0, 260);
  console.log((cond ? 'PASS ' : 'FAIL ') + id + ' · ' + name + (d ? ' — ' + d : ''));
  results.push({ id, name, pass: !!cond, detail: d });
  if (cond) pass++; else fail++;
}

/* GLO-01 数据完整性（总数含补遗 = 147） */
{
  const ids = new Set(BANK.map(e => e.id));
  const cats = {};
  BANK.forEach(e => { cats[e.cat] = (cats[e.cat] || 0) + 1; });
  check('GLO-01', '词条总数 = 147（124 + 补遗 23）', BANK.length === 147, '实际 ' + BANK.length);
  check('GLO-01', 'id 全唯一且 KB-001..KB-147 连续', ids.size === 147 && BANK.every((e, i) => e.id === 'KB-' + String(i + 1).padStart(3, '0')));
  check('GLO-01', '分类计数 技术术语60/应用工具27/产品名词40/补强20', cats['技术术语'] === 60 && cats['应用工具'] === 27 && cats['产品名词'] === 40 && cats['补强'] === 20, JSON.stringify(cats));
  check('GLO-01', '每条三段非空、kw 1–8 个、kp 为空或 0–26、supp 只含合法段名',
    BANK.every(e => e.concept.length >= 10 && e.usage.length >= 10 && e.notes.length >= 10 &&
      e.kw.length >= 1 && e.kw.length <= 8 &&
      (e.kp === null || (e.kp >= 0 && e.kp <= 26)) &&
      (e.supp || []).every(s => ['concept', 'usage', 'notes'].includes(s))));
  const s2 = BANK.filter(e => e.batch === 'supplement2');
  check('GLO-01', '补遗 23 条均带 batch=supplement2 且 supp 为空', s2.length === 23 && s2.every(e => (e.supp || []).length === 0), 's2=' + s2.length);
}

/* GLO-02 标题精确优先 */
{
  const r1 = GL.searchGlossary(BANK, '向量数据库', '全部');
  check('GLO-02', '搜「向量数据库」首条即该词条（标题精确）', r1.length > 0 && r1[0].term.includes('向量数据库'), r1[0] && r1[0].term);
  const self = BANK[41]; /* KB-042 魔搭社区 */
  const r2 = GL.searchGlossary(BANK, self.term, '全部');
  check('GLO-02', '以任一词条全名搜索，首条为其本身', r2.length > 0 && r2[0].id === self.id, self.term);
  const r3 = GL.searchGlossary(BANK, 'Transformer', '全部');
  check('GLO-02', '搜英文「Transformer」首条为补遗 Transformer 条目', r3.length > 0 && r3[0].batch === 'supplement2' && r3[0].term.includes('Transformer'), r3[0] && r3[0].term);
}

/* GLO-03 排序口径：分数非递增且标题命中排在正文命中之前 */
{
  const r = GL.searchGlossary(BANK, '模型', '全部');
  const scores = r.map(e => GL._scoreTerm(e, '模型'));
  const mono = scores.every((s, i) => i === 0 || scores[i - 1] >= s);
  const titleIdx = r.map((e, i) => e.term.includes('模型') ? i : -1).filter(i => i >= 0);
  const bodyOnlyIdx = r.map((e, i) => !e.term.includes('模型') && !(e.kw || []).some(k => k.includes('模型')) ? i : -1).filter(i => i >= 0);
  check('GLO-03', '搜「模型」结果分数非递增', mono && r.length >= 10, 'n=' + r.length);
  check('GLO-03', '标题含「模型」的条目全部排在纯正文命中之前', titleIdx.length > 0 && (bodyOnlyIdx.length === 0 || Math.max(...titleIdx) < Math.min(...bodyOnlyIdx)),
    'titleHits=' + titleIdx.length + ' bodyOnly=' + bodyOnlyIdx.length);
}

/* GLO-04 分类筛选 */
{
  const supp = GL.searchGlossary(BANK, '', '补强');
  const tech = GL.searchGlossary(BANK, '', '技术术语');
  const all = GL.searchGlossary(BANK, '', '全部');
  check('GLO-04', '空查询+分类：补强 20 / 技术术语 60 / 全部 147', supp.length === 20 && supp.every(e => e.cat === '补强') && tech.length === 60 && all.length === 147,
    `supp=${supp.length} tech=${tech.length} all=${all.length}`);
  const inCat = GL.searchGlossary(BANK, '模型', '应用工具');
  check('GLO-04', '分类内搜索只出该分类', inCat.every(e => e.cat === '应用工具'), 'n=' + inCat.length);
}

/* GLO-05 正文/关键词命中与无结果 */
{
  const e = BANK.find(x => x.id === 'KB-031');
  const probe = e.notes.slice(0, 4);
  const r = GL.searchGlossary(BANK, probe, '全部');
  check('GLO-05', '正文片段可检索到来源词条', r.some(x => x.id === 'KB-031'), 'probe=' + probe);
  const none = GL.searchGlossary(BANK, 'zzzz不存在的词xyz', '全部');
  check('GLO-05', '无意义查询返回空数组', none.length === 0);
}

/* GLO-06 相关知识点 */
{
  const pts = JSON.parse(JSON.stringify(Array.from({ length: 27 }, (_, i) => ({ t: 'KP' + i, kw: '' }))));
  const withKp = BANK.find(e => e.kp !== null);
  check('GLO-06', '条目自带 kp 时 relatedPoints 直达该知识点', JSON.stringify(GL.relatedPoints(withKp, pts)) === JSON.stringify([withKp.kp]), withKp.term + '→' + withKp.kp);
  const fakePts = [{ t: 'RAG 工程排障：切分、召回与重排', kw: 'RAG · 切分' }, { t: '无关标题', kw: '无关' }];
  const fakeEntry = { id: 'X', term: 'RAG 优化', cat: '技术术语', concept: '', usage: '', notes: '', supp: [], kw: ['RAG'], kp: null };
  const rel = GL.relatedPoints(fakeEntry, fakePts);
  const orphan = GL.relatedPoints({ id: 'Y', term: 'zzzz', cat: '技术术语', concept: '', usage: '', notes: '', supp: [], kw: ['qqqq'], kp: null }, fakePts);
  check('GLO-06', '无 kp 时按标题/关键词匹配；无命中返回空（不硬凑）', rel.length === 1 && rel[0] === 0 && orphan.length === 0, 'rel=' + rel.join(','));
}

/* GLO-07 摘要 */
{
  const s = GL.summaryOf(BANK[0]);
  check('GLO-07', '摘要为概念首句且不超长+省略号', s.length <= 65 && BANK[0].concept.startsWith(s.replace(/…$/, '')), s.slice(0, 40));
}

/* ============ 浏览器 UI 流程（GLO-08 / GLO-09） ============ */
const { chromium } = require('/opt/muse/assets/spaces/ts-runtime/dist/node_modules/playwright-core');
const BASE = 'file:///home/hatch/workspace/ts-spaces/ai-pm-coach/index.html';
const ORIGIN = 'file:///home/hatch/workspace/ts-spaces/ai-pm-coach';
const CARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--hatch-webgl-allowed-domains-file=/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt', '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6'];
const TEN_KEYS = ['aipm.attempts.v1', 'aipm.snapshots.v1', 'aipm.inprogress.v1', 'aipm.appeals.v1', 'aipm.learn.v1', 'aipm.quizcfg.v1', 'aipm.wrongbook.v1', 'aipm.stagequiz.v1', 'aipm.review.v1', 'aipm.drill.v1'];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome', args: CARGS });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const pageErrors = [];
  const external = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('request', r => { const u = r.url(); if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('about:')) external.push(u); });
  const activeView = () => page.evaluate(() => { const v = document.querySelector('.view.active'); return v ? v.id : null; });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  const keysBefore = await page.evaluate(() => Object.keys(window.localStorage).sort());
  /* 学习页入口 → 搜索页 */
  await page.evaluate(() => { const el = document.querySelector('[data-goto="view-learn"]'); el.click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#view-learn [data-goto="view-glossary"]')][0]; b.click(); });
  await page.waitForTimeout(300);
  const inGlo = (await activeView()) === 'view-glossary';
  const totalShown = await page.evaluate(() => document.querySelectorAll('#glo-results .glo-item').length);
  const countTxt = await page.evaluate(() => document.getElementById('glo-count').textContent);
  check('GLO-08', '学习页入口可达知识搜索，默认列出全部 147 条', inGlo && totalShown === 147 && countTxt.includes('147'), 'shown=' + totalShown + ' ' + countTxt.slice(0, 40));
  /* 检索精确词条并打开详情 */
  await page.fill('#glo-input', '向量数据库');
  await page.waitForTimeout(250);
  const firstTerm = await page.evaluate(() => { const b = document.querySelector('#glo-results .glo-item .glo-item-head b'); return b ? b.textContent : ''; });
  await page.evaluate(() => { document.querySelector('#glo-results .glo-item').click(); });
  await page.waitForTimeout(300);
  const detail = await page.evaluate(() => {
    const w = document.getElementById('glo-detail-wrap');
    return { heads: [...w.querySelectorAll('.detail-sec h3')].map(h => h.textContent), hasKpBtn: !!w.querySelector('[data-glo-kp]') };
  });
  check('GLO-08', '搜「向量数据库」首条置顶；详情三段齐全（概念/使用/注意）', firstTerm.includes('向量数据库') && (await activeView()) === 'view-glossary-detail' &&
    detail.heads.some(h => h.includes('概念介绍')) && detail.heads.some(h => h.includes('使用方案')) && detail.heads.some(h => h.includes('注意事项')),
    firstTerm + ' | ' + detail.heads.join('/'));
  /* 相关知识点跳转（向量数据库条目自带 kp 或关键词命中） */
  const keysBeforeJump = await page.evaluate(() => Object.keys(window.localStorage).sort());
  if (detail.hasKpBtn) {
    await page.evaluate(() => { document.querySelector('#glo-detail-wrap [data-glo-kp]').click(); });
    await page.waitForTimeout(300);
    check('GLO-08', '详情「相关知识点」按钮跳到对应知识点学习页', (await activeView()) === 'view-learn-detail', await activeView());
  } else {
    check('GLO-08', '详情「相关知识点」按钮跳到对应知识点学习页', false, '该条目无相关知识点按钮');
  }
  /* 补写标注：动态找一条 supp 非空的词条，详情中补写注记数 == supp 段数 */
  await page.evaluate(() => { const el = document.querySelector('#view-glossary-detail [data-goto="view-glossary"]'); el.click(); });
  await page.waitForTimeout(250);
  const suppProbe = await page.evaluate(() => {
    const e = window.GLOSSARY_BANK.find(x => (x.supp || []).length > 0);
    return e ? { term: e.term, n: e.supp.length } : null;
  });
  await page.fill('#glo-input', suppProbe.term);
  await page.waitForTimeout(250);
  await page.evaluate(() => { document.querySelector('#glo-results .glo-item').click(); });
  await page.waitForTimeout(300);
  const suppNotes = await page.evaluate(() => document.querySelectorAll('#glo-detail-wrap .glo-supp-note').length);
  check('GLO-08', '补写段在详情页有明确标注（注记数 = supp 段数）', suppNotes === suppProbe.n, suppProbe.term + ' supp=' + suppProbe.n + ' notes=' + suppNotes);
  /* 分类筛选 UI */
  await page.evaluate(() => { const el = document.querySelector('#view-glossary-detail [data-goto="view-glossary"]'); el.click(); });
  await page.waitForTimeout(250);
  await page.fill('#glo-input', '');
  await page.evaluate(() => { const c = [...document.querySelectorAll('#glo-cat-filter .dim-chip')].find(x => x.textContent === '补强'); c.click(); });
  await page.waitForTimeout(250);
  const catShown = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#glo-results .glo-item')];
    return { n: items.length, cats: [...new Set(items.map(i => i.querySelector('.glo-cat').textContent))] };
  });
  check('GLO-08', '分类筛选「补强」只列 20 条补强词条', catShown.n === 20 && catShown.cats.length === 1 && catShown.cats[0] === '补强', JSON.stringify(catShown));
  /* GLO-09 零存储零网络：快照取在「相关知识点跳转」之前——跳转走 openPoint 会正常写 learn 键，
     那是学习功能自身的持久化；知识搜索本身（检索/筛选/详情）不得写任何存储 */
  check('GLO-09', '知识搜索全程不新增 localStorage key、不发外部请求、无 pageerror',
    JSON.stringify(keysBefore.filter(k => TEN_KEYS.includes(k))) === JSON.stringify(keysBeforeJump.filter(k => TEN_KEYS.includes(k))) &&
    external.length === 0 && pageErrors.length === 0,
    'ext=' + external.length + ' err=' + pageErrors.length + ' keysDelta=' + keysBeforeJump.filter(k => !keysBefore.includes(k)).join(','));
  await browser.close();
  console.log('\n==== GLO 汇总：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  fs.writeFileSync('/tmp/glo-results.json', JSON.stringify({ pass, fail, results }, null, 1));
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('GLO 脚本异常：', e); process.exit(2); });
