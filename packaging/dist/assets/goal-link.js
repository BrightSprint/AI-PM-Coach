/*
 * goal-link.js — 「当前目标」共享逻辑（学习计划 ⇄ 测评设置 双向自动匹配）
 * 源文件：src/services/goal-link.ts；本文件为同逻辑的经典脚本版，暴露全局 GoalLink。
 * 纯函数、无 DOM / 无存储 / 无网络 / 无 LLM：页面负责读写 localStorage 与渲染，
 * 本模块只做计划规整、计划→测评设置换算、错题→知识点建议、练习相关度排序、
 * 快照资格判定。Node 自测可直接加载本文件执行 PLN / SET / MAT 用例。
 *
 * 数据形状（Suzuki 定版）：
 * - 学习计划 plan（存入既有键 aipm.learn.v1 的 plan 字段）：
 *     { mode:'all'|'weakest'|'custom', dims:[维度名], pointIds:[知识点下标], pinnedFirst:[知识点下标] }
 * - 测评设置 quizcfg（新键 aipm.quizcfg.v1）：
 *     { count:12|18|24, dims:[维度名子集], startDiff:'adaptive'|'basic'|'advanced',
 *       scope:'unseen'|'wrongfirst'|'all' }
 * - 知识点按维度分组与 diagnosis.js 的 POINTS_BY_DIM 保持一致（下标即 POINTS 下标）。
 */
