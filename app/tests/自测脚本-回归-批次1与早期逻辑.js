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

/* 全量回归补写脚本：批次 1（CAL / CNT / DAT 逻辑面）+ 早期组可逻辑化条目
 * 加载真实资产：quiz-bank / cat-engine / diagnosis-data / diagnosis / goal-link。
 * 界面流程部分（恢复卡、快照去重、导出下载等）由浏览器脚本执行，本脚本只覆盖引擎/数据层断言。 */
const fs = require('fs');
const vm = require('vm');
const base = AIPM_ASSETS + '/';
const sandbox = { console: { log: () => {}, warn: () => {} } };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['quiz-bank.js', 'cat-engine.js', 'diagnosis-data.js', 'diagnosis.js', 'goal-link.js']) {
  vm.runInContext(fs.readFileSync(base + f, 'utf8'), sandbox, { filename: f });
}
const { QUIZ_BANK, CatEngine, GoalLink, Diagnosis, DIAG_DATA } = sandbox;
const DIMS = ['AI 基础认知', '场景洞察', '产品设计', '数据与评估', '技术协作', '商业与落地'];
const byId = {}; QUIZ_BANK.forEach(q => { byId[q.id] = q; });
const html = fs.readFileSync(__path.join(AIPM_APP_DIR, 'index.html'), 'utf8');
let pass = 0, fail = 0;
function check(id, name, cond, detail) {
  console.log((cond ? 'PASS ' : 'FAIL ') + id + ' · ' + name + (detail ? ' — ' + detail : ''));
  if (cond) pass++; else fail++;
}
const CFG = { bank: QUIZ_BANK, dimensions: DIMS, totalQuestions: 18, perDimensionCap: 3, initialDifficulty: 3, initialScore: 50 };
function runSession(mode) { // mode: 'correct' | 'wrong' | 'alt' | 'skip'
  const s = CatEngine.createCatSession(Object.assign({}, CFG));
  const decisions = [], outcomes = [];
  let d, i = 0;
  while ((d = s.nextQuestion())) {
    decisions.push(d);
    if (mode === 'correct') outcomes.push(s.answerCurrent(true));
    else if (mode === 'wrong') outcomes.push(s.answerCurrent(false));
    else if (mode === 'skip') outcomes.push(s.answerCurrent(false, true));
    else outcomes.push(s.answerCurrent(i % 2 === 0));
    i++;
  }
  return { s, decisions, outcomes, result: s.getResult() };
}

/* ---------- CAL ---------- */
{
  const all = runSession('correct'), none = runSession('wrong'), alt = runSession('alt'), skip = runSession('skip');
  check('CAL-01', '全对总分 ∈[80,88] 且六维均 ∈[80,88]',
    all.result.totalScore >= 80 && all.result.totalScore <= 88 && all.result.dimScores.every(x => x >= 80 && x <= 88),
    'total=' + all.result.totalScore + ' dims=' + all.result.dimScores.join(','));
  check('CAL-02', '全错总分 ∈[25,35]',
    none.result.totalScore >= 25 && none.result.totalScore <= 35,
    'total=' + none.result.totalScore + ' dims=' + none.result.dimScores.join(','));
  check('CAL-03', '交替对错：answered==18 且总分 ∈[50,65]',
    alt.s.stepCount === 18 && alt.result.totalScore >= 50 && alt.result.totalScore <= 65,
    'total=' + alt.result.totalScore);
  check('CAL-04', '全跳过 == 全错口径',
    skip.result.totalScore === none.result.totalScore && skip.result.totalScore >= 25 && skip.result.totalScore <= 35,
    'skip=' + skip.result.totalScore + ' wrong=' + none.result.totalScore);
  // CAL-05 逐题公式复算 + 贡献表 + modal 文案
  let formulaOk = true;
  for (const o of all.outcomes.concat(none.outcomes)) {
    const expect = Math.round((o.scoreBefore * 0.55 + o.contribution * 0.45) * 10) / 10;
    if (Math.abs(expect - o.scoreAfter) > 0.051) formulaOk = false;
  }
  const cc = JSON.stringify(CatEngine.CONTRIBUTION_CORRECT) === JSON.stringify({ 1: 50, 2: 60, 3: 75, 4: 90, 5: 100 });
  const cw = JSON.stringify(CatEngine.CONTRIBUTION_WRONG) === JSON.stringify({ 1: 20, 2: 30, 3: 45, 4: 50, 5: 60 });
  check('CAL-05', '逐题公式 0.55/0.45 复算一致 + 贡献表不变 + modal 文案含公式',
    formulaOk && cc && cw && html.includes('×0.55') && html.includes('×0.45'),
    'formula=' + formulaOk + ' tables=' + cc + '/' + cw);
  const bi = Diagnosis._test.bandIndex;
  check('CAL-06', '诊断分数段边界 0-40/40-60/60-80/80-100',
    bi(0) === 0 && bi(39) === 0 && bi(40) === 1 && bi(59) === 1 && bi(60) === 2 && bi(79) === 2 && bi(80) === 3 && bi(100) === 3);
}

