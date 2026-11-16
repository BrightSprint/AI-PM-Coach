/* 批次 4 自测脚本（Node 可执行部分）：面试演练 DRL 组 + DAT-02R 十键修订
 * 运行：node 自测脚本-批次4-drill.js
 * 加载真实资产 assets/drill-bank.js 与 assets/drill-link.js，并静态核对 index.html 的 DATA_KEYS。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'ts-spaces', 'ai-pm-coach');

const vm = require('vm');
global.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets', 'drill-bank.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'assets', 'drill-link.js'), 'utf8'));
const BANK = globalThis.DRILL_BANK;
const DL = globalThis.DrillLink;

let pass = 0, fail = 0;
function check(id, name, cond, extra) {
  if (cond) { pass++; console.log(`PASS ${id} · ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`FAIL ${id} · ${name}${extra ? ' — ' + extra : ''}`); }
}

/* DRL-01 数据完整性 */
{
  const ids = new Set(BANK.map(e => e.gid));
  const SEGS = ['ask', 'explain', 'case', 'pitfalls', 'followup'];
  const badSeg = BANK.filter(e => SEGS.some(k => !e.sections || typeof e.sections[k] !== 'string' || e.sections[k].length < 10));
  const noQ = BANK.filter(e => !e.question);
  const noDim = BANK.filter(e => !e.dimension).map(e => e.gid);
  check('DRL-01', '条目数 = 547', BANK.length === 547, `实际 ${BANK.length}`);
  check('DRL-01', 'gid 全唯一', ids.size === BANK.length, `唯一 ${ids.size}`);
  check('DRL-01', '五段齐全率 100%（缺段 0 条）', badSeg.length === 0, badSeg.length ? '缺段：' + badSeg.map(e => e.gid).join(',') : 'G39 第三段为原稿变体标题「六个坑逐个拆透」，内容为实机案例，已映射 case 段并在此注明');
  check('DRL-01', '题干齐全', noQ.length === 0);
  check('DRL-01', '维度覆盖 544/547（无对应原题的 E7/E8/E45 为 null，不填充）',
    noDim.length === 3 && noDim.join(',') === 'E7,E8,E45', '无维度：' + noDim.join(','));
}

/* DRL-02 维度筛选只出该维 */
{
  const DIMS = ['AI 基础认知', '场景洞察', '产品设计', '数据与评估', '技术协作', '商业与落地'];
  let ok = true, detail = [];
  DIMS.forEach(d => {
    const got = DL.filterBank(BANK, {}, { dim: d, mode: 'all' });
    const want = BANK.filter(e => e.dimension === d).length;
    if (!got.every(e => e.dimension === d) || got.length !== want) ok = false;
    detail.push(`${d}:${got.length}`);
  });
  check('DRL-02', '六维筛选结果只含该维且计数与题库一致', ok, detail.join(' '));
}

/* DRL-03 待加强筛选只含模糊/不会 + 排序 */
{
  let store = {};
  store = DL.applyRating(store, BANK[0].gid, 'fuzzy', '2026-11-10T10:00:00.000Z');
  store = DL.applyRating(store, BANK[1].gid, 'unknown', '2026-11-12T10:00:00.000Z');
  store = DL.applyRating(store, BANK[2].gid, 'mastered', '2026-11-13T10:00:00.000Z');
  store = DL.applyRating(store, BANK[3].gid, 'fuzzy', '2026-11-11T10:00:00.000Z');
  const weak = DL.filterBank(BANK, store, { mode: 'weak' });
  const wl = DL.weakList(BANK, store);
  check('DRL-03', 'weak 筛选只含模糊/不会', weak.length === 3 && weak.every(e => ['fuzzy', 'unknown'].includes(store[e.gid].rating)));
  check('DRL-03', '待加强列表按最近自评倒序', wl.map(w => w.entry.gid).join(',') === [BANK[1].gid, BANK[3].gid, BANK[0].gid].join(','), wl.map(w => w.entry.gid).join(','));
  const unp = DL.filterBank(BANK, store, { mode: 'unpracticed' });
  check('DRL-03', '只练没练过的 = 547-4', unp.length === 543, `实际 ${unp.length}`);
}

