'use strict';
/* 批次 2 自测：Node 加载真实资产脚本执行 PLN / SET / MAT / PRC 用例 + 批次1回归抽查 */
const fs = require('fs');
const vm = require('vm');
const base = '/home/hatch/workspace/ts-spaces/ai-pm-coach/assets/';
const sandbox = { console: { log: () => {}, warn: () => {} } };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ['quiz-bank.js', 'cat-engine.js', 'diagnosis-data.js', 'diagnosis.js', 'goal-link.js']) {
  vm.runInContext(fs.readFileSync(base + f, 'utf8'), sandbox, { filename: f });
}
const { QUIZ_BANK, CatEngine, GoalLink, DIAG_DATA } = sandbox;
const DIMS = ['AI 基础认知', '场景洞察', '产品设计', '数据与评估', '技术协作', '商业与落地'];
const DIM_INDEX = {}; DIMS.forEach((d, i) => DIM_INDEX[d] = i);
const POINT_STAGES = [0,0,0,1,1,1,2,2,2,3,3,3,4,4,4,5,5,5,0,0,1,2,2,3,3,4,5];
const bankById = {}; QUIZ_BANK.forEach(q => bankById[q.id] = q);
let pass = 0, fail = 0; const results = [];
function check(id, name, cond, detail) {
  results.push({ id, name, ok: !!cond, detail: detail || '' });
  if (cond) pass++; else fail++;
}
function runSession(cfg, answerFn) {
  const s = CatEngine.createCatSession(Object.assign({ bank: QUIZ_BANK }, cfg));
  const decisions = [];
  let d;
  while ((d = s.nextQuestion())) { decisions.push(d); s.answerCurrent(answerFn(d)); }
  return { s, decisions, result: s.getResult() };
}

/* ---------- PLN ---------- */
// PLN-01 计划保存后重读一致（JSON 往返 + normalize 幂等）
{
  const plan = { mode: 'custom', dims: ['AI 基础认知', '数据与评估'], pointIds: [0, 1, 19, 9, 23], pinnedFirst: [23] };
  const saved = JSON.stringify({ learned: [], practice: {}, lastPoint: 0, plan });
  const reread = JSON.parse(saved).plan;
  const n1 = GoalLink.normalizePlan(reread, DIMS, POINT_STAGES);
  const n2 = GoalLink.normalizePlan(n1, DIMS, POINT_STAGES);
  check('PLN-01', '计划保存后重读一致', JSON.stringify(n1) === JSON.stringify(n2)
    && n1.pointIds.join() === '0,1,19,9,23' && n1.pinnedFirst.join() === '23'
    && n1.dims.join() === 'AI 基础认知,数据与评估', JSON.stringify(n1));
}
// PLN-02 预设 weakest 取的维度 == 最近成绩最弱维
{
  const scores = [72, 41, 66, 58, 63, 70];
  const p = GoalLink.planFromWeakest(scores, DIMS, POINT_STAGES);
  check('PLN-02', '只学最弱维预设维度正确', p && p.dims[0] === '场景洞察' && p.pointIds.join() === '3,4,5,20' && p.weakestIndex === 1, p && p.dims[0]);
  check('PLN-02b', '无成绩时 weakest 预设返回 null', GoalLink.planFromWeakest(null, DIMS, POINT_STAGES) === null);
}
// PLN-03 默认（无 plan）== 系统全学 27 点
{
  const p = GoalLink.normalizePlan(null, DIMS, POINT_STAGES);
  check('PLN-03', '无计划时默认全学', p.mode === 'all' && p.pointIds.length === 27 && p.dims.length === 6);
}
// PLN-04 置顶顺序：pinnedFirst 在最前
{
  const ordered = GoalLink.orderedPlanPoints({ mode: 'custom', dims: [], pointIds: [3, 9, 23, 0], pinnedFirst: [23, 9] });
  check('PLN-04', '置顶知识点排在计划最前', ordered.join() === '23,9,0,3', ordered.join());
}