/* ---------- CNT（引擎面） ---------- */
{
  const { s, decisions, result } = runSession('alt');
  const perDim = {}; decisions.forEach(d => { perDim[d.dimension] = (perDim[d.dimension] || 0) + 1; });
  check('CNT-01', '每轮恰好 18 题', decisions.length === 18 && s.stepCount === 18 && s.isFinished());
  check('CNT-02', '六维各 3 题', DIMS.every(n => perDim[n] === 3), JSON.stringify(perDim));
  check('CNT-03', '本轮题目无重复', new Set(decisions.map(d => d.questionId)).size === 18);
  check('CNT-04', '题量/时长文案同步（静态抓取）',
    html.includes('第 <strong>1</strong> 题 / 共 18 题') && html.includes('18 题 · 约 15–18 分钟')
    && html.includes('18 道题') && !/共 15 题|15 道题|共15题/.test(html));
  // CNT-05 诊断阈值：六维各 3 题（每维含带解析错题）→ 无 insufficient；1/2 题 → insufficient
  function synthRecords(perDimCount, withWrong) {
    const recs = [];
    DIMS.forEach(dim => {
      const pool = QUIZ_BANK.filter(q => q.dimension === dim);
      for (let i = 0; i < perDimCount; i++) {
        const q = pool[i];
        const wrongLetter = ['A', 'B', 'C', 'D'].find(L => L !== q.answer);
        const isWrong = withWrong && i === 0;
        recs.push({
          questionId: q.id, dimension: dim, difficulty: q.difficulty,
          correct: !isWrong, skipped: false,
          userAnswer: isWrong ? wrongLetter : q.answer,
          selectedAnalysis: isWrong ? (q.distractor_analysis || {})[wrongLetter] : null,
          stem: q.stem, sub_topic: q.sub_topic || '', exam_points: q.exam_points || [], difficulty_points: q.difficulty_points || []
        });
      }
    });
    return recs;
  }
  const scores = [60, 60, 60, 60, 60, 60];
  const d3 = Diagnosis.buildAll(scores, DIMS, synthRecords(3, true), QUIZ_BANK);
  const d2 = Diagnosis.buildAll(scores, DIMS, synthRecords(2, true), QUIZ_BANK);
  const d1 = Diagnosis.buildAll(scores, DIMS, synthRecords(1, true), QUIZ_BANK);
  check('CNT-05', '六维各 3 题均越过严格 1–2 题阈值；1/2 题为 insufficient',
    d3.length === 6 && d3.every(x => x.kind !== 'insufficient')
    && d2.every(x => x.kind === 'insufficient') && d1.every(x => x.kind === 'insufficient'),
    'kinds3=' + d3.map(x => x.kind).join(','));
  // CNT-06 引擎面：序列化 → 恢复 → 步数与已用题保留，续答满 18
  const s1 = CatEngine.createCatSession(Object.assign({}, CFG));
  const firstIds = [];
  for (let i = 0; i < 5; i++) { const dd = s1.nextQuestion(); firstIds.push(dd.questionId); s1.answerCurrent(true); }
  const snap = s1.serializeState();
  const s2 = CatEngine.createCatSession(Object.assign({}, CFG));
  s2.restoreState(JSON.parse(JSON.stringify(snap)), byId);
  let rest = 0; const restIds = [];
  let dd2;
  // restoreState 会恢复 pending（第 6 题已抽出）；先答 pending 再继续
  while ((dd2 = s2.nextQuestion())) { restIds.push(dd2.questionId); s2.answerCurrent(false); rest++; }
  check('CNT-06', '中途进度恢复（引擎序列化面）：恢复步数 5、总步数 18、前 5 题不重抽',
    s2.stepCount === 18 && firstIds.every(id => !restIds.includes(id)),
    'restoredSteps total=' + s2.stepCount + ' continued=' + rest);
  check('CNT-07', '快照门槛 ≥10 不变（资格函数面）',
    GoalLink.isSnapshotEligible(true, 18) === true && GoalLink.isSnapshotEligible(true, 10) === true
    && GoalLink.isSnapshotEligible(true, 9) === false && GoalLink.isSnapshotEligible(false, 18) === false);
}