(function (global) {
  'use strict';

  /* 知识点下标按维度（= 阶段）分组，与 POINTS 的 s 字段一致 */
  var POINTS_BY_DIM = [[0, 1, 2, 18, 19], [3, 4, 5, 20], [6, 7, 8, 21, 22], [9, 10, 11, 23, 24], [12, 13, 14, 25], [15, 16, 17, 26]];
  var QUIZ_COUNTS = [12, 18, 24];
  var START_DIFF_MAP = { adaptive: 3, basic: 2, advanced: 4 };
  var SCOPES = ['unseen', 'wrongfirst', 'all'];

  function uniqNums(arr) {
    var seen = {}, out = [];
    (arr || []).forEach(function (x) { if (typeof x === 'number' && !seen[x]) { seen[x] = true; out.push(x); } });
    return out;
  }

  /* ---------- 学习计划 ---------- */
  function defaultPlan(dimNames, totalPoints) {
    var ids = [];
    for (var i = 0; i < totalPoints; i++) ids.push(i);
    return { mode: 'all', dims: dimNames.slice(), pointIds: ids, pinnedFirst: [] };
  }

  /* 把任意来源的 plan 规整为合法形状；pointStages[i] = 知识点 i 的阶段（维度）下标 */
  function normalizePlan(raw, dimNames, pointStages) {
    var total = pointStages.length;
    if (!raw || typeof raw !== 'object') return defaultPlan(dimNames, total);
    var mode = (raw.mode === 'weakest' || raw.mode === 'custom') ? raw.mode : 'all';
    var pointIds = uniqNums(raw.pointIds).filter(function (i) { return i >= 0 && i < total; });
    if (mode === 'all') return defaultPlan(dimNames, total);
    var dimSet = {};
    pointIds.forEach(function (pi) { dimSet[pointStages[pi]] = true; });
    var dims = dimNames.filter(function (_, di) { return dimSet[di]; });
    /* dims 以 pointIds 推导为准，保证计划摘要与路径呈现一致 */
    var pinnedFirst = uniqNums(raw.pinnedFirst).filter(function (i) { return pointIds.indexOf(i) >= 0; });
    return { mode: mode, dims: dims, pointIds: pointIds, pinnedFirst: pinnedFirst };
  }

  /* 预设：只学最弱维。dimScores 为最近一次成绩（六维），返回该维全部知识点 */
  function planFromWeakest(dimScores, dimNames, pointStages) {
    if (!dimScores || !dimScores.length) return null;
    var wi = 0;
    dimScores.forEach(function (v, i) { if (typeof v === 'number' && v < dimScores[wi]) wi = i; });
    var pointIds = [];
    pointStages.forEach(function (s, pi) { if (s === wi) pointIds.push(pi); });
    return { mode: 'weakest', dims: [dimNames[wi]], pointIds: pointIds, pinnedFirst: [], weakestIndex: wi };
  }

  /* 计划内呈现顺序：pinnedFirst 在最前，其余按知识点下标升序 */
  function orderedPlanPoints(plan) {
    var rest = plan.pointIds.filter(function (i) { return plan.pinnedFirst.indexOf(i) < 0; });
    rest.sort(function (a, b) { return a - b; });
    return plan.pinnedFirst.slice().concat(rest);
  }

  /* ---------- 计划 → 测评：一键应用的设置换算 ---------- */
  function quizCfgFromPlan(plan) {
    var dims = (plan.dims || []).slice();
    var count = Math.max(12, Math.min(24, dims.length * 3));
    if (QUIZ_COUNTS.indexOf(count) < 0) {
      /* count 只能落 12/18/24（如 5 维 ×3 = 15）：向上取最近的合法档，保证每维仍 ≥3 题 */
      for (var i = 0; i < QUIZ_COUNTS.length; i++) { if (QUIZ_COUNTS[i] >= count) { count = QUIZ_COUNTS[i]; break; } }
    }
    return { count: count, dims: dims, startDiff: 'adaptive', scope: 'unseen' };
  }

  function normalizeQuizCfg(raw, dimNames) {
    var cfg = { count: 18, dims: dimNames.slice(), startDiff: 'adaptive', scope: 'unseen' };
    if (!raw || typeof raw !== 'object') return cfg;
    if (QUIZ_COUNTS.indexOf(raw.count) >= 0) cfg.count = raw.count;
    if (Array.isArray(raw.dims) && raw.dims.length) {
      var picked = dimNames.filter(function (n) { return raw.dims.indexOf(n) >= 0; });
      if (picked.length) cfg.dims = picked;
    }
    if (START_DIFF_MAP[raw.startDiff] != null) cfg.startDiff = raw.startDiff;
    if (SCOPES.indexOf(raw.scope) >= 0) cfg.scope = raw.scope;
    return cfg;
  }

  function startDifficulty(cfg) { return START_DIFF_MAP[cfg.startDiff] || 3; }
  /* 轮询 + 每维上限配合下的每维题数区间：最少 floor、最多个 ceil */
  function perDimRange(cfg) {
    var n = Math.max(1, cfg.dims.length);
    return { min: Math.floor(cfg.count / n), max: Math.ceil(cfg.count / n), cap: Math.ceil(cfg.count / n) };
  }

  /* ---------- 题目 → 知识点匹配（与 diagnosis.js 同口径：最长关键词优先） ---------- */
  function questionText(q) {
    return ((q.sub_topic || '') + ' ' + (q.exam_points || []).join(' ') + ' ' + (q.stem || '')).toLowerCase();
  }
  function matchQuestionPoint(q, dimIndex, pointKeywords) {
    var candidates = POINTS_BY_DIM[dimIndex] || [];
    if (!q || !candidates.length) return candidates.length ? candidates[0] : -1;
    var text = questionText(q);
    var bestIdx = candidates[0], bestLen = 0;
    candidates.forEach(function (pi) {
      (pointKeywords[pi] || []).forEach(function (kw) {
        var k = String(kw).toLowerCase();
        if (k.length > bestLen && text.indexOf(k) >= 0) { bestLen = k.length; bestIdx = pi; }
      });
    });
    return bestIdx;
  }

  /* ---------- 测评 → 计划：来自最近一次 attempt 的建议 ----------
   * 入参 records 为 attempt 记录（需含 dimension / correct / questionId），
   * bankById 为题库索引，dimIndexOf(维度名)→下标，pointKeywords = DIAG_DATA.POINT_KEYWORDS。
   * 返回 { addPoints:[{pointIndex, wrongCount}], weakestIndex }：
   * addPoints = 错题映射到的、不在当前计划内的知识点（按错题数降序）。 */
  function suggestionsFromAttempt(records, bankById, dimIndexOf, pointKeywords, planPointIds) {
    var inPlan = {};
    (planPointIds || []).forEach(function (i) { inPlan[i] = true; });
    var wrongByPoint = {};
    (records || []).forEach(function (r) {
      if (r.correct) return;
      var q = bankById[r.questionId];
      if (!q) return;
      var di = dimIndexOf(q.dimension);
      if (di == null || di < 0) return;
      var pi = matchQuestionPoint(q, di, pointKeywords);
      if (pi >= 0 && !inPlan[pi]) wrongByPoint[pi] = (wrongByPoint[pi] || 0) + 1;
    });
    var addPoints = Object.keys(wrongByPoint).map(function (k) {
      return { pointIndex: parseInt(k, 10), wrongCount: wrongByPoint[k] };
    }).sort(function (a, b) { return b.wrongCount - a.wrongCount || a.pointIndex - b.pointIndex; });
    return { addPoints: addPoints };
  }

  /* ---------- 快照资格：只有六维全选且题量 ≥10 的 attempt 才生成快照 ---------- */
  function isSnapshotEligible(isFullDims, answered) {
    return !!isFullDims && typeof answered === 'number' && answered >= 10;
  }

  /* ---------- 练习题相关度：多关键词命中 / 子考点命中优先，同相关度内难度升序 ----------
   * relevance = { subHit: 子考点命中任一关键词, hits: 命中关键词个数, len: 命中关键词总长度 } */
  function relevanceOf(q, kws) {
    var sub = (q.sub_topic || '').toLowerCase();
    var text = ((q.sub_topic || '') + ' ' + (q.exam_points || []).join(' ') + ' ' + (q.difficulty_points || []).join(' ') + ' ' + (q.stem || '')).toLowerCase();
    var hits = 0, len = 0, subHit = false;
    (kws || []).forEach(function (kw) {
      var k = String(kw).toLowerCase();
      if (text.indexOf(k) >= 0) { hits++; len += k.length; if (sub.indexOf(k) >= 0) subHit = true; }
    });
    return { subHit: subHit, hits: hits, len: len };
  }
  function compareRelevance(a, b) {
    if (a.rel.subHit !== b.rel.subHit) return a.rel.subHit ? -1 : 1;
    if (a.rel.hits !== b.rel.hits) return b.rel.hits - a.rel.hits;
    if (a.rel.len !== b.rel.len) return b.rel.len - a.rel.len;
    if (a.q.difficulty !== b.q.difficulty) return a.q.difficulty - b.q.difficulty;
    return a.q.id - b.q.id;
  }
  function rankPracticeQuestions(bank, dimName, kws) {
    var matched = [];
    (bank || []).forEach(function (q) {
      if (q.dimension !== dimName) return;
      var rel = relevanceOf(q, kws);
      if (rel.hits > 0) matched.push({ q: q, rel: rel });
    });
    matched.sort(compareRelevance);
    return matched.map(function (m) { return m.q; });
  }

  /* CAT 计划优先：给定题目返回其知识点是否在计划内（供 planMatchFn 使用） */
  function makePlanMatcher(plan, dimIndexOf, pointKeywords) {
    var inPlan = {};
    (plan.pointIds || []).forEach(function (i) { inPlan[i] = true; });
    return function (q) {
      var di = dimIndexOf(q.dimension);
      if (di == null || di < 0) return 0;
      var pi = matchQuestionPoint(q, di, pointKeywords);
      return inPlan[pi] ? 1 : 0;
    };
  }

  global.GoalLink = {
    POINTS_BY_DIM: POINTS_BY_DIM,
    QUIZ_COUNTS: QUIZ_COUNTS,
    START_DIFF_MAP: START_DIFF_MAP,
    defaultPlan: defaultPlan,
    normalizePlan: normalizePlan,
    planFromWeakest: planFromWeakest,
    orderedPlanPoints: orderedPlanPoints,
    quizCfgFromPlan: quizCfgFromPlan,
    normalizeQuizCfg: normalizeQuizCfg,
    startDifficulty: startDifficulty,
    perDimRange: perDimRange,
    matchQuestionPoint: matchQuestionPoint,
    suggestionsFromAttempt: suggestionsFromAttempt,
    isSnapshotEligible: isSnapshotEligible,
    relevanceOf: relevanceOf,
    rankPracticeQuestions: rankPracticeQuestions,
    makePlanMatcher: makePlanMatcher
  };
})(typeof window !== 'undefined' ? window : globalThis);