/* ---------- SET ---------- */
// SET-01 子集维度抽题只出所选维度
{
  const dims = ['AI 基础认知', '产品设计', '技术协作'];
  const { decisions } = runSession({ dimensions: dims, totalQuestions: 12, perDimensionCap: 4, initialDifficulty: 3, initialScore: 50 }, () => true);
  const perDim = {}; decisions.forEach(d => perDim[d.dimension] = (perDim[d.dimension] || 0) + 1);
  check('SET-01', '子集抽题只出所选维度', decisions.length === 12 && decisions.every(d => dims.includes(d.dimension))
    && dims.every(n => perDim[n] === 4), JSON.stringify(perDim));
}
// SET-02 count=12 时总题数 == 12（全维）
{
  const { s, decisions } = runSession({ dimensions: DIMS, totalQuestions: 12, perDimensionCap: 2, initialDifficulty: 3, initialScore: 50 }, () => false);
  check('SET-02', 'count=12 总题数==12', decisions.length === 12 && s.stepCount === 12 && s.isFinished());
}
// SET-03 startDiff=basic 时各维初始难度 == 2
{
  const s = CatEngine.createCatSession({ dimensions: DIMS, bank: QUIZ_BANK, totalQuestions: 18, perDimensionCap: 3, initialDifficulty: GoalLink.startDifficulty({ startDiff: 'basic' }), initialScore: 50 });
  const st = s.getState();
  const d1 = s.nextQuestion();
  check('SET-03', '难度起点 basic → 初始难度 2', st.every(x => x.currentDifficulty === 2) && d1.targetDifficulty === 2,
    'state=' + st.map(x => x.currentDifficulty).join() + ' firstTarget=' + d1.targetDifficulty);
  check('SET-03b', '难度映射表', GoalLink.startDifficulty({ startDiff: 'adaptive' }) === 3 && GoalLink.startDifficulty({ startDiff: 'advanced' }) === 4);
}
// SET-04 wrongfirst：首批候选优先命中历史错题集
{
  // 取 AI 基础认知 中一道难度 3 的题作为唯一历史错题
  const target = QUIZ_BANK.find(q => q.dimension === 'AI 基础认知' && q.difficulty === 3);
  const wrongIds = {}; wrongIds[target.id] = true;
  const avoid = {}; QUIZ_BANK.forEach(q => { if (q.id !== target.id) avoid[q.id] = true; }); // 其余全部算已答（模拟历史）
  const s = CatEngine.createCatSession({ dimensions: ['AI 基础认知'], bank: QUIZ_BANK, totalQuestions: 5, perDimensionCap: 5, initialDifficulty: 3, initialScore: 50, avoidIds: avoid, wrongIds, wrongFirst: true });
  const d1 = s.nextQuestion();
  check('SET-04', '错题优先命中历史错题', d1 && d1.questionId === target.id && d1.wrongPreferred === true,
    d1 && ('qid=' + d1.questionId + ' wrongPreferred=' + d1.wrongPreferred));
}
// SET-05 scope=all 不做历史过滤（avoid 为空时 reused 全 false 属正常；用全 avoid 对照）
{
  const avoidAll = {}; QUIZ_BANK.forEach(q => avoidAll[q.id] = true);
  const a = runSession({ dimensions: DIMS, totalQuestions: 18, perDimensionCap: 3, initialDifficulty: 3, initialScore: 50, avoidIds: avoidAll }, () => true);
  const b = runSession({ dimensions: DIMS, totalQuestions: 18, perDimensionCap: 3, initialDifficulty: 3, initialScore: 50, avoidIds: {} }, () => true);
  check('SET-05', '全部范围不避旧题 / 未答优先全避旧', a.decisions.every(d => d.reused) && b.decisions.every(d => !d.reused));
}
// SET-06 每维题数推算（校验提示口径）
{
  const r1 = GoalLink.perDimRange({ count: 12, dims: DIMS });
  const r2 = GoalLink.perDimRange({ count: 18, dims: DIMS });
  const r3 = GoalLink.perDimRange({ count: 24, dims: DIMS.slice(0, 4) });
  check('SET-06', '每维题数推算', r1.min === 2 && r1.max === 2 && r2.min === 3 && r3.min === 6 && r3.cap === 6,
    JSON.stringify({ r1, r2, r3 }));
}
// SET-07 quizcfg 规整：非法值回落默认、至少一维
{
  const c = GoalLink.normalizeQuizCfg({ count: 99, dims: ['不存在维'], startDiff: 'x', scope: 'y' }, DIMS);
  const c2 = GoalLink.normalizeQuizCfg({ count: 24, dims: ['技术协作', 'AI 基础认知'], startDiff: 'advanced', scope: 'all' }, DIMS);
  check('SET-07', 'quizcfg 规整与维度保序', c.count === 18 && c.dims.length === 6 && c.startDiff === 'adaptive' && c.scope === 'unseen'
    && c2.count === 24 && c2.dims.join() === 'AI 基础认知,技术协作', JSON.stringify(c2));
}

