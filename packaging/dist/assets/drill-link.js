/*
 * drill-link.js — 批次 4 纯逻辑：面试演练（自评式，基于《完整扩写版》547 条）
 * 源文件：src/services/drill-link.ts；本文件为同逻辑的经典脚本版，暴露全局 DrillLink。
 * 纯函数、无 DOM / 无网络 / 无 LLM：页面负责读写 localStorage 与渲染，
 * 本模块只做演练统计、筛选、组题、自评状态迁移与五段正文的 Markdown 渲染。
 * Node 自测可直接加载本文件执行 DRL 用例。
 *
 * 数据形状（Suzuki 定版）：
 * - 演练题库 assets/drill-bank.js：DRILL_BANK = [{gid, srcGid, title, question,
 *   dimension, difficulty, sections:{ask, explain, case, pitfalls, followup}}]
 *   gid 为演练内唯一键：有原题号的用 G 号；原 50 题版第 22/48 题同对应 G178，
 *   第二条记为 G178-2；原 50 题版第 7/8/45 题无对应原题，记为 E7/E8/E45
 *   （srcGid 保留其原始对应关系，维度/难度取题库转换数据；无对应原题的三条
 *   dimension/difficulty 为 null，不做静默填充）。
 * - 自评存储 aipm.drill.v1：{ gid: { rating:'mastered'|'fuzzy'|'unknown', lastAt:ISO, count } }
 * - 自评只有三档、由用户自己点选；本模块不做任何自动评分。
 */
