/*
 * review-link.js — 批次 3 纯逻辑：错题本推导 / 阶段小测抽题 / 间隔复习队列
 * 源文件：src/services/review-link.ts；本文件为同逻辑的经典脚本版，暴露全局 ReviewLink。
 * 纯函数、无 DOM / 无网络 / 无 LLM：页面负责读写 localStorage 与渲染，
 * 本模块只做数据推导与状态迁移。Node 自测可直接加载本文件执行 WRB / STG / REV 用例。
 *
 * 数据形状（Suzuki 定版）：
 * - 错题本状态 aipm.wrongbook.v1：{ mastered:{qid:ISO时间}, redo:{qid:{lastAt,lastCorrect}} }
 *   错题条目本身不落盘：每次打开都从 aipm.attempts.v1 实时推导（deriveWrongBook）。
 * - 阶段小测状态 aipm.stagequiz.v1：{ stageIdx:{plays,best,lastScore,passedAt,lastAt,seen:[qid]} }
 *   seen 为该阶段小测已出过的题 id（「优先未出现过的题」所需，规格字段之外的唯一扩展）。
 * - 复习队列 aipm.review.v1：{ qid:{stage,due:'YYYY-MM-DD',lastResult,source} }
 *   间隔阶梯：stage 0 → +1 天，之后依次 +3 / +7 / +14 / +30 天，stage 4 封顶仍 +30。
 *   日期一律按用户本地日期（YYYY-MM-DD 字符串比较即时间序）。
 */
