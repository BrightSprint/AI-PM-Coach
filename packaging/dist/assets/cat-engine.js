/*
 * cat-engine.js — 简化版 CAT 引擎（运行时转译版）
 * 源文件：src/services/cat-engine.ts（纯 TypeScript，无 UI 依赖）。
 * 本文件为其同逻辑的经典脚本版本，暴露全局 CatEngine，供静态页面加载。
 * 算法全部为本地代码实现：无网络、无 LLM。
 */
(function (global) {
  'use strict';

  var CONTRIBUTION_CORRECT = { 1: 50, 2: 60, 3: 75, 4: 90, 5: 100 };
  var CONTRIBUTION_WRONG = { 1: 20, 2: 30, 3: 45, 4: 50, 5: 60 };
  var FALLBACK_OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4, -4];

  function CatSession(config) {
    this.totalQuestions = config.totalQuestions != null ? config.totalQuestions : 18;
    this.perDimensionCap = config.perDimensionCap != null ? config.perDimensionCap : 3;
    this.rng = config.rng || Math.random;
    /* 复测避旧题：avoidIds 为历史已答题 id 集合，抽题时优先未答过的题 */
    this.avoidIds = config.avoidIds || {};
    /* 批次 2 · 测评设置 scope='wrongfirst'：wrongIds 为历史答错题 id 集合，
       wrongFirst=true 时在同维内优先抽历史错题（优先于未答题层） */
    this.wrongIds = config.wrongIds || {};
    this.wrongFirst = !!config.wrongFirst;
    /* 批次 2 · 计划自动匹配：planMatchFn(question)->0/1，同维同难度同层候选内
       优先选能匹配当前学习计划知识点的题，决策与日志带 planMatch 标记 */
    this.planMatchFn = typeof config.planMatchFn === 'function' ? config.planMatchFn : null;
    var initDiff = config.initialDifficulty != null ? config.initialDifficulty : 3;
    var initScore = config.initialScore != null ? config.initialScore : 50;
    this.dims = config.dimensions.map(function (name) {
      return { name: name, currentDifficulty: initDiff, score: initScore, answered: 0 };
    });
    this.byDim = {};
    for (var i = 0; i < config.bank.length; i++) {
      var q = config.bank[i];
      if (!this.byDim[q.dimension]) this.byDim[q.dimension] = [];
      this.byDim[q.dimension].push(q);
    }
    this.usedIds = {};
    this.cursor = 0;
    this.stepCount = 0;
    this.pending = null;
  }

  CatSession.prototype.unusedInDim = function (dimension) {
    var list = this.byDim[dimension] || [];
    var used = this.usedIds;
    return list.filter(function (q) { return !used[q.id]; });
  };

  CatSession.prototype.hasAnyAvailable = function () {
    var self = this;
    return this.dims.some(function (d) {
      return d.answered < self.perDimensionCap && self.unusedInDim(d.name).length > 0;
    });
  };

  CatSession.prototype.isFinished = function () {
    return this.stepCount >= this.totalQuestions ||
      (this.pending === null && !this.hasAnyAvailable());
  };

  CatSession.prototype.nextQuestion = function () {
    if (this.stepCount >= this.totalQuestions) return null;
    var n = this.dims.length;
    for (var scan = 0; scan < n; scan++) {
      var idx = (this.cursor + scan) % n;
      var dim = this.dims[idx];
      if (dim.answered >= this.perDimensionCap) continue;
      var unused = this.unusedInDim(dim.name);
      if (unused.length === 0) continue;

      var target = dim.currentDifficulty;
      var avoid = this.avoidIds;
      var wrongIds = this.wrongIds;
      var unseen = unused.filter(function (q) { return !avoid[q.id]; });
      var chosen = null;
      var poolSize = 0;
      var reused = false;
      var wrongPreferred = false;
      var planMatch = false;
      var self = this;
      /* 候选层（按优先级）：wrongFirst 时历史错题层在最前；其后是「从未答过」层；
         最后放开限制用全部未用题。每层内先目标难度、再按偏移同维跨难度兜底。
         层内同难度候选里，若有能匹配当前学习计划知识点的题，优先在其中抽。 */
      var tiers = [];
      if (this.wrongFirst) tiers.push({ list: unused.filter(function (q) { return !!wrongIds[q.id]; }), wrong: true });
      tiers.push({ list: unseen, wrong: false });
      tiers.push({ list: unused, wrong: false });
      for (var t = 0; t < tiers.length && !chosen; t++) {
        var tier = tiers[t];
        if (!tier.list.length) continue;
        for (var o = 0; o < FALLBACK_OFFSETS.length; o++) {
          var lvl = target + FALLBACK_OFFSETS[o];
          if (lvl < 1 || lvl > 5) continue;
          var pool = tier.list.filter(function (q) { return q.difficulty === lvl; });
          if (pool.length > 0) {
            poolSize = pool.length;
            var pickPool = pool;
            if (self.planMatchFn) {
              var pm = pool.filter(function (q) { return self.planMatchFn(q) > 0; });
              if (pm.length > 0) { pickPool = pm; planMatch = true; }
            }
            chosen = pickPool[Math.floor(this.rng() * pickPool.length)];
            wrongPreferred = !!tier.wrong;
            reused = !!avoid[chosen.id] && !wrongPreferred;
            break;
          }
        }
      }
      if (!chosen) continue;

      this.usedIds[chosen.id] = true;
      this.cursor = (idx + 1) % n;
      var decision = {
        step: this.stepCount + 1,
        dimension: dim.name,
        targetDifficulty: target,
        actualDifficulty: chosen.difficulty,
        fallback: chosen.difficulty !== target,
        poolSize: poolSize,
        unseenPoolSize: unseen.length,
        reused: reused,
        wrongPreferred: wrongPreferred,
        planMatch: planMatch,
        questionId: chosen.id,
        src: chosen.src,
        question: chosen
      };
      this.pending = decision;
      console.log('[CAT] 抽题决策', {
        step: decision.step,
        dimension: decision.dimension,
        targetDifficulty: decision.targetDifficulty,
        actualDifficulty: decision.actualDifficulty,
        fallback: decision.fallback,
        poolSize: decision.poolSize,
        unseenPoolSize: decision.unseenPoolSize,
        reused: decision.reused,
        wrongPreferred: decision.wrongPreferred,
        planMatch: decision.planMatch,
        questionId: decision.questionId,
        src: decision.src
      });
      return decision;
    }
    return null;
  };

  CatSession.prototype.answerCurrent = function (correct, skipped) {
    if (!this.pending) return null;
    var decision = this.pending;
    this.pending = null;
    var dim = null;
    for (var i = 0; i < this.dims.length; i++) {
      if (this.dims[i].name === decision.dimension) { dim = this.dims[i]; break; }
    }
    var isCorrect = skipped ? false : !!correct;

    var difficultyBefore = dim.currentDifficulty;
    var difficultyAfter = Math.min(5, Math.max(1, difficultyBefore + (isCorrect ? 1 : -1)));
    var contribution = (isCorrect ? CONTRIBUTION_CORRECT : CONTRIBUTION_WRONG)[decision.actualDifficulty];
    var scoreBefore = dim.score;
    var scoreAfter = scoreBefore * 0.55 + contribution * 0.45;

    dim.currentDifficulty = difficultyAfter;
    dim.score = scoreAfter;
    dim.answered += 1;
    this.stepCount += 1;

    var outcome = {
      step: decision.step,
      dimension: dim.name,
      correct: isCorrect,
      skipped: !!skipped,
      actualDifficulty: decision.actualDifficulty,
      targetDifficulty: decision.targetDifficulty,
      difficultyBefore: difficultyBefore,
      difficultyAfter: difficultyAfter,
      contribution: contribution,
      scoreBefore: Math.round(scoreBefore * 10) / 10,
      scoreAfter: Math.round(scoreAfter * 10) / 10
    };
    console.log('[CAT] 答题更新', outcome);
    return outcome;
  };

  CatSession.prototype.getState = function () {
    return this.dims.map(function (d) {
      return { name: d.name, currentDifficulty: d.currentDifficulty, score: d.score, answered: d.answered };
    });
  };

  CatSession.prototype.getResult = function () {
    var dimScores = this.dims.map(function (d) { return Math.round(d.score); });
    var sum = dimScores.reduce(function (a, b) { return a + b; }, 0);
    var totalScore = Math.round(sum / dimScores.length);
    var byName = {};
    this.dims.forEach(function (d, i) { byName[d.name] = dimScores[i]; });
    console.log('[CAT] 测评结束', { dimScores: byName, totalScore: totalScore });
    return { dimScores: dimScores, totalScore: totalScore };
  };

  /* ---- 进行中状态序列化 / 恢复（中途关闭浏览器后继续作答用） ---- */
  CatSession.prototype.serializeState = function () {
    return {
      dims: this.dims.map(function (d) {
        return { name: d.name, currentDifficulty: d.currentDifficulty, score: d.score, answered: d.answered };
      }),
      usedIds: Object.keys(this.usedIds),
      cursor: this.cursor,
      stepCount: this.stepCount,
      pendingId: this.pending ? this.pending.questionId : null,
      pendingTarget: this.pending ? this.pending.targetDifficulty : null,
      pendingActual: this.pending ? this.pending.actualDifficulty : null,
      pendingReused: this.pending ? !!this.pending.reused : false
    };
  };

  CatSession.prototype.restoreState = function (snap, bankById) {
    if (!snap) return false;
    for (var i = 0; i < this.dims.length && i < snap.dims.length; i++) {
      this.dims[i].currentDifficulty = snap.dims[i].currentDifficulty;
      this.dims[i].score = snap.dims[i].score;
      this.dims[i].answered = snap.dims[i].answered;
    }
    this.usedIds = {};
    (snap.usedIds || []).forEach(function (id) { this.usedIds[id] = true; }, this);
    this.cursor = snap.cursor || 0;
    this.stepCount = snap.stepCount || 0;
    this.pending = null;
    if (snap.pendingId != null && bankById && bankById[snap.pendingId]) {
      var q = bankById[snap.pendingId];
      this.pending = {
        step: this.stepCount + 1,
        dimension: q.dimension,
        targetDifficulty: snap.pendingTarget != null ? snap.pendingTarget : q.difficulty,
        actualDifficulty: snap.pendingActual != null ? snap.pendingActual : q.difficulty,
        fallback: (snap.pendingActual != null ? snap.pendingActual : q.difficulty) !== (snap.pendingTarget != null ? snap.pendingTarget : q.difficulty),
        poolSize: 0,
        reused: !!snap.pendingReused,
        questionId: q.id,
        src: q.src,
        question: q
      };
    }
    return !!this.pending;
  };

  function createCatSession(config) { return new CatSession(config); }

  global.CatEngine = {
    CatSession: CatSession,
    createCatSession: createCatSession,
    CONTRIBUTION_CORRECT: CONTRIBUTION_CORRECT,
    CONTRIBUTION_WRONG: CONTRIBUTION_WRONG
  };
})(window);
