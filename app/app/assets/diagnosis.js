/*
 * diagnosis.js — 弱点诊断 + 资源推荐引擎（纯本地规则拼装）
 * 源文件：src/services/diagnosis-engine.ts；本文件为同逻辑的经典脚本版。
 * 输入：CAT 维度分 + 答题记录（含题库元数据）；输出：结构化诊断对象。
 * 全程无网络、无 LLM：错因逐字引用题库干扰项解析，总结走预写句式库，
 * 资源走预制资源库标签匹配。
 */
(function (global) {
  'use strict';
  var DATA = global.DIAG_DATA;

  function subOf(r) { return r.sub_topic || r.subTopic || ''; }
  function examOf(r) { return r.exam_points || r.examPoints || []; }
  function diffPtsOf(r) { return r.difficulty_points || r.difficultyPoints || []; }
  function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return Math.abs(h); }
  function hasBlacklist(text) { return DATA.BLACKLIST.some(function (w) { return text.indexOf(w) >= 0; }); }
  function bandIndex(score) { if (score < 40) return 0; if (score < 60) return 1; if (score < 80) return 2; return 3; }

  function pickSummary(dimName, mainWrong) {
    var templates = DATA.SUMMARY_TEMPLATES[dimName] || [];
    if (mainWrong && subOf(mainWrong).length > 12 && DATA.SUMMARY_LONG[dimName]) return DATA.SUMMARY_LONG[dimName];
    if (mainWrong && templates.length) {
      var t = subOf(mainWrong).slice(0, 10);
      var start = hashStr(dimName + '|' + subOf(mainWrong)) % templates.length;
      for (var k = 0; k < templates.length; k++) {
        var s = templates[(start + k) % templates.length].replace('{t}', t);
        if (s.length <= 30 && !hasBlacklist(s)) return s;
      }
    }
    return DATA.SUMMARY_FALLBACK[dimName] || '这一维度的判断还需要再稳一稳';
  }

  function patternSentence(r) {
    var d = r.difficulty || 3;
    if (r.skipped) return '本题你选择了跳过，说明当时完全没有可用的判断抓手——先补这个子考点的概念，再谈做题技巧。';
    if (d <= 2) return '这是基础难度题，说明这个概念本身还没立住，先补概念再谈应用。';
    if ((r.timeSec || 0) > 0 && r.timeSec < 15) return '你这题只用了 ' + r.timeSec + ' 秒，更像是概念未成形时的直觉选择；下次先想清判断标准再选。';
    if (d >= 4) return '这是高难度题，难在多因素权衡，错往往出在取舍顺序，而不是单个概念不懂。';
    return '难度适中却答错，通常是判断标准还没内化，遇到具体场景就套不上去。';
  }

  function buildWeakBlock(r, seq) {
    var lines = [];
    if (!r.skipped && r.selectedAnalysis) {
      lines.push('你所选选项的解析原文：「' + r.selectedAnalysis + '」');
    } else if (r.skipped) {
      lines.push('本题未作答，没有可引用的选项解析；结合本题难点看你缺的是哪一步判断。');
    }
    var dp = diffPtsOf(r);
    if (dp.length) lines.push('本题难点：' + dp.slice(0, 2).join('；') + '。');
    lines.push(patternSentence(r));
    var stem = r.stem || '';
    return {
      title: subOf(r),
      seq: seq,
      src: r.src || '',
      difficulty: r.difficulty || 3,
      skipped: !!r.skipped,
      evidence: '在第 ' + seq + ' 题' + (r.src ? '（' + r.src + ' · 难度 ' + (r.difficulty || 3) + '）' : '') + '：' + (stem.length > 40 ? stem.slice(0, 40) + '…' : stem),
      cause: lines.join('')
    };
  }

  function encouragementFor(dimRecords, allRecords) {
    function best(list) {
      var b = null;
      list.forEach(function (e) {
        if (!e.r.correct) return;
        if (!b || (e.r.difficulty || 0) > (b.r.difficulty || 0)) b = e;
      });
      return b;
    }
    function sentence(e, prefix) {
      var ex = examOf(e.r);
      return prefix + '你在第 ' + e.seq + ' 题（难度 ' + (e.r.difficulty || 3) + '）答对了『' + subOf(e.r) + '』' +
        (ex.length ? '——这道题考的是' + ex[0] : '') + '，说明这一块你已经有判断力，答题节奏可以保持。';
    }
    var inDim = best(dimRecords);
    if (inDim) return sentence(inDim, '');
    var inAll = best(allRecords);
    if (inAll) return sentence(inAll, '这个维度这次没有答对的题，但放眼全卷，');
    return DATA.FALLBACK_ENCOURAGEMENT;
  }

  var POINTS_BY_DIM = [[0, 1, 2, 18, 19], [3, 4, 5, 20], [6, 7, 8, 21, 22], [9, 10, 11, 23, 24], [12, 13, 14, 25], [15, 16, 17, 26]];
  /* 批次 8（一-4）统一口径：匹配文本 = 子考点 + 考核点 + 难点 + 题干，与 goal-link / review-link 同组成；
     批次 8（二-2）：同时返回 bestLen，bestLen=0 表示未精确命中任何关键词，界面不得把回落知识点当精确匹配呈现。 */
  function matchPointDetailed(dimIdx, r) {
    var candidates = POINTS_BY_DIM[dimIdx] || [dimIdx * 3];
    if (!r) return { index: candidates[0], bestLen: 0 };
    var text = (subOf(r) + ' ' + examOf(r).join(' ') + ' ' + diffPtsOf(r).join(' ') + ' ' + (r.stem || '')).toLowerCase();
    var bestIdx = candidates[0], bestLen = 0;
    candidates.forEach(function (pi) {
      var kws = DATA.POINT_KEYWORDS[pi] || [];
      kws.forEach(function (kw) {
        var k = kw.toLowerCase();
        if (k.length > bestLen && text.indexOf(k) >= 0) { bestLen = k.length; bestIdx = pi; }
      });
    });
    return { index: bestIdx, bestLen: bestLen };
  }
  function matchPointIndex(dimIdx, r) { return matchPointDetailed(dimIdx, r).index; }

  function findRedoCandidate(dimName, r, allRecords, bank) {
    var used = {};
    allRecords.forEach(function (e) { used[e.r.questionId || e.r.id] = true; });
    var myExam = examOf(r).join(' ');
    var bestC = null, bestScore = -1;
    (bank || []).forEach(function (q) {
      if (q.dimension !== dimName || used[q.id] || q.id === (r.questionId || r.id)) return;
      var s = 0;
      (q.exam_points || []).forEach(function (p) { if (myExam.indexOf(p.slice(0, 4)) >= 0) s += 2; });
      if (q.difficulty === r.difficulty) s += 1;
      if (s > bestScore) { bestScore = s; bestC = q; }
    });
    return bestC;
  }

  function matchResources(dimName, wrongRecords) {
    var lib = DATA.RESOURCES.filter(function (x) { return x.dimension === dimName; });
    var scored = lib.map(function (res, order) {
      var best = 0, bestRec = null;
      wrongRecords.forEach(function (e) {
        var text = (subOf(e.r) + ' ' + (e.r.stem || '') + ' ' + examOf(e.r).join(' ')).toLowerCase();
        var s = 0;
        res.tags.forEach(function (tag) { if (text.indexOf(tag.toLowerCase()) >= 0) s++; });
        if (s > best) { best = s; bestRec = e.r; }
      });
      return { res: res, score: best, rec: bestRec, order: order };
    });
    scored.sort(function (a, b) { return b.score - a.score || a.order - b.order; });
    var matched = scored.filter(function (x) { return x.score > 0; });
    var rest = scored.filter(function (x) { return x.score <= 0; });
    var picked = matched.slice(0, 5);
    var target = Math.min(4, scored.length);
    for (var i = 0; picked.length < target && i < rest.length; i++) picked.push(rest[i]);
    return picked.map(function (x) {
      return {
        title: x.res.title, platform: x.res.platform, type: x.res.type, minutes: x.res.minutes,
        keywords: x.res.keywords,
        reason: (x.score > 0 && x.rec) ? '针对你在「' + subOf(x.rec) + '」上的错题：' + x.res.reason : x.res.reason
      };
    });
  }

  function buildDimension(dimName, dimIdx, score, allRecords, bank) {
    var dimRecords = allRecords.filter(function (e) { return e.r.dimension === dimName; });
    var wrong = dimRecords.filter(function (e) { return !e.r.correct; });
    var base = { dimension: dimName, score: score, encouragement: encouragementFor(dimRecords, allRecords), resources: matchResources(dimName, wrong) };
    if (dimRecords.length <= 2) {
      base.kind = 'insufficient';
      base.summary = DATA.SUMMARY_FALLBACK[dimName];
      return base;
    }
    if (score > 90) {
      var used = {};
      allRecords.forEach(function (e) { used[e.r.questionId || e.r.id] = true; });
      var subs = [], seen = {};
      (bank || []).forEach(function (q) {
        if (q.dimension === dimName && q.difficulty >= 4 && !used[q.id] && !seen[q.sub_topic] && subs.length < 3) { seen[q.sub_topic] = true; subs.push(q.sub_topic); }
      });
      base.kind = 'mastery';
      base.summary = '这个维度你已经掌握得很好';
      base.challenge = { subs: subs, pointIndex: dimIdx * 3 + 2 };
      return base;
    }
    var hasEvidence = wrong.some(function (e) { return e.r.skipped || !!e.r.selectedAnalysis; });
    if (wrong.length && hasEvidence) {
      base.kind = 'personal';
      base.summary = pickSummary(dimName, wrong[0].r);
      base.blocks = wrong.map(function (e) {
        var block = buildWeakBlock(e.r, e.seq);
        var md = matchPointDetailed(dimIdx, e.r);
        block.pointIndex = md.index;
        block.pointMatched = md.bestLen > 0;
        block.redo = findRedoCandidate(dimName, e.r, allRecords, bank);
        return block;
      });
      return base;
    }
    var bd = DATA.BASE_DIAGNOSIS[dimName][bandIndex(score)];
    base.kind = 'base';
    base.summary = bd.summary;
    base.baseText = bd.text;
    return base;
  }

  function buildAll(scores, dimNames, records, bank) {
    var all = records.map(function (r, i) { return { r: r, seq: i + 1 }; });
    return dimNames.map(function (name, i) { return buildDimension(name, i, scores[i], all, bank); });
  }

  global.Diagnosis = {
    buildAll: buildAll,
    matchResources: matchResources,
    _test: { pickSummary: pickSummary, patternSentence: patternSentence, bandIndex: bandIndex, hasBlacklist: hasBlacklist }
  };
})(window);