(function (global) {
  'use strict';

  /* 知识点下标按维度（= 阶段）分组，与 goal-link.js / diagnosis.js 保持一致 */
  var POINTS_BY_DIM = [[0, 1, 2, 18, 19], [3, 4, 5, 20], [6, 7, 8, 21, 22], [9, 10, 11, 23, 24], [12, 13, 14, 25], [15, 16, 17, 26]];
  var REVIEW_INTERVALS = [1, 3, 7, 14, 30];
  var STAGE_QUIZ_COUNT = 5;
  var STAGE_QUIZ_PASS = 3;

  /* ---------- 本地日期工具（纯字符串 / 本地时区，不用 UTC） ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function localDateStr(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function todayStr(now) { return localDateStr(now || new Date()); }
  function addDaysStr(dateStr, n) {
    var p = String(dateStr).split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    d.setDate(d.getDate() + n);
    return localDateStr(d);
  }

  /* ---------- 题目 → 知识点映射（与 goal-link 同口径：最长关键词优先） ---------- */
  function questionText(q) {
    return ((q.sub_topic || '') + ' ' + (q.exam_points || []).join(' ') + ' ' + (q.stem || '')).toLowerCase();
  }
  /* 返回 { pointIndex, bestLen }：bestLen=0 表示无任何关键词命中（不算映射到知识点） */
  function matchPointDetailed(q, dimIndex, pointKeywords) {
    var candidates = POINTS_BY_DIM[dimIndex] || [];
    var fallback = candidates.length ? candidates[0] : -1;
    if (!q || !candidates.length) return { pointIndex: fallback, bestLen: 0 };
    var text = questionText(q);
    var bestIdx = fallback, bestLen = 0;
    candidates.forEach(function (pi) {
      (pointKeywords[pi] || []).forEach(function (kw) {
        var k = String(kw).toLowerCase();
        if (k.length > bestLen && text.indexOf(k) >= 0) { bestLen = k.length; bestIdx = pi; }
      });
    });
    return { pointIndex: bestIdx, bestLen: bestLen };
  }

  /* ================= 一、错题本 =================
   * deriveWrongBook：以 attempts 为唯一事实源实时推导。
   * 每条：{ questionId, dimension, difficulty（最近一次）, wrongCount,
   *         lastUserAnswer, lastSkipped, lastSelectedAnalysis, lastOrder }
   * 排序：最近一次答错在前。 */
  function deriveWrongBook(attempts) {
    var byId = {}, order = 0;
    (attempts || []).forEach(function (a) {
      (a.records || []).forEach(function (r) {
        order++;
        if (!r || r.correct || r.questionId == null) return;
        var e = byId[r.questionId];
        if (!e) {
          e = byId[r.questionId] = {
            questionId: r.questionId, dimension: r.dimension, difficulty: r.difficulty || 3,
            wrongCount: 0, lastUserAnswer: null, lastSkipped: false, lastSelectedAnalysis: null, lastOrder: 0
          };
        }
        e.wrongCount++;
        e.dimension = r.dimension;
        e.difficulty = r.difficulty || e.difficulty;
        e.lastUserAnswer = r.userAnswer || null;
        e.lastSkipped = !!r.skipped;
        e.lastSelectedAnalysis = r.selectedAnalysis || null;
        e.lastOrder = order;
      });
    });
    return Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (a, b) { return b.lastOrder - a.lastOrder; });
  }

  function filterWrongEntries(entries, dimName) {
    if (!dimName || dimName === '全部') return (entries || []).slice();
    return (entries || []).filter(function (e) { return e.dimension === dimName; });
  }

  function normalizeWrongbook(raw) {
    var wb = { mastered: {}, redo: {} };
    if (!raw || typeof raw !== 'object') return wb;
    if (raw.mastered && typeof raw.mastered === 'object') {
      Object.keys(raw.mastered).forEach(function (k) { if (typeof raw.mastered[k] === 'string') wb.mastered[k] = raw.mastered[k]; });
    }
    if (raw.redo && typeof raw.redo === 'object') {
      Object.keys(raw.redo).forEach(function (k) {
        var v = raw.redo[k];
        if (v && typeof v === 'object') wb.redo[k] = { lastAt: v.lastAt || null, lastCorrect: !!v.lastCorrect };
      });
    }
    return wb;
  }

  /* 顶部统计：待巩固（未掌握）数、已掌握数、各维分布（按错题条目计） */
  function wrongStats(entries, wrongbook) {
    var wb = normalizeWrongbook(wrongbook);
    var mastered = 0;
    var byDim = {};
    (entries || []).forEach(function (e) {
      var isM = !!wb.mastered[e.questionId];
      if (isM) mastered++;
      if (!byDim[e.dimension]) byDim[e.dimension] = { total: 0, pending: 0, mastered: 0 };
      byDim[e.dimension].total++;
      if (isM) byDim[e.dimension].mastered++; else byDim[e.dimension].pending++;
    });
    return { total: (entries || []).length, mastered: mastered, pending: (entries || []).length - mastered, byDim: byDim };
  }

  /* 重做结果流转：答对 → 记 mastered（ISO 时间）；答错 → 保持待巩固（清除 mastered）。
   * 只写 wrongbook 状态，绝不回写 attempts。 */
  function applyRedo(wrongbook, qid, correct, isoTime) {
    var wb = normalizeWrongbook(wrongbook);
    if (correct) { wb.mastered[qid] = isoTime; } else { delete wb.mastered[qid]; }
    wb.redo[qid] = { lastAt: isoTime, lastCorrect: !!correct };
    return wb;
  }

  /* ================= 二、阶段小测 =================
   * stagePool：该阶段（= 维度）知识点经 POINT_KEYWORDS 映射到的题库题：
   * 题目维度 == 阶段维度，且至少命中该阶段任一知识点的一个关键词。 */
  function stagePool(bank, stageIdx, dimNames, pointKeywords) {
    var dimName = dimNames[stageIdx];
    var pool = [];
    (bank || []).forEach(function (q) {
      if (q.dimension !== dimName) return;
      var m = matchPointDetailed(q, stageIdx, pointKeywords);
      if (m.bestLen > 0) pool.push(q);
    });
    return pool;
  }

  /* 抽题：优先未在该阶段小测出现过的题，难度升序（同难度按 id），取 count 题；
   * 未见题不足时用已见题补足（同样难度升序）；池不足 count 则全抽。 */
  function pickStageQuestions(pool, seenIds, count) {
    count = count || STAGE_QUIZ_COUNT;
    var seen = {};
    (seenIds || []).forEach(function (id) { seen[id] = true; });
    function byDiff(a, b) { return (a.difficulty - b.difficulty) || (a.id - b.id); }
    var unseen = (pool || []).filter(function (q) { return !seen[q.id]; }).sort(byDiff);
    var seenPool = (pool || []).filter(function (q) { return seen[q.id]; }).sort(byDiff);
    var picked = unseen.slice(0, count);
    var fromSeen = 0;
    if (picked.length < count) {
      var extra = seenPool.slice(0, count - picked.length);
      fromSeen = extra.length;
      picked = picked.concat(extra);
    }
    picked.sort(byDiff);
    return { questions: picked, poolSize: (pool || []).length, fromSeen: fromSeen };
  }

  function stageQuizPassed(score, total) {
    var line = Math.min(STAGE_QUIZ_PASS, total || STAGE_QUIZ_COUNT);
    return score >= line;
  }

  function normalizeStageQuiz(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (k) {
      var v = raw[k];
      if (!v || typeof v !== 'object') return;
      out[k] = {
        plays: v.plays || 0,
        best: v.best || 0,
        lastScore: v.lastScore == null ? null : v.lastScore,
        passedAt: v.passedAt || null,
        lastAt: v.lastAt || null,
        seen: Array.isArray(v.seen) ? v.seen.slice() : []
      };
    });
    return out;
  }

  /* 一次小测结算：plays+1、best 取高、lastScore/lastAt 更新、通过则记 passedAt（首次通过时间）、seen 并入本轮题 */
  function applyStageQuizResult(all, stageIdx, score, total, qids, isoTime) {
    var out = normalizeStageQuiz(all);
    var prev = out[stageIdx] || { plays: 0, best: 0, lastScore: null, passedAt: null, lastAt: null, seen: [] };
    var seenSet = {};
    prev.seen.forEach(function (id) { seenSet[id] = true; });
    (qids || []).forEach(function (id) { seenSet[id] = true; });
    out[stageIdx] = {
      plays: prev.plays + 1,
      best: Math.max(prev.best, score),
      lastScore: score,
      passedAt: prev.passedAt || (stageQuizPassed(score, total) ? isoTime : null),
      lastAt: isoTime,
      seen: Object.keys(seenSet).map(function (x) { return parseInt(x, 10); }).sort(function (a, b) { return a - b; })
    };
    return out;
  }

  /* ================= 三、复习队列（间隔复习） ================= */
  function normalizeReview(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(raw).forEach(function (k) {
      var v = raw[k];
      if (!v || typeof v !== 'object' || typeof v.due !== 'string') return;
      var stage = (typeof v.stage === 'number' && v.stage >= 0 && v.stage < REVIEW_INTERVALS.length) ? Math.floor(v.stage) : 0;
      out[k] = { stage: stage, due: v.due, lastResult: v.lastResult || null, source: v.source || 'attempt' };
    });
    return out;
  }

  /* 种子入队：新题以 stage 0 入队，到期 = 今天 +1 天；已在队列的题不覆盖（去重合并）。 */
  function seedReview(review, qid, source, today) {
    var out = normalizeReview(review);
    if (out[qid]) return { review: out, added: false };
    out[qid] = { stage: 0, due: addDaysStr(today, REVIEW_INTERVALS[0]), lastResult: null, source: source || 'attempt' };
    return { review: out, added: true };
  }

  /* 三来源（测评 / 阶段小测 / 知识点练习）种子按题 id 去重合并，返回新增条数 */
  function mergeSeeds(review, seeds, today) {
    var out = normalizeReview(review);
    var added = 0;
    (seeds || []).forEach(function (s) {
      if (!s || s.qid == null || out[s.qid]) return;
      out[s.qid] = { stage: 0, due: addDaysStr(today, REVIEW_INTERVALS[0]), lastResult: null, source: s.source || 'attempt' };
      added++;
    });
    return { review: out, added: added };
  }

  /* 复习作答迁移：答对进一阶（封顶 stage 4），到期 = 今天 + 该阶间隔；
   * 答错回 stage 0，到期 = 今天 +1 天。 */
  function applyReviewResult(review, qid, correct, today) {
    var out = normalizeReview(review);
    var e = out[qid];
    if (!e) return out;
    if (correct) {
      e.stage = Math.min(e.stage + 1, REVIEW_INTERVALS.length - 1);
      e.due = addDaysStr(today, REVIEW_INTERVALS[e.stage]);
      e.lastResult = 'correct';
    } else {
      e.stage = 0;
      e.due = addDaysStr(today, REVIEW_INTERVALS[0]);
      e.lastResult = 'wrong';
    }
    out[qid] = e;
    return out;
  }

  /* 到期列表：due <= today 的题，按到期日升序、同日按 qid 升序 */
  function dueQuestions(review, today) {
    var out = normalizeReview(review);
    return Object.keys(out)
      .filter(function (k) { return out[k].due <= today; })
      .map(function (k) { return { qid: parseInt(k, 10), stage: out[k].stage, due: out[k].due, source: out[k].source }; })
      .sort(function (a, b) { return a.due < b.due ? -1 : (a.due > b.due ? 1 : a.qid - b.qid); });
  }

  global.ReviewLink = {
    POINTS_BY_DIM: POINTS_BY_DIM,
    REVIEW_INTERVALS: REVIEW_INTERVALS,
    STAGE_QUIZ_COUNT: STAGE_QUIZ_COUNT,
    STAGE_QUIZ_PASS: STAGE_QUIZ_PASS,
    localDateStr: localDateStr,
    todayStr: todayStr,
    addDaysStr: addDaysStr,
    matchPointDetailed: matchPointDetailed,
    deriveWrongBook: deriveWrongBook,
    filterWrongEntries: filterWrongEntries,
    normalizeWrongbook: normalizeWrongbook,
    wrongStats: wrongStats,
    applyRedo: applyRedo,
    stagePool: stagePool,
    pickStageQuestions: pickStageQuestions,
    stageQuizPassed: stageQuizPassed,
    normalizeStageQuiz: normalizeStageQuiz,
    applyStageQuizResult: applyStageQuizResult,
    normalizeReview: normalizeReview,
    seedReview: seedReview,
    mergeSeeds: mergeSeeds,
    applyReviewResult: applyReviewResult,
    dueQuestions: dueQuestions
  };
})(typeof window !== 'undefined' ? window : globalThis);