/* DRL-04 自评持久化往返 */
{
  const shim = {};
  const fakeLS = {
    getItem: k => (k in shim ? shim[k] : null),
    setItem: (k, v) => { shim[k] = String(v); },
    removeItem: k => { delete shim[k]; }
  };
  let store = {};
  store = DL.applyRating(store, 'G35', 'fuzzy', '2026-11-13T01:00:00.000Z');
  store = DL.applyRating(store, 'G35', 'mastered', '2026-11-13T02:00:00.000Z');
  store = DL.applyRating(store, 'G3', 'unknown', '2026-11-13T03:00:00.000Z');
  fakeLS.setItem(DL.DRILL_KEY, JSON.stringify(store));
  const back = DL.normalizeStore(JSON.parse(fakeLS.getItem(DL.DRILL_KEY)));
  check('DRL-04', '写入→读回往返一致', JSON.stringify(back) === JSON.stringify(store));
  check('DRL-04', '同题重复自评 count 累加且以最新为准', back['G35'].count === 2 && back['G35'].rating === 'mastered' && back['G35'].lastAt === '2026-11-13T02:00:00.000Z');
  check('DRL-04', '非法 rating 被规整剔除', Object.keys(DL.normalizeStore({ G1: { rating: 'great' } })).length === 0);
  const st = DL.stats(BANK, back);
  check('DRL-04', '统计与存储一致（已练 2 / 掌握 1 / 不会 1）', st.practiced === 2 && st.mastered === 1 && st.unknown === 1 && st.total === 547);
}

/* DRL-05 组题量 3/5/10 精确 */
{
  let seed = 42;
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const g3 = DL.pickGroup(BANK, 3, rng), g5 = DL.pickGroup(BANK, 5, rng), g10 = DL.pickGroup(BANK, 10, rng);
  const uniq = a => new Set(a.map(e => e.gid)).size === a.length;
  check('DRL-05', '组题量精确 3/5/10 且组内不重复', g3.length === 3 && g5.length === 5 && g10.length === 10 && uniq(g3) && uniq(g5) && uniq(g10));
  check('DRL-05', '池小于组题量时取全部', DL.pickGroup(BANK.slice(0, 2), 10, rng).length === 2);
  check('DRL-05', '非法组题量回落 5', DL.pickGroup(BANK, 7, rng).length === 5);
}

/* DRL-06 / DAT-02R：index.html 数据键恰为十二键【批次 5 口径同步】 */
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = html.match(/var DATA_KEYS = \[([^\]]+)\]/);
  const keys = m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort() : [];
  const want = ['aipm.appeals.v1', 'aipm.attempts.v1', 'aipm.drill.v1', 'aipm.favorites.v1', 'aipm.inprogress.v1', 'aipm.learn.v1', 'aipm.notes.v1', 'aipm.quizcfg.v1', 'aipm.review.v1', 'aipm.snapshots.v1', 'aipm.stagequiz.v1', 'aipm.wrongbook.v1']; /* 【批次 5 口径同步】十键→十二键 */
  check('DRL-06', 'DATA_KEYS 恰为十二键（含 aipm.drill.v1 与批次 5 两新键）【批次 5 同步】', JSON.stringify(keys) === JSON.stringify(want), keys.join(','));
  check('DRL-06', '导入校验对象键含 aipm.drill.v1', html.includes("'aipm.drill.v1'") && /objKeys = \[[^\]]*aipm\.drill\.v1/.test(html));
}

/* DRL-07 正文渲染安全与结构 */
{
  const h = DL.mdToHtml('## notused\n#### 小节\n\n正文 **粗体** 与 `code` 与 <script>alert(1)</' + 'script>\n\n- 甲\n- 乙\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
  check('DRL-07', 'mdToHtml 转义脚本标签', !h.includes('<script>') && h.includes('&lt;script&gt;'));
  check('DRL-07', 'mdToHtml 渲染粗体/列表/表格', h.includes('<strong>粗体</strong>') && h.includes('<li>甲</li>') && h.includes('<td>2</td>'));
  const real = DL.mdToHtml(BANK[0].sections.explain);
  check('DRL-07', '真实条目正文可渲染且非空', real.length > 200);
}

console.log(`\n合计：PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
