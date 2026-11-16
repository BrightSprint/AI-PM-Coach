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

/* AI PM Coach 批次 6 自测脚本：学习计划空态 + 「只学最弱维」待生效（PLN-07/08/09/10/12）
 * 运行：node 自测脚本-批次6-planfix.js
 * 无头 Chromium（playwright-core），对象为 ts-spaces 真源 index.html（file://）。
 * PLN-11（旧数据兼容）在 自测脚本-批次2-goallink.js 中以 Node 断言执行。
 * 结果逐条 PASS/FAIL 打印，汇总 JSON 落 /tmp/planfix-results.json。 */
const fs = require('fs');
const { chromium } = __playwright();
const BASE = AIPM_APP_URL;
const CHROME = __chromePath();
const CARGS = __chromeArgs();
const DIMS = ['AI 基础认知', '场景洞察', '产品设计', '数据与评估', '技术协作', '商业与落地'];

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
async function textOf(page, sel) { return page.evaluate(s => { const el = document.querySelector(s); return el ? el.textContent : null; }, sel); }
async function clickGoto(page, viewId) { await page.evaluate(id => { const el = document.querySelector('[data-goto="' + id + '"]'); if (el) el.click(); }, viewId); await page.waitForTimeout(280); }
async function clickPreset(page, frag) {
  await page.evaluate(f => { const b = [...document.querySelectorAll('#plan-panel-slot .preset-btn')].find(x => x.textContent.includes(f)); if (b) b.click(); }, frag);
  await page.waitForTimeout(260);
}
async function currentBankQ(page) {
  return page.evaluate(() => {
    const stem = document.querySelector('#q-stem').textContent;
    const dim = document.querySelector('#q-dim').textContent;
    const q = window.QUIZ_BANK.find(x => x.stem === stem && x.dimension === dim) || window.QUIZ_BANK.find(x => x.stem === stem);
    return q ? JSON.parse(JSON.stringify(q)) : null;
  });
}
async function answerCurrentRight(page) {
  const q = await currentBankQ(page);
  if (!q) throw new Error('题库未匹配当前题');
  await page.evaluate(i => { document.querySelectorAll('#q-options .opt')[i].click(); }, 'ABCD'.indexOf(q.answer));
  await page.waitForTimeout(60);
  await page.click('#q-next');
  await page.waitForTimeout(140);
}
async function completeQuizAllRight(page) {
  await clickGoto(page, 'view-intro');
  await page.click('#view-intro .doc-actions .btn-primary');
  await page.waitForTimeout(300);
  let guard = 0;
  while ((await activeView(page)) === 'view-quiz' && guard < 40) { await answerCurrentRight(page); guard++; }
  await page.waitForTimeout(300);
  return guard;
}