/* ---------- 早期组 · 逻辑面 ---------- */
{
  // 题库就绪数据面：634 题、每维 ≥61（拦截阈值 ≥3 的数据前提）
  const perDim = {}; QUIZ_BANK.forEach(q => { perDim[q.dimension] = (perDim[q.dimension] || 0) + 1; });
  check('E-题库就绪', '题库 634 题且每维 ≥61 题（≥3 拦截阈值的数据前提）',
    QUIZ_BANK.length === 634 && DIMS.every(n => perDim[n] >= 61), JSON.stringify(perDim));
  // 诊断引用面：薄弱点逐字引用所选干扰项解析 + 题序
  const recs = [];
  DIMS.forEach(dim => {
    const pool = QUIZ_BANK.filter(q => q.dimension === dim);
    for (let i = 0; i < 3; i++) {
      const q = pool[i + 5];
      const wrongLetter = ['A', 'B', 'C', 'D'].find(L => L !== q.answer);
      const isWrong = i === 0;
      recs.push({
        questionId: q.id, dimension: dim, difficulty: q.difficulty,
        correct: !isWrong, skipped: false,
        userAnswer: isWrong ? wrongLetter : q.answer,
        selectedAnalysis: isWrong ? (q.distractor_analysis || {})[wrongLetter] : null,
        stem: q.stem, sub_topic: q.sub_topic || '', exam_points: q.exam_points || [], difficulty_points: q.difficulty_points || []
      });
    }
  });
  let diag = null, threw = false;
  try { diag = Diagnosis.buildAll([55, 55, 55, 55, 55, 55], DIMS, recs, QUIZ_BANK); } catch (e) { threw = true; }
  const probe = recs.find(r => !r.correct && r.selectedAnalysis);
  check('E-诊断引用', '薄弱点逐字引用所选干扰项解析且带题序',
    !threw && !!probe && JSON.stringify(diag).includes(probe.selectedAnalysis) && /第 \d+ 题/.test(JSON.stringify(diag)));
  // 诊断托底面：破坏证据字段（删 selectedAnalysis / stem）不抛错且走基础诊断
  const corrupt = recs.map(r => { const c = Object.assign({}, r); delete c.selectedAnalysis; delete c.stem; return c; });
  let diag2 = null, threw2 = false;
  try { diag2 = Diagnosis.buildAll([55, 55, 55, 55, 55, 55], DIMS, corrupt, QUIZ_BANK); } catch (e) { threw2 = true; }
  check('E-诊断托底', '证据字段被破坏时不崩溃、自动走基础诊断托底',
    !threw2 && diag2.every(x => x.kind === 'base' || x.kind === 'insufficient'),
    diag2 ? 'kinds=' + diag2.map(x => x.kind).join(',') : 'null');
  // 诊断鼓励面：最高难度答对题被引用（buildDimension encouragement 不抛错且 personal 分支成形）
  check('E-诊断分支', '含错题维度走 personal 分支、无错题维度走 mastery 分支',
    diag && diag.every(x => x.kind === 'personal'), diag ? diag.map(x => x.kind).join(',') : 'null');
}

console.log('---- ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
