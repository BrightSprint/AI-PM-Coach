/*
 * drill-link.ts — 批次 4 纯逻辑：面试演练（自评式，基于《完整扩写版》547 条）
 * 运行时加载的是同逻辑的经典脚本版 assets/drill-link.js（全局 DrillLink）。
 * 纯函数、无 DOM / 无网络 / 无 LLM：页面负责读写 localStorage 与渲染。
 *
 * 数据形状（Suzuki 定版）：
 * - 演练题库 assets/drill-bank.js：DRILL_BANK = [{gid, srcGid, title, question,
 *   dimension, difficulty, sections:{ask, explain, case, pitfalls, followup}}]
 *   gid 为演练内唯一键：有原题号的用 G 号；原 50 题版第 22/48 题同对应 G178，
 *   第二条记为 G178-2；原 50 题版第 7/8/45 题无对应原题，记为 E7/E8/E45
 *   （srcGid 保留其原始对应关系；无对应原题的三条 dimension/difficulty 为 null，不做静默填充）。
 *   G39 第三段原稿题为「六个坑逐个拆透」，内容即实机案例，解析映射为 case 段。
 * - 自评存储 aipm.drill.v1：{ gid: { rating:'mastered'|'fuzzy'|'unknown', lastAt:ISO, count } }
 * - 自评只有三档、由用户自己点选；不做任何自动评分。
 */

export type DrillRating = 'mastered' | 'fuzzy' | 'unknown';
export interface DrillEntry {
  gid: string;
  srcGid: string | null;
  title: string;
  question: string;
  dimension: string | null;
  difficulty: number | null;
  sections: { ask: string; explain: string; case: string; pitfalls: string; followup: string };
}
export interface DrillRecord { rating: DrillRating; lastAt: string; count: number }
export type DrillStore = Record<string, DrillRecord>;
export interface DrillFilter { dim?: string | null; mode?: 'all' | 'unpracticed' | 'fuzzy' | 'unknown' | 'weak' }

export const DRILL_KEY = 'aipm.drill.v1';
export const RATINGS: DrillRating[] = ['mastered', 'fuzzy', 'unknown'];
export const RATING_LABELS: Record<DrillRating, string> = { mastered: '掌握', fuzzy: '模糊', unknown: '不会' };
export const GROUP_SIZES = [3, 5, 10];
export const SECTION_ORDER = [
  { key: 'ask', label: '一、这题在问什么' },
  { key: 'explain', label: '二、参考答案大白话拆解' },
  { key: 'case', label: '三、小像实机案例' },
  { key: 'pitfalls', label: '四、新手常见的坑' },
  { key: 'followup', label: '五、追问预案 + 一句话总结' }
] as const;

/* 与 assets/drill-link.js 同逻辑的类型化源文件；运行时以 .js 版为准。 */
export function normalizeStore(raw: unknown): DrillStore {
  const out: DrillStore = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.keys(raw as object).forEach((gid) => {
    const v = (raw as Record<string, DrillRecord>)[gid];
    if (v && typeof v === 'object' && RATINGS.includes(v.rating)) {
      out[gid] = {
        rating: v.rating,
        lastAt: typeof v.lastAt === 'string' ? v.lastAt : '',
        count: typeof v.count === 'number' && v.count > 0 ? Math.floor(v.count) : 1
      };
    }
  });
  return out;
}

export function stats(bank: DrillEntry[], store: DrillStore) {
  const s = { total: (bank || []).length, practiced: 0, mastered: 0, fuzzy: 0, unknown: 0, unpracticed: 0 };
  (bank || []).forEach((e) => {
    const r = store && store[e.gid];
    if (r && RATINGS.includes(r.rating)) { s.practiced++; s[r.rating]++; }
  });
  s.unpracticed = s.total - s.practiced;
  return s;
}

export function filterBank(bank: DrillEntry[], store: DrillStore, filter: DrillFilter): DrillEntry[] {
  const dim = filter && filter.dim != null ? filter.dim : null;
  const mode = (filter && filter.mode) || 'all';
  return (bank || []).filter((e) => {
    if (dim !== null && e.dimension !== dim) return false;
    const rating = store && store[e.gid] ? store[e.gid].rating : null;
    if (mode === 'all') return true;
    if (mode === 'unpracticed') return !rating;
    if (mode === 'fuzzy') return rating === 'fuzzy';
    if (mode === 'unknown') return rating === 'unknown';
    if (mode === 'weak') return rating === 'fuzzy' || rating === 'unknown';
    return true;
  });
}

