/*
 * glossary-link.js — 知识搜索纯逻辑：本地匹配排序 / 摘要 / 相关知识点匹配
 * 源文件：src/services/glossary-link.ts；本文件为同逻辑的经典脚本版，暴露全局 GlossaryLink。
 * 纯函数、无 DOM / 无存储 / 无网络 / 无 LLM：页面负责渲染，数据来自 assets/glossary.js。
 *
 * 词条形状：{ id, term, cat, concept, usage, notes, supp[], kw[], kp }
 * supp 记录靠通用补写成的段（原文缺该段材料），界面明确标注，不冒充原文。
 * 搜索排序口径：标题精确 > 标题前缀 > 标题包含 > 关键词命中 > 正文关键词计分；同分按原序。
 */
(function (global) {
  'use strict';

  var GLOSSARY_CATS = ['全部', '技术术语', '应用工具', '产品名词', '补强'];

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
  }

  function scoreTerm(e, q) {
    if (!q) { return 0; }
    var term = norm(e.term);
    if (term === q) { return 1000; }
    if (term.indexOf(q) === 0) { return 800; }
    if (term.indexOf(q) >= 0) { return 600; }
    var s = 0;
    (e.kw || []).forEach(function (k) {
      var kk = norm(k);
      if (kk === q) { s = Math.max(s, 500); }
      else if (kk.indexOf(q) >= 0) { s = Math.max(s, 400); }
      else if (q.indexOf(kk) >= 0 && kk.length >= 2) { s = Math.max(s, 300); }
    });
    if (s > 0) { return s; }
    var body = norm(e.concept + '\n' + e.usage + '\n' + e.notes);
    var idx = body.indexOf(q), cnt = 0;
    while (idx >= 0 && cnt < 10) { cnt++; idx = body.indexOf(q, idx + q.length); }
    if (cnt > 0) { return 100 + cnt * 10; }
    if (q.length >= 2) {
      var chars = q.split('');
      var all = true;
      for (var i = 0; i < chars.length; i++) { if (term.indexOf(chars[i]) < 0) { all = false; break; } }
      if (all) { return 50; }
    }
    return 0;
  }

  function searchGlossary(entries, query, cat) {
    var pool = (entries || []).filter(function (e) { return !cat || cat === '全部' || e.cat === cat; });
    var q = norm(query || '');
    if (!q) { return pool.slice(); }
    var tokens = String(query || '').split(/[\s,，、;；\/]+/).map(norm).filter(Boolean);
    var scored = pool.map(function (e, i) {
      var total = scoreTerm(e, q);
      if (tokens.length > 1) { tokens.forEach(function (t) { total += scoreTerm(e, t); }); }
      return { e: e, i: i, s: total };
    }).filter(function (r) { return r.s > 0; });
    scored.sort(function (a, b) { return (b.s - a.s) || (a.i - b.i); });
    return scored.map(function (r) { return r.e; });
  }

  function summaryOf(e, maxLen) {
    var limit = maxLen || 64;
    var c = String(e.concept || '');
    var end = c.indexOf('。');
    var s = end >= 0 ? c.slice(0, end + 1) : c;
    if (s.length > limit) { s = s.slice(0, limit) + '…'; }
    return s;
  }

  function relatedPoints(e, points) {
    if (typeof e.kp === 'number' && e.kp >= 0 && e.kp < points.length) { return [e.kp]; }
    var needles = [e.term].concat(e.kw || []).map(norm).filter(function (x) { return x.length >= 2; });
    var hits = [];
    points.forEach(function (p, i) {
      var hay = norm(p.t + ' ' + (p.kw || ''));
      var s = 0;
      needles.forEach(function (n) { if (hay.indexOf(n) >= 0) { s += n.length; } });
      if (s > 0) { hits.push({ i: i, s: s }); }
    });
    hits.sort(function (a, b) { return (b.s - a.s) || (a.i - b.i); });
    return hits.slice(0, 2).map(function (h) { return h.i; });
  }

  global.GlossaryLink = {
    GLOSSARY_CATS: GLOSSARY_CATS,
    searchGlossary: searchGlossary,
    summaryOf: summaryOf,
    relatedPoints: relatedPoints,
    _scoreTerm: scoreTerm
  };
})(typeof window !== 'undefined' ? window : globalThis);