(function (global) {
  'use strict';

  var DRILL_KEY = 'aipm.drill.v1';
  var RATINGS = ['mastered', 'fuzzy', 'unknown'];
  var RATING_LABELS = { mastered: '掌握', fuzzy: '模糊', unknown: '不会' };
  var GROUP_SIZES = [3, 5, 10];
  var SECTION_ORDER = [
    { key: 'ask', label: '一、这题在问什么' },
    { key: 'explain', label: '二、参考答案大白话拆解' },
    { key: 'case', label: '三、小像实机案例' },
    { key: 'pitfalls', label: '四、新手常见的坑' },
    { key: 'followup', label: '五、追问预案 + 一句话总结' }
  ];

  /* ---------- 存储规整 ---------- */
  function normalizeStore(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(function (gid) {
      var v = raw[gid];
      if (v && typeof v === 'object' && RATINGS.indexOf(v.rating) >= 0) {
        out[gid] = {
          rating: v.rating,
          lastAt: typeof v.lastAt === 'string' ? v.lastAt : '',
          count: (typeof v.count === 'number' && v.count > 0) ? Math.floor(v.count) : 1
        };
      }
    });
    return out;
  }

  /* ---------- 统计 ---------- */
  function stats(bank, store) {
    var s = { total: (bank || []).length, practiced: 0, mastered: 0, fuzzy: 0, unknown: 0, unpracticed: 0 };
    (bank || []).forEach(function (e) {
      var r = store && store[e.gid];
      if (r && RATINGS.indexOf(r.rating) >= 0) { s.practiced++; s[r.rating]++; }
    });
    s.unpracticed = s.total - s.practiced;
    return s;
  }

  /* ---------- 筛选 ----------
   * filter = { dim: 维度名|null（null=全部维度）, mode: 'all'|'unpracticed'|'fuzzy'|'unknown'|'weak' }
   * 'weak' = 待加强（模糊 + 不会）。维度为 null 的条目只在 dim=null 时出现。 */
  function filterBank(bank, store, filter) {
    var dim = filter && filter.dim != null ? filter.dim : null;
    var mode = (filter && filter.mode) || 'all';
    return (bank || []).filter(function (e) {
      if (dim !== null && e.dimension !== dim) return false;
      var r = store && store[e.gid];
      var rating = r ? r.rating : null;
      if (mode === 'all') return true;
      if (mode === 'unpracticed') return !rating;
      if (mode === 'fuzzy') return rating === 'fuzzy';
      if (mode === 'unknown') return rating === 'unknown';
      if (mode === 'weak') return rating === 'fuzzy' || rating === 'unknown';
      return true;
    });
  }

  /* ---------- 待加强列表：模糊 + 不会，按最近自评时间倒序 ---------- */
  function weakList(bank, store) {
    var byGid = {};
    (bank || []).forEach(function (e) { byGid[e.gid] = e; });
    var out = [];
    Object.keys(store || {}).forEach(function (gid) {
      var r = store[gid];
      if (r && (r.rating === 'fuzzy' || r.rating === 'unknown') && byGid[gid]) {
        out.push({ entry: byGid[gid], rating: r.rating, lastAt: r.lastAt, count: r.count });
      }
    });
    out.sort(function (a, b) {
      if (a.lastAt === b.lastAt) return a.entry.gid < b.entry.gid ? -1 : 1;
      return a.lastAt < b.lastAt ? 1 : -1;
    });
    return out;
  }

  /* ---------- 组题：从候选池随机抽 count 题（count 只能是 3/5/10，池不足取全部） ---------- */
  function pickGroup(pool, count, rng) {
    var n = GROUP_SIZES.indexOf(count) >= 0 ? count : 5;
    var arr = (pool || []).slice();
    var rand = typeof rng === 'function' ? rng : Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr.slice(0, Math.min(n, arr.length));
  }

  /* ---------- 自评写入：返回新 store（不改入参） ---------- */
  function applyRating(store, gid, rating, nowIso) {
    if (RATINGS.indexOf(rating) < 0 || !gid) return normalizeStore(store);
    var next = normalizeStore(store);
    var prev = next[gid];
    next[gid] = {
      rating: rating,
      lastAt: typeof nowIso === 'string' && nowIso ? nowIso : new Date().toISOString(),
      count: (prev ? prev.count : 0) + 1
    };
    return next;
  }

  /* ---------- 一组小结：本组自评分布 + 涉及维度（保持题序去重） ---------- */
  function groupSummary(items) {
    var counts = { mastered: 0, fuzzy: 0, unknown: 0 };
    var dims = [];
    (items || []).forEach(function (it) {
      if (it && RATINGS.indexOf(it.rating) >= 0) counts[it.rating]++;
      var d = it && it.entry ? it.entry.dimension : null;
      if (d && dims.indexOf(d) < 0) dims.push(d);
    });
    return { counts: counts, dims: dims, total: (items || []).length };
  }

  /* ---------- Markdown → HTML（仅覆盖扩写版正文用到的语法） ----------
   * 支持：####/### 标题、``` 代码块、| 表格 |、- / * / 1. 列表、> 引用、--- 分隔、
   * **粗体**、`行内代码`。先转义 HTML 再套格式，题库文本不会被当成标签执行。 */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function inline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
  }
  function isTableRow(line) { return /^\s*\|.*\|\s*$/.test(line); }
  function isTableSep(line) { return /^\s*\|[\s:|-]+\|\s*$/.test(line); }
  function mdToHtml(md) {
    var lines = String(md || '').split('\n');
    var out = [];
    var i = 0;
    function flushList(tag, items) {
      out.push('<' + tag + '>' + items.map(function (t) { return '<li>' + inline(t) + '</li>'; }).join('') + '</' + tag + '>');
    }
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*```/.test(line)) {
        var buf = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        out.push('<pre>' + esc(buf.join('\n')) + '</pre>');
        continue;
      }
      if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        var head = line.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return '<th>' + inline(c.trim()) + '</th>'; }).join('');
        i += 2;
        var rows = [];
        while (i < lines.length && isTableRow(lines[i])) {
          rows.push('<tr>' + lines[i].trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return '<td>' + inline(c.trim()) + '</td>'; }).join('') + '</tr>');
          i++;
        }
        out.push('<table><thead><tr>' + head + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>');
        continue;
      }
      var hm = line.match(/^(#{3,6})\s+(.*)$/);
      if (hm) { out.push('<h5>' + inline(hm[2]) + '</h5>'); i++; continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
      if (/^\s*>\s?/.test(line)) {
        var qb = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { qb.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push('<blockquote>' + qb.map(inline).join('<br>') + '</blockquote>');
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { ul.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
        flushList('ul', ul);
        continue;
      }
      if (/^\s*\d+[.、]\s+/.test(line)) {
        var ol = [];
        while (i < lines.length && /^\s*\d+[.、]\s+/.test(lines[i])) { ol.push(lines[i].replace(/^\s*\d+[.、]\s+/, '')); i++; }
        flushList('ol', ol);
        continue;
      }
      if (/^\s*$/.test(line)) { i++; continue; }
      var pb = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{3,6})\s/.test(lines[i]) &&
             !/^\s*```/.test(lines[i]) && !isTableRow(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) &&
             !/^\s*\d+[.、]\s+/.test(lines[i]) && !/^\s*>/.test(lines[i])) {
        pb.push(lines[i]); i++;
      }
      out.push('<p>' + pb.map(inline).join('<br>') + '</p>');
    }
    return out.join('\n');
  }

  global.DrillLink = {
    DRILL_KEY: DRILL_KEY,
    RATINGS: RATINGS,
    RATING_LABELS: RATING_LABELS,
    GROUP_SIZES: GROUP_SIZES,
    SECTION_ORDER: SECTION_ORDER,
    normalizeStore: normalizeStore,
    stats: stats,
    filterBank: filterBank,
    weakList: weakList,
    pickGroup: pickGroup,
    applyRating: applyRating,
    groupSummary: groupSummary,
    mdToHtml: mdToHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