export function weakList(bank: DrillEntry[], store: DrillStore) {
  const byGid: Record<string, DrillEntry> = {};
  (bank || []).forEach((e) => { byGid[e.gid] = e; });
  const out: { entry: DrillEntry; rating: DrillRating; lastAt: string; count: number }[] = [];
  Object.keys(store || {}).forEach((gid) => {
    const r = store[gid];
    if (r && (r.rating === 'fuzzy' || r.rating === 'unknown') && byGid[gid]) {
      out.push({ entry: byGid[gid], rating: r.rating, lastAt: r.lastAt, count: r.count });
    }
  });
  out.sort((a, b) => (a.lastAt === b.lastAt ? (a.entry.gid < b.entry.gid ? -1 : 1) : a.lastAt < b.lastAt ? 1 : -1));
  return out;
}

export function pickGroup(pool: DrillEntry[], count: number, rng?: () => number): DrillEntry[] {
  const n = GROUP_SIZES.includes(count) ? count : 5;
  const arr = (pool || []).slice();
  const rand = typeof rng === 'function' ? rng : Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr.slice(0, Math.min(n, arr.length));
}

export function applyRating(store: DrillStore, gid: string, rating: DrillRating, nowIso?: string): DrillStore {
  if (!RATINGS.includes(rating) || !gid) return normalizeStore(store);
  const next = normalizeStore(store);
  const prev = next[gid];
  next[gid] = {
    rating,
    lastAt: typeof nowIso === 'string' && nowIso ? nowIso : new Date().toISOString(),
    count: (prev ? prev.count : 0) + 1
  };
  return next;
}

export function groupSummary(items: { entry: DrillEntry; rating: DrillRating }[]) {
  const counts: Record<DrillRating, number> = { mastered: 0, fuzzy: 0, unknown: 0 };
  const dims: string[] = [];
  (items || []).forEach((it) => {
    if (it && RATINGS.includes(it.rating)) counts[it.rating]++;
    const d = it && it.entry ? it.entry.dimension : null;
    if (d && !dims.includes(d)) dims.push(d);
  });
  return { counts, dims, total: (items || []).length };
}

/* mdToHtml：与 assets/drill-link.js 同实现的 Markdown 子集渲染（标题/代码块/表格/列表/引用/粗体/行内代码，先转义后套格式）。 */
export function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inline(s: string): string {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
}
function isTableRow(line: string): boolean { return /^\s*\|.*\|\s*$/.test(line); }
function isTableSep(line: string): boolean { return /^\s*\|[\s:|-]+\|\s*$/.test(line); }
export function mdToHtml(md: string): string {
  const lines = String(md || '').split('\n');
  const out: string[] = [];
  let i = 0;
  const flushList = (tag: string, items: string[]) => {
    out.push('<' + tag + '>' + items.map((t) => '<li>' + inline(t) + '</li>').join('') + '</' + tag + '>');
  };
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push('<pre>' + esc(buf.join('\n')) + '</pre>');
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => '<th>' + inline(c.trim()) + '</th>').join('');
      i += 2;
      const rows: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push('<tr>' + lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => '<td>' + inline(c.trim()) + '</td>').join('') + '</tr>');
        i++;
      }
      out.push('<table><thead><tr>' + head + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>');
      continue;
    }
    const hm = line.match(/^(#{3,6})\s+(.*)$/);
    if (hm) { out.push('<h5>' + inline(hm[2]) + '</h5>'); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\s*>\s?/.test(line)) {
      const qb: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { qb.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push('<blockquote>' + qb.map(inline).join('<br>') + '</blockquote>');
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const ul: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { ul.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      flushList('ul', ul);
      continue;
    }
    if (/^\s*\d+[.、]\s+/.test(line)) {
      const ol: string[] = [];
      while (i < lines.length && /^\s*\d+[.、]\s+/.test(lines[i])) { ol.push(lines[i].replace(/^\s*\d+[.、]\s+/, '')); i++; }
      flushList('ol', ol);
      continue;
    }
    if (/^\s*$/.test(line)) { i++; continue; }
    const pb = [line];
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
