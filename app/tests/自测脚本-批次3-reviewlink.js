/* 批次 3 结构化自测（Node 实跑）：WRB / STG / REV + DAT-02R 键口径（严格顺序版）
 * 加载真实题库与页面同源脚本（quiz-bank / diagnosis-data / goal-link / review-link）。
 * DAT-02R 按批次 3 修复规格加强：DATA_KEYS 必须与规格键逐项、逐序完全一致（不排序后比对），
 * 且导出 payload 的 data 恰含规格键、version 仍为 1，导入校验与清空均遍历同一 DATA_KEYS。
 * 【批次 4 修订】规格键由 9 键扩展为 10 键（新增 aipm.drill.v1 面试演练自评），继批次 3 后的第二次口径扩展；
 * 本脚本 DAT-02R 组预期已同步修订为 10 键。 */
'use strict';
const fs = require('fs');
const vm = require('vm');
global.window = globalThis;
const base = '/home/hatch/workspace/ts-spaces/ai-pm-coach/assets/';
vm.runInThisContext(fs.readFileSync(base + 'quiz-bank.js', 'utf8'));
vm.runInThisContext(fs.readFileSync(base + 'diagnosis-data.js', 'utf8'));
vm.runInThisContext(fs.readFileSync(base + 'goal-link.js', 'utf8'));
vm.runInThisContext(fs.readFileSync(base + 'review-link.js', 'utf8'));
const BANK = global.QUIZ_BANK, PK = global.DIAG_DATA.POINT_KEYWORDS, RL = global.ReviewLink, GL = global.GoalLink;
const DIMS = ['AI 基础认知', '场景洞察', '产品设计', '数据与评估', '技术协作', '商业与落地'];
const byId = {}; BANK.forEach(q => { byId[q.id] = q; });
let pass = 0, fail = 0;
function t(id, name, fn) {
  try { const r = fn(); if (r === true) { console.log('PASS ' + id + ' ' + name); pass++; } else { console.log('FAIL ' + id + ' ' + name + ' -> ' + r); fail++; } }
  catch (e) { console.log('FAIL ' + id + ' ' + name + ' threw: ' + e.message); fail++; }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------- WRB ---------- */
const synthAttempts = [
  { records: [
    { questionId: 101, dimension: 'AI 基础认知', difficulty: 3, userAnswer: 'A', correct: false, skipped: false, selectedAnalysis: '解析A1' },
    { questionId: 102, dimension: '场景洞察', difficulty: 2, userAnswer: null, correct: false, skipped: true, selectedAnalysis: null },
    { questionId: 103, dimension: '产品设计', difficulty: 3, userAnswer: 'B', correct: true, skipped: false, selectedAnalysis: null }
  ] },
  { records: [
    { questionId: 101, dimension: 'AI 基础认知', difficulty: 4, userAnswer: 'C', correct: false, skipped: false, selectedAnalysis: '解析C2' },
    { questionId: 104, dimension: 'AI 基础认知', difficulty: 2, userAnswer: 'D', correct: false, skipped: false, selectedAnalysis: '解析D' }
  ] }
];
t('WRB-01', '错题推导去重（合成 attempts）', () => {
  const es = RL.deriveWrongBook(synthAttempts);
  return (es.length === 3 && !es.some(e => e.questionId === 103)) || 'len=' + es.length;
});
t('WRB-02', '答错次数与最近一次答案/解析', () => {
  const es = RL.deriveWrongBook(synthAttempts);
  const e101 = es.find(e => e.questionId === 101);
  const e102 = es.find(e => e.questionId === 102);
  return (e101.wrongCount === 2 && e101.lastUserAnswer === 'C' && e101.lastSelectedAnalysis === '解析C2' && e101.difficulty === 4 && e102.lastSkipped === true) || JSON.stringify(e101);
});
t('WRB-03', '重做掌握流转（对→已掌握，错→回待巩固，只写 wrongbook）', () => {
  let wb = RL.normalizeWrongbook(null);
  wb = RL.applyRedo(wb, 101, true, '2026-11-13T10:00:00.000Z');
  const okA = wb.mastered[101] === '2026-11-13T10:00:00.000Z' && wb.redo[101].lastCorrect === true;
  wb = RL.applyRedo(wb, 101, false, '2026-11-14T10:00:00.000Z');
  const okB = !wb.mastered[101] && wb.redo[101].lastCorrect === false && wb.redo[101].lastAt === '2026-11-14T10:00:00.000Z';
  const es = RL.deriveWrongBook(synthAttempts);
  return (okA && okB && es.some(e => e.questionId === 101)) || 'A=' + okA + ' B=' + okB;
});
t('WRB-04', '维度筛选', () => {
  const es = RL.deriveWrongBook(synthAttempts);
  return (RL.filterWrongEntries(es, 'AI 基础认知').length === 2 && RL.filterWrongEntries(es, '场景洞察').length === 1 && RL.filterWrongEntries(es, '全部').length === 3) || 'filter mismatch';
});
t('WRB-05', '顶部统计（待巩固/已掌握/各维分布）', () => {
  const es = RL.deriveWrongBook(synthAttempts);
  const wb = RL.applyRedo(RL.normalizeWrongbook(null), 104, true, '2026-11-13T10:00:00.000Z');
  const st = RL.wrongStats(es, wb);
  return (st.total === 3 && st.mastered === 1 && st.pending === 2 && st.byDim['AI 基础认知'].total === 2 && st.byDim['AI 基础认知'].mastered === 1 && st.byDim['场景洞察'].pending === 1) || JSON.stringify(st);
});
t('WRB-06', '真实题库 attempts 推导（全错一轮 18 题）', () => {
  const recs = BANK.slice(0, 18).map(q => ({ questionId: q.id, dimension: q.dimension, difficulty: q.difficulty, userAnswer: 'A', correct: q.answer === 'A', skipped: false, selectedAnalysis: (q.distractor_analysis || {}).A }));
  const es = RL.deriveWrongBook([{ records: recs }]);
  const wrongN = recs.filter(r => !r.correct).length;
  return (es.length === wrongN && es.every(e => byId[e.questionId])) || 'es=' + es.length + ' wrong=' + wrongN;
});

/* ---------- STG ---------- */
const pools = DIMS.map((_, si) => RL.stagePool(BANK, si, DIMS, PK));
console.log('INFO stage pools: ' + pools.map(p => p.length).join(','));
t('STG-01', '抽题池只含本阶段映射题（维度+关键词命中）', () => {
  for (let si = 0; si < 6; si++) {
    if (!pools[si].every(q => q.dimension === DIMS[si])) return 'dim leak stage ' + si;
    if (!pools[si].every(q => RL.matchPointDetailed(q, si, PK).bestLen > 0)) return 'unmapped q in stage ' + si;
  }
  return true;
});
t('STG-02', '恰 5 题（或池上限）且难度升序', () => {
  for (let si = 0; si < 6; si++) {
    const pick = RL.pickStageQuestions(pools[si], [], 5);
    const want = Math.min(5, pools[si].length);
    if (pick.questions.length !== want) return 'stage ' + si + ' got ' + pick.questions.length + ' want ' + want;
    for (let i = 1; i < pick.questions.length; i++) if (pick.questions[i].difficulty < pick.questions[i - 1].difficulty) return 'not ascending stage ' + si;
  }
  return true;
});
t('STG-03', '优先未出现过的题（seen 排除与补足）', () => {
  const pool = pools[0];
  const seenFirst = pool.slice(0, 3).map(q => q.id);
  const pick = RL.pickStageQuestions(pool, seenFirst, 5);
  if (pool.length - 3 >= 5 && pick.questions.some(q => seenFirst.includes(q.id))) return 'seen leaked';
  const allSeen = pool.map(q => q.id);
  const pick2 = RL.pickStageQuestions(pool, allSeen, 5);
  return (pick2.questions.length === 5 && pick2.fromSeen === 5) || 'fromSeen=' + pick2.fromSeen;
});
t('STG-04', '通过判定 3/5', () => {
  return (RL.stageQuizPassed(3, 5) === true && RL.stageQuizPassed(2, 5) === false && RL.stageQuizPassed(5, 5) === true && RL.stageQuizPassed(0, 5) === false) || 'pass line wrong';
});
t('STG-05', '状态持久化往返（plays/best/passedAt/seen）', () => {
  let all = RL.applyStageQuizResult({}, 2, 4, 5, [11, 12, 13, 14, 15], '2026-11-13T10:00:00.000Z');
  all = RL.applyStageQuizResult(all, 2, 2, 5, [16, 17, 18, 19, 20], '2026-11-14T10:00:00.000Z');
  const rt = RL.normalizeStageQuiz(JSON.parse(JSON.stringify(all)));
  const r = rt[2];
  return (r.plays === 2 && r.best === 4 && r.lastScore === 2 && r.passedAt === '2026-11-13T10:00:00.000Z' && r.lastAt === '2026-11-14T10:00:00.000Z' && r.seen.length === 10) || JSON.stringify(r);
});

/* ---------- REV（固定时钟） ---------- */
t('REV-01', '间隔迁移链 1→3→7→14→30→30（封顶）', () => {
  let m = RL.mergeSeeds({}, [{ qid: 7, source: 'attempt' }], '2026-11-13');
  let r = m.review;
  if (r[7].stage !== 0 || r[7].due !== '2026-11-14') return 'seed due=' + r[7].due;
  const steps = [
    ['2026-11-14', 1, '2026-11-17'], ['2026-11-17', 2, '2026-11-24'], ['2026-11-24', 3, '2026-12-08'],
    ['2026-12-08', 4, '2027-01-07'], ['2027-01-07', 4, '2027-02-06']
  ];
  for (const [day, st, due] of steps) {
    r = RL.applyReviewResult(r, 7, true, day);
    if (r[7].stage !== st || r[7].due !== due) return 'at ' + day + ' stage=' + r[7].stage + ' due=' + r[7].due + ' want ' + st + '/' + due;
  }
  return true;
});
t('REV-02', '答错回阶段 0（+1 天）', () => {
  let r = RL.mergeSeeds({}, [{ qid: 9, source: 'stagequiz' }], '2026-11-13').review;
  r = RL.applyReviewResult(r, 9, true, '2026-11-14');
  r = RL.applyReviewResult(r, 9, true, '2026-11-17');
  r = RL.applyReviewResult(r, 9, false, '2026-11-20');
  return (r[9].stage === 0 && r[9].due === '2026-11-21' && r[9].lastResult === 'wrong') || JSON.stringify(r[9]);
});
t('REV-03', '到期列表计算（due<=today，排序）', () => {
  const review = {
    1: { stage: 0, due: '2026-11-14', lastResult: null, source: 'attempt' },
    2: { stage: 1, due: '2026-11-16', lastResult: 'correct', source: 'attempt' },
    3: { stage: 0, due: '2026-11-13', lastResult: null, source: 'practice' },
    4: { stage: 2, due: '2026-11-20', lastResult: 'correct', source: 'stagequiz' }
  };
  const due = RL.dueQuestions(review, '2026-11-16');
  return eq(due.map(d => d.qid), [3, 1, 2]) || JSON.stringify(due);
});
t('REV-04', '三来源去重合并（同题只入队一次，首个来源保留）', () => {
  const seeds = [
    { qid: 42, source: 'attempt' }, { qid: 42, source: 'stagequiz' }, { qid: 42, source: 'practice' },
    { qid: 43, source: 'stagequiz' }, { qid: 44, source: 'practice' }
  ];
  const m1 = RL.mergeSeeds({}, seeds, '2026-11-13');
  const m2 = RL.mergeSeeds(m1.review, seeds, '2026-11-15');
  return (m1.added === 3 && m1.review[42].source === 'attempt' && m2.added === 0 && m2.review[42].due === '2026-11-14') || 'added=' + m1.added + '/' + m2.added;
});
t('REV-05', '本地日期口径（跨月/闰日加天）', () => {
  return (RL.addDaysStr('2026-01-31', 1) === '2026-02-01' && RL.addDaysStr('2026-12-31', 30) === '2027-01-30' && RL.todayStr(new Date(2026, 10, 13, 23, 59)) === '2026-11-13') || 'date math wrong';
});

/* ---------- DAT-02R（批次 4 修订规格：10 键，严格逐序；批次 3 时为 9 键） ---------- */
const SPEC_KEYS = ['aipm.attempts.v1', 'aipm.snapshots.v1', 'aipm.inprogress.v1', 'aipm.appeals.v1', 'aipm.learn.v1', 'aipm.quizcfg.v1', 'aipm.wrongbook.v1', 'aipm.stagequiz.v1', 'aipm.review.v1', 'aipm.drill.v1'];
const html = fs.readFileSync('/home/hatch/workspace/ts-spaces/ai-pm-coach/index.html', 'utf8');
function pageDataKeys() {
  const m = html.match(/var DATA_KEYS = \[([^\]]+)\]/);
  if (!m) return null;
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}
t('DAT-02R', '页面 DATA_KEYS 恰为规格 10 键（不多不少、逐序一致）【批次 4 修订】', () => {
  const keys = pageDataKeys();
  if (!keys) return 'DATA_KEYS not found';
  console.log('INFO DATA_KEYS actual: ' + JSON.stringify(keys));
  return eq(keys, SPEC_KEYS) || 'actual=' + JSON.stringify(keys);
});
t('DAT-02R-EXP', '导出 payload：version==1 且 data 恰含 10 键（按 DATA_KEYS 逐序构建）【批次 4 修订】', () => {
  const keys = pageDataKeys();
  if (!/return \{ app: 'ai-pm-coach', version: 1,/.test(html)) return 'export version literal != 1';
  if (!/DATA_KEYS\.forEach\(function\(key\)\{ data\[key\] = readStored\(key\); \}\);/.test(html)) return 'buildExportPayload does not iterate DATA_KEYS';
  const data = {}; keys.forEach(k => { data[k] = null; });
  const payload = { app: 'ai-pm-coach', version: 1, data };
  return (payload.version === 1 && eq(Object.keys(payload.data), SPEC_KEYS)) || JSON.stringify(Object.keys(payload.data));
});
t('DAT-02R-IMP', '导入结构校验覆盖全部 10 键（逐键 hasOwnProperty 检查）【批次 4 修订】', () => {
  return /for\(var i = 0; i < DATA_KEYS\.length; i\+\+\)\{\s*if\(!Object\.prototype\.hasOwnProperty\.call\(obj\.data, DATA_KEYS\[i\]\)\)/.test(html) || 'validateImport does not loop DATA_KEYS';
});
t('DAT-02R-CLR', '导入写回与清空全部遍历同一 DATA_KEYS（10 键全覆盖）【批次 4 修订】', () => {
  const writes = (html.match(/DATA_KEYS\.forEach\(function\(key\)\{\s*try \{\s*var v = pendingImport\.data\[key\];/g) || []).length;
  const clears = (html.match(/DATA_KEYS\.forEach\(function\(key\)\{ try \{ window\.localStorage\.removeItem\(key\); \} catch\(e\)\{\} \}\);/g) || []).length;
  return (writes === 1 && clears === 1) || 'writes=' + writes + ' clears=' + clears;
});

console.log('---- ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
