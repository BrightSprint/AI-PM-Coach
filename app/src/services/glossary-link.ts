/*
 * glossary-link.ts — 知识搜索纯逻辑：本地匹配排序 / 摘要 / 相关知识点匹配
 * 运行时加载的是同逻辑的经典脚本版 assets/glossary-link.js（全局 GlossaryLink）。
 * 纯函数、无 DOM / 无存储 / 无网络 / 无 LLM：页面负责渲染，数据来自 assets/glossary.js。
 *
 * 词条形状（数据生成脚本产出，源为知识库 104 条 + 补强篇 20 条的原文三段式拆分）：
 * { id, term, cat: '技术术语'|'应用工具'|'产品名词'|'补强', concept, usage, notes,
 *   supp: Array<'concept'|'usage'|'notes'>, kw: string[], kp: number|null }
 * supp 记录靠通用补写成的段（原文缺该段材料），界面会明确标注，不冒充原文。
 * 搜索排序口径：标题精确 > 标题前缀 > 标题包含 > 关键词命中 > 正文关键词计分；
 * 同分按词条 id 序（即原知识库顺序）稳定排序。
 */

export interface GlossaryEntry {
  id: string;
  term: string;
  cat: string;
  concept: string;
  usage: string;
  notes: string;
  supp: string[];
  kw: string[];
  kp: number | null;
}

export const GLOSSARY_CATS: string[] = ['全部', '技术术语', '应用工具', '产品名词', '补强'];

function norm(s: string): string {
  return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '');
}

/* 单个查询词对词条的命中分：标题层级优先，其次关键词，再次正文出现次数 */
function scoreTerm(e: GlossaryEntry, q: string): number {
  if (!q) { return 0; }
  const term = norm(e.term);
  if (term === q) { return 1000; }
  if (term.indexOf(q) === 0) { return 800; }
  if (term.indexOf(q) >= 0) { return 600; }
  let s = 0;
  (e.kw || []).forEach(function (k) {
    const kk = norm(k);
    if (kk === q) { s = Math.max(s, 500); }
    else if (kk.indexOf(q) >= 0) { s = Math.max(s, 400); }
    else if (q.indexOf(kk) >= 0 && kk.length >= 2) { s = Math.max(s, 300); }
  });
  if (s > 0) { return s; }
  const body = norm(e.concept + '\n' + e.usage + '\n' + e.notes);
  let idx = body.indexOf(q), cnt = 0;
  while (idx >= 0 && cnt < 10) { cnt++; idx = body.indexOf(q, idx + q.length); }
  if (cnt > 0) { return 100 + cnt * 10; }
  /* 兜底：查询的每个字都在标题中出现（无序）时给低分，保证中文分词缺失时仍有召回 */
  if (q.length >= 2) {
    const chars = q.split('');
    if (chars.every(function (c) { return term.indexOf(c) >= 0; })) { return 50; }
  }
  return 0;
}

/* 搜索：先按分类过滤，再按总分降序；空查询返回该分类全部（原序） */
export function searchGlossary(entries: GlossaryEntry[], query: string, cat: string): GlossaryEntry[] {
  const pool = (entries || []).filter(function (e) { return !cat || cat === '全部' || e.cat === cat; });
  const q = norm(query || '');
  if (!q) { return pool.slice(); }
  const tokens = String(query || '').split(/[\s,，、;；\/]+/).map(norm).filter(Boolean);
  const scored = pool.map(function (e, i) {
    let total = scoreTerm(e, q);
    if (tokens.length > 1) {
      tokens.forEach(function (t) { total += scoreTerm(e, t); });
    }
    return { e: e, i: i, s: total };
  }).filter(function (r) { return r.s > 0; });
  scored.sort(function (a, b) { return (b.s - a.s) || (a.i - b.i); });
  return scored.map(function (r) { return r.e; });
}

/* 列表摘要：概念段首句（到第一个句号为止），过长截断 */
export function summaryOf(e: GlossaryEntry, maxLen?: number): string {
  const limit = maxLen || 64;
  const c = String(e.concept || '');
  const end = c.indexOf('。');
  let s = end >= 0 ? c.slice(0, end + 1) : c;
  if (s.length > limit) { s = s.slice(0, limit) + '…'; }
  return s;
}

/* 相关知识点：条目自带 kp 优先；否则用词条名/关键词与知识点标题、关键词字段做包含匹配，
 * 只返回有命中的（最多 2 个），链不上返回空数组，不硬凑。 */
export function relatedPoints(e: GlossaryEntry, points: Array<{ t: string; kw?: string }>): number[] {
  if (typeof e.kp === 'number' && e.kp >= 0 && e.kp < points.length) { return [e.kp]; }
  const needles = [e.term].concat(e.kw || []).map(norm).filter(function (x) { return x.length >= 2; });
  const hits: Array<{ i: number; s: number }> = [];
  points.forEach(function (p, i) {
    const hay = norm(p.t + ' ' + (p.kw || ''));
    let s = 0;
    needles.forEach(function (n) { if (hay.indexOf(n) >= 0) { s += n.length; } });
    if (s > 0) { hits.push({ i: i, s: s }); }
  });
  hits.sort(function (a, b) { return (b.s - a.s) || (a.i - b.i); });
  return hits.slice(0, 2).map(function (h) { return h.i; });
}