(async () => {
  browser = await chromium.launch({ executablePath: CHROME, args: CARGS });

  /* ===== PLN-07 首启空态呈现（全新存储） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    const panel = await textOf(page, '#plan-panel-slot');
    const onCount = await page.evaluate(() => document.querySelectorAll('#plan-panel-slot .preset-btn.is-on').length);
    const weakDisabled = await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .preset-btn')].find(x => x.textContent.includes('只学最弱维')); return b ? b.disabled : null; });
    const rows = await page.evaluate(() => document.querySelectorAll('.point-row').length);
    check('PLN-07', '首启计划面板呈空态：有「尚未设置学习目标」、无计划计数摘要', !!panel && panel.includes('尚未设置学习目标') && !panel.includes('计划内已学') && !panel.includes('计划知识点'),
      (panel || '').replace(/\s+/g, ' ').slice(0, 120));
    check('PLN-07', '空态下无预设被预亮、「只学最弱维」不禁用、路径仍列 27 个知识点', onCount === 0 && weakDisabled === false && rows === 27,
      'isOn=' + onCount + ' weakDisabled=' + weakDisabled + ' rows=' + rows);
    await ctx.close();
  }

  /* ===== PLN-12 待生效的取消与改选（全新存储） ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    await clickPreset(page, '只学最弱维');
    let cfg = await lsJSON(page, 'aipm.quizcfg.v1');
    const btnTxt1 = await page.evaluate(() => { const b = [...document.querySelectorAll('#plan-panel-slot .preset-btn')].find(x => x.textContent.includes('只学最弱维')); return b ? b.textContent : ''; });
    const seq = [cfg && cfg.weakestPending === true];
    check('PLN-12', '点选后进入待生效：weakestPending 落盘、按钮呈「待生效」、计划未生成',
      seq[0] && btnTxt1.includes('待生效') && (await lsJSON(page, 'aipm.learn.v1'))?.plan == null,
      'btn=' + btnTxt1);
    await clickPreset(page, '只学最弱维');
    cfg = await lsJSON(page, 'aipm.quizcfg.v1');
    seq.push(!!cfg && cfg.weakestPending === true);
    await clickPreset(page, '只学最弱维');
    cfg = await lsJSON(page, 'aipm.quizcfg.v1');
    seq.push(!!cfg && cfg.weakestPending === true);
    await clickPreset(page, '系统全学');
    cfg = await lsJSON(page, 'aipm.quizcfg.v1');
    const learn = await lsJSON(page, 'aipm.learn.v1');
    seq.push(!!cfg && cfg.weakestPending === true);
    check('PLN-12', '待生效可取消（true→false）、可改选系统全学（→false 且生成 all/27 计划）',
      seq.join() === 'true,false,true,false' && learn && learn.plan && learn.plan.mode === 'all' && learn.plan.pointIds.length === 27,
      'seq=' + seq.join('→') + ' plan=' + (learn && learn.plan && learn.plan.mode));
    await ctx.close();
  }

  /* ===== PLN-09 待生效全链路：预选 → 首次完整测评 → 自动生效 + 结果页提示一次 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await clickGoto(page, 'view-learn');
    await clickPreset(page, '只学最弱维');
    const cfgBefore = await lsJSON(page, 'aipm.quizcfg.v1');
    check('PLN-09', '预选落盘：weakestPending=true 且尚无计划', cfgBefore && cfgBefore.weakestPending === true && (await lsJSON(page, 'aipm.learn.v1'))?.plan == null);
    const answered = await completeQuizAllRight(page);
    const onResult = (await activeView(page)) === 'view-result';
    const note = await page.evaluate(() => { const el = document.getElementById('weakest-note'); return el ? { show: el.classList.contains('show'), txt: el.textContent } : null; });
    const attempts = await lsJSON(page, 'aipm.attempts.v1');
    const last = attempts && attempts[attempts.length - 1];
    /* 全对时六维同分，planFromWeakest 取首维（AI 基础认知）为最弱维 */
    const expWeak = last && last.dimScores ? last.dimScores.indexOf(Math.min(...last.dimScores)) : -1;
    const learn = await lsJSON(page, 'aipm.learn.v1');
    const cfg = await lsJSON(page, 'aipm.quizcfg.v1');
    check('PLN-09', '首次完整测评走完（18 题）并停在结果页', answered === 18 && onResult && !!last && Array.isArray(last.dimScores), 'answered=' + answered);
    check('PLN-09', '结果页出现一次「已生效」提示（含最弱维名）', !!note && note.show && note.txt.includes('已生效') && note.txt.includes(DIMS[expWeak]),
      note && note.txt.slice(0, 90));
    const POINTS_BY_DIM = [[0, 1, 2, 18, 19], [3, 4, 5, 20], [6, 7, 8, 21, 22], [9, 10, 11, 23, 24], [12, 13, 14, 25], [15, 16, 17, 26]];
    check('PLN-09', '自动生效：plan=weakest 且知识点恰为最弱维全部知识点',
      !!learn && !!learn.plan && learn.plan.mode === 'weakest' && learn.plan.dims.join() === DIMS[expWeak]
      && JSON.stringify(learn.plan.pointIds) === JSON.stringify(POINTS_BY_DIM[expWeak]),
      'plan=' + JSON.stringify(learn && learn.plan && { m: learn.plan.mode, d: learn.plan.dims, ids: learn.plan.pointIds }) + ' expWeak=' + expWeak);
    check('PLN-09', '待生效标记与一次性提示均已清空', !!cfg && cfg.weakestPending === false && cfg.weakestNotice == null,
      'pending=' + (cfg && cfg.weakestPending) + ' notice=' + (cfg && JSON.stringify(cfg.weakestNotice)));
    await clickGoto(page, 'view-learn');
    const panel = await textOf(page, '#plan-panel-slot');
    const noticeEls = await page.evaluate(() => document.querySelectorAll('#plan-panel-slot .plan-notice').length);
    check('PLN-09', '回学习页：摘要为只学最弱维、生效提示不重复出现', !!panel && panel.includes('只学最弱维') && panel.includes('计划内已学') && noticeEls === 0,
      'noticeEls=' + noticeEls);
    await ctx.close();
  }

  /* ===== PLN-08 无计划下完整测评可走完、且不自动生成计划 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    const answered = await completeQuizAllRight(page);
    const attempts = await lsJSON(page, 'aipm.attempts.v1');
    const learn = await lsJSON(page, 'aipm.learn.v1');
    await clickGoto(page, 'view-learn');
    const panel = await textOf(page, '#plan-panel-slot');
    check('PLN-08', '无计划完整测评可走完（18 题、1 条 attempt），且不自动生成计划、面板仍空态',
      answered === 18 && !!attempts && attempts.length === 1 && (!learn || learn.plan == null) && !!panel && panel.includes('尚未设置学习目标'),
      'answered=' + answered + ' attempts=' + (attempts && attempts.length));
    await ctx.close();
  }

  /* ===== PLN-10 有记录时原行为：立即生效、不产生待生效 ===== */
  {
    const { ctx, page } = await newPage();
    await goto(page);
    await lsSet(page, 'aipm.attempts.v1', [{ finishedAt: new Date().toISOString(), totalScore: 56, dimScores: [60, 55, 50, 45, 65, 70], testedDims: DIMS, records: [{ questionId: 11, dimension: '数据与评估', correct: false }] }]);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(350);
    await clickGoto(page, 'view-learn');
    await clickPreset(page, '只学最弱维');
    const learn = await lsJSON(page, 'aipm.learn.v1');
    const cfg = await lsJSON(page, 'aipm.quizcfg.v1');
    check('PLN-10', '有记录点「只学最弱维」立即生成数据与评估计划 [9,10,11,23,24]，无待生效标记',
      !!learn && !!learn.plan && learn.plan.mode === 'weakest' && JSON.stringify(learn.plan.pointIds) === JSON.stringify([9, 10, 11, 23, 24]) && (!cfg || cfg.weakestPending !== true),
      'plan=' + JSON.stringify(learn && learn.plan && learn.plan.pointIds));
    await ctx.close();
  }

  check('PLN-07~12', '全流程无 pageerror', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  await browser.close();
  console.log('\n==== 批次6 PLN 汇总：PASS ' + pass + ' / FAIL ' + fail + ' ====');
  fs.writeFileSync('/tmp/planfix-results.json', JSON.stringify({ pass, fail, results }, null, 1));
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('批次6 脚本异常：', e); process.exit(2); });