/* ---------- MAT ---------- */
// MAT-01 一键应用后 quizcfg.dims == plan.dims，count 公式
{
  const plan = { mode: 'custom', dims: ['场景洞察', '数据与评估'], pointIds: [3, 4, 5, 20, 9, 23], pinnedFirst: [] };
  const cfg = GoalLink.quizCfgFromPlan(plan);
  const plan5 = { mode: 'custom', dims: DIMS.slice(0, 5), pointIds: [], pinnedFirst: [] };
  const cfg5 = GoalLink.quizCfgFromPlan(plan5);
  check('MAT-01', '计划→测评一键换算', cfg.dims.join() === plan.dims.join() && cfg.count === 12 && cfg.scope === 'unseen' && cfg.startDiff === 'adaptive'
    && cfg5.count === 18, JSON.stringify({ cfg, cfg5: cfg5.count }));
}
// MAT-02 合成 attempt：错题映射知识点不在计划内时建议恰含之；加入后 plan 包含之
{
  // 在题库里找一道能唯一映射到知识点 23（Badcase）的题（用与页面相同的匹配函数判定）
  let probe = null;
  for (const q of QUIZ_BANK) {
    if (q.dimension !== '数据与评估') continue;
    if (GoalLink.matchQuestionPoint(q, 3, DIAG_DATA.POINT_KEYWORDS) === 23) { probe = q; break; }
  }
  if (!probe) { check('MAT-02', '错题→建议加入计划', false, '题库中未找到映射到知识点23的题'); }
  else {
    const planIds = [0, 1, 2, 3, 4, 5]; // 不含 23
    const records = [{ questionId: probe.id, dimension: probe.dimension, correct: false }];
    const sug = GoalLink.suggestionsFromAttempt(records, bankById, n => DIM_INDEX[n], DIAG_DATA.POINT_KEYWORDS, planIds);
    const hit = sug.addPoints.some(x => x.pointIndex === 23);
    const after = GoalLink.normalizePlan({ mode: 'custom', pointIds: planIds.concat([23]), pinnedFirst: [] }, DIMS, POINT_STAGES);
    const sug2 = GoalLink.suggestionsFromAttempt(records, bankById, n => DIM_INDEX[n], DIAG_DATA.POINT_KEYWORDS, after.pointIds);
    check('MAT-02', '错题→建议加入计划', hit && after.pointIds.includes(23) && !sug2.addPoints.some(x => x.pointIndex === 23),
      'probe=#' + probe.id + ' suggestions=' + JSON.stringify(sug.addPoints));
  }
}
// MAT-03 子集 attempt 不生成快照、全集生成
{
  check('MAT-03', '快照资格判定', GoalLink.isSnapshotEligible(false, 18) === false
    && GoalLink.isSnapshotEligible(true, 18) === true
    && GoalLink.isSnapshotEligible(true, 9) === false
    && GoalLink.isSnapshotEligible(true, 10) === true);
}
// MAT-04 planMatch：同维同难度候选内优先计划知识点题，决策带 planMatch 标记
{
  const plan = { mode: 'custom', dims: ['数据与评估'], pointIds: [23], pinnedFirst: [] };
  const matcher = GoalLink.makePlanMatcher(plan, n => DIM_INDEX[n], DIAG_DATA.POINT_KEYWORDS);
  // 确认题库中该维存在能匹配 23 的题
  const anyMatch = QUIZ_BANK.some(q => q.dimension === '数据与评估' && matcher(q) > 0);
  const { decisions } = runSession({ dimensions: ['数据与评估'], totalQuestions: 6, perDimensionCap: 6, initialDifficulty: 3, initialScore: 50, planMatchFn: matcher }, () => true);
  const matchedCount = decisions.filter(d => d.planMatch).length;
  check('MAT-04', 'CAT 计划优先 + planMatch 标记', anyMatch && matchedCount >= 1 && decisions.every(d => typeof d.planMatch === 'boolean'),
    'matched=' + matchedCount + '/6');
}

/* ---------- PRC ---------- */
// PRC-01 相关度优先：仅「召回」单短词命中的题不排在多关键词命中题之前（知识点 19 RAG 排障）
{
  const kws = DIAG_DATA.POINT_KEYWORDS[19];
  const ranked = GoalLink.rankPracticeQuestions(QUIZ_BANK, 'AI 基础认知', kws);
  const rels = ranked.map(q => GoalLink.relevanceOf(q, kws));
  // 排序不变量：(subHit, hits, len) 非增、同键难度非降
  let mono = true;
  for (let i = 1; i < ranked.length; i++) {
    const a = rels[i - 1], b = rels[i];
    const ka = [a.subHit ? 1 : 0, a.hits, a.len], kb = [b.subHit ? 1 : 0, b.hits, b.len];
    if (ka[0] < kb[0] || (ka[0] === kb[0] && ka[1] < kb[1]) || (ka[0] === kb[0] && ka[1] === kb[1] && ka[2] < kb[2])) mono = false;
    if (ka.join() === kb.join() && ranked[i - 1].difficulty > ranked[i].difficulty) mono = false;
  }
  // 蹭题案例：仅命中单个短词「召回」(hits==1 && len==2 && !subHit) 的题
  const squatIdx = rels.findIndex(r => r.hits === 1 && r.len === 2 && !r.subHit);
  const multiIdx = rels.map((r, i) => (r.hits >= 2 || r.subHit) ? i : -1).filter(i => i >= 0);
  const squatAfter = squatIdx < 0 || multiIdx.every(i => i < squatIdx);
  check('PRC-01', '练习相关度优先排序', ranked.length > 0 && mono && squatAfter,
    'ranked=' + ranked.length + ' squatIdx=' + squatIdx + ' top=' + ranked.slice(0, 4).map(q => q.id).join(','));
}
// PRC-02 每个知识点练习题组仍能配满 4 道真题（与批次 A+B+C 口径一致）
{
  let min = 99, short = [];
  for (let pi = 0; pi < 27; pi++) {
    const dimName = DIMS[POINT_STAGES[pi]];
    const n = GoalLink.rankPracticeQuestions(QUIZ_BANK, dimName, DIAG_DATA.POINT_KEYWORDS[pi]).length;
    if (n < min) min = n;
    if (n < 4) short.push(pi + ':' + n);
  }
  check('PRC-02', '27 个知识点真题均 ≥4 道', short.length === 0, 'min=' + min + ' short=' + short.join(','));
}

/* ---------- 批次 1 回归抽查 ---------- */
{
  const all = runSession({ dimensions: DIMS, totalQuestions: 18, perDimensionCap: 3, initialDifficulty: 3, initialScore: 50 }, () => true);
  const none = runSession({ dimensions: DIMS, totalQuestions: 18, perDimensionCap: 3, initialDifficulty: 3, initialScore: 50 }, () => false);
  const perDim = {}; all.decisions.forEach(d => perDim[d.dimension] = (perDim[d.dimension] || 0) + 1);
  check('REG-01', '默认全对总分 81 / 六维各 3 题', all.result.totalScore === 81 && DIMS.every(n => perDim[n] === 3), 'total=' + all.result.totalScore);
  check('REG-02', '默认全错总分 32', none.result.totalScore === 32, 'total=' + none.result.totalScore);
}

console.log(results.map(r => (r.ok ? 'PASS' : 'FAIL') + ' ' + r.id + ' · ' + r.name + (r.detail ? ' — ' + r.detail : '')).join('\n'));
console.log('== ' + pass + ' passed, ' + fail + ' failed ==');
process.exit(fail ? 1 : 0);
